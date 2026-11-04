package server

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func (e *env) mustCreatePaper(t *testing.T, admin, body string) Paper {
	t.Helper()
	code, w := e.do("POST", "/api/v1/papers", admin, body)
	if code != 201 {
		t.Fatalf("tạo paper %s: %d %s", body, code, w.Body.String())
	}
	var p Paper
	if err := json.Unmarshal(w.Body.Bytes(), &p); err != nil {
		t.Fatal(err)
	}
	return p
}

// titles gọi GET path và trả danh sách tiêu đề theo thứ tự server trả về, nối bằng "|".
func (e *env) titles(t *testing.T, path string) string {
	t.Helper()
	code, w := e.do("GET", path, "", "")
	if code != 200 {
		t.Fatalf("GET %s: %d %s", path, code, w.Body.String())
	}
	var out struct{ Papers []Paper }
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatal(err)
	}
	names := make([]string, 0, len(out.Papers))
	for _, p := range out.Papers {
		names = append(names, p.Title)
	}
	return strings.Join(names, "|")
}

func (e *env) view(id int64) (int, *testResp) {
	code, w := e.do("POST", fmt.Sprintf("/api/v1/papers/%d/view", id), "", "")
	return code, &testResp{w.Header().Get("Retry-After"), w.Body.String()}
}

type testResp struct{ retryAfter, body string }

func TestSearchAndTags(t *testing.T) {
	e := newEnv(t)
	admin := e.login(t, "admin", "a-pass")
	// Cùng một thời điểm tạo nên thứ tự trả về là id giảm dần: C, B, A.
	a := e.mustCreatePaper(t, admin, `{"title":"Kubernetes kubeadm","abstract":"cụm chạy 100% ổn định","tags":["k8s","Infra"]}`)
	b := e.mustCreatePaper(t, admin, `{"title":"Helm chart","abstract":"values_prod","tags":["helm","k8s"]}`)
	e.mustCreatePaper(t, admin, `{"title":"Prometheus","tags":["monitoring"]}`)
	_ = a

	cases := []struct{ path, want string }{
		{"/api/v1/papers", "Prometheus|Helm chart|Kubernetes kubeadm"},
		{"/api/v1/papers?q=kube", "Kubernetes kubeadm"},
		// không phân biệt hoa thường
		{"/api/v1/papers?q=HELM", "Helm chart"},
		// "%" và "_" là ký tự thường, không phải ký tự đại diện của LIKE
		{"/api/v1/papers?q=%25", "Kubernetes kubeadm"},
		{"/api/v1/papers?q=_", "Helm chart"},
		{"/api/v1/papers?q=khongcoai", ""},
		{"/api/v1/papers?tag=k8s", "Helm chart|Kubernetes kubeadm"},
		{"/api/v1/papers?tag=INFRA", "Kubernetes kubeadm"},
		{"/api/v1/papers?tag=khong", ""},
		{"/api/v1/papers?q=helm&tag=k8s", "Helm chart"},
		{"/api/v1/papers?q=helm&tag=infra", ""},
		// chuỗi kiểu SQL injection chỉ là văn bản tìm kiếm
		{"/api/v1/papers?q=%27%3B+DROP+TABLE+papers%3B--", ""},
	}
	for _, c := range cases {
		if got := e.titles(t, c.path); got != c.want {
			t.Errorf("%s: got %q, want %q", c.path, got, c.want)
		}
	}
	if got := e.titles(t, "/api/v1/papers"); got == "" {
		t.Fatal("bảng papers bị ảnh hưởng bởi truy vấn tìm kiếm")
	}

	for _, bad := range []string{"/api/v1/papers?sort=oops", "/api/v1/papers?q=" + strings.Repeat("a", 101), "/api/v1/papers?tag=" + strings.Repeat("a", 25)} {
		if code, _ := e.do("GET", bad, "", ""); code != 400 {
			t.Errorf("%.60s...: got %d, want 400", bad, code)
		}
	}

	// sort=views: paper nhiều lượt xem nhất lên đầu
	e.view(b.ID)
	e.view(b.ID)
	if got := e.titles(t, "/api/v1/papers?sort=views"); !strings.HasPrefix(got, "Helm chart|") {
		t.Errorf("sort=views: got %q", got)
	}

	code, w := e.do("GET", "/api/v1/tags", "", "")
	var tags struct{ Tags []TagCount }
	_ = json.Unmarshal(w.Body.Bytes(), &tags)
	want := []TagCount{{"k8s", 2}, {"helm", 1}, {"infra", 1}, {"monitoring", 1}} // gộp hoa/thường, nhiều nhất trước
	if code != 200 || len(tags.Tags) != len(want) {
		t.Fatalf("tags: %d %+v", code, tags.Tags)
	}
	for i := range want {
		if tags.Tags[i] != want[i] {
			t.Errorf("tags[%d] = %+v, want %+v", i, tags.Tags[i], want[i])
		}
	}
}

func TestViewsAndStats(t *testing.T) {
	e := newEnv(t)
	admin := e.login(t, "admin", "a-pass")
	user := e.login(t, "user", "u-pass")
	p1 := e.mustCreatePaper(t, admin, `{"title":"P1"}`)
	p2 := e.mustCreatePaper(t, admin, `{"title":"P2"}`)

	for i := 1; i <= 5; i++ {
		code, r := e.view(p1.ID)
		if code != 200 || !strings.Contains(r.body, fmt.Sprintf(`"views":%d`, i)) {
			t.Fatalf("view %d: %d %s", i, code, r.body)
		}
	}
	if code, r := e.view(p1.ID); code != 409 || r.retryAfter == "" {
		t.Fatalf("view 6: got %d, want 409 kèm Retry-After", code)
	}
	// Hạn mức tính theo (IP, paper): paper khác vẫn xem được.
	if code, _ := e.view(p2.ID); code != 200 {
		t.Fatalf("paper khác cùng IP: got %d, want 200", code)
	}
	if code, _ := e.view(999); code != 404 {
		t.Fatalf("paper không tồn tại: got %d, want 404", code)
	}
	if code, _ := e.do("POST", "/api/v1/papers/abc/view", "", ""); code != 404 {
		t.Fatalf("id không hợp lệ: got %d, want 404", code)
	}
	// Lượt xem bị chặn KHÔNG được tính vào bộ đếm.
	code, w := e.do("GET", fmt.Sprintf("/api/v1/papers/%d", p1.ID), "", "")
	var got Paper
	_ = json.Unmarshal(w.Body.Bytes(), &got)
	if code != 200 || got.Views != 5 {
		t.Fatalf("views = %d, want 5", got.Views)
	}
	e.now = e.now.Add(61 * time.Second)
	if code, _ := e.view(p1.ID); code != 200 {
		t.Fatalf("sau cửa sổ: got %d, want 200", code)
	}

	if code, _ := e.postComment(user, int(p2.ID), "một"); code != 201 {
		t.Fatal("không tạo được comment")
	}
	code, w = e.do("GET", "/api/v1/stats", "", "")
	var st Stats
	_ = json.Unmarshal(w.Body.Bytes(), &st)
	if code != 200 || st.Papers != 2 || st.Comments != 1 || st.Views != 7 {
		t.Fatalf("stats: %d %+v", code, st)
	}
	if len(st.TopPapers) != 2 || st.TopPapers[0].ID != p1.ID || st.TopPapers[0].Views != 6 {
		t.Fatalf("top_papers: %+v", st.TopPapers)
	}
}

func (e *env) patchComment(token string, id int64, body string) (int, Comment) {
	b, _ := json.Marshal(map[string]string{"body": body})
	code, w := e.do("PATCH", fmt.Sprintf("/api/v1/comments/%d", id), token, string(b))
	var c Comment
	_ = json.Unmarshal(w.Body.Bytes(), &c)
	return code, c
}

func (e *env) reply(token string, paperID int64, parent int64, body string) (int, Comment) {
	b, _ := json.Marshal(map[string]any{"body": body, "parent_id": parent})
	code, w := e.do("POST", fmt.Sprintf("/api/v1/papers/%d/comments", paperID), token, string(b))
	var c Comment
	_ = json.Unmarshal(w.Body.Bytes(), &c)
	return code, c
}

func TestCommentReplyAndEdit(t *testing.T) {
	e := newEnv(t)
	admin := e.login(t, "admin", "a-pass")
	user := e.login(t, "user", "u-pass")
	p1 := e.mustCreatePaper(t, admin, `{"title":"P1"}`)
	p2 := e.mustCreatePaper(t, admin, `{"title":"P2"}`)

	code, w := e.postComment(user, int(p1.ID), "gốc")
	if code != 201 {
		t.Fatalf("comment gốc: %d", code)
	}
	root := commentOf(t, w)
	if root.ParentID != 0 || root.EditedAt != nil {
		t.Fatalf("comment gốc không được có parent/edited: %+v", root)
	}

	code, rep := e.reply(admin, p1.ID, root.ID, "trả lời")
	if code != 201 || rep.ParentID != root.ID {
		t.Fatalf("reply: %d %+v", code, rep)
	}
	// Chỉ một cấp: không trả lời một reply; không trả lời comment của paper khác; cha không tồn tại; cha âm.
	if code, _ := e.reply(user, p1.ID, rep.ID, "lồng"); code != 400 {
		t.Errorf("reply của reply: got %d, want 400", code)
	}
	if code, _ := e.reply(user, p2.ID, root.ID, "sai paper"); code != 400 {
		t.Errorf("cha ở paper khác: got %d, want 400", code)
	}
	if code, _ := e.reply(user, p1.ID, 999, "ma"); code != 400 {
		t.Errorf("cha không tồn tại: got %d, want 400", code)
	}
	if code, _ := e.reply(user, p1.ID, -1, "âm"); code != 400 {
		t.Errorf("cha âm: got %d, want 400", code)
	}
	e.now = e.now.Add(61 * time.Second) // sang cửa sổ rate limit mới (5/phút/tài khoản)

	// Sửa: chỉ chủ comment
	code, edited := e.patchComment(user, root.ID, "  đã sửa  ")
	if code != 200 || edited.Body != "đã sửa" || edited.EditedAt == nil || !edited.EditedAt.Equal(e.now) {
		t.Fatalf("chủ sửa: %d %+v", code, edited)
	}
	if code, _ := e.patchComment(admin, root.ID, "admin sửa lời người khác"); code != 403 {
		t.Errorf("admin sửa comment người khác: got %d, want 403", code)
	}
	if code, _ := e.patchComment("", root.ID, "x"); code != 403 {
		t.Errorf("không token: got %d, want 403", code)
	}
	if code, _ := e.patchComment(user, 999, "x"); code != 404 {
		t.Errorf("comment không tồn tại: got %d, want 404", code)
	}
	if code, _ := e.patchComment(user, root.ID, "   "); code != 400 {
		t.Errorf("rỗng: got %d, want 400", code)
	}
	if code, _ := e.patchComment(user, root.ID, strings.Repeat("a", 1001)); code != 400 {
		t.Errorf("quá dài: got %d, want 400", code)
	}

	// comment_count tính cả reply; danh sách có parent_id
	code, w = e.do("GET", fmt.Sprintf("/api/v1/papers/%d", p1.ID), "", "")
	var p Paper
	_ = json.Unmarshal(w.Body.Bytes(), &p)
	if code != 200 || p.Comments != 2 {
		t.Fatalf("comment_count = %d, want 2", p.Comments)
	}
	cs, _ := e.store.ListComments(p1.ID)
	if len(cs) != 2 || cs[1].ParentID != root.ID {
		t.Fatalf("danh sách: %+v", cs)
	}

	// Xoá comment gốc kéo theo reply (ON DELETE CASCADE)
	if code, _ := e.do("DELETE", fmt.Sprintf("/api/v1/comments/%d", root.ID), admin, ""); code != 204 {
		t.Fatalf("admin xoá: got %d", code)
	}
	if cs, _ := e.store.ListComments(p1.ID); len(cs) != 0 {
		t.Fatalf("reply mồ côi: %+v", cs)
	}
}

// DB tạo bởi phiên bản cũ (chưa có cột views, parent_id, edited_at) phải được nâng cấp tại chỗ mà không mất dữ liệu.
func TestMigrateUpgradesOldDatabase(t *testing.T) {
	path := filepath.Join(t.TempDir(), "old.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	for _, q := range []string{
		`CREATE TABLE papers (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL COLLATE NOCASE UNIQUE,
			abstract TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '[]', repo_url TEXT NOT NULL DEFAULT '',
			video_url TEXT NOT NULL DEFAULT '', demo_url TEXT NOT NULL DEFAULT '', pdf_file TEXT NOT NULL DEFAULT '',
			created_at INTEGER NOT NULL)`,
		`CREATE TABLE comments (id INTEGER PRIMARY KEY AUTOINCREMENT, paper_id INTEGER NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
			author_login TEXT NOT NULL, author_avatar TEXT NOT NULL DEFAULT '', body TEXT NOT NULL, created_at INTEGER NOT NULL)`,
		`INSERT INTO papers (title, tags, created_at) VALUES ('Cũ', '["go"]', 1)`,
		`INSERT INTO comments (paper_id, author_login, body, created_at) VALUES (1, 'user', 'cũ', 1)`,
	} {
		if _, err := db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	_ = db.Close()

	st, err := OpenStore(path)
	if err != nil {
		t.Fatalf("nâng cấp DB cũ: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })
	if err := st.migrate(); err != nil { // chạy lại phải an toàn
		t.Fatalf("migrate lần hai: %v", err)
	}
	p, err := st.GetPaper(1)
	if err != nil || p.Title != "Cũ" || p.Views != 0 || p.Comments != 1 {
		t.Fatalf("paper sau nâng cấp: %+v %v", p, err)
	}
	cs, err := st.ListComments(1)
	if err != nil || len(cs) != 1 || cs[0].ParentID != 0 || cs[0].EditedAt != nil {
		t.Fatalf("comment sau nâng cấp: %+v %v", cs, err)
	}
	if n, err := st.AddView(1); err != nil || n != 1 {
		t.Fatalf("AddView: %d %v", n, err)
	}
}

func TestSeedDemoDevOps(t *testing.T) {
	e := newEnv(t, func(c *Config) { c.SeedDemo = true })
	code, w := e.do("GET", "/api/v1/papers", "", "")
	var out struct{ Papers []Paper }
	_ = json.Unmarshal(w.Body.Bytes(), &out)
	if code != 200 || len(out.Papers) != 9 {
		t.Fatalf("seed: %d, %d paper (want 9)", code, len(out.Papers))
	}
	for _, p := range out.Papers {
		in := paperInput{Title: p.Title, Abstract: p.Abstract, Tags: p.Tags, RepoURL: p.RepoURL}
		if msg := in.validate(); msg != "" { // dữ liệu mẫu cũng phải qua đúng luật kiểm tra như dữ liệu thật
			t.Errorf("paper mẫu %q không hợp lệ: %s", p.Title, msg)
		}
	}
}
