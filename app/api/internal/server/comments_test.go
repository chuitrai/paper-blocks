package server

import (
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func (e *env) postComment(token string, paperID int, body string) (int, *httptest.ResponseRecorder) {
	b, _ := json.Marshal(map[string]string{"body": body})
	return e.do("POST", fmt.Sprintf("/api/v1/papers/%d/comments", paperID), token, string(b))
}

func commentOf(t *testing.T, w *httptest.ResponseRecorder) Comment {
	t.Helper()
	var c Comment
	if err := json.Unmarshal(w.Body.Bytes(), &c); err != nil {
		t.Fatal(err)
	}
	return c
}

func TestComments(t *testing.T) {
	e := newEnv(t)
	user := e.login(t, "user", "u-pass")
	admin := e.login(t, "admin", "a-pass")
	if code, _ := e.do("POST", "/api/v1/papers", admin, `{"title":"P"}`); code != 201 {
		t.Fatal("không tạo được paper")
	}

	if code, _ := e.do("GET", "/api/v1/papers/999/comments", "", ""); code != 404 {
		t.Fatalf("paper không tồn tại: got %d, want 404", code)
	}
	if code, w := e.do("GET", "/api/v1/papers/1/comments", "", ""); code != 200 || !strings.Contains(w.Body.String(), `"comments":[]`) {
		t.Fatalf("danh sách rỗng: %d %s", code, w.Body.String())
	}

	if code, _ := e.postComment("", 1, "xin chào"); code != 403 {
		t.Fatalf("không token: got %d, want 403", code)
	}
	// 5 request của "user" (đúng hạn mức 5/phút)
	code, w := e.postComment(user, 1, "Hello")
	if code != 201 {
		t.Fatalf("comment hợp lệ: got %d %s", code, w.Body.String())
	}
	c1 := commentOf(t, w)
	if c1.Author != "user" {
		t.Fatalf("author = %q", c1.Author)
	}
	if code, _ := e.postComment(user, 1, "   "); code != 400 {
		t.Fatalf("rỗng: got %d, want 400", code)
	}
	if code, _ := e.postComment(user, 1, strings.Repeat("a", 1001)); code != 400 {
		t.Fatalf("quá dài: got %d, want 400", code)
	}
	if code, _ := e.postComment(user, 1, "Hello"); code != 409 {
		t.Fatalf("trùng liên tiếp: got %d, want 409", code)
	}
	code, w = e.postComment(user, 1, "Second")
	if code != 201 {
		t.Fatalf("comment 2: got %d", code)
	}
	c2 := commentOf(t, w)
	code, w = e.postComment(admin, 1, "<script>alert(1)</script>") // lưu nguyên văn; giao diện dùng textContent
	if code != 201 {
		t.Fatalf("comment admin: got %d", code)
	}
	c3 := commentOf(t, w)

	code, w = e.do("GET", "/api/v1/papers/1/comments", "", "")
	var list struct{ Comments []Comment }
	_ = json.Unmarshal(w.Body.Bytes(), &list)
	if code != 200 || len(list.Comments) != 3 || list.Comments[0].ID != c1.ID {
		t.Fatalf("danh sách: %d %+v", code, list.Comments)
	}

	// Xoá
	del := func(token string, id int64) int {
		code, _ := e.do("DELETE", fmt.Sprintf("/api/v1/comments/%d", id), token, "")
		return code
	}
	if got := del(user, c3.ID); got != 403 {
		t.Fatalf("user xoá comment của admin: got %d, want 403", got)
	}
	if got := del("", c1.ID); got != 403 {
		t.Fatalf("không token: got %d, want 403", got)
	}
	if got := del(user, 999); got != 404 {
		t.Fatalf("comment không tồn tại: got %d, want 404", got)
	}
	if got := del(user, c1.ID); got != 204 {
		t.Fatalf("chủ xoá comment của mình: got %d, want 204", got)
	}
	if got := del(admin, c2.ID); got != 204 {
		t.Fatalf("admin xoá comment của người khác: got %d, want 204", got)
	}
	if cs, _ := e.store.ListComments(1); len(cs) != 1 || cs[0].ID != c3.ID {
		t.Fatalf("còn lại: %+v", cs)
	}

	// Xoá paper kéo theo comment (khoá ngoại ON DELETE CASCADE)
	if code, _ := e.do("DELETE", "/api/v1/papers/1", admin, ""); code != 204 {
		t.Fatalf("xoá paper: got %d", code)
	}
	if cs, _ := e.store.ListComments(1); len(cs) != 0 {
		t.Fatalf("comment mồ côi sau khi xoá paper: %+v", cs)
	}
}

func TestCommentRateLimitPerAccount(t *testing.T) {
	e := newEnv(t)
	user := e.login(t, "user", "u-pass")
	admin := e.login(t, "admin", "a-pass")
	_, _ = e.do("POST", "/api/v1/papers", admin, `{"title":"P"}`)

	for i := 1; i <= 5; i++ {
		if code, _ := e.postComment(user, 1, fmt.Sprintf("c%d", i)); code != 201 {
			t.Fatalf("comment %d: got %d, want 201", i, code)
		}
	}
	if code, w := e.postComment(user, 1, "c6"); code != 409 || w.Header().Get("Retry-After") == "" {
		t.Fatalf("comment 6: got %d, want 409", code)
	}
	// Tài khoản khác cùng IP không bị ảnh hưởng: giới hạn theo tài khoản, không theo IP.
	if code, _ := e.postComment(admin, 1, "từ admin"); code != 201 {
		t.Fatalf("admin cùng IP: got %d, want 201", code)
	}
	e.now = e.now.Add(61 * time.Second)
	if code, _ := e.postComment(user, 1, "c7"); code != 201 {
		t.Fatalf("sau cửa sổ: got %d, want 201", code)
	}
}
