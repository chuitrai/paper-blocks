// Academic & Engineering Portfolio UI Controller (Living 3D Minecraft Shader & Knowledge Graph).
// Security invariant: user-provided content (title, abstract, README, comment)
// is always rendered via textContent / createTextNode, NEVER via innerHTML.
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
  if (!(e instanceof ApiError)) return "Could not connect to server";
  if (e.status === 403) return e.reason === "expired" ? "Session expired, please sign in again" : "You do not have permission for this action";
  if (e.status === 409 && e.reason === undefined && /rate|limit|many/i.test(e.message)) return "Too many requests, please wait a minute";
  return e.message || "An error occurred";
}

const STATIC_PAPERS = [
  {
    id: 1,
    title: "Graph-Derived Controls for Patient Identifier Leakage in Medical Graph RAG",
    abstract:
      "Authors: Dinh Ngoc Bao Vu, Ngoc Duy My Nguyen, Mai-Khiem Tran, Minh-Hoang Le, Minh-Triet Tran (University of Science, VNU-HCM · Submitted to ACIIDS 2027). We plant synthetic patients in HealthCareMagic dialogues, index them with LightRAG and plain RAG, and trace each identifier from the graph to the answers. P2q masks names with a dictionary built from the graph's person nodes (lowering patient-naming leakage from 35.0%/66.2% to 1.2% with no detection model at query time), and P4 drops the named person's source documents via person-to-source links and hashes IDs per query (reducing patient-diagnosis linkage and cited-ID join attacks to 0%).",
    tags: ["Graph RAG", "Privacy-Preserving AI", "PII Leakage", "ACIIDS 2027"],
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
      "Authors: Dinh Ngoc Bao Vu, Van-Linh Nguyen (University of Science, VNU-HCM & National Chung Cheng University, Taiwan · Submitted to IEEE ICC 2027 SAC-BigData). From 1,358 public GitHub Actions repositories using Harden-Runner we collected 7,137 enforcing allowlists and joined workflow rules, IP co-tenancy/abuse reference data, and public CI DNS run logs. We show that 56.7% of allowlists admit a co-tenant or exfiltration destination, static tightening reduces this to 25.0% but drops a required host in 98.4% of builds, and public CI logs suffer from run misattribution (45.9% -> 15.5%) and silent degradation (6.4%).",
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
      "Production-grade CI/CD and GitOps platform for microservices: automated Kubernetes cluster provisioning with Kubeadm, Vagrant, and Ansible; Jenkins CI pipelines; multi-source Helm + ArgoCD GitOps delivery; and end-to-end observability with Prometheus, Grafana, and the EFK Stack.",
    tags: ["Kubernetes", "Helm", "ArgoCD", "Observability"],
    repo_url: "https://github.com/chuitrai/VDT_Final_Project",
    has_pdf: false,
    views: 96,
    comment_count: 0,
  },
  {
    id: 4,
    title: "AquaSafe: Interactive Flood Severity Map & Real-Time Prediction (Data For Life 2025)",
    abstract:
      "Web-based geospatial mapping platform visualizing real-time flood severity levels and predictive safety alerts. Won the Promising Award (Top 30 out of 2,600+ teams) at the Data For Life 2025 international competition organized by the Ministry of Public Security.",
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
      "Large-scale video event retrieval system supporting text and image queries using TransNet for keyframe extraction, FAISS for high-speed vector indexing, and a Streamlit UI. Reached the Final Round (Finalist) of The 5th AI Challenge Ho Chi Minh City 2024.",
    tags: ["AI Vision", "TransNet", "FAISS", "Python"],
    repo_url: "https://github.com/chuitrai/AIC_Challenge",
    has_pdf: false,
    views: 75,
    comment_count: 0,
  },
  {
    id: 6,
    title: "Paper Blocks: Academic Research Portfolio & GitOps Platform",
    abstract:
      "Scholarly portfolio and research publication platform built with Go 1.24, SQLite WAL, GitHub OAuth 2.0 PKCE, multi-source Helm + ArgoCD GitOps, and a 60fps interactive Minecraft Shader & Knowledge Graph canvas.",
    tags: ["Go", "Helm", "ArgoCD", "Knowledge Graph"],
    repo_url: "https://github.com/chuitrai/paper-blocks",
    has_pdf: false,
    views: 62,
    comment_count: 0,
  },
  {
    id: 7,
    title: "High-Performance HTTP/HTTPS Proxy Server from Scratch in C++",
    abstract:
      "Designed and implemented a multithreaded HTTP/HTTPS proxy server from scratch in C++ (Windows API, Socket Programming) supporting request routing, domain/IP filtering, and user activity logging.",
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
      /* expired token cleared automatically by api() */
    }
  }
  renderAuth();
}

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
        text: filtered ? "No publications match your filter." : "No publications yet." + (state.me?.role === "admin" ? " Click “+ New Paper” to add one." : ""),
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
      text: `[Full Paper & Details] · ${p.views} views · ${p.comment_count} comments`,
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
    $("stats").textContent = `${state.all.length} publications & technical reports`;
    return;
  }
  try {
    const s = await api("/stats");
    $("stats").textContent = `${s.papers} papers · ${s.comments} comments · ${s.views} views`;
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
    pdf.append(h("p", { class: "muted", text: "No PDF attached for this report yet (see GitHub repository above)." }));
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
    box.append(h("p", { class: "muted", text: "No GitHub repository linked to this paper." }));
    return;
  }
  if (state.staticMode) {
    box.append(
      h("p", {
        class: "muted",
        text: `Open the GitHub repository (${p.repo_url}) above to browse full source code and README.`,
      })
    );
    return;
  }
  box.append(h("p", { class: "muted", text: "Loading README..." }));
  try {
    const r = await api(`/papers/${p.id}/readme`);
    box.replaceChildren(h("pre", { class: "readme", text: r.markdown }));
    if (r.truncated) box.append(h("p", { class: "muted", text: "(README truncated due to length)" }));
  } catch (e) {
    box.replaceChildren(h("p", { class: "muted", text: e.status === 404 ? "Repository has no README." : "Could not fetch README from GitHub, please try again later." }));
  }
}

function fmtTime(iso) {
  const d = new Date(iso);
  return isNaN(d) ? "" : d.toLocaleString("en-US");
}

async function loadComments() {
  const p = state.current;
  if (!p) return;
  if (state.staticMode) {
    const ul = $("c-list");
    ul.replaceChildren(h("li", { class: "muted", text: "Interactive comments are enabled when connected to the Go API server." }));
    return;
  }
  try {
    const { comments } = await api(`/papers/${p.id}/comments`);
    if (state.current?.id !== p.id) return;
    $("c-count").textContent = comments.length ? `(${comments.length})` : "";
    const ul = $("c-list");
    ul.replaceChildren();
    if (!comments.length) ul.append(h("li", { class: "muted", text: "No comments yet." }));
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
  if (c.edited_at) head.append(h("em", { text: "(edited)" }));
  const main = h("div", {}, head, bodyEl);

  const actions = h("div", { class: "actions" });
  if (state.me && !isReply) actions.append(h("button", { class: "btn-ghost", type: "button", text: "Reply", onclick: () => setReply(c) }));
  if (mine) actions.append(h("button", { class: "btn-ghost", type: "button", text: "Edit", onclick: () => startEdit(c, main, bodyEl, actions) }));
  if (canDelete) actions.append(h("button", { class: "btn danger", type: "button", text: "Delete", onclick: () => removeComment(c.id) }));
  return h("li", { class: isReply ? "reply" : "" }, src ? h("img", { src, alt: "" }) : h("span"), main, actions);
}

function setReply(c) {
  state.replyTo = c;
  $("c-replying-to").textContent = "Replying to " + shortName(c.author);
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
  const save = h("button", { class: "btn primary", type: "button", text: "Save" });
  const cancel = h("button", { class: "btn-ghost", type: "button", text: "Cancel", onclick: loadComments });
  save.addEventListener("click", async () => {
    const body = ta.value.trim();
    if (!body) return;
    try {
      await api("/comments/" + c.id, { method: "PATCH", json: { body } });
      loadComments();
    } catch (err) {
      toast(err instanceof ApiError && err.status === 409 ? "Too many requests, please wait a minute" : explain(err), true);
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
    toast(err instanceof ApiError && err.status === 409 ? "Commenting too fast, please wait a minute" : explain(err), true);
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
    toast("PDF uploaded");
    await loadPapers();
    openPaper(id);
  } catch (err) {
    toast(err instanceof ApiError && err.status === 413 ? "File is too large" : explain(err), true);
  }
});

$("p-delete").addEventListener("click", async () => {
  const p = state.current;
  if (!p || !confirm(`Delete paper “${p.title}”? This cannot be undone.`)) return;
  try {
    await api("/papers/" + p.id, { method: "DELETE" });
    closePaper();
    await loadPapers();
    toast("Paper deleted");
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
    toast("Created. Open the paper to upload a PDF.");
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
  toast("Signed out");
});
window.addEventListener("session-changed", async () => {
  await loadMe();
  toast("Session expired, please sign in again", true);
});

// Switch Shader Lighting Theme (Daylight / Sunset / Firefly Night)
$("btn-time")?.addEventListener("click", () => {
  if (!world?.cycleTimeMode) return;
  const mode = world.cycleTimeMode();
  const labels = ["🌌 Theme: Daylight", "🌇 Theme: Sunset", "🌙 Theme: Firefly Night"];
  $("btn-time").textContent = labels[mode] || "🌌 Theme";
});

// Toggle Interactive World View
function toggleScenicMode(force) {
  const isScenic = typeof force === "boolean" ? force : !document.body.classList.contains("scenic-mode");
  document.body.classList.toggle("scenic-mode", isScenic);
  const btn = $("btn-scenic");
  if (btn) {
    btn.textContent = isScenic ? "📋 Show Portfolio" : "🕸️ World View";
  }
  if (isScenic) {
    toast("Move or click to interact with the Minecraft Shader World & Knowledge Graph (Press Esc to return)");
  }
}

$("btn-scenic")?.addEventListener("click", () => toggleScenicMode());

// Activity / Competition / Vlog Filter Pills
document.querySelectorAll(".f-pill").forEach((btn) => {
  btn.addEventListener("click", () => {
    const filter = btn.dataset.media;
    document.querySelectorAll(".f-pill").forEach((b) => b.classList.toggle("on", b === btn));
    document.querySelectorAll("#activities [data-category]").forEach((card) => {
      card.hidden = filter !== "all" && card.dataset.category !== filter;
    });
  });
});

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

async function boot() {
  setupScrollAnimations();

  try {
    world = createWorld($("world"));
  } catch (e) {
    console.error(e);
    world = { setPapers() {}, setPaused() {}, cycleTimeMode() { return 0; } };
  }

  const login = consumeLoginFragment();
  if (login?.error) toast("GitHub sign-in failed: " + login.error, true);

  try {
    state.methods = await api("/auth/methods");
  } catch {
    state.methods = { github: false, password: false };
  }
  await loadMe();
  if (login?.loggedIn && state.me) toast("Welcome " + shortName(state.me.user));

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
