// Điều phối giao diện Portfolio Học thuật & Kỹ thuật trên nền 3D Voxel Vintage.
// Quy tắc an toàn: nội dung do người dùng nhập (tiêu đề, tóm tắt, README, comment)
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
  if (!t) return;
  t.textContent = msg;
  t.className = "toast" + (isErr ? " err" : "");
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 4000);
}

function explain(e) {
  if (!(e instanceof ApiError)) return "Không kết nối được máy chủ";
  if (e.status === 403) return e.reason === "expired" ? "Phiên đã hết hạn, hãy đăng nhập lại" : "Bạn không có quyền thực hiện thao tác này";
  if (e.status === 409 && e.reason === undefined && /rate|limit|many/i.test(e.message)) return "Bạn thao tác quá nhanh, thử lại sau một phút";
  return e.message || "Có lỗi xảy ra";
}

const STATIC_PAPERS = [
  {
    id: 1,
    title: "Graph-Derived Controls for Patient Identifier Leakage in Medical Graph RAG",
    abstract:
      "Tác giả: Dinh Ngoc Bao Vu, Ngoc Duy My Nguyen, Mai-Khiem Tran, Minh-Hoang Le, Minh-Triet Tran (HCMUS · ACIIDS 2027). Nghiên cứu rò rỉ định danh bệnh nhân (PII) trên LightRAG và plain RAG với hội thoại y khoa HealthCareMagic. Đề xuất bộ lọc ngữ cảnh từ chính đồ thị (P2q: giảm rò rỉ tên từ 35.0%/66.2% xuống 1.2% không cần model tại query time) và cơ chế cắt tỉa theo nguồn gốc + băm ID theo từng truy vấn (P4: đưa liên kết chẩn đoán-bệnh nhân về 0%).",
    tags: ["Graph RAG", "Privacy-preserving AI", "PII Leakage", "ACIIDS 2027"],
    thumb_url: "./assets/graphrag-overview.png",
    pdf_url: "./papers/ACIIDS_2027_Patient_Identifier_Leakage_Graph_RAG.pdf",
    has_pdf: true,
    views: 156,
    comment_count: 0,
  },
  {
    id: 2,
    title: "Measuring Egress-Allowlist Reachability in GitHub Actions from Multi-Source CI Data",
    abstract:
      "Tác giả: Dinh Ngoc Bao Vu, Van-Linh Nguyen (HCMUS & National Chung Cheng University, Taiwan · IEEE ICC 2027 SAC-BigData). Thu thập 7,137 egress allowlists trên 1,358 repo GitHub Actions dùng Harden-Runner, kết hợp dữ liệu workflow, sở hữu IP/co-tenancy và log chạy CI. Chỉ ra 56.7% allowlist chứa đích dùng chung IP hoặc dịch vụ exfiltration; siết tĩnh giảm xuống 25.0% nhưng làm hỏng 98.4% repo; phát hiện lỗi chọn nhầm run log (45.9% -> 15.5%) và suy giảm âm thầm (6.4%).",
    tags: ["CI/CD Security", "GitHub Actions", "Egress Filtering", "IEEE ICC 2027"],
    repo_url: "https://github.com/chuitrai/EgressGap",
    thumb_url: "./assets/egressgap-overview.png",
    pdf_url: "./papers/EgressGap_ICC2027_SAC-BigData.pdf",
    has_pdf: true,
    views: 142,
    comment_count: 0,
  },
  {
    id: 3,
    title: "Cloud-Native Application Deployment & Observability Platform (Viettel Digital Talent)",
    abstract:
      "Thiết kế đường ống CI/CD và GitOps cho kiến trúc microservices: tự động dựng cụm Kubernetes (Kubeadm, Vagrant, Ansible), build/deploy qua Jenkins, Helm & ArgoCD, giám sát Prometheus + Grafana và tập trung log với EFK Stack.",
    tags: ["Kubernetes", "Helm", "ArgoCD", "Observability"],
    repo_url: "https://github.com/chuitrai/VDT_Final_Project",
    has_pdf: false,
    views: 96,
    comment_count: 0,
  },
  {
    id: 4,
    title: "AquaSafe: Flood Map with Severity Levels and Prediction (Data For Life 2025)",
    abstract:
      "Hệ thống bản đồ web hiển thị mức độ ngập lụt và cảnh báo dự báo theo thời gian thực. Đạt Giải Triển vọng (Promising Award — Top 30 / 2.600+ đội thi) tại cuộc thi quốc tế Data For Life 2025 do Bộ Công An tổ chức.",
    tags: ["Web Map", "Data For Life 2025", "React", "AI Prediction"],
    repo_url: "https://github.com/chuitrai/AquaSafe_FE",
    has_pdf: false,
    views: 84,
    comment_count: 0,
  },
  {
    id: 5,
    title: "Multimodal Image & Text Query System for Large-Scale Video Dataset (AI Challenge 2024)",
    abstract:
      "Hệ thống truy vấn sự kiện video quy mô lớn bằng văn bản hoặc hình ảnh sử dụng TransNet để trích xuất keyframe, FAISS để tìm kiếm vector tốc độ cao và giao diện Streamlit. Lọt vào Vòng Chung kết (Finalist) AI Challenge TP.HCM 2024.",
    tags: ["AI Vision", "TransNet", "FAISS", "Python"],
    repo_url: "https://github.com/chuitrai/AIC_Challenge",
    has_pdf: false,
    views: 75,
    comment_count: 0,
  },
  {
    id: 6,
    title: "Paper Blocks: Research Portfolio & Fast-Lane CI/CD Platform",
    abstract:
      "Nền tảng trình bày công trình nghiên cứu học thuật kết hợp nền 3D Voxel Shader (Three.js), backend Go 1.24 + SQLite WAL, Helm Chart multi-source với ArgoCD GitOps.",
    tags: ["Go", "WebGL", "Helm", "ArgoCD"],
    repo_url: "https://github.com/chuitrai/paper-blocks",
    has_pdf: false,
    views: 62,
    comment_count: 0,
  },
  {
    id: 7,
    title: "High-Performance HTTP/HTTPS Proxy Server from Scratch in C++",
    abstract:
      "Thiết kế và cài đặt Proxy Server hiệu năng cao từ đầu bằng C++ (Windows API, Socket Programming), hỗ trợ định tuyến HTTP/HTTPS, lọc website theo domain/IP và ghi nhật ký truy cập.",
    tags: ["C++", "Networking", "HTTP/HTTPS", "Security"],
    repo_url: "https://github.com/chuitrai/Proxy_server",
    has_pdf: false,
    views: 54,
    comment_count: 0,
  },
];

const state = {
  all: [],
  staticMode: false,
  me: null,
  methods: { github: false, password: false },
  current: null,
  filter: { q: "", tag: "" },
  replyTo: null,
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

// ----- danh sách công bố khoa học + thế giới -----
let world;
async function loadPapers() {
  try {
    const data = await api("/papers");
    state.staticMode = false;
    state.all = data.papers || [];
  } catch {
    state.staticMode = true;
    state.all = STATIC_PAPERS;
  }
  world.setPapers(state.all);
  await renderList();
  loadTags();
  loadStats();
}

async function renderList() {
  const f = state.filter;
  let papers = state.all;
  if (f.q || f.tag) {
    if (state.staticMode) {
      const qLower = f.q.toLowerCase();
      papers = state.all.filter((p) => {
        const matchTag = !f.tag || (p.tags || []).includes(f.tag);
        const matchQ =
          !qLower ||
          p.title.toLowerCase().includes(qLower) ||
          (p.abstract || "").toLowerCase().includes(qLower) ||
          (p.tags || []).some((t) => t.toLowerCase().includes(qLower));
        return matchTag && matchQ;
      });
    } else {
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
  }
  const list = $("list");
  list.replaceChildren();
  if (papers.length === 0) {
    const filtered = f.q || f.tag;
    list.append(
      h("li", {
        class: "empty",
        text: filtered ? "Không có công bố nào khớp từ khoá." : "Chưa có công bố nào." + (state.me?.role === "admin" ? " Bấm “+ Thêm Paper” để tạo." : ""),
      })
    );
    return;
  }
  for (const [idx, p] of papers.entries()) {
    const thumb = p.thumb_url
      ? h("div", { class: "pub-thumb has-img", "aria-hidden": "true" }, h("img", { src: p.thumb_url, alt: "" }))
      : h(
          "div",
          { class: "pub-thumb", "aria-hidden": "true" },
          h("span", { class: "pub-thumb-type", text: p.has_pdf ? "PDF PAPER" : "RESEARCH" }),
          h("span", { class: "pub-thumb-icon", text: `Paper #${idx + 1}` })
        );
    const tags = h("div", { class: "tags" }, ...(p.tags || []).map((t) => h("span", { text: t })));
    const meta = h("small", {
      class: "meta",
      text: `[Xem toàn văn & Thảo luận] · ${p.views} lượt đọc · ${p.comment_count} bình luận`,
    });
    const mainCol = h(
      "div",
      { class: "pub-main" },
      h("h3", { text: p.title }),
      h("p", { text: p.abstract || "" }),
      tags,
      meta
    );
    const card = h("button", { class: "card", type: "button", onclick: () => openPaper(p.id) }, thumb, mainCol);
    list.append(h("li", {}, card));
  }
}

async function loadTags() {
  try {
    let tags;
    if (state.staticMode) {
      const counts = new Map();
      for (const p of state.all) {
        for (const t of p.tags || []) counts.set(t, (counts.get(t) || 0) + 1);
      }
      tags = [...counts.entries()].map(([tag, count]) => ({ tag, count }));
    } else {
      tags = (await api("/tags")).tags;
    }
    const box = $("tags");
    box.replaceChildren();
    for (const t of tags) {
      const b = h("button", {
        type: "button",
        class: state.filter.tag === t.tag ? "on" : "",
        text: `${t.tag} (${t.count})`,
        onclick: () => {
          state.filter.tag = state.filter.tag === t.tag ? "" : t.tag;
          loadTags();
          renderList();
        },
      });
      box.append(b);
    }
  } catch {}
}

async function loadStats() {
  if (state.staticMode) {
    $("stats").textContent = `${state.all.length} công bố & dự án nghiên cứu`;
    return;
  }
  try {
    const s = await api("/stats");
    $("stats").textContent = `${s.papers} công bố · ${s.comments} thảo luận · ${s.views} lượt đọc`;
  } catch {
    $("stats").textContent = "";
  }
}

let searchTimer = 0;
$("q").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
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
  if (state.staticMode) {
    p = state.all.find((item) => item.id === id);
    if (!p) return;
  } else {
    try {
      p = await api("/papers/" + id);
    } catch (e) {
      toast(explain(e), true);
      return;
    }
  }
  state.current = p;
  state.replyTo = null;

  if (!state.staticMode) {
    api(`/papers/${p.id}/view`, { method: "POST" }).catch(() => {});
  }
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
  if (p.pdf_url) {
    pdf.append(h("iframe", { src: p.pdf_url, title: "PDF: " + p.title }));
  } else if (p.has_pdf) {
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
  $("tab-pdf").replaceChildren();
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
    if (state.current?.id !== p.id) return;
    $("c-count").textContent = comments.length ? `(${comments.length})` : "";
    const ul = $("c-list");
    ul.replaceChildren();
    if (!comments.length) ul.append(h("li", { class: "muted", text: "Chưa có bình luận." }));
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
  if (state.me && !isReply) actions.append(h("button", { class: "btn-ghost", type: "button", text: "Trả lời", onclick: () => setReply(c) }));
  if (mine) actions.append(h("button", { class: "btn-ghost", type: "button", text: "Sửa", onclick: () => startEdit(c, main, bodyEl, actions) }));
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

function startEdit(c, main, bodyEl, actions) {
  const ta = h("textarea", { maxlength: "1000", rows: "3" });
  ta.value = c.body;
  const save = h("button", { class: "btn primary", type: "button", text: "Lưu" });
  const cancel = h("button", { class: "btn-ghost", type: "button", text: "Huỷ", onclick: loadComments });
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

// ----- sự kiện Modal & Form -----
$("p-close").addEventListener("click", closePaper);
$("modal").addEventListener("click", (e) => e.target === $("modal") && closePaper());
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!$("modal-new").hidden) $("modal-new").hidden = true;
  else if (!$("modal").hidden) closePaper();
  else if (document.body.classList.contains("scenic-mode")) toggleScenicMode(false);
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
    loadPapers();
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

// Nút đổi giao diện nền Đồ thị Tri thức (Research Slate / Twilight / Cyber Midnight)
$("btn-time")?.addEventListener("click", () => {
  if (!world?.cycleTimeMode) return;
  const mode = world.cycleTimeMode();
  const labels = ["🌌 Nền: Research Slate", "🌇 Nền: Twilight", "🌙 Nền: Cyber Matrix"];
  $("btn-time").textContent = labels[mode] || "🌌 Đổi nền";
});

// Nút Ngắm Đồ thị Tri thức Tương tác
function toggleScenicMode(force) {
  const isScenic = typeof force === "boolean" ? force : !document.body.classList.contains("scenic-mode");
  document.body.classList.toggle("scenic-mode", isScenic);
  const btn = $("btn-scenic");
  if (btn) {
    btn.textContent = isScenic ? "📋 Hiện Portfolio" : "🕸️ Ngắm Đồ thị";
  }
  if (isScenic) {
    toast("Di chuột hoặc click để tương tác với Đồ thị Tri thức (Bấm Esc hoặc nút trên menu để hiện lại)");
  }
}

$("btn-scenic")?.addEventListener("click", () => toggleScenicMode());

// Bộ lọc tab khu vực Hoạt động / Sự kiện / Vlog
document.querySelectorAll(".f-pill").forEach((btn) => {
  btn.addEventListener("click", () => {
    const filter = btn.dataset.media;
    document.querySelectorAll(".f-pill").forEach((b) => b.classList.toggle("on", b === btn));
    document.querySelectorAll("#activities [data-category]").forEach((card) => {
      card.hidden = filter !== "all" && card.dataset.category !== filter;
    });
  });
});

// Hiệu ứng xuất hiện khi cuộn
function setupScrollAnimations() {
  const sections = document.querySelectorAll(".frosted-section");
  const navLinks = document.querySelectorAll(".nav-links a");

  if ("IntersectionObserver" in window) {
    const revealObs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
          }
        }
      },
      { threshold: 0.06 }
    );
    sections.forEach((s) => revealObs.observe(s));

    const spyObs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const id = "#" + entry.target.id;
            navLinks.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === id));
          }
        }
      },
      { rootMargin: "-25% 0px -55% 0px" }
    );
    sections.forEach((s) => spyObs.observe(s));
  } else {
    sections.forEach((s) => s.classList.add("visible"));
  }
}

// ----- khởi động -----
async function boot() {
  setupScrollAnimations();

  try {
    world = createWorld($("world"));
  } catch (e) {
    console.error(e);
    world = { setPapers() {}, setPaused() {}, cycleTimeMode() { return 0; } };
  }

  const login = consumeLoginFragment();
  if (login?.error) toast("Đăng nhập GitHub thất bại: " + login.error, true);

  try {
    state.methods = await api("/auth/methods");
  } catch {
    state.methods = { github: false, password: false };
  }
  await loadMe();
  if (login?.loggedIn && state.me) toast("Xin chào " + shortName(state.me.user));

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
