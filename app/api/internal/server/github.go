package server

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	stateCookie = "oauth_state"
	statePath   = "/api/v1/auth/github"
)

// Login GitHub: 1-39 ký tự chữ-số-gạch ngang, không bắt đầu bằng gạch ngang.
var loginRe = regexp.MustCompile(`^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$`)

var errGitHubRejected = errors.New("github rejected the code")

type githubAuth struct {
	clientID, secret, redirect, adminLogin string
	authURL, tokenURL, apiURL              string
	frontendURL                            string
	secure                                 bool
	client                                 *http.Client
}

// newGitHubAuth trả (nil, nil) nếu GitHub OAuth không được cấu hình,
// và lỗi nếu cấu hình dở dang (thiếu một trong bốn giá trị bắt buộc).
func newGitHubAuth(cfg *Config) (*githubAuth, error) {
	vals := []string{cfg.GitHubClientID, cfg.GitHubClientSecret, cfg.GitHubRedirectURL, cfg.AdminGitHubLogin}
	set := 0
	for _, v := range vals {
		if v != "" {
			set++
		}
	}
	if set == 0 {
		return nil, nil
	}
	if set != len(vals) {
		return nil, errors.New("GitHub OAuth cấu hình thiếu: cần đủ GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_REDIRECT_URL, ADMIN_GITHUB_LOGIN")
	}
	u, err := url.Parse(cfg.GitHubRedirectURL)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return nil, errors.New("GITHUB_REDIRECT_URL không hợp lệ")
	}
	if !loginRe.MatchString(cfg.AdminGitHubLogin) {
		return nil, errors.New("ADMIN_GITHUB_LOGIN không hợp lệ")
	}
	g := &githubAuth{
		clientID:    cfg.GitHubClientID,
		secret:      cfg.GitHubClientSecret,
		redirect:    cfg.GitHubRedirectURL,
		adminLogin:  cfg.AdminGitHubLogin,
		authURL:     cfg.GitHubAuthURL,
		tokenURL:    cfg.GitHubTokenURL,
		apiURL:      cfg.GitHubAPIURL,
		frontendURL: cfg.FrontendURL,
		secure:      cfg.CookieSecure,
		client:      cfg.HTTPClient,
	}
	// Các URL này lấy từ cấu hình của MÌNH, không bao giờ từ input người dùng (không có SSRF).
	if g.authURL == "" {
		g.authURL = "https://github.com/login/oauth/authorize"
	}
	if g.tokenURL == "" {
		g.tokenURL = "https://github.com/login/oauth/access_token"
	}
	if g.apiURL == "" {
		g.apiURL = "https://api.github.com"
	}
	if g.frontendURL == "" {
		g.frontendURL = "/"
	}
	if g.client == nil {
		g.client = &http.Client{Timeout: 10 * time.Second}
	}
	return g, nil
}

func randomHex(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// identify đổi code lấy access token rồi đọc danh tính công khai. Access token của người dùng
// chỉ sống trong hàm này, không bao giờ được lưu hay ghi log.
func (g *githubAuth) identify(ctx context.Context, code string) (login, avatar string, err error) {
	form := url.Values{
		"client_id":     {g.clientID},
		"client_secret": {g.secret},
		"code":          {code},
		"redirect_uri":  {g.redirect},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, g.tokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")
	resp, err := g.client.Do(req)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", "", fmt.Errorf("token endpoint: status %d", resp.StatusCode)
	}
	var tr struct {
		AccessToken string `json:"access_token"`
		Error       string `json:"error"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&tr); err != nil {
		return "", "", fmt.Errorf("token endpoint: %w", err)
	}
	if tr.Error != "" || tr.AccessToken == "" {
		return "", "", errGitHubRejected // GitHub trả 200 kèm trường error khi code sai/hết hạn
	}

	ureq, err := http.NewRequestWithContext(ctx, http.MethodGet, g.apiURL+"/user", nil)
	if err != nil {
		return "", "", err
	}
	ureq.Header.Set("Authorization", "Bearer "+tr.AccessToken)
	ureq.Header.Set("Accept", "application/vnd.github+json")
	ureq.Header.Set("User-Agent", "portfolio-oauth") // GitHub API bắt buộc có User-Agent
	uresp, err := g.client.Do(ureq)
	if err != nil {
		return "", "", err
	}
	defer uresp.Body.Close()
	if uresp.StatusCode != http.StatusOK {
		return "", "", fmt.Errorf("user endpoint: status %d", uresp.StatusCode)
	}
	var u struct {
		Login     string `json:"login"`
		AvatarURL string `json:"avatar_url"`
	}
	if err := json.NewDecoder(io.LimitReader(uresp.Body, 1<<20)).Decode(&u); err != nil {
		return "", "", fmt.Errorf("user endpoint: %w", err)
	}
	if !loginRe.MatchString(u.Login) { // dữ liệu từ bên ngoài: luôn kiểm tra trước khi dùng
		return "", "", errors.New("login GitHub trả về không hợp lệ")
	}
	if validHTTPS(u.AvatarURL) {
		avatar = u.AvatarURL
	}
	return u.Login, avatar, nil
}

func (s *Server) authMethods(c *gin.Context) {
	c.JSON(200, gin.H{"password": s.cfg.PasswordLogin, "github": s.gh != nil})
}

// githubLogin: sinh state ngẫu nhiên, gắn vào cookie ngắn hạn rồi chuyển hướng sang GitHub.
// Không xin scope nào: chỉ cần danh tính công khai.
func (s *Server) githubLogin(c *gin.Context) {
	state, err := randomHex(16)
	if err != nil {
		s.fail(c, err)
		return
	}
	c.SetSameSite(http.SameSiteLaxMode) // Lax để cookie còn được gửi khi GitHub chuyển hướng về
	c.SetCookie(stateCookie, state, 600, statePath, "", s.gh.secure, true)
	q := url.Values{"client_id": {s.gh.clientID}, "redirect_uri": {s.gh.redirect}, "state": {state}}
	c.Redirect(http.StatusFound, s.gh.authURL+"?"+q.Encode())
}

func (s *Server) githubCallback(c *gin.Context) {
	want, cookieErr := c.Cookie(stateCookie)
	got := c.Query("state")
	// state chỉ dùng một lần: xoá ngay dù kết quả ra sao.
	c.SetSameSite(http.SameSiteLaxMode)
	c.SetCookie(stateCookie, "", -1, statePath, "", s.gh.secure, true)
	if cookieErr != nil || want == "" || subtle.ConstantTimeCompare([]byte(want), []byte(got)) != 1 {
		c.JSON(400, gin.H{"error": "invalid state"})
		return
	}
	if c.Query("error") != "" { // người dùng bấm từ chối trên GitHub
		c.Redirect(http.StatusFound, s.gh.frontendURL+"#login_error=access_denied")
		return
	}
	code := c.Query("code")
	if code == "" || len(code) > 200 {
		c.JSON(400, gin.H{"error": "missing code"})
		return
	}

	login, avatar, err := s.gh.identify(c.Request.Context(), code)
	if errors.Is(err, errGitHubRejected) {
		c.JSON(400, gin.H{"error": "github rejected the code"})
		return
	}
	if err != nil {
		s.log.Error("github identify", "request_id", c.GetString("request_id"), "err", err.Error())
		c.JSON(502, gin.H{"error": "github unavailable"})
		return
	}

	// Quyền lấy từ login do GitHub xác nhận, không bao giờ từ client.
	role := "user"
	if strings.EqualFold(login, s.gh.adminLogin) {
		role = "admin"
	}
	// Tiền tố "gh:" để một người GitHub tên "admin" không giả danh tài khoản mật khẩu "admin".
	tok, exp, err := s.issue("gh:"+login, role, avatar)
	if err != nil {
		s.fail(c, err)
		return
	}
	// Token đi trong URL fragment (#...): không gửi tới server, không nằm trong Referer hay access log.
	c.Header("Cache-Control", "no-store")
	c.Header("Referrer-Policy", "no-referrer")
	frag := url.Values{"token": {tok}, "expires_at": {exp.UTC().Format(time.RFC3339)}, "role": {role}}
	c.Redirect(http.StatusFound, s.gh.frontendURL+"#"+frag.Encode())
}
