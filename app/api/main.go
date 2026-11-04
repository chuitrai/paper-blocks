package main

import (
	"context"
	"errors"
	"log"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"

	"pipelinequest/api/internal/server"
)

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	// Fail fast: thiếu secret thì dừng ngay thay vì chạy với giá trị rỗng.
	cfg := server.Config{
		JWTSecret:     []byte(os.Getenv("JWT_SECRET")),
		PasswordLogin: os.Getenv("ENABLE_PASSWORD_LOGIN") == "true",
		UserPassword:  os.Getenv("USER_PASSWORD"),
		AdminPassword: os.Getenv("ADMIN_PASSWORD"),
		DBPath:        env("DB_PATH", "data/app.db"),

		GitHubClientID:     os.Getenv("GITHUB_CLIENT_ID"),
		GitHubClientSecret: os.Getenv("GITHUB_CLIENT_SECRET"),
		GitHubRedirectURL:  os.Getenv("GITHUB_REDIRECT_URL"),
		AdminGitHubLogin:   os.Getenv("ADMIN_GITHUB_LOGIN"),
		CookieSecure:       os.Getenv("COOKIE_SECURE") == "true",
		FrontendURL:        os.Getenv("FRONTEND_URL"),
		GitHubToken:        os.Getenv("GITHUB_TOKEN"),
		WebDir:             os.Getenv("WEB_DIR"), // chỉ dùng khi dev: API phục vụ luôn giao diện tĩnh

		SeedDemo: os.Getenv("SEED_DEMO") == "true",
		Version:  env("APP_VERSION", "dev"),
		Logger:   logger,
	}
	if tp := os.Getenv("TRUSTED_PROXIES"); tp != "" {
		cfg.TrustedProxies = strings.Split(tp, ",")
	}

	if err := os.MkdirAll(filepath.Dir(cfg.DBPath), 0o750); err != nil {
		log.Fatalf("không tạo được thư mục dữ liệu: %v", err)
	}
	if os.Getenv("GIN_MODE") == "" {
		gin.SetMode(gin.ReleaseMode)
	}
	app, err := server.New(cfg)
	if err != nil {
		log.Fatalf("cấu hình không hợp lệ: %v", err)
	}

	srv := &http.Server{
		Addr:              ":" + env("PORT", "8080"),
		Handler:           app.Engine,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       60 * time.Second, // đủ để tải PDF 20 MiB qua mạng chậm
		WriteTimeout:      60 * time.Second,
	}

	go func() {
		logger.Info("listening", "addr", srv.Addr, "version", cfg.Version)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server: %v", err)
		}
	}()

	// Graceful shutdown: Kubernetes gửi SIGTERM khi cập nhật/di chuyển pod.
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	logger.Info("shutting down")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		logger.Error("shutdown", "err", err)
	}
	if err := app.Close(); err != nil { // đóng DB sau cùng, khi không còn request nào
		logger.Error("close db", "err", err)
	}
}
