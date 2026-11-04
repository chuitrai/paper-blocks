// Lớp gọi API + lưu phiên. Token nằm trong sessionStorage (mất khi đóng tab).
// Đánh đổi đã biết: script chạy trong trang đọc được sessionStorage, nên XSS = lộ token.
// Vì vậy mọi nội dung người khác viết đều chỉ được hiển thị bằng textContent, và CSP chặn script ngoài.

const KEY = "pb_session";

export const session = {
  get() {
    try {
      const s = JSON.parse(sessionStorage.getItem(KEY) || "null");
      if (s && s.token && new Date(s.expires_at) > new Date()) return s;
    } catch {
      /* dữ liệu hỏng: bỏ qua và xoá */
    }
    sessionStorage.removeItem(KEY);
    return null;
  },
  set(s) {
    sessionStorage.setItem(KEY, JSON.stringify(s));
  },
  clear() {
    sessionStorage.removeItem(KEY);
  },
};

// Sau khi đăng nhập GitHub, server chuyển về "/#token=...&expires_at=...&role=...".
// Đọc xong phải xoá ngay khỏi thanh địa chỉ để token không nằm lại trong lịch sử.
export function consumeLoginFragment() {
  const frag = location.hash.slice(1);
  if (!frag || frag.startsWith("/")) return null;
  const p = new URLSearchParams(frag);
  const out = {};
  if (p.get("token")) {
    session.set({
      token: p.get("token"),
      expires_at: p.get("expires_at") || "",
      role: p.get("role") || "user",
    });
    out.loggedIn = true;
  } else if (p.get("login_error")) {
    out.error = p.get("login_error");
  } else {
    return null;
  }
  history.replaceState(null, "", location.pathname + location.search + "#/");
  return out;
}

export class ApiError extends Error {
  constructor(status, message, reason) {
    super(message);
    this.status = status;
    this.reason = reason;
  }
}

export async function api(path, { method = "GET", json, form } = {}) {
  const headers = {};
  const s = session.get();
  if (s) headers.Authorization = "Bearer " + s.token;
  let body;
  if (json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  } else if (form) {
    body = form; // để trình duyệt tự đặt Content-Type multipart
  }
  const res = await fetch("/api/v1" + path, { method, headers, body });
  const reason = res.headers.get("X-Auth-Reason");
  // Barem bắt buộc 403 cho cả "hết hạn" lẫn "bị cấm"; header X-Auth-Reason giúp phân biệt.
  if (res.status === 403 && s && (reason === "expired" || reason === "bad_token")) {
    session.clear();
    window.dispatchEvent(new Event("session-changed"));
  }
  if (res.status === 204) return null;
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* thân rỗng hoặc không phải JSON */
  }
  if (!res.ok) throw new ApiError(res.status, (data && data.error) || res.statusText, reason);
  return data;
}
