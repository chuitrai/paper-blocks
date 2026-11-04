package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func newReadmeEnv(t *testing.T) (*env, *atomic.Int32) {
	t.Helper()
	var hits atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		if !strings.Contains(r.Header.Get("Accept"), "raw") || r.Header.Get("User-Agent") == "" {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		switch r.URL.Path {
		case "/repos/octo/hello/readme":
			_, _ = w.Write([]byte("# Hello\n\nXin chào <script>alert(1)</script>"))
		case "/repos/octo/big/readme":
			_, _ = w.Write([]byte(strings.Repeat("a", 300<<10)))
		case "/repos/octo/limited/readme":
			w.WriteHeader(http.StatusForbidden)
		default: // /repos/octo/none/readme và mọi thứ khác
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	t.Cleanup(srv.Close)
	return newEnv(t, func(c *Config) { c.GitHubAPIURL = srv.URL }), &hits
}

func (e *env) readme(id string) (int, struct {
	Repo      string
	Markdown  string
	Truncated bool
}) {
	code, w := e.do("GET", "/api/v1/papers/"+id+"/readme", "", "")
	var out struct {
		Repo      string
		Markdown  string
		Truncated bool
	}
	_ = json.Unmarshal(w.Body.Bytes(), &out)
	return code, out
}

func TestReadme(t *testing.T) {
	e, hits := newReadmeEnv(t)
	admin := e.login(t, "admin", "a-pass")
	for _, body := range []string{
		`{"title":"hello","repo_url":"https://github.com/octo/hello"}`, // id 1
		`{"title":"norepo"}`, // id 2
		`{"title":"none","repo_url":"https://github.com/octo/none"}`,       // id 3
		`{"title":"limited","repo_url":"https://github.com/octo/limited"}`, // id 4
		`{"title":"big","repo_url":"https://github.com/octo/big"}`,         // id 5
	} {
		if code, w := e.do("POST", "/api/v1/papers", admin, body); code != 201 {
			t.Fatalf("tạo paper: %d %s", code, w.Body.String())
		}
	}

	// Lấy README thành công, trả văn bản thô (không render HTML phía server)
	code, r := e.readme("1")
	if code != 200 || r.Repo != "octo/hello" || !strings.HasPrefix(r.Markdown, "# Hello") {
		t.Fatalf("README: %d %+v", code, r)
	}
	// Lần 2 lấy từ cache, không gọi lại GitHub
	_, _ = e.readme("1")
	if hits.Load() != 1 {
		t.Fatalf("cache hỏng: %d lần gọi GitHub, want 1", hits.Load())
	}
	// Hết TTL thì gọi lại
	e.now = e.now.Add(11 * time.Minute)
	_, _ = e.readme("1")
	if hits.Load() != 2 {
		t.Fatalf("hết TTL phải gọi lại: %d lần, want 2", hits.Load())
	}

	// Paper không có repo / paper không tồn tại
	if code, _ := e.readme("2"); code != 404 {
		t.Fatalf("không có repo: got %d, want 404", code)
	}
	if code, _ := e.readme("999"); code != 404 {
		t.Fatalf("paper không tồn tại: got %d, want 404", code)
	}

	// Repo không có README -> 404, và được cache âm (không dồn dập hỏi GitHub)
	before := hits.Load()
	if code, _ := e.readme("3"); code != 404 {
		t.Fatalf("repo không README: got %d, want 404", code)
	}
	_, _ = e.readme("3")
	if hits.Load() != before+1 {
		t.Fatalf("cache âm hỏng: %d lần gọi, want %d", hits.Load()-before, 1)
	}

	// GitHub hết hạn mức -> 502, cũng được cache ngắn hạn
	before = hits.Load()
	if code, _ := e.readme("4"); code != 502 {
		t.Fatalf("hết hạn mức: got %d, want 502", code)
	}
	_, _ = e.readme("4")
	if hits.Load() != before+1 {
		t.Fatalf("không được dồn dập gọi GitHub khi đang bị giới hạn")
	}

	// README quá lớn bị cắt
	code, r = e.readme("5")
	if code != 200 || !r.Truncated || len(r.Markdown) > maxReadme {
		t.Fatalf("README lớn: %d truncated=%v len=%d", code, r.Truncated, len(r.Markdown))
	}
}

// Không cho gắn repo có tên "." hoặc ".." (sẽ làm đường dẫn gọi GitHub bị hiểu sai).
func TestRepoURLTraversalRejected(t *testing.T) {
	e := newEnv(t)
	admin := e.login(t, "admin", "a-pass")
	for _, u := range []string{
		"https://github.com/o/..",
		"https://github.com/../r",
		"https://github.com/o/r/extra",
		"http://github.com/o/r",
		"https://evil.com/o/r",
	} {
		body := `{"title":"x","repo_url":"` + u + `"}`
		if code, _ := e.do("POST", "/api/v1/papers", admin, body); code != 400 {
			t.Fatalf("%s: got %d, want 400", u, code)
		}
	}
}
