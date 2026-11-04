package server

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"

	"github.com/gin-gonic/gin"
)

// Tên file trên đĩa do SERVER sinh (32 hex + .pdf). Không bao giờ dùng tên client gửi
// (chống path traversal). Regex này được kiểm lại trước khi đọc/xoá file (phòng thủ nhiều lớp).
var pdfNameRe = regexp.MustCompile(`^[0-9a-f]{32}\.pdf$`)

const multipartSlack = 64 << 10 // phần overhead của multipart ngoài nội dung file

func randomPDFName() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b) + ".pdf", nil
}

func (s *Server) pdfPath(name string) (string, bool) {
	if !pdfNameRe.MatchString(name) {
		return "", false
	}
	return filepath.Join(s.papersDir, name), true
}

func (s *Server) removePDF(name string) {
	if name == "" {
		return
	}
	p, ok := s.pdfPath(name)
	if !ok {
		s.log.Error("tên file PDF bất thường trong DB, bỏ qua xoá", "name", name)
		return
	}
	if err := os.Remove(p); err != nil && !os.IsNotExist(err) {
		s.log.Error("không xoá được file PDF", "err", err.Error())
	}
}

// uploadPDF nhận multipart (trường "file"). Chỉ admin. Kiểm tra nội dung THẬT (magic bytes),
// không tin đuôi file hay Content-Type do client gửi.
func (s *Server) uploadPDF(c *gin.Context) {
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

	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, s.cfg.MaxPDFBytes+multipartSlack)
	fh, err := c.FormFile("file")
	if err != nil {
		var mbe *http.MaxBytesError
		if errors.As(err, &mbe) {
			c.JSON(413, gin.H{"error": "file too large"})
			return
		}
		c.JSON(400, gin.H{"error": "missing multipart field 'file'"})
		return
	}
	if fh.Size > s.cfg.MaxPDFBytes {
		c.JSON(413, gin.H{"error": "file too large"})
		return
	}
	f, err := fh.Open()
	if err != nil {
		s.fail(c, err)
		return
	}
	defer f.Close()

	head := make([]byte, 5)
	if _, err := io.ReadFull(f, head); err != nil || string(head) != "%PDF-" {
		c.JSON(400, gin.H{"error": "file is not a PDF"})
		return
	}

	name, err := randomPDFName()
	if err != nil {
		s.fail(c, err)
		return
	}
	// Ghi ra file tạm rồi đổi tên: người đọc không bao giờ thấy file ghi dở.
	tmp, err := os.CreateTemp(s.papersDir, "upload-*.tmp")
	if err != nil {
		s.fail(c, err)
		return
	}
	tmpName := tmp.Name()
	cleanup := func() { _ = os.Remove(tmpName) }
	if _, err := tmp.Write(head); err != nil {
		_ = tmp.Close()
		cleanup()
		s.fail(c, err)
		return
	}
	if _, err := io.Copy(tmp, io.LimitReader(f, s.cfg.MaxPDFBytes)); err != nil {
		_ = tmp.Close()
		cleanup()
		s.fail(c, err)
		return
	}
	if err := tmp.Close(); err != nil {
		cleanup()
		s.fail(c, err)
		return
	}
	dst := filepath.Join(s.papersDir, name)
	if err := os.Rename(tmpName, dst); err != nil {
		cleanup()
		s.fail(c, err)
		return
	}

	old, err := s.store.SetPDF(id, name)
	if err != nil {
		_ = os.Remove(dst)
		if errors.Is(err, errNotFound) { // paper bị xoá giữa chừng
			c.JSON(404, gin.H{"error": err.Error()})
			return
		}
		s.fail(c, err)
		return
	}
	s.removePDF(old)

	p, err := s.store.GetPaper(id)
	if err != nil {
		s.fail(c, err)
		return
	}
	c.JSON(200, p)
}

// paperFile phục vụ PDF công khai. Luôn ép Content-Type=application/pdf và nosniff
// để file do người dùng tải lên không bao giờ bị trình duyệt hiểu thành HTML.
func (s *Server) paperFile(c *gin.Context) {
	id, ok := pathID(c)
	if !ok {
		c.JSON(404, gin.H{"error": errNotFound.Error()})
		return
	}
	name, err := s.store.PDFName(id)
	if errors.Is(err, errNotFound) || (err == nil && name == "") {
		c.JSON(404, gin.H{"error": errNotFound.Error()})
		return
	}
	if err != nil {
		s.fail(c, err)
		return
	}
	p, ok := s.pdfPath(name)
	if !ok {
		s.fail(c, errors.New("tên file PDF bất thường trong DB"))
		return
	}
	c.Header("Content-Type", "application/pdf")
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("Content-Disposition", `inline; filename="paper-`+c.Param("id")+`.pdf"`)
	c.File(p)
}
