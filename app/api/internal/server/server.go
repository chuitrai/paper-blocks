// Package server dựng router Gin cho portfolio.
//
// Thứ tự middleware: recover -> request-id -> log -> metrics -> (rate-limit | auth) -> handler.
// log và metrics nằm NGOÀI để ghi cả request bị từ chối (403, 409).
package server

import (
	"errors"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

type Config struct {
	JWTSecret     []byte
	PasswordLogin bool // đăng nhập mật khẩu: CHỈ để chạy ma trận kiểm thử / evidence barem
	UserPassword  string
	AdminPassword string

	// GitHub OAuth: phải đặt đủ 4 giá trị đầu, hoặc không đặt giá trị nào.
	GitHubClientID     string
	GitHubClientSecret string
	GitHubRedirectURL  string
	AdminGitHubLogin   string // login GitHub được cấp quyền admin
	CookieSecure       bool   // true khi chạy sau HTTPS
	FrontendURL        string // nơi chuyển hướng sau khi đăng nhập, mặc định "/"
	// Ba URL dưới chỉ để test thay bằng máy chủ GitHub giả; mặc định là GitHub thật.
	GitHubAuthURL  string
	GitHubTokenURL string
	GitHubAPIURL   string
	HTTPClient     *http.Client
	GitHubToken    string // tuỳ chọn: tăng hạn mức gọi API khi lấy README (không cần quyền nào)
	CommentLimit   int    // số comment tối đa mỗi tài khoản trong Window, mặc định 5
	ViewLimit      int    // số lượt xem tính cho mỗi (IP, paper) trong Window, mặc định 5
	WebDir         string // tuỳ chọn, dev: phục vụ giao diện tĩnh từ thư mục này (production dùng nginx)

	DBPath      string
	PapersDir   string // thư mục lưu PDF; mặc định <thư mục của DBPath>/papers
	MaxPDFBytes int64  // mặc định 20 MiB
	SeedDemo    bool
	Version     string

	TrustedProxies []string // chỉ tin X-Forwarded-For khi request đến từ các địa chỉ này
	StatusLimit    int      // mặc định 10 request / Window cho /status
	LoginLimit     int      // mặc định 20 request / Window cho /login
	Window         time.Duration
	TokenTTL       time.Duration
	Now            func() time.Time // tiêm đồng hồ giả khi test
	Logger         *slog.Logger
}

type Server struct {
	cfg        Config
	store      *Store
	met        *metrics
	statusLim  *limiter
	loginLim   *limiter
	log        *slog.Logger
	started    time.Time
	papersDir  string
	gh         *githubAuth // nil nếu GitHub OAuth không được cấu hình
	readme     *readmeFetcher
	commentLim *limiter
	viewLim    *limiter
}

// App gói router và tài nguyên cần đóng khi tắt.
type App struct {
	Engine *gin.Engine
	store  *Store
}

func (a *App) Close() error { return a.store.Close() }

func New(cfg Config) (*App, error) {
	if len(cfg.JWTSecret) < 16 {
		return nil, errors.New("JWT_SECRET phải có ít nhất 16 ký tự")
	}
	if cfg.GitHubAPIURL == "" {
		cfg.GitHubAPIURL = "https://api.github.com"
	}
	if cfg.HTTPClient == nil {
		cfg.HTTPClient = &http.Client{Timeout: 10 * time.Second}
	}
	if cfg.CommentLimit == 0 {
		cfg.CommentLimit = 5
	}
	if cfg.ViewLimit == 0 {
		cfg.ViewLimit = 5
	}
	gh, err := newGitHubAuth(&cfg)
	if err != nil {
		return nil, err
	}
	if !cfg.PasswordLogin && gh == nil {
		return nil, errors.New("chưa có phương thức đăng nhập: bật ENABLE_PASSWORD_LOGIN=true hoặc cấu hình GitHub OAuth")
	}
	if cfg.PasswordLogin && (cfg.UserPassword == "" || cfg.AdminPassword == "") {
		return nil, errors.New("ENABLE_PASSWORD_LOGIN=true cần USER_PASSWORD và ADMIN_PASSWORD")
	}
	if cfg.DBPath == "" {
		return nil, errors.New("thiếu DB_PATH")
	}
	if cfg.Version == "" {
		cfg.Version = "dev"
	}
	if cfg.MaxPDFBytes == 0 {
		cfg.MaxPDFBytes = 20 << 20
	}
	if cfg.PapersDir == "" {
		cfg.PapersDir = filepath.Join(filepath.Dir(cfg.DBPath), "papers")
	}
	if err := os.MkdirAll(cfg.PapersDir, 0o750); err != nil {
		return nil, err
	}
	if cfg.StatusLimit == 0 {
		cfg.StatusLimit = 10
	}
	if cfg.LoginLimit == 0 {
		cfg.LoginLimit = 20
	}
	if cfg.Window == 0 {
		cfg.Window = time.Minute
	}
	if cfg.TokenTTL == 0 {
		cfg.TokenTTL = 30 * time.Minute
	}
	if cfg.Now == nil {
		cfg.Now = time.Now
	}
	if cfg.Logger == nil {
		cfg.Logger = slog.New(slog.NewJSONHandler(os.Stdout, nil))
	}

	store, err := OpenStore(cfg.DBPath)
	if err != nil {
		return nil, err
	}
	if cfg.SeedDemo {
		if err := store.SeedDemo(cfg.Now()); err != nil {
			_ = store.Close()
			return nil, err
		}
	}

	s := &Server{
		cfg:       cfg,
		store:     store,
		met:       newMetrics(),
		statusLim: newLimiter(cfg.StatusLimit, cfg.Window, cfg.Now),
		loginLim:  newLimiter(cfg.LoginLimit, cfg.Window, cfg.Now),
		log:       cfg.Logger,
		started:   cfg.Now(),
		papersDir: cfg.PapersDir,
		gh:        gh,
		readme: &readmeFetcher{
			apiURL: cfg.GitHubAPIURL, token: cfg.GitHubToken, client: cfg.HTTPClient,
			now: cfg.Now, cache: map[string]cacheEntry{},
		},
		commentLim: newLimiter(cfg.CommentLimit, cfg.Window, cfg.Now),
		viewLim:    newLimiter(cfg.ViewLimit, cfg.Window, cfg.Now),
	}

	r := gin.New()
	r.MaxMultipartMemory = 8 << 20 // phần vượt quá được gin đệm ra đĩa tạm
	// nil = không tin proxy nào: ClientIP() là địa chỉ TCP thật, header giả bị bỏ qua.
	if err := r.SetTrustedProxies(cfg.TrustedProxies); err != nil {
		_ = store.Close()
		return nil, err
	}
	r.Use(gin.Recovery(), s.requestID(), s.accessLog(), s.metricsMW())

	r.GET("/healthz", func(c *gin.Context) { c.JSON(200, gin.H{"status": "ok"}) })
	r.GET("/readyz", func(c *gin.Context) { c.JSON(200, gin.H{"status": "ready"}) })
	r.GET("/metrics", gin.WrapH(promhttp.HandlerFor(s.met.reg, promhttp.HandlerOpts{})))

	v1 := r.Group("/api/v1")
	if cfg.PasswordLogin {
		v1.POST("/login", s.rateLimit(s.loginLim), s.login)
	}
	v1.GET("/auth/methods", s.authMethods)
	if gh != nil {
		v1.GET("/auth/github/login", s.rateLimit(s.loginLim), s.githubLogin)
		v1.GET("/auth/github/callback", s.rateLimit(s.loginLim), s.githubCallback)
	}
	v1.GET("/status", s.rateLimit(s.statusLim), s.status)
	v1.GET("/papers", s.listPapers)
	v1.GET("/tags", s.listTags)
	v1.GET("/stats", s.stats)
	v1.GET("/papers/:id", s.getPaper)
	v1.POST("/papers/:id/view",
		s.rateLimitBy(s.viewLim, func(c *gin.Context) string {
			// Chuẩn hoá id: chuỗi lạ không được tạo thêm khoá trong bộ nhớ của limiter.
			if id, ok := pathID(c); ok {
				return c.ClientIP() + "/" + strconv.FormatInt(id, 10)
			}
			return c.ClientIP() + "/invalid"
		}),
		s.viewPaper)
	v1.GET("/papers/:id/file", s.paperFile)
	v1.GET("/papers/:id/readme", s.paperReadme)
	v1.GET("/papers/:id/comments", s.listComments)

	authed := v1.Group("", s.authenticate())
	authed.GET("/me", s.me)
	// Giới hạn comment theo TÀI KHOẢN (không theo IP, vì nhiều người có thể chung IP).
	authed.POST("/papers/:id/comments",
		s.rateLimitBy(s.commentLim, func(c *gin.Context) string { return c.GetString("user") }),
		s.createComment)
	authed.PATCH("/comments/:id",
		s.rateLimitBy(s.commentLim, func(c *gin.Context) string { return c.GetString("user") }),
		s.updateComment)
	authed.DELETE("/comments/:id", s.deleteComment)

	admin := authed.Group("", s.requireRole("admin"))
	admin.POST("/papers", s.createPaper)
	admin.POST("/papers/:id/file", s.uploadPDF)
	admin.DELETE("/papers/:id", s.deletePaper)

	if cfg.WebDir != "" {
		// Route không khớp thì trả file tĩnh; /api/... không tồn tại vẫn ra 404 của file server.
		r.NoRoute(gin.WrapH(http.FileServer(http.Dir(cfg.WebDir))))
	}

	return &App{Engine: r, store: store}, nil
}
