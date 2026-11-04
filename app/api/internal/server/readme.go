package server

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	maxReadme = 256 << 10
	okTTL     = 10 * time.Minute // README còn mới
	missTTL   = 5 * time.Minute  // repo không có README
	errTTL    = 1 * time.Minute  // lỗi/hết hạn mức: đừng dồn dập gọi lại GitHub
	maxCache  = 200
)

var (
	errNoReadme = errors.New("repository has no README")
	errUpstream = errors.New("github unavailable")
)

// parseRepo chỉ nhận đúng https://github.com/<owner>/<repo>. "." và ".." bị từ chối
// (regex cho phép dấu chấm nhưng chúng sẽ làm đường dẫn gọi GitHub bị hiểu sai).
func parseRepo(raw string) (owner, repo string, ok bool) {
	if !repoRe.MatchString(raw) {
		return "", "", false
	}
	parts := strings.Split(strings.TrimPrefix(raw, "https://github.com/"), "/")
	if len(parts) != 2 {
		return "", "", false
	}
	for _, p := range parts {
		if p == "." || p == ".." {
			return "", "", false
		}
	}
	return parts[0], parts[1], true
}

type readmeResult struct {
	Repo      string    `json:"repo"`
	Markdown  string    `json:"markdown"` // văn bản thô; giao diện phải hiển thị bằng textContent
	Truncated bool      `json:"truncated"`
	FetchedAt time.Time `json:"fetched_at"`
}

type cacheEntry struct {
	res     readmeResult
	err     error
	expires time.Time
}

// readmeFetcher chỉ gọi api.github.com theo cấu hình của MÌNH và owner/repo đã kiểm tra
// nghiêm ngặt; không bao giờ gọi URL do người dùng cung cấp (không có SSRF).
type readmeFetcher struct {
	apiURL string
	token  string // tuỳ chọn: tăng hạn mức API; không cần quyền nào cho repo công khai
	client *http.Client
	now    func() time.Time

	mu    sync.Mutex
	cache map[string]cacheEntry
}

func (f *readmeFetcher) get(ctx context.Context, owner, repo string) (readmeResult, error) {
	key := strings.ToLower(owner + "/" + repo)
	f.mu.Lock()
	if e, ok := f.cache[key]; ok && f.now().Before(e.expires) {
		f.mu.Unlock()
		return e.res, e.err
	}
	f.mu.Unlock()

	res, err := f.fetch(ctx, owner, repo)

	ttl := okTTL
	switch {
	case errors.Is(err, errNoReadme):
		ttl = missTTL
	case err != nil:
		ttl = errTTL
	}
	f.mu.Lock()
	if len(f.cache) >= maxCache {
		now := f.now()
		for k, e := range f.cache {
			if !now.Before(e.expires) {
				delete(f.cache, k)
			}
		}
		if len(f.cache) >= maxCache {
			f.cache = map[string]cacheEntry{}
		}
	}
	f.cache[key] = cacheEntry{res: res, err: err, expires: f.now().Add(ttl)}
	f.mu.Unlock()
	return res, err
}

func (f *readmeFetcher) fetch(ctx context.Context, owner, repo string) (readmeResult, error) {
	u := f.apiURL + "/repos/" + url.PathEscape(owner) + "/" + url.PathEscape(repo) + "/readme"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return readmeResult{}, err
	}
	req.Header.Set("Accept", "application/vnd.github.raw+json") // trả markdown thô
	req.Header.Set("User-Agent", "portfolio-readme")
	if f.token != "" {
		req.Header.Set("Authorization", "Bearer "+f.token)
	}
	resp, err := f.client.Do(req)
	if err != nil {
		return readmeResult{}, fmt.Errorf("%w: %v", errUpstream, err)
	}
	defer resp.Body.Close()
	switch resp.StatusCode {
	case http.StatusOK:
	case http.StatusNotFound:
		return readmeResult{}, errNoReadme
	case http.StatusForbidden, http.StatusTooManyRequests:
		return readmeResult{}, fmt.Errorf("%w: rate limited", errUpstream)
	default:
		return readmeResult{}, fmt.Errorf("%w: status %d", errUpstream, resp.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, maxReadme+1))
	if err != nil {
		return readmeResult{}, fmt.Errorf("%w: %v", errUpstream, err)
	}
	truncated := len(data) > maxReadme
	if truncated {
		data = data[:maxReadme]
	}
	return readmeResult{
		Repo:      owner + "/" + repo,
		Markdown:  strings.ToValidUTF8(string(data), ""),
		Truncated: truncated,
		FetchedAt: f.now().UTC(),
	}, nil
}

func (s *Server) paperReadme(c *gin.Context) {
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
	owner, repo, ok := parseRepo(p.RepoURL)
	if !ok {
		c.JSON(404, gin.H{"error": "paper has no repository"})
		return
	}
	res, err := s.readme.get(c.Request.Context(), owner, repo)
	switch {
	case errors.Is(err, errNoReadme):
		c.JSON(404, gin.H{"error": err.Error()})
	case errors.Is(err, errUpstream):
		s.log.Error("readme upstream", "request_id", c.GetString("request_id"), "err", err.Error())
		c.JSON(502, gin.H{"error": "github unavailable"})
	case err != nil:
		s.fail(c, err)
	default:
		c.JSON(200, res)
	}
}
