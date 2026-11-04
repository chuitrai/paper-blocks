// Tạo traffic giả cho dashboard Prometheus, log EFK và minh hoạ rate limit.
//
// Chạy (cần ENABLE_PASSWORD_LOGIN=true ở server; mật khẩu giống .env):
//   k6 run -e BASE_URL=http://localhost:8080 -e USER_PASSWORD=... -e ADMIN_PASSWORD=... bench/k6/traffic.js
// Không cài k6 mà có Docker (Docker Desktop):
//   docker run --rm -i -e BASE_URL=http://host.docker.internal:8080 -e USER_PASSWORD=... -e ADMIN_PASSWORD=... grafana/k6 run - < bench/k6/traffic.js
// Cài k6 trên Windows:  winget install k6   (hoặc choco install k6)
//
// Ba kịch bản chạy song song:
//   readers    người đọc: danh sách, tìm kiếm, lọc tag, mở paper, ghi lượt xem, thống kê
//   commenters 2 tài khoản bình luận / trả lời / sửa (hạn mức 5 thao tác/phút/tài khoản -> 409 là bình thường)
//   abusers    gọi không token -> 403; dồn dập vào /status -> 409
// "Lỗi" của k6 (http_req_failed) chỉ tính các mã NGOÀI những mã đã khai báo là chấp nhận được cho từng loại request,
// nên 5xx hay 404 bất ngờ sẽ làm ngưỡng fail, còn 403/409 có chủ đích thì không.
//
// Token sống 30 phút: giữ DURATION dưới ~25 phút.
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = (__ENV.BASE_URL || "http://localhost:8080").replace(/\/$/, "");
const API = BASE + "/api/v1";
const DURATION = __ENV.DURATION || "2m";
const WORDS = ["kubernetes", "helm", "argocd", "jenkins", "prometheus", "efk", "haproxy", "ci/cd", "rate", "go"];

export const options = {
  scenarios: {
    readers: {
      executor: "ramping-vus",
      exec: "reader",
      stages: [
        { duration: "20s", target: 10 },
        { duration: DURATION, target: 10 },
        { duration: "10s", target: 0 },
      ],
    },
    commenters: { executor: "constant-vus", exec: "commenter", vus: 2, duration: DURATION },
    abusers: { executor: "constant-vus", exec: "abuser", vus: 1, duration: DURATION },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"], // 5xx, 404 và 403/409 ngoài dự kiến
    "http_req_duration{kind:read}": ["p(95)<300"],
    checks: ["rate>0.99"],
  },
};

const ok = (...codes) => http.expectedStatuses(...codes);
const json = (token) => ({ headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) } });
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function login(user, pass) {
  const r = http.post(API + "/login", JSON.stringify({ username: user, password: pass }), json());
  if (r.status !== 200) throw new Error(`đăng nhập ${user} thất bại (${r.status}): kiểm tra ENABLE_PASSWORD_LOGIN và mật khẩu`);
  return r.json("token");
}

export function setup() {
  const userToken = login("user", __ENV.USER_PASSWORD);
  const adminToken = login("admin", __ENV.ADMIN_PASSWORD);
  const papers = http.get(API + "/papers").json("papers");
  if (!papers.length) throw new Error("chưa có paper nào: bật SEED_DEMO=true hoặc tạo paper trước");
  const tags = http.get(API + "/tags").json("tags").map((t) => t.tag);
  return { userToken, adminToken, ids: papers.map((p) => p.id), tags };
}

export function reader(d) {
  const read = { tags: { kind: "read" }, responseCallback: ok(200) };
  const id = pick(d.ids);
  const step = Math.random();
  if (step < 0.25) {
    check(http.get(API + "/papers", read), { "list 200": (r) => r.status === 200 });
  } else if (step < 0.45) {
    const r = http.get(`${API}/papers?q=${encodeURIComponent(pick(WORDS))}`, read);
    check(r, { "search 200": (r) => r.status === 200 });
  } else if (step < 0.6 && d.tags.length) {
    check(http.get(`${API}/papers?tag=${encodeURIComponent(pick(d.tags))}`, read), { "tag 200": (r) => r.status === 200 });
  } else if (step < 0.8) {
    check(http.get(`${API}/papers/${id}`, read), { "paper 200": (r) => r.status === 200 });
    http.get(`${API}/papers/${id}/comments`, read);
    // lượt xem: bị chặn (409) khi vượt 5 lần/phút/(IP, paper); đó là hành vi đúng
    http.post(`${API}/papers/${id}/view`, null, { tags: { kind: "write" }, responseCallback: ok(200, 409) });
  } else if (step < 0.9) {
    http.get(API + "/stats", read);
    http.get(API + "/tags", read);
  } else {
    http.get(`${API}/papers/${id}/readme`, { tags: { kind: "read" }, responseCallback: ok(200, 404, 502) }); // README phụ thuộc GitHub
  }
  sleep(0.3 + Math.random());
}

// Mỗi VU giữ một comment gốc gần nhất để trả lời và sửa.
let lastRoot = null;
export function commenter(d) {
  const token = __VU % 2 === 0 ? d.adminToken : d.userToken;
  const write = { tags: { kind: "write" }, responseCallback: ok(201, 200, 409) };
  const id = pick(d.ids);
  const body = `k6 vu${__VU} lần ${__ITER} ${Date.now()}`;
  const step = Math.random();
  if (step < 0.5 || !lastRoot) {
    const r = http.post(`${API}/papers/${id}/comments`, JSON.stringify({ body }), { ...json(token), ...write });
    check(r, { "comment 201 hoặc 409": (r) => r.status === 201 || r.status === 409 });
    if (r.status === 201) lastRoot = { id: r.json("id"), paper: id, token };
  } else if (step < 0.8) {
    const r = http.post(`${API}/papers/${lastRoot.paper}/comments`, JSON.stringify({ body, parent_id: lastRoot.id }), { ...json(token), ...write });
    check(r, { "reply 201 hoặc 409": (r) => r.status === 201 || r.status === 409 });
  } else {
    const r = http.patch(`${API}/comments/${lastRoot.id}`, JSON.stringify({ body: body + " (sửa)" }), { ...json(lastRoot.token), ...write });
    // 403 xảy ra khi VU này không còn là chủ comment nữa (token khác): vẫn là phản hồi đúng
    check(r, { "sửa 200, 403 hoặc 409": (r) => [200, 403, 409].includes(r.status) });
  }
  sleep(1 + Math.random() * 2);
}

export function abuser() {
  const denied = { tags: { kind: "abuse" }, responseCallback: ok(403) };
  check(http.get(API + "/me", denied), { "/me không token -> 403": (r) => r.status === 403 });
  check(http.post(API + "/papers", JSON.stringify({ title: "x" }), { ...json(), ...denied }), { "tạo paper không token -> 403": (r) => r.status === 403 });
  check(http.del(API + "/comments/1", null, denied), { "xoá comment không token -> 403": (r) => r.status === 403 });
  // Dồn 12 request vào /status (hạn mức 10/phút/IP): sẽ có 409 và tăng ratelimit_blocked_total
  for (let i = 0; i < 12; i++) http.get(API + "/status", { tags: { kind: "abuse" }, responseCallback: ok(200, 409) });
  sleep(15);
}
