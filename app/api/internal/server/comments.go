package server

import (
	"errors"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
)

func (s *Server) listComments(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		c.JSON(404, gin.H{"error": errNotFound.Error()})
		return
	}
	if _, err := s.store.GetPaper(id); err != nil {
		if errors.Is(err, errNotFound) {
			c.JSON(404, gin.H{"error": err.Error()})
			return
		}
		s.fail(c, err)
		return
	}
	cs, err := s.store.ListComments(id)
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(200, gin.H{"comments": cs})
}

func (s *Server) createComment(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		c.JSON(404, gin.H{"error": errNotFound.Error()})
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 4<<10)
	var in struct {
		Body     string `json:"body"`
		ParentID int64  `json:"parent_id"` // tuỳ chọn: id comment gốc muốn trả lời
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(400, gin.H{"error": "invalid body"})
		return
	}
	body := strings.TrimSpace(in.Body)
	if n := utf8.RuneCountInString(body); n < 1 || n > 1000 {
		c.JSON(400, gin.H{"error": "comment must be 1-1000 characters"})
		return
	}
	if in.ParentID < 0 {
		c.JSON(400, gin.H{"error": errBadParent.Error()})
		return
	}
	cm, err := s.store.CreateComment(id, in.ParentID, c.GetString("user"), c.GetString("avatar"), body, s.cfg.Now())
	switch {
	case errors.Is(err, errNotFound):
		c.JSON(404, gin.H{"error": err.Error()})
	case errors.Is(err, errBadParent):
		c.JSON(400, gin.H{"error": err.Error()})
	case errors.Is(err, errDuplicate):
		c.JSON(409, gin.H{"error": "duplicate comment"})
	case err != nil:
		s.fail(c, err)
	default:
		if in.ParentID != 0 {
			s.met.comments.WithLabelValues("replied").Inc()
		} else {
			s.met.comments.WithLabelValues("created").Inc()
		}
		c.JSON(201, cm)
	}
}

// updateComment: CHỈ chủ comment được sửa (admin chỉ được xoá, không được sửa lời người khác).
func (s *Server) updateComment(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		c.JSON(404, gin.H{"error": errNotFound.Error()})
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 4<<10)
	var in struct {
		Body string `json:"body"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(400, gin.H{"error": "invalid body"})
		return
	}
	body := strings.TrimSpace(in.Body)
	if n := utf8.RuneCountInString(body); n < 1 || n > 1000 {
		c.JSON(400, gin.H{"error": "comment must be 1-1000 characters"})
		return
	}
	cm, err := s.store.GetComment(id)
	if errors.Is(err, errNotFound) {
		c.JSON(404, gin.H{"error": err.Error()})
		return
	}
	if err != nil {
		s.fail(c, err)
		return
	}
	if cm.Author != c.GetString("user") {
		s.deny(c, "owner")
		return
	}
	cm, err = s.store.UpdateComment(id, body, s.cfg.Now())
	switch {
	case errors.Is(err, errNotFound): // bị xoá giữa hai truy vấn
		c.JSON(404, gin.H{"error": err.Error()})
	case err != nil:
		s.fail(c, err)
	default:
		s.met.comments.WithLabelValues("edited").Inc()
		c.JSON(200, cm)
	}
}

// deleteComment: chủ comment hoặc admin. Người khác -> 403.
func (s *Server) deleteComment(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		c.JSON(404, gin.H{"error": errNotFound.Error()})
		return
	}
	cm, err := s.store.GetComment(id)
	if errors.Is(err, errNotFound) {
		c.JSON(404, gin.H{"error": err.Error()})
		return
	}
	if err != nil {
		s.fail(c, err)
		return
	}
	if c.GetString("role") != "admin" && cm.Author != c.GetString("user") {
		s.deny(c, "owner")
		return
	}
	if err := s.store.DeleteComment(id); err != nil && !errors.Is(err, errNotFound) {
		s.fail(c, err)
		return
	}
	s.met.comments.WithLabelValues("deleted").Inc()
	c.Status(204)
}
