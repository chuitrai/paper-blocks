// Điều phối giao diện. Quy tắc an toàn: nội dung do người dùng nhập (tiêu đề, tóm tắt, README, comment)
// chỉ được đưa vào trang bằng textContent / createTextNode, KHÔNG BAO GIỜ bằng innerHTML.
import { api, ApiError, session, consumeLoginFragment } from "./api.js";
import { createWorld } from "./world.js";

const $ = (id) => document.getElementById(id);

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  for (const kid of kids) if (kid != null) el.append(kid);
  return el;
}

let toastTimer = 0;
function toast(msg, isErr = false) {
  const t = $("toast");
  t.textContent = msg;
  t.className = "toast" + (isErr ? " err" : "");
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 4000);
}

function explain(e) {
  if (!(e instanceof ApiError)) return "Không kết nối được máy chủ";
  // Barem: thiếu quyền / token sai / hết hạn đều là 403; vượt hạn mức là 409.
  if (e.status === 403) return e.reason === "expired" ? "Phiên đã hết hạn, hãy đăng nhập lại" : "Bạn không có quyền thực hiện thao tác này";
  if (e.status === 409 && e.reason === undefined && /rate|limit|many/i.test(e.message)) return "Bạn thao tác quá nhanh, thử lại sau một phút";
  return e.message || "Có lỗi xảy ra";
}

// ----- trạng thái -----
const state = {
  all: [], // toàn bộ paper (cấp dữ liệu cho thế giới 3D)
  me: null,
  methods: { github: false, password: false },
  current: null,
  filter: { q: "", tag: "" },
  replyTo: null, // comment gốc đang được trả lời
};

// ----- URL ngoài: chỉ cho https, hiển thị tên miền, mở tab mới không rò referrer -----
function safeLink(label, raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  return h("a", { class: "btn", href: u.href, target: "_blank", rel: "noopener noreferrer", text: `${label} · ${u.hostname}` });
}

function avatarSrc(url) {
  // Chỉ nhận ảnh đại diện từ GitHub; CSP cũng chặn các nguồn khác.
  return typeof url === "string" && url.startsWith("https://avatars.githubusercontent.com/") ? url : "";
}

function shortName(user) {
  return user.startsWith("gh:") ? user.slice(3) : user;
}

// ----- thanh trên cùng -----
function renderAuth() {
  const s = session.get();
  const logged = !!(s && state.me);
  $("who").hidden = !logged;
  $("btn-logout").hidden = !logged;
  $("btn-login").hidden = logged || !state.methods.github;
  $("btn-new").hidden = !(logged && state.me.role === "admin");
  if (logged) {
    $("who-name").textContent = shortName(state.me.user);
    $("who-role").textContent = state.me.role;
    const src = avatarSrc(state.me.avatar);
    $("who-avatar").hidden = !src;
    if (src) $("who-avatar").src = src;
  }
}

async function loadMe() {
  state.me = null;
  if (session.get()) {
    try {
      state.me = await api("/me");
    } catch {
      /* token hỏng: api() đã tự xoá phiên nếu hết hạn */
    }
  }
  renderAuth();
}

// ----- danh sách + thế giới -----
let world;
async function loadPapers() {
  const data = await api("/papers");
  state.all = data.papers || [];
  world.setPapers(state.all);
  await renderList();
  loadTags();
  loadStats();
}

// Danh sách bên dưới dùng tìm kiếm/lọc phía server (?q=, ?tag=); không lọc thì dùng lại dữ liệu đã tải.
async function renderList() {
  const f = state.filter;
  let papers = state.all;
  if (f.q || f.tag) {
    const qs = new URLSearchParams();
    if (f.q) qs.set("q", f.q);
    if (f.tag) qs.set("tag", f.tag);
    try {
      papers = (await api("/papers?" + qs)).papers || [];
    } catch (e) {
      toast(explain(e), true);
      return;
    }
  }
  const list = $("list");
  list.replaceChildren();
  if (papers.length === 0) {
    const filtered = f.q || f.tag;
    list.append(h("li", { class: "empty", text: filtered ? "Không có paper nào khớp." : "Chưa có paper nào." + (state.me?.role === "admin" ? " Bấm “+ Paper mới” để tạo." : "") }));
    return;
  }
  for (const p of papers) {
    const tags = h("div", { class: "tags" }, ...(p.tags || []).map((t) => h("span", { text: t })));
    const meta = h("small", { class: "meta", text: `${p.views} lượt xem · ${p.comment_count} bình luận` });
    const card = h("button", { class: "card", type: "button", onclick: () => openPaper(p.id) }, h("h3", { text: p.title }), h("p", { text: p.abstract || "" }), tags, meta);
    list.append(h("li", {}, card));
  }
}

async function loadTags() {
  try {
    const { tags } = await api("/tags");
    const box = $("tags");
    box.replaceChildren();
    for (const t of tags) {
      const b = h("button", { type: "button", class: state.filter.tag === t.tag ? "on" : "", text: `${t.tag} (${t.count})`, onclick: () => {
        state.filter.tag = state.filter.tag === t.tag ? "" : t.tag; // bấm lần nữa để bỏ lọc
        loadTags();
        renderList();
      } });
      box.append(b);
    }
  } catch {
    /* tag chỉ là tiện ích: lỗi thì bỏ qua */
  }
}

async function loadStats() {
  try {
    const s = await api("/stats");
    $("stats").textContent = `${s.papers} paper · ${s.comments} bình luận · ${s.views} lượt xem`;
  } catch {
    $("stats").textContent = "";
  }
}

let searchTimer = 0;
$("q").addEventListener("input", (e) => {
  clearTimeout(searchTimer); // chờ người dùng gõ xong để không bắn một request cho mỗi phím
  searchTimer = setTimeout(() => {
    state.filter.q = e.target.value.trim();
    renderList();
  }, 300);
});

// ----- chi tiết paper -----
const tabs = ["pdf", "readme", "comments"];
function showTab(name) {
  for (const t of tabs) {
    $("tab-" + t).hidden = t !== name;
  }
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("on", b.dataset.tab === name));
  if (name === "readme") loadReadme();
  if (name === "comments") loadComments();
}

async function openPaper(id) {
  let p;
  try {
    p = await api("/papers/" + id);
  } catch (e) {
    toast(explain(e), true);
    return;
  }
  state.current = p;
  state.replyTo = null;
  // Ghi một lượt xem. Lỗi (kể cả 409 do rate limit) đều bỏ qua: đây không phải việc người dùng cần biết.
  api(`/papers/${p.id}/view`, { method: "POST" }).catch(() => {});
  world.setPaused(true);
  $("p-title").textContent = p.title;
  $("p-abstract").textContent = p.abstract || "";
  $("p-tags").replaceChildren(...(p.tags || []).map((t) => h("span", { text: t })));
  const links = $("p-links");
  links.replaceChildren();
  for (const [label, url] of [["Repo", p.repo_url], ["Video", p.video_url], ["Demo", p.demo_url]]) {
    if (!url) continue;
    const a = safeLink(label, url);
    if (a) links.append(a);
  }
  const pdf = $("tab-pdf");
  pdf.replaceChildren();
  if (p.has_pdf) {
    // Không dùng sandbox: trình xem PDF của Chrome không chạy trong iframe sandbox.
    pdf.append(h("iframe", { src: `/api/v1/papers/${p.id}/file`, title: "PDF: " + p.title }));
  } else {
    pdf.append(h("p", { class: "muted", text: "Paper này chưa có file PDF." }));
  }
  $("tab-readme").replaceChildren();
  $("c-list").replaceChildren();
  $("c-count").textContent = "";
  $("p-admin").hidden = state.me?.role !== "admin";
  $("c-form").hidden = !state.me;
  $("c-login").hidden = !!state.me || !state.methods.github;
  $("modal").hidden = false;
  showTab("pdf");
}

function closePaper() {
  $("modal").hidden = true;
  $("tab-pdf").replaceChildren(); // gỡ iframe để dừng trình xem PDF
  state.current = null;
  clearReply();
  world.setPaused(false);
}

async function loadReadme() {
  const p = state.current;
  const box = $("tab-readme");
  if (!p || box.childElementCount) return;
  if (!p.repo_url) {
    box.append(h("p", { class: "muted", text: "Paper này chưa gắn repo GitHub." }));
    return;
  }
  box.append(h("p", { class: "muted", text: "Đang tải README..." }));
  try {
    const r = await api(`/papers/${p.id}/readme`);
    box.replaceChildren(h("pre", { class: "readme", text: r.markdown }));
    if (r.truncated) box.append(h("p", { class: "muted", text: "(README quá dài, đã cắt bớt)" }));
  } catch (e) {
    box.replaceChildren(h("p", { class: "muted", text: e.status === 404 ? "Repo không có README." : "Chưa lấy được README từ GitHub, thử lại sau." }));
  }
}

function fmtTime(iso) {
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleString("vi-VN");
}

async function loadComments() {
  const p = state.current;
  if (!p) return;
  try {
    const { comments } = await api(`/papers/${p.id}/comments`);
    if (state.current?.id !== p.id) return; // người dùng đã đóng hoặc mở paper khác
    $("c-count").textContent = comments.length ? `(${comments.length})` : "";
    const ul = $("c-list");
    ul.replaceChildren();
    if (!comments.length) ul.append(h("li", { class: "muted", text: "Chưa có bình luận." }));
    // Một cấp trả lời: mỗi comment gốc kèm các reply của nó, theo thứ tự thời gian.
    const roots = comments.filter((c) => !c.parent_id);
    for (const root of roots) {
      ul.append(commentRow(root, false));
      for (const r of comments.filter((c) => c.parent_id === root.id)) ul.append(commentRow(r, true));
    }
  } catch (e) {
    toast(explain(e), true);
  }
}

function commentRow(c, isReply) {
  const src = avatarSrc(c.avatar);
  const mine = state.me && state.me.user === c.author;
  const canDelete = state.me && (state.me.role === "admin" || mine);
  const bodyEl = h("p", { class: "body", text: c.body });
  const head = h("div", {}, h("b", { text: shortName(c.author) }), h("time", { text: fmtTime(c.created_at) }));
  if (c.edited_at) head.append(h("em", { text: "(đã sửa)" }));
  const main = h("div", {}, head, bodyEl);

  const actions = h("div", { class: "actions" });
  if (state.me && !isReply) actions.append(h("button", { class: "btn", type: "button", text: "Trả lời", onclick: () => setReply(c) }));
  if (mine) actions.append(h("button", { class: "btn", type: "button", text: "Sửa", onclick: () => startEdit(c, main, bodyEl, actions) }));
  if (canDelete) actions.append(h("button", { class: "btn danger", type: "button", text: "Xoá", onclick: () => removeComment(c.id) }));
  return h("li", { class: isReply ? "reply" : "" }, src ? h("img", { src, alt: "" }) : h("span"), main, actions);
}

function setReply(c) {
  state.replyTo = c;
  $("c-replying-to").textContent = "Đang trả lời " + shortName(c.author);
  $("c-replying").hidden = false;
  $("c-body").focus();
}
function clearReply() {
  state.replyTo = null;
  $("c-replying").hidden = true;
}
$("c-replying-x").addEventListener("click", clearReply);

// Sửa tại chỗ: thay đoạn văn bằng ô nhập; nội dung vẫn được đặt bằng .value (không phải HTML).
function startEdit(c, main, bodyEl, actions) {
  const ta = h("textarea", { maxlength: "1000", rows: "3" });
  ta.value = c.body;
  const save = h("button", { class: "btn primary", type: "button", text: "Lưu" });
  const cancel = h("button", { class: "btn", type: "button", text: "Huỷ", onclick: loadComments });
  save.addEventListener("click", async () => {
    const body = ta.value.trim();
    if (!body) return;
    try {
      await api("/comments/" + c.id, { method: "PATCH", json: { body } });
      loadComments();
    } catch (err) {
      toast(err instanceof ApiError && err.status === 409 ? "Bạn thao tác quá nhanh, đợi một phút rồi thử lại" : explain(err), true);
    }
  });
  bodyEl.replaceWith(ta);
  main.append(h("div", { class: "edit-row" }, save, cancel));
  actions.hidden = true;
  ta.focus();
}

async function removeComment(id) {
  try {
    await api("/comments/" + id, { method: "DELETE" });
    if (state.replyTo?.id === id) clearReply();
    loadComments();
    loadPapers();
  } catch (e) {
    toast(explain(e), true);
  }
}

// ----- sự kiện -----
$("p-close").addEventListener("click", closePaper);
$("modal").addEventListener("click", (e) => e.target === $("modal") && closePaper());
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!$("modal-new").hidden) $("modal-new").hidden = true;
  else if (!$("modal").hidden) closePaper();
});
document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));

$("c-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = $("c-body").value.trim();
  if (!body || !state.current) return;
  try {
    const payload = { body };
    if (state.replyTo) payload.parent_id = state.replyTo.id;
    await api(`/papers/${state.current.id}/comments`, { method: "POST", json: payload });
    $("c-body").value = "";
    clearReply();
    loadComments();
    loadPapers(); // cập nhật số bình luận và thống kê
  } catch (err) {
    toast(err instanceof ApiError && err.status === 409 ? "Bạn bình luận quá nhanh, đợi một phút rồi thử lại" : explain(err), true);
  }
});

$("p-file").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f || !state.current) return;
  const id = state.current.id;
  const form = new FormData();
  form.append("file", f);
  try {
    await api(`/papers/${id}/file`, { method: "POST", form });
    toast("Đã tải PDF lên");
    await loadPapers();
    openPaper(id);
  } catch (err) {
    toast(err instanceof ApiError && err.status === 413 ? "File quá lớn" : explain(err), true);
  }
});

$("p-delete").addEventListener("click", async () => {
  const p = state.current;
  if (!p || !confirm(`Xoá paper “${p.title}”? Không hoàn tác được.`)) return;
  try {
    await api("/papers/" + p.id, { method: "DELETE" });
    closePaper();
    await loadPapers();
    toast("Đã xoá");
  } catch (err) {
    toast(explain(err), true);
  }
});

$("btn-new").addEventListener("click", () => {
  $("n-error").hidden = true;
  $("modal-new").hidden = false;
});
$("n-close").addEventListener("click", () => ($("modal-new").hidden = true));
$("new-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const body = {
    title: String(f.get("title")).trim(),
    abstract: String(f.get("abstract")).trim(),
    tags: String(f.get("tags")).split(",").map((t) => t.trim()).filter(Boolean),
    repo_url: String(f.get("repo_url")).trim(),
    video_url: String(f.get("video_url")).trim(),
    demo_url: String(f.get("demo_url")).trim(),
  };
  try {
    const p = await api("/papers", { method: "POST", json: body });
    e.target.reset();
    $("modal-new").hidden = true;
    await loadPapers();
    toast("Đã tạo. Mở paper để tải PDF lên.");
    openPaper(p.id);
  } catch (err) {
    $("n-error").textContent = explain(err);
    $("n-error").hidden = false;
  }
});

$("btn-logout").addEventListener("click", async () => {
  session.clear();
  await loadMe();
  closePaper();
  toast("Đã đăng xuất");
});
window.addEventListener("session-changed", async () => {
  await loadMe();
  toast("Phiên đã hết hạn, hãy đăng nhập lại", true);
});

// ----- khởi động -----
async function boot() {
  try {
    world = createWorld($("world"), { onEnter: (p) => openPaper(p.id) });
  } catch (e) {
    // Không có WebGL: vẫn dùng được danh sách paper bên dưới.
    console.error(e);
    world = { setPapers() {}, setPaused() {} };
    $("overlay").textContent = "Trình duyệt không hỗ trợ WebGL, hãy dùng danh sách bên dưới.";
  }

  const login = consumeLoginFragment();
  if (login?.error) toast("Đăng nhập GitHub thất bại: " + login.error, true);

  try {
    state.methods = await api("/auth/methods");
  } catch {
    toast("Không kết nối được máy chủ API", true);
  }
  await loadMe();
  if (login?.loggedIn && state.me) toast("Xin chào " + shortName(state.me.user));

  // Chỉ gọi /status MỘT lần: endpoint này bị giới hạn 10 request/phút theo yêu cầu barem.
  api("/status")
    .then((s) => {
      $("version").textContent = "v" + s.version;
      $("version").hidden = false;
    })
    .catch(() => {});

  try {
    await loadPapers();
  } catch (e) {
    toast(explain(e), true);
  }
}
boot();
