package server

import (
	"math"
	"strconv"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// limiter: cửa sổ cố định, đếm theo khoá (IP). Trạng thái nằm trong bộ nhớ nên
// chỉ đúng với replicas: 1 (mỗi pod đếm riêng).
// Nhược điểm của cửa sổ cố định: có thể lọt tối đa 2*limit request quanh ranh giới cửa sổ.
type limiter struct {
	mu        sync.Mutex
	limit     int
	window    time.Duration
	now       func() time.Time
	hits      map[string]*bucket
	lastSweep time.Time
}

type bucket struct {
	start time.Time
	n     int
}

func newLimiter(limit int, window time.Duration, now func() time.Time) *limiter {
	return &limiter{limit: limit, window: window, now: now, hits: map[string]*bucket{}, lastSweep: now()}
}

// allow trả (true, 0) nếu còn hạn mức, ngược lại (false, thời gian chờ).
func (l *limiter) allow(key string) (bool, time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()

	// Dọn các khoá hết hạn, tránh rò bộ nhớ khi có nhiều IP.
	if now.Sub(l.lastSweep) >= l.window {
		for k, b := range l.hits {
			if now.Sub(b.start) >= l.window {
				delete(l.hits, k)
			}
		}
		l.lastSweep = now
	}

	b := l.hits[key]
	if b == nil || now.Sub(b.start) >= l.window {
		b = &bucket{start: now}
		l.hits[key] = b
	}
	if b.n >= l.limit {
		return false, l.window - now.Sub(b.start)
	}
	b.n++
	return true, 0
}

// rateLimit trả 409 khi vượt hạn mức (barem yêu cầu 409, chuẩn HTTP sẽ là 429).
func (s *Server) rateLimit(l *limiter) gin.HandlerFunc {
	return s.rateLimitBy(l, func(c *gin.Context) string { return c.ClientIP() })
}

// rateLimitBy cho phép chọn khoá đếm (IP, hoặc tài khoản đã đăng nhập).
func (s *Server) rateLimitBy(l *limiter, key func(*gin.Context) string) gin.HandlerFunc {
	return func(c *gin.Context) {
		ok, wait := l.allow(key(c))
		if !ok {
			s.met.ratelimited.WithLabelValues(c.FullPath()).Inc()
			c.Header("Retry-After", strconv.Itoa(int(math.Ceil(wait.Seconds()))))
			c.AbortWithStatusJSON(409, gin.H{"error": "rate limit exceeded"})
			return
		}
		c.Next()
	}
}
