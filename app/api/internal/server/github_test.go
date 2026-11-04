package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"path/filepath"
	"strings"
	"testing"
)

const testRedirect = "http://localhost:8080/api/v1/auth/github/callback"

// fakeGitHub giả lập hai endpoint GitHub mà ta dùng; không gọi mạng thật.
type fakeGitHub struct {
	srv   *httptest.Server
	login string // login mà /user sẽ trả về
}

func newFakeGitHub(t *testing.T, login string) *fakeGitHub {
	t.Helper()
	f := &fakeGitHub{login: login}
	mux := http.NewServeMux()
	mux.HandleFunc("/login/oauth/access_token", func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		w.Header().Set("Content-Type", "application/json")
		if r.Method != http.MethodPost || r.PostForm.Get("client_id") != "cid" ||
			r.PostForm.Get("client_secret") != "csecret" || r.PostForm.Get("redirect_uri") != testRedirect {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		if r.PostForm.Get("code") != "good-code" {
			_, _ = w.Write([]byte(`{"error":"bad_verification_code"}`)) // GitHub trả 200 kèm error
			return
		}
		_, _ = w.Write([]byte(`{"access_token":"gho_fake","token_type":"bearer","scope":""}`))
	})
	mux.HandleFunc("/user", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer gho_fake" || r.Header.Get("User-Agent") == "" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]string{
			"login": f.login, "avatar_url": "https://avatars.githubusercontent.com/u/1",
		})
	})
	f.srv = httptest.NewServer(mux)
	t.Cleanup(f.srv.Close)
	return f
}

func ghEnv(t *testing.T, f *fakeGitHub) *env {
	return newEnv(t, func(c *Config) {
		c.GitHubClientID = "cid"
		c.GitHubClientSecret = "csecret"
		c.GitHubRedirectURL = testRedirect
		c.AdminGitHubLogin = "chuitrai"
		c.GitHubAuthURL = f.srv.URL + "/login/oauth/authorize"
		c.GitHubTokenURL = f.srv.URL + "/login/oauth/access_token"
		c.GitHubAPIURL = f.srv.URL
	})
}

// start gọi bước 1 và trả về state, cookie, Location.
func (e *env) startGitHub(t *testing.T) (state string, ck *http.Cookie, loc *url.URL, w *httptest.ResponseRecorder) {
	t.Helper()
	req := httptest.NewRequest("GET", "/api/v1/auth/github/login", nil)
	req.RemoteAddr = "10.1.1.1:5555"
	w = httptest.NewRecorder()
	e.h.ServeHTTP(w, req)
	if w.Code != 302 {
		t.Fatalf("login: got %d, want 302", w.Code)
	}
	loc, _ = url.Parse(w.Header().Get("Location"))
	for _, c := range w.Result().Cookies() {
		if c.Name == stateCookie {
			ck = c
		}
	}
	return loc.Query().Get("state"), ck, loc, w
}

func (e *env) callback(query string, ck *http.Cookie) *httptest.ResponseRecorder {
	req := httptest.NewRequest("GET", "/api/v1/auth/github/callback?"+query, nil)
	req.RemoteAddr = "10.1.1.1:5555"
	if ck != nil {
		req.AddCookie(ck)
	}
	w := httptest.NewRecorder()
	e.h.ServeHTTP(w, req)
	return w
}

func fragmentToken(t *testing.T, w *httptest.ResponseRecorder) string {
	t.Helper()
	if w.Code != 302 {
		t.Fatalf("callback: got %d, want 302, body=%s", w.Code, w.Body.String())
	}
	u, err := url.Parse(w.Header().Get("Location"))
	if err != nil {
		t.Fatal(err)
	}
	vals, _ := url.ParseQuery(u.Fragment)
	tok := vals.Get("token")
	if tok == "" {
		t.Fatalf("không có token trong fragment: %q", u.Fragment)
	}
	if u.RawQuery != "" {
		t.Fatalf("token không được nằm trong query: %q", u.RawQuery)
	}
	return tok
}

func TestGitHubLoginRedirect(t *testing.T) {
	e := ghEnv(t, newFakeGitHub(t, "chuitrai"))
	state, ck, loc, _ := e.startGitHub(t)
	q := loc.Query()
	if q.Get("client_id") != "cid" || q.Get("redirect_uri") != testRedirect || len(state) < 16 {
		t.Fatalf("tham số chuyển hướng sai: %v", q)
	}
	if q.Has("scope") {
		t.Fatal("không được xin scope nào")
	}
	if ck == nil || ck.Value != state || !ck.HttpOnly || ck.SameSite != http.SameSiteLaxMode {
		t.Fatalf("cookie state sai: %+v", ck)
	}
}

func TestGitHubCallbackAdmin(t *testing.T) {
	e := ghEnv(t, newFakeGitHub(t, "ChuiTrai")) // khác hoa/thường vẫn phải nhận ra admin
	state, ck, _, _ := e.startGitHub(t)
	w := e.callback("code=good-code&state="+state, ck)
	tok := fragmentToken(t, w)

	// state chỉ dùng một lần: cookie bị xoá
	for _, c := range w.Result().Cookies() {
		if c.Name == stateCookie && c.MaxAge >= 0 {
			t.Fatalf("cookie state phải bị xoá: %+v", c)
		}
	}
	code, me := e.do("GET", "/api/v1/me", tok, "")
	if code != 200 || !strings.Contains(me.Body.String(), `"role":"admin"`) || !strings.Contains(me.Body.String(), `"user":"gh:ChuiTrai"`) {
		t.Fatalf("/me: %d %s", code, me.Body.String())
	}
	if code, _ := e.do("POST", "/api/v1/papers", tok, `{"title":"Từ GitHub admin"}`); code != 201 {
		t.Fatalf("admin GitHub tạo paper: got %d, want 201", code)
	}
}

func TestGitHubCallbackRegularUser(t *testing.T) {
	e := ghEnv(t, newFakeGitHub(t, "someone-else"))
	state, ck, _, _ := e.startGitHub(t)
	tok := fragmentToken(t, e.callback("code=good-code&state="+state, ck))
	if code, _ := e.do("GET", "/api/v1/me", tok, ""); code != 200 {
		t.Fatalf("/me: got %d", code)
	}
	if code, _ := e.do("POST", "/api/v1/papers", tok, `{"title":"x"}`); code != 403 {
		t.Fatalf("user thường tạo paper: got %d, want 403", code)
	}
}

// Một người GitHub tên "admin" không được giả danh tài khoản mật khẩu "admin" hay có quyền admin.
func TestGitHubUserNamedAdminIsNotAdmin(t *testing.T) {
	e := ghEnv(t, newFakeGitHub(t, "admin"))
	state, ck, _, _ := e.startGitHub(t)
	tok := fragmentToken(t, e.callback("code=good-code&state="+state, ck))
	code, me := e.do("GET", "/api/v1/me", tok, "")
	if code != 200 || !strings.Contains(me.Body.String(), `"user":"gh:admin"`) || strings.Contains(me.Body.String(), `"role":"admin"`) {
		t.Fatalf("/me: %d %s", code, me.Body.String())
	}
}

func TestGitHubCallbackRejections(t *testing.T) {
	e := ghEnv(t, newFakeGitHub(t, "chuitrai"))
	state, ck, _, _ := e.startGitHub(t)

	cases := []struct {
		name  string
		query string
		ck    *http.Cookie
		want  int
	}{
		{"không có cookie state", "code=good-code&state=" + state, nil, 400},
		{"state không khớp", "code=good-code&state=sai", ck, 400},
		{"thiếu state", "code=good-code", ck, 400},
		{"thiếu code", "state=" + state, ck, 400},
		{"code bị GitHub từ chối", "code=bad-code&state=" + state, ck, 400},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if w := e.callback(tc.query, tc.ck); w.Code != tc.want {
				t.Fatalf("got %d, want %d, body=%s", w.Code, tc.want, w.Body.String())
			}
		})
	}

	// Người dùng bấm "từ chối" trên GitHub: chuyển về giao diện kèm lỗi, không cấp token.
	w := e.callback("error=access_denied&state="+state, ck)
	if w.Code != 302 || !strings.Contains(w.Header().Get("Location"), "login_error=access_denied") {
		t.Fatalf("từ chối: %d %s", w.Code, w.Header().Get("Location"))
	}
}

// GitHub trả login lạ (ví dụ chứa ký tự nguy hiểm) -> không cấp token.
func TestGitHubWeirdLoginRejected(t *testing.T) {
	e := ghEnv(t, newFakeGitHub(t, "../etc/passwd"))
	state, ck, _, _ := e.startGitHub(t)
	if w := e.callback("code=good-code&state="+state, ck); w.Code != 502 {
		t.Fatalf("got %d, want 502", w.Code)
	}
}

func TestAuthMethodsAndDisabledGitHub(t *testing.T) {
	e := newEnv(t) // chỉ đăng nhập mật khẩu
	code, w := e.do("GET", "/api/v1/auth/methods", "", "")
	if code != 200 || !strings.Contains(w.Body.String(), `"github":false`) || !strings.Contains(w.Body.String(), `"password":true`) {
		t.Fatalf("methods: %d %s", code, w.Body.String())
	}
	if code, _ := e.do("GET", "/api/v1/auth/github/login", "", ""); code != 404 {
		t.Fatalf("GitHub tắt thì route phải 404, got %d", code)
	}
}

func TestPartialGitHubConfigFailsFast(t *testing.T) {
	app, err := New(Config{
		JWTSecret:      []byte("test-secret-at-least-16-chars"),
		PasswordLogin:  true,
		UserPassword:   "u",
		AdminPassword:  "a",
		DBPath:         filepath.Join(t.TempDir(), "x.db"),
		GitHubClientID: "cid", // thiếu secret, redirect, admin login
	})
	if err == nil {
		_ = app.Close()
		t.Fatal("cấu hình GitHub dở dang phải bị từ chối")
	}
}

func TestNoLoginMethodFailsFast(t *testing.T) {
	app, err := New(Config{
		JWTSecret: []byte("test-secret-at-least-16-chars"),
		DBPath:    filepath.Join(t.TempDir(), "x.db"),
	})
	if err == nil {
		_ = app.Close()
		t.Fatal("không có phương thức đăng nhập nào phải bị từ chối")
	}
}
