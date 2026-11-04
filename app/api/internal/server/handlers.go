package server

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
)

const maxBody = 16 << 10 // 16 KiB cho body JSON: chặn body khổng lồ

// fail ghi lỗi nội bộ vào log (không lộ chi tiết cho client).
func (s *Server) fail(c *gin.Context, err error) {
	s.log.Error("internal error", "request_id", c.GetString("request_id"), "err", err.Error())
	c.JSON(500, gin.H{"error": "internal error"})
}

func pathID(c *gin.Context) (int64, bool) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	return id, err == nil && id > 0
}

func (s *Server) login(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBody)
	var req struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "invalid body"})
		return
	}
	role, ok := s.checkCredentials(req.Username, req.Password)
	if !ok {
		// 401 có chủ đích: login không phải "URL cần xác thực" của barem.
		c.JSON(401, gin.H{"error": "invalid credentials"})
		return
	}
	tok, exp, err := s.issue(req.Username, role, "")
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(200, gin.H{"token": tok, "expires_at": exp.UTC().Format(time.RFC3339), "role": role})
}

func (s *Server) status(c *gin.Context) {
	c.JSON(200, gin.H{
		"version":        s.cfg.Version,
		"uptime_seconds": int(s.cfg.Now().Sub(s.started).Seconds()),
	})
}

// me là URL "bắt buộc xác thực" dùng cho barem: không token -> 403.
func (s *Server) me(c *gin.Context) {
	c.JSON(200, gin.H{"user": c.GetString("user"), "role": c.GetString("role"), "avatar": c.GetString("avatar")})
}

// listPapers hỗ trợ ?q= (tìm tiêu đề/tóm tắt), ?tag= (một tag) và ?sort=new|views.
func (s *Server) listPapers(c *gin.Context) {
	f := paperFilter{Q: strings.TrimSpace(c.Query("q")), Tag: strings.TrimSpace(c.Query("tag")), Sort: c.Query("sort")}
	if utf8.RuneCountInString(f.Q) > 100 || utf8.RuneCountInString(f.Tag) > 24 {
		c.JSON(400, gin.H{"error": "q must be at most 100 characters and tag at most 24"})
		return
	}
	if f.Sort != "" && f.Sort != "new" && f.Sort != "views" {
		c.JSON(400, gin.H{"error": "sort must be new or views"})
		return
	}
	ps, err := s.store.SearchPapers(f)
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(200, gin.H{"papers": ps})
}

func (s *Server) listTags(c *gin.Context) {
	ts, err := s.store.ListTags()
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(200, gin.H{"tags": ts})
}

func (s *Server) stats(c *gin.Context) {
	st, err := s.store.Stats()
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(200, st)
}

// viewPaper: POST (không phải GET) vì có tác dụng phụ. Giới hạn theo (IP, paper) để một người
// F5 liên tục không bơm số lượt xem; vượt hạn mức thì trả 409 như các rate limit khác.
func (s *Server) viewPaper(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		c.JSON(404, gin.H{"error": errNotFound.Error()})
		return
	}
	n, err := s.store.AddView(id)
	if errors.Is(err, errNotFound) {
		c.JSON(404, gin.H{"error": err.Error()})
		return
	}
	if err != nil {
		s.fail(c, err)
		return
	}
	s.met.views.Inc()
	c.JSON(200, gin.H{"views": n})
}

func (s *Server) getPaper(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		c.JSON(404, gin.H{"error": errNotFound.Error()})
		return
	}
	p, err := s.store.GetPaper(id)
	if errors.Is(err, errNotFound) {
		c.JSON(404, gin.H{"error": err.Error()})
		return
	}
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(200, p)
}

func (s *Server) createPaper(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBody)
	var in paperInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(400, gin.H{"error": "invalid body"})
		return
	}
	if msg := in.validate(); msg != "" {
		c.JSON(400, gin.H{"error": msg})
		return
	}
	p, err := s.store.CreatePaper(in, s.cfg.Now())
	if errors.Is(err, errDuplicate) {
		c.JSON(409, gin.H{"error": err.Error()})
		return
	}
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(201, p)
}

func (s *Server) deletePaper(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		c.JSON(404, gin.H{"error": errNotFound.Error()})
		return
	}
	pdf, err := s.store.DeletePaper(id)
	if errors.Is(err, errNotFound) {
		c.JSON(404, gin.H{"error": err.Error()})
		return
	}
	if err != nil {
		s.fail(c, err)
		return
	}
	s.removePDF(pdf)
	c.Status(204)
}
