package server

import (
	"crypto/rand"
	"encoding/hex"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
)

// ---- request id ----

func (s *Server) requestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		b := make([]byte, 8)
		_, _ = rand.Read(b)
		id := hex.EncodeToString(b) // luôn tự sinh, không tin header của client (tránh log injection)
		c.Set("request_id", id)
		c.Header("X-Request-Id", id)
		c.Next()
	}
}

// ---- access log (JSON, đủ path/method/status cho Kibana) ----
// Không bao giờ ghi header Authorization hay body.

func (s *Server) accessLog() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		s.log.Info("request",
			"request_id", c.GetString("request_id"),
			"method", c.Request.Method,
			"path", c.Request.URL.Path,
			"route", c.FullPath(),
			"status", c.Writer.Status(),
			"latency_ms", time.Since(start).Milliseconds(),
			"client_ip", c.ClientIP(),
			"user", c.GetString("user"),
		)
	}
}

// ---- metrics ----

type metrics struct {
	reg         *prometheus.Registry
	requests    *prometheus.CounterVec
	duration    *prometheus.HistogramVec
	ratelimited *prometheus.CounterVec
	denied      *prometheus.CounterVec
	views       prometheus.Counter
	comments    *prometheus.CounterVec
}

func newMetrics() *metrics {
	m := &metrics{
		reg: prometheus.NewRegistry(),
		requests: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "http_requests_total", Help: "Tổng số request HTTP.",
		}, []string{"method", "path", "status"}),
		duration: prometheus.NewHistogramVec(prometheus.HistogramOpts{
			Name: "http_request_duration_seconds", Help: "Thời gian xử lý request.",
			Buckets: prometheus.DefBuckets,
		}, []string{"method", "path"}),
		ratelimited: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "ratelimit_blocked_total", Help: "Số request bị chặn bởi rate limit (409).",
		}, []string{"route"}),
		denied: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "authz_denied_total", Help: "Số request bị từ chối (403) theo lý do.",
		}, []string{"reason"}),
		views: prometheus.NewCounter(prometheus.CounterOpts{
			Name: "paper_views_total", Help: "Số lượt xem paper được ghi nhận (sau rate limit).",
		}),
		comments: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "comments_total", Help: "Số thao tác comment thành công theo loại.",
		}, []string{"action"}),
	}
	m.reg.MustRegister(m.requests, m.duration, m.ratelimited, m.denied, m.views, m.comments,
		collectors.NewGoCollector(),
		collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}))
	for _, r := range []string{"no_token", "bad_token", "expired", "role", "owner"} {
		m.denied.WithLabelValues(r) // khởi tạo = 0 để biểu đồ có chuỗi ngay từ đầu
	}
	for _, a := range []string{"created", "replied", "edited", "deleted"} {
		m.comments.WithLabelValues(a)
	}
	return m
}

// Nhãn path dùng MẪU route (/api/v1/quests/:id), không dùng đường dẫn thật,
// để số chuỗi thời gian không phình theo số id (cardinality).
func (s *Server) metricsMW() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		path := c.FullPath()
		if path == "" {
			path = "unmatched"
		}
		s.met.requests.WithLabelValues(c.Request.Method, path, strconv.Itoa(c.Writer.Status())).Inc()
		s.met.duration.WithLabelValues(c.Request.Method, path).Observe(time.Since(start).Seconds())
	}
}
