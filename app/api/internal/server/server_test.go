package server

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

type env struct {
	h         http.Handler
	now       time.Time
	papersDir string
	store     *Store
}

func newEnv(t *testing.T, mods ...func(*Config)) *env {
	t.Helper()
	gin.SetMode(gin.TestMode)
	dir := t.TempDir()
	e := &env{now: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC), papersDir: filepath.Join(dir, "papers")}
	cfg := Config{
		JWTSecret:     []byte("test-secret-at-least-16-chars"),
		PasswordLogin: true,
		UserPassword:  "u-pass",
		AdminPassword: "a-pass",
		DBPath:        filepath.Join(dir, "test.db"),
		MaxPDFBytes:   1024,
		Now:           func() time.Time { return e.now },
		Logger:        slog.New(slog.NewJSONHandler(io.Discard, nil)),
	}
	for _, m := range mods {
		m(&cfg)
	}
	app, err := New(cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = app.Close() }) // đóng DB trước khi TempDir bị xoá (quan trọng trên Windows)
	e.h = app.Engine
	e.store = app.store
	return e
}

func (e *env) do(method, path, token, body string) (int, *httptest.ResponseRecorder) {
	req := httptest.NewRequest(method, path, bytes.NewBufferString(body))
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	req.RemoteAddr = "10.1.1.1:5555"
	w := httptest.NewRecorder()
	e.h.ServeHTTP(w, req)
	return w.Code, w
}

func (e *env) login(t *testing.T, user, pass string) string {
	t.Helper()
	code, w := e.do("POST", "/api/v1/login", "", `{"username":"`+user+`","password":"`+pass+`"}`)
	if code != 200 {
		t.Fatalf("login %s: %d %s", user, code, w.Body.String())
	}
	var out struct{ Token string }
	_ = json.Unmarshal(w.Body.Bytes(), &out)
	return out.Token
}

const paperA = `{"title":"Paper A","abstract":"tóm tắt","tags":["go"],"repo_url":"https://github.com/o/r","video_url":"https://www.tiktok.com/@u/video/1"}`

func TestAuthMatrix(t *testing.T) {
	e := newEnv(t)
	user := e.login(t, "user", "u-pass")
	admin := e.login(t, "admin", "a-pass")

	tests := []struct {
		name, method, path, token, body string
		want                            int
	}{
		{"GET /me không token", "GET", "/api/v1/me", "", "", 403},
		{"GET /me token rác", "GET", "/api/v1/me", "abc.def.ghi", "", 403},
		{"GET /me user", "GET", "/api/v1/me", user, "", 200},
		{"GET /me admin", "GET", "/api/v1/me", admin, "", 200},
		{"GET /papers công khai", "GET", "/api/v1/papers", "", "", 200},
		{"GET /papers user", "GET", "/api/v1/papers", user, "", 200},
		{"GET /papers admin", "GET", "/api/v1/papers", admin, "", 200},
		{"POST không token", "POST", "/api/v1/papers", "", paperA, 403},
		{"POST user", "POST", "/api/v1/papers", user, paperA, 403},
		{"POST admin", "POST", "/api/v1/papers", admin, paperA, 201},
		{"POST admin trùng tiêu đề (khác hoa thường)", "POST", "/api/v1/papers", admin, `{"title":"paper a"}`, 409},
		{"POST admin repo sai", "POST", "/api/v1/papers", admin, `{"title":"B","repo_url":"http://evil.com/x"}`, 400},
		{"POST admin video javascript:", "POST", "/api/v1/papers", admin, `{"title":"C","video_url":"javascript:alert(1)"}`, 400},
		{"POST admin tiêu đề rỗng", "POST", "/api/v1/papers", admin, `{"title":"  "}`, 400},
		{"GET /papers/1", "GET", "/api/v1/papers/1", "", "", 200},
		{"GET /papers/999", "GET", "/api/v1/papers/999", "", "", 404},
		{"GET /papers/abc", "GET", "/api/v1/papers/abc", "", "", 404},
		{"DELETE không token", "DELETE", "/api/v1/papers/1", "", "", 403},
		{"DELETE user", "DELETE", "/api/v1/papers/1", user, "", 403},
		{"DELETE admin", "DELETE", "/api/v1/papers/1", admin, "", 204},
		{"DELETE admin lần 2", "DELETE", "/api/v1/papers/1", admin, "", 404},
		{"healthz", "GET", "/healthz", "", "", 200},
		{"metrics", "GET", "/metrics", "", "", 200},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got, w := e.do(tc.method, tc.path, tc.token, tc.body); got != tc.want {
				t.Fatalf("got %d, want %d, body=%s", got, tc.want, w.Body.String())
			}
		})
	}
}

func (e *env) upload(token, path, filename string, content []byte) (int, *httptest.ResponseRecorder) {
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	fw, _ := mw.CreateFormFile("file", filename)
	_, _ = fw.Write(content)
	_ = mw.Close()
	req := httptest.NewRequest("POST", path, &buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	req.RemoteAddr = "10.1.1.1:5555"
	w := httptest.NewRecorder()
	e.h.ServeHTTP(w, req)
	return w.Code, w
}

func (e *env) pdfFiles(t *testing.T) []string {
	t.Helper()
	ents, err := os.ReadDir(e.papersDir)
	if err != nil {
		t.Fatal(err)
	}
	var names []string
	for _, ent := range ents {
		names = append(names, ent.Name())
	}
	return names
}

func TestPDFUploadAndServe(t *testing.T) {
	e := newEnv(t)
	user := e.login(t, "user", "u-pass")
	admin := e.login(t, "admin", "a-pass")
	if code, _ := e.do("POST", "/api/v1/papers", admin, `{"title":"Có PDF"}`); code != 201 {
		t.Fatal("không tạo được paper")
	}
	pdf := []byte("%PDF-1.4\n% nội dung giả để test\n%%EOF")

	// Phân quyền
	if code, _ := e.upload("", "/api/v1/papers/1/file", "a.pdf", pdf); code != 403 {
		t.Fatalf("không token: got %d, want 403", code)
	}
	if code, _ := e.upload(user, "/api/v1/papers/1/file", "a.pdf", pdf); code != 403 {
		t.Fatalf("user: got %d, want 403", code)
	}

	// Paper chưa có PDF -> 404; paper không tồn tại -> 404
	if code, _ := e.do("GET", "/api/v1/papers/1/file", "", ""); code != 404 {
		t.Fatalf("chưa có PDF: got %d, want 404", code)
	}
	if code, _ := e.upload(admin, "/api/v1/papers/999/file", "a.pdf", pdf); code != 404 {
		t.Fatalf("paper không tồn tại: got %d, want 404", code)
	}

	// Nội dung giả mạo / quá lớn bị từ chối, không để lại file rác
	html := []byte("<html><script>alert(1)</script></html>")
	if code, _ := e.upload(admin, "/api/v1/papers/1/file", "evil.pdf", html); code != 400 {
		t.Fatalf("HTML đội lốt PDF: got %d, want 400", code)
	}
	big := append([]byte("%PDF-"), bytes.Repeat([]byte("a"), 2000)...)
	if code, _ := e.upload(admin, "/api/v1/papers/1/file", "big.pdf", big); code != 413 {
		t.Fatalf("quá lớn: got %d, want 413", code)
	}
	if n := len(e.pdfFiles(t)); n != 0 {
		t.Fatalf("còn %d file rác sau upload bị từ chối", n)
	}

	// Upload hợp lệ, tên file độc hại của client bị bỏ qua
	code, w := e.upload(admin, "/api/v1/papers/1/file", "../../evil.pdf", pdf)
	if code != 200 {
		t.Fatalf("upload hợp lệ: got %d %s", code, w.Body.String())
	}
	var p Paper
	_ = json.Unmarshal(w.Body.Bytes(), &p)
	if !p.HasPDF {
		t.Fatal("has_pdf phải là true")
	}
	files := e.pdfFiles(t)
	if len(files) != 1 || !pdfNameRe.MatchString(files[0]) {
		t.Fatalf("tên file trên đĩa không do server sinh: %v", files)
	}

	// Phục vụ công khai với header an toàn
	code, w = e.do("GET", "/api/v1/papers/1/file", "", "")
	if code != 200 || !bytes.Equal(w.Body.Bytes(), pdf) {
		t.Fatalf("phục vụ PDF: got %d, nội dung khớp=%v", code, bytes.Equal(w.Body.Bytes(), pdf))
	}
	if w.Header().Get("Content-Type") != "application/pdf" || w.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Fatalf("header không an toàn: %v", w.Header())
	}

	// Thay PDF: file cũ phải bị xoá
	if code, _ := e.upload(admin, "/api/v1/papers/1/file", "b.pdf", pdf); code != 200 {
		t.Fatalf("thay PDF: got %d", code)
	}
	if n := len(e.pdfFiles(t)); n != 1 {
		t.Fatalf("sau khi thay PDF còn %d file, want 1", n)
	}

	// Xoá paper: file phải biến mất theo
	if code, _ := e.do("DELETE", "/api/v1/papers/1", admin, ""); code != 204 {
		t.Fatalf("xoá paper: got %d", code)
	}
	if n := len(e.pdfFiles(t)); n != 0 {
		t.Fatalf("xoá paper nhưng còn %d file PDF", n)
	}
}

// Client không được tự đặt id / has_pdf / created_at.
func TestCreateIgnoresServerFields(t *testing.T) {
	e := newEnv(t)
	admin := e.login(t, "admin", "a-pass")
	code, w := e.do("POST", "/api/v1/papers", admin, `{"id":99,"has_pdf":true,"created_at":"2000-01-01T00:00:00Z","title":"X"}`)
	if code != 201 {
		t.Fatalf("got %d: %s", code, w.Body.String())
	}
	var p Paper
	_ = json.Unmarshal(w.Body.Bytes(), &p)
	if p.ID == 99 || p.HasPDF || p.CreatedAt.Year() != 2026 {
		t.Fatalf("server field bị client điều khiển: %+v", p)
	}
}

func TestLoginWrongPassword(t *testing.T) {
	e := newEnv(t)
	for _, c := range []string{
		`{"username":"admin","password":"sai"}`,
		`{"username":"nobody","password":"x"}`,
	} {
		if code, _ := e.do("POST", "/api/v1/login", "", c); code != 401 {
			t.Fatalf("got %d, want 401 for %s", code, c)
		}
	}
}

func TestTokenExpired(t *testing.T) {
	e := newEnv(t)
	tok := e.login(t, "user", "u-pass")
	e.now = e.now.Add(31*time.Minute + time.Minute) // quá hạn 30 phút + leeway 30s
	code, w := e.do("GET", "/api/v1/me", tok, "")
	if code != 403 || w.Header().Get("X-Auth-Reason") != "expired" {
		t.Fatalf("got %d reason=%q", code, w.Header().Get("X-Auth-Reason"))
	}
}

func TestStatusRateLimit(t *testing.T) {
	e := newEnv(t)
	for i := 1; i <= 10; i++ {
		if code, _ := e.do("GET", "/api/v1/status", "", ""); code != 200 {
			t.Fatalf("request %d: got %d, want 200", i, code)
		}
	}
	if code, w := e.do("GET", "/api/v1/status", "", ""); code != 409 || w.Header().Get("Retry-After") == "" {
		t.Fatalf("request 11: got %d, want 409 kèm Retry-After", code)
	}
	e.now = e.now.Add(61 * time.Second) // sang cửa sổ mới
	if code, _ := e.do("GET", "/api/v1/status", "", ""); code != 200 {
		t.Fatalf("sau cửa sổ: got %d, want 200", code)
	}
}

// Header X-Forwarded-For giả không được lách giới hạn khi không có proxy tin cậy.
func TestForgedForwardedForIgnored(t *testing.T) {
	e := newEnv(t)
	for i := 0; i < 11; i++ {
		req := httptest.NewRequest("GET", "/api/v1/status", nil)
		req.RemoteAddr = "10.1.1.1:5555"
		req.Header.Set("X-Forwarded-For", "9.9.9."+string(rune('0'+i%10)))
		w := httptest.NewRecorder()
		e.h.ServeHTTP(w, req)
		if i == 10 && w.Code != 409 {
			t.Fatalf("request 11 với XFF giả: got %d, want 409", w.Code)
		}
	}
}

// Dữ liệu phải sống qua việc đóng/mở lại DB (mô phỏng pod restart với PVC).
func TestDataSurvivesRestart(t *testing.T) {
	path := filepath.Join(t.TempDir(), "persist.db")
	s1, err := OpenStore(path)
	if err != nil {
		t.Fatal(err)
	}
	in := paperInput{Title: "Bền vững", Tags: []string{}}
	if _, err := s1.CreatePaper(in, time.Now()); err != nil {
		t.Fatal(err)
	}
	_ = s1.Close()

	s2, err := OpenStore(path)
	if err != nil {
		t.Fatal(err)
	}
	defer s2.Close()
	ps, err := s2.ListPapers()
	if err != nil || len(ps) != 1 || ps[0].Title != "Bền vững" {
		t.Fatalf("mất dữ liệu sau restart: %v %+v", err, ps)
	}
}
