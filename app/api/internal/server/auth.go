package server

import (
	"crypto/subtle"
	"errors"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

type claims struct {
	Role   string `json:"role"`
	Avatar string `json:"avatar,omitempty"`
	jwt.RegisteredClaims
}

// checkCredentials so sánh mật khẩu (đọc từ biến môi trường) bằng thời gian không đổi.
func (s *Server) checkCredentials(username, password string) (role string, ok bool) {
	want := "\x00unknown-user\x00"
	switch username {
	case "user":
		want, role = s.cfg.UserPassword, "user"
	case "admin":
		want, role = s.cfg.AdminPassword, "admin"
	}
	match := subtle.ConstantTimeCompare([]byte(password), []byte(want)) == 1
	return role, match && role != ""
}

func (s *Server) issue(user, role, avatar string) (string, time.Time, error) {
	now := s.cfg.Now()
	exp := now.Add(s.cfg.TokenTTL)
	cl := claims{
		Role:   role,
		Avatar: avatar,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   user,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(exp),
		},
	}
	tok, err := jwt.NewWithClaims(jwt.SigningMethodHS256, cl).SignedString(s.cfg.JWTSecret)
	return tok, exp, err
}

func (s *Server) parse(raw string) (*claims, error) {
	cl := &claims{}
	_, err := jwt.ParseWithClaims(raw, cl,
		func(*jwt.Token) (any, error) { return s.cfg.JWTSecret, nil },
		jwt.WithValidMethods([]string{"HS256"}), // ép thuật toán, không tin trường alg của token
		jwt.WithTimeFunc(s.cfg.Now),
		jwt.WithLeeway(30*time.Second), // chịu lệch đồng hồ nhỏ giữa các node
		jwt.WithExpirationRequired(),
	)
	if err != nil {
		return nil, err
	}
	if cl.Role != "user" && cl.Role != "admin" {
		return nil, errors.New("role không hợp lệ")
	}
	return cl, nil
}

// deny trả 403 (barem yêu cầu 403, không phải 401) và ghi lý do để phân biệt
// lỗi người dùng với dò quét: no_token | bad_token | expired | role.
func (s *Server) deny(c *gin.Context, reason string) {
	s.met.denied.WithLabelValues(reason).Inc()
	c.Header("X-Auth-Reason", reason)
	c.AbortWithStatusJSON(403, gin.H{"error": "forbidden", "reason": reason})
}

func (s *Server) authenticate() gin.HandlerFunc {
	const prefix = "Bearer "
	return func(c *gin.Context) {
		h := c.GetHeader("Authorization")
		if !strings.HasPrefix(h, prefix) {
			s.deny(c, "no_token")
			return
		}
		cl, err := s.parse(strings.TrimPrefix(h, prefix))
		if err != nil {
			reason := "bad_token"
			if errors.Is(err, jwt.ErrTokenExpired) {
				reason = "expired"
			}
			s.deny(c, reason)
			return
		}
		c.Set("user", cl.Subject)
		c.Set("role", cl.Role)
		c.Set("avatar", cl.Avatar)
		c.Next()
	}
}

func (s *Server) requireRole(role string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.GetString("role") != role {
			s.deny(c, "role")
			return
		}
		c.Next()
	}
}
