package server

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	_ "modernc.org/sqlite" // driver SQLite thuần Go: giữ CGO_ENABLED=0
)

// Paper là bản ghi trả cho client. Client KHÔNG được đặt id/has_pdf/created_at:
// dữ liệu đầu vào đi qua paperInput.
type Paper struct {
	ID        int64     `json:"id"`
	Title     string    `json:"title"`
	Abstract  string    `json:"abstract"`
	Tags      []string  `json:"tags"`
	RepoURL   string    `json:"repo_url"`
	VideoURL  string    `json:"video_url"`
	DemoURL   string    `json:"demo_url"`
	HasPDF    bool      `json:"has_pdf"`
	CreatedAt time.Time `json:"created_at"`
	Views     int64     `json:"views"`
	Comments  int64     `json:"comment_count"`
}

type paperInput struct {
	Title    string   `json:"title"`
	Abstract string   `json:"abstract"`
	Tags     []string `json:"tags"`
	RepoURL  string   `json:"repo_url"`
	VideoURL string   `json:"video_url"`
	DemoURL  string   `json:"demo_url"`
}

var (
	errDuplicate = errors.New("paper already exists")
	errNotFound  = errors.New("not found")
	errBadParent = errors.New("invalid parent comment")
	repoRe      = regexp.MustCompile(`^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$`)
)

// validate chuẩn hoá và kiểm tra đầu vào; trả "" nếu hợp lệ, ngược lại là thông báo lỗi.
func (in *paperInput) validate() string {
	in.Title = strings.TrimSpace(in.Title)
	in.Abstract = strings.TrimSpace(in.Abstract)
	if n := utf8.RuneCountInString(in.Title); n < 1 || n > 120 {
		return "title must be 1-120 characters"
	}
	if utf8.RuneCountInString(in.Abstract) > 2000 {
		return "abstract must be at most 2000 characters"
	}
	if in.Tags == nil {
		in.Tags = []string{}
	}
	if len(in.Tags) > 8 {
		return "at most 8 tags"
	}
	for i, t := range in.Tags {
		t = strings.TrimSpace(t)
		if n := utf8.RuneCountInString(t); n < 1 || n > 24 {
			return "each tag must be 1-24 characters"
		}
		in.Tags[i] = t
	}
	if in.RepoURL != "" {
		if _, _, ok := parseRepo(in.RepoURL); !ok {
			return "repo_url must look like https://github.com/<owner>/<repo>"
		}
	}
	if in.VideoURL != "" && !validHTTPS(in.VideoURL) {
		return "video_url must be an https URL"
	}
	if in.DemoURL != "" && !validHTTPS(in.DemoURL) {
		return "demo_url must be an https URL"
	}
	return ""
}

func validHTTPS(raw string) bool {
	if len(raw) > 300 {
		return false
	}
	u, err := url.Parse(raw)
	return err == nil && u.Scheme == "https" && u.Host != "" && u.User == nil
}

// Store lưu dữ liệu trong SQLite. Chỉ an toàn khi MỘT tiến trình ghi (replicas: 1).
type Store struct{ db *sql.DB }

func OpenStore(path string) (*Store, error) {
	db, err := sql.Open("sqlite", path+"?_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)")
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1) // SQLite chỉ một người ghi; một kết nối tránh lỗi "database is locked"
	s := &Store{db: db}
	if err := s.migrate(); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("migrate: %w", err)
	}
	return s, nil
}

func (s *Store) Close() error { return s.db.Close() }

func (s *Store) migrate() error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS papers (
			id         INTEGER PRIMARY KEY AUTOINCREMENT,
			title      TEXT NOT NULL COLLATE NOCASE UNIQUE,
			abstract   TEXT NOT NULL DEFAULT '',
			tags       TEXT NOT NULL DEFAULT '[]',
			repo_url   TEXT NOT NULL DEFAULT '',
			video_url  TEXT NOT NULL DEFAULT '',
			demo_url   TEXT NOT NULL DEFAULT '',
			pdf_file   TEXT NOT NULL DEFAULT '',
			created_at INTEGER NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS comments (
			id            INTEGER PRIMARY KEY AUTOINCREMENT,
			paper_id      INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
			author_login  TEXT NOT NULL,
			author_avatar TEXT NOT NULL DEFAULT '',
			body          TEXT NOT NULL,
			created_at    INTEGER NOT NULL)`,
		`CREATE INDEX IF NOT EXISTS idx_comments_paper ON comments(paper_id, created_at)`,
	}
	for _, q := range stmts {
		if _, err := s.db.Exec(q); err != nil {
			return err
		}
	}
	// Cột thêm sau này: ALTER chỉ chạy khi cột chưa có, nên DB cũ (đã có dữ liệu) được nâng cấp tại chỗ
	// và chạy lại nhiều lần vẫn an toàn (idempotent).
	for _, a := range []struct{ table, col, ddl string }{
		{"papers", "views", `ALTER TABLE papers ADD COLUMN views INTEGER NOT NULL DEFAULT 0`},
		{"comments", "parent_id", `ALTER TABLE comments ADD COLUMN parent_id INTEGER REFERENCES comments(id) ON DELETE CASCADE`},
		{"comments", "edited_at", `ALTER TABLE comments ADD COLUMN edited_at INTEGER NOT NULL DEFAULT 0`},
	} {
		var n int
		if err := s.db.QueryRow(`SELECT COUNT(*) FROM pragma_table_info(?) WHERE name = ?`, a.table, a.col).Scan(&n); err != nil {
			return err
		}
		if n == 0 {
			if _, err := s.db.Exec(a.ddl); err != nil {
				return err
			}
		}
	}
	return nil
}

// comment_count tính bằng truy vấn con: luôn khớp với bảng comments, không cần đồng bộ bộ đếm.
const paperCols = `id, title, abstract, tags, repo_url, video_url, demo_url, pdf_file, created_at, views,
	(SELECT COUNT(*) FROM comments c WHERE c.paper_id = papers.id)`

type scanner interface{ Scan(dest ...any) error }

func scanPaper(sc scanner) (Paper, error) {
	var (
		p    Paper
		tags string
		pdf  string
		ts   int64
	)
	if err := sc.Scan(&p.ID, &p.Title, &p.Abstract, &tags, &p.RepoURL, &p.VideoURL, &p.DemoURL, &pdf, &ts, &p.Views, &p.Comments); err != nil {
		return Paper{}, err
	}
	if err := json.Unmarshal([]byte(tags), &p.Tags); err != nil || p.Tags == nil {
		p.Tags = []string{}
	}
	p.HasPDF = pdf != ""
	p.CreatedAt = time.Unix(ts, 0).UTC()
	return p, nil
}

// paperFilter: mọi trường đều tuỳ chọn. Giá trị đi vào truy vấn bằng tham số (không nối chuỗi),
// riêng Sort chỉ nhận giá trị trong danh sách trắng.
type paperFilter struct {
	Q    string // tìm trong tiêu đề và tóm tắt
	Tag  string // khớp đúng một tag, không phân biệt hoa thường
	Sort string // "" hoặc "new" = mới nhất; "views" = nhiều lượt xem nhất
}

var likeEscaper = strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)

func (s *Store) ListPapers() ([]Paper, error) { return s.SearchPapers(paperFilter{}) }

func (s *Store) SearchPapers(f paperFilter) ([]Paper, error) {
	var (
		where []string
		args  []any
	)
	if f.Q != "" {
		pat := "%" + likeEscaper.Replace(f.Q) + "%" // người dùng gõ % hoặc _ thì tìm đúng ký tự đó
		where = append(where, `(title LIKE ? ESCAPE '\' OR abstract LIKE ? ESCAPE '\')`)
		args = append(args, pat, pat)
	}
	if f.Tag != "" {
		where = append(where, `EXISTS (SELECT 1 FROM json_each(papers.tags) WHERE lower(value) = lower(?))`)
		args = append(args, f.Tag)
	}
	q := `SELECT ` + paperCols + ` FROM papers`
	if len(where) > 0 {
		q += ` WHERE ` + strings.Join(where, ` AND `)
	}
	if f.Sort == "views" {
		q += ` ORDER BY views DESC, id DESC`
	} else {
		q += ` ORDER BY created_at DESC, id DESC`
	}
	q += ` LIMIT 200`
	rows, err := s.db.Query(q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Paper{}
	for rows.Next() {
		p, err := scanPaper(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *Store) GetPaper(id int64) (Paper, error) {
	p, err := scanPaper(s.db.QueryRow(`SELECT `+paperCols+` FROM papers WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return Paper{}, errNotFound
	}
	return p, err
}

func (s *Store) CreatePaper(in paperInput, now time.Time) (Paper, error) {
	tags, err := json.Marshal(in.Tags)
	if err != nil {
		return Paper{}, err
	}
	res, err := s.db.Exec(
		`INSERT INTO papers (title, abstract, tags, repo_url, video_url, demo_url, created_at) VALUES (?,?,?,?,?,?,?)`,
		in.Title, in.Abstract, string(tags), in.RepoURL, in.VideoURL, in.DemoURL, now.Unix())
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			return Paper{}, errDuplicate
		}
		return Paper{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return Paper{}, err
	}
	return s.GetPaper(id)
}

// DeletePaper xoá bản ghi và trả tên file PDF (nếu có) để caller xoá file trên đĩa.
func (s *Store) DeletePaper(id int64) (string, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return "", err
	}
	defer tx.Rollback() //nolint:errcheck // no-op sau Commit
	var pdf string
	if err := tx.QueryRow(`SELECT pdf_file FROM papers WHERE id = ?`, id).Scan(&pdf); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", errNotFound
		}
		return "", err
	}
	if _, err := tx.Exec(`DELETE FROM papers WHERE id = ?`, id); err != nil {
		return "", err
	}
	return pdf, tx.Commit()
}

// PDFName trả tên file PDF đã lưu ("" nếu paper chưa có PDF).
func (s *Store) PDFName(id int64) (string, error) {
	var name string
	err := s.db.QueryRow(`SELECT pdf_file FROM papers WHERE id = ?`, id).Scan(&name)
	if errors.Is(err, sql.ErrNoRows) {
		return "", errNotFound
	}
	return name, err
}

// SetPDF gắn file PDF mới cho paper và trả tên file cũ (để caller xoá).
func (s *Store) SetPDF(id int64, name string) (string, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return "", err
	}
	defer tx.Rollback() //nolint:errcheck // no-op sau Commit
	var old string
	if err := tx.QueryRow(`SELECT pdf_file FROM papers WHERE id = ?`, id).Scan(&old); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "", errNotFound
		}
		return "", err
	}
	if _, err := tx.Exec(`UPDATE papers SET pdf_file = ? WHERE id = ?`, name, id); err != nil {
		return "", err
	}
	return old, tx.Commit()
}

// AddView tăng bộ đếm lượt xem và trả giá trị mới.
func (s *Store) AddView(id int64) (int64, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback() //nolint:errcheck // no-op sau Commit
	res, err := tx.Exec(`UPDATE papers SET views = views + 1 WHERE id = ?`, id)
	if err != nil {
		return 0, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return 0, errNotFound
	}
	var v int64
	if err := tx.QueryRow(`SELECT views FROM papers WHERE id = ?`, id).Scan(&v); err != nil {
		return 0, err
	}
	return v, tx.Commit()
}

type TagCount struct {
	Tag   string `json:"tag"`
	Count int64  `json:"count"`
}

// ListTags gộp tag không phân biệt hoa thường, nhiều nhất trước.
func (s *Store) ListTags() ([]TagCount, error) {
	rows, err := s.db.Query(`SELECT lower(j.value) AS t, COUNT(*) FROM papers, json_each(papers.tags) j
		GROUP BY t ORDER BY COUNT(*) DESC, t LIMIT 100`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []TagCount{}
	for rows.Next() {
		var tc TagCount
		if err := rows.Scan(&tc.Tag, &tc.Count); err != nil {
			return nil, err
		}
		out = append(out, tc)
	}
	return out, rows.Err()
}

type TopPaper struct {
	ID    int64  `json:"id"`
	Title string `json:"title"`
	Views int64  `json:"views"`
}

type Stats struct {
	Papers    int64      `json:"papers"`
	Comments  int64      `json:"comments"`
	Views     int64      `json:"views"`
	TopPapers []TopPaper `json:"top_papers"`
}

func (s *Store) Stats() (Stats, error) {
	var st Stats
	if err := s.db.QueryRow(`SELECT COUNT(*), COALESCE(SUM(views), 0) FROM papers`).Scan(&st.Papers, &st.Views); err != nil {
		return st, err
	}
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM comments`).Scan(&st.Comments); err != nil {
		return st, err
	}
	rows, err := s.db.Query(`SELECT id, title, views FROM papers ORDER BY views DESC, id DESC LIMIT 5`)
	if err != nil {
		return st, err
	}
	defer rows.Close()
	st.TopPapers = []TopPaper{}
	for rows.Next() {
		var tp TopPaper
		if err := rows.Scan(&tp.ID, &tp.Title, &tp.Views); err != nil {
			return st, err
		}
		st.TopPapers = append(st.TopPapers, tp)
	}
	return st, rows.Err()
}

// Comment: Author là subject trong token ("gh:<login>" hoặc "user"/"admin").
// ParentID != 0 nghĩa là trả lời một comment gốc (chỉ một cấp).
type Comment struct {
	ID        int64      `json:"id"`
	PaperID   int64      `json:"paper_id"`
	ParentID  int64      `json:"parent_id,omitempty"`
	Author    string     `json:"author"`
	Avatar    string     `json:"avatar"`
	Body      string     `json:"body"`
	CreatedAt time.Time  `json:"created_at"`
	EditedAt  *time.Time `json:"edited_at,omitempty"`
}

const commentCols = `id, paper_id, parent_id, author_login, author_avatar, body, created_at, edited_at`

func scanComment(sc scanner) (Comment, error) {
	var (
		c      Comment
		parent sql.NullInt64
		ts, ed int64
	)
	if err := sc.Scan(&c.ID, &c.PaperID, &parent, &c.Author, &c.Avatar, &c.Body, &ts, &ed); err != nil {
		return Comment{}, err
	}
	c.ParentID = parent.Int64 // NULL -> 0 -> bị omitempty bỏ qua
	c.CreatedAt = time.Unix(ts, 0).UTC()
	if ed > 0 {
		t := time.Unix(ed, 0).UTC()
		c.EditedAt = &t
	}
	return c, nil
}

func (s *Store) ListComments(paperID int64) ([]Comment, error) {
	rows, err := s.db.Query(`SELECT `+commentCols+` FROM comments WHERE paper_id = ? ORDER BY created_at, id LIMIT 200`, paperID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Comment{}
	for rows.Next() {
		c, err := scanComment(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *Store) GetComment(id int64) (Comment, error) {
	c, err := scanComment(s.db.QueryRow(`SELECT `+commentCols+` FROM comments WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return Comment{}, errNotFound
	}
	return c, err
}

// CreateComment từ chối comment trùng hệt comment ngay trước của cùng người trên cùng paper.
// parentID = 0 là comment gốc; khác 0 phải là comment gốc (không phải một reply) của CÙNG paper.
func (s *Store) CreateComment(paperID, parentID int64, author, avatar, body string, now time.Time) (Comment, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return Comment{}, err
	}
	defer tx.Rollback() //nolint:errcheck // no-op sau Commit
	var parent sql.NullInt64
	if parentID != 0 {
		var pp int64
		var pparent sql.NullInt64
		err := tx.QueryRow(`SELECT paper_id, parent_id FROM comments WHERE id = ?`, parentID).Scan(&pp, &pparent)
		if errors.Is(err, sql.ErrNoRows) || (err == nil && (pp != paperID || pparent.Valid)) {
			return Comment{}, errBadParent
		}
		if err != nil {
			return Comment{}, err
		}
		parent = sql.NullInt64{Int64: parentID, Valid: true}
	}
	var last string
	err = tx.QueryRow(`SELECT body FROM comments WHERE paper_id = ? AND author_login = ? ORDER BY id DESC LIMIT 1`,
		paperID, author).Scan(&last)
	if err == nil && last == body {
		return Comment{}, errDuplicate
	}
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return Comment{}, err
	}
	res, err := tx.Exec(`INSERT INTO comments (paper_id, parent_id, author_login, author_avatar, body, created_at) VALUES (?,?,?,?,?,?)`,
		paperID, parent, author, avatar, body, now.Unix())
	if err != nil {
		if strings.Contains(err.Error(), "FOREIGN KEY") { // paper không tồn tại
			return Comment{}, errNotFound
		}
		return Comment{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return Comment{}, err
	}
	if err := tx.Commit(); err != nil {
		return Comment{}, err
	}
	return s.GetComment(id)
}

// UpdateComment đổi nội dung và đánh dấu đã sửa. Việc kiểm tra chủ sở hữu do handler làm.
func (s *Store) UpdateComment(id int64, body string, now time.Time) (Comment, error) {
	res, err := s.db.Exec(`UPDATE comments SET body = ?, edited_at = ? WHERE id = ?`, body, now.Unix(), id)
	if err != nil {
		return Comment{}, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return Comment{}, errNotFound
	}
	return s.GetComment(id)
}

func (s *Store) DeleteComment(id int64) error {
	res, err := s.db.Exec(`DELETE FROM comments WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return errNotFound
	}
	return nil
}

// SeedDemo thêm các paper mẫu về DevOps khi bảng còn trống (chỉ dùng cho demo/local).
// Chủ ý chỉ nạp khi DB trống: nếu nạp lại mỗi lần khởi động thì paper admin đã xoá sẽ hiện lại.
func (s *Store) SeedDemo(now time.Time) error {
	var n int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM papers`).Scan(&n); err != nil || n > 0 {
		return err
	}
	for _, in := range []paperInput{
		{Title: "Dựng cụm Kubernetes bằng kubeadm", Abstract: "Một master và một worker trên máy ảo: containerd, Calico, và các lỗi thực tế như NIC NAT với host-only, containerd chưa sẵn sàng khi init.", Tags: []string{"kubernetes", "kubeadm", "infra"}, RepoURL: "https://github.com/kubernetes/kubeadm"},
		{Title: "Đóng gói ứng dụng bằng Helm chart", Abstract: "Chart cho API và web: values theo môi trường, Deployment strategy Recreate vì SQLite, PVC cho dữ liệu.", Tags: []string{"helm", "kubernetes"}, RepoURL: "https://github.com/helm/helm"},
		{Title: "GitOps với ArgoCD", Abstract: "Ba repo (app, config, infra); ArgoCD đồng bộ từ config repo, ApplicationSet tạo môi trường preview theo từng PR.", Tags: []string{"argocd", "gitops", "ci/cd"}, RepoURL: "https://github.com/argoproj/argo-cd"},
		{Title: "Jenkins CI theo tag", Abstract: "Push tag kích hoạt build, đẩy image lên Docker Hub rồi cập nhật tag trong config repo.", Tags: []string{"jenkins", "ci/cd"}, RepoURL: "https://github.com/jenkinsci/jenkins"},
		{Title: "Giám sát bằng Prometheus", Abstract: "Cài bằng Ansible, thu metric http_requests_total, độ trễ, số request bị rate limit (409) và bị từ chối (403).", Tags: []string{"prometheus", "monitoring", "ansible"}, RepoURL: "https://github.com/prometheus/prometheus"},
		{Title: "Log tập trung với EFK", Abstract: "Fluent Bit thu log JSON của ứng dụng, Elasticsearch lưu, Kibana tìm theo request_id, route và status.", Tags: []string{"efk", "logging", "ansible"}, RepoURL: "https://github.com/fluent/fluent-bit"},
		{Title: "HAProxy và Ingress HTTPS tự ký", Abstract: "HAProxy cân bằng tải TCP vào các node, Ingress kết thúc TLS bằng chứng chỉ tự ký.", Tags: []string{"haproxy", "ingress", "security"}, RepoURL: "https://github.com/haproxy/haproxy"},
		{Title: "Rate limiting và RBAC cho API Go", Abstract: "Thiết kế 403/409 theo barem, ma trận user/admin, và các đánh đổi của cửa sổ cố định.", Tags: []string{"security", "go"}},
		{Title: "Fast-Lane CI/CD: build nhanh, preview theo PR", Abstract: "BuildKit với cache trên registry, chỉ build phần bị ảnh hưởng, stage chạy song song; đo trước và sau trong thư mục bench.", Tags: []string{"ci/cd", "buildkit", "benchmark"}, RepoURL: "https://github.com/moby/buildkit"},
	} {
		if _, err := s.CreatePaper(in, now); err != nil {
			return err
		}
	}
	return nil
}
