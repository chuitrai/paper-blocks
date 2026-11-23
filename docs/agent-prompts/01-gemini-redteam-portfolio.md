# PROMPT cho agent Gemini: "Red-Team Console Portfolio"

> Cách dùng: mở thư mục repo trong IDE của agent, dán **toàn bộ phần từ `---BẮT ĐẦU PROMPT---` đến `---HẾT PROMPT---`** làm tin nhắn đầu. Prompt viết bằng tiếng Anh vì agent làm theo tiếng Anh ổn định hơn; câu trả lời của agent có thể yêu cầu bằng tiếng Việt (đã ghi trong prompt).
> Prompt này đã đối chiếu với code thật ngày 2026-11-23 (`server.go`, `store.go`, `nginx.conf`, `api.js`, `app/web/Dockerfile`). Nếu bạn đổi API hay CSP thì sửa lại các mục tương ứng.

---BẮT ĐẦU PROMPT---

# ROLE
You are a senior front-end engineer with a strong eye for visual design and a security mindset. You are upgrading the front end of an existing project, "Paper Blocks": a personal portfolio of Vu Dinh Ngoc Bao (GitHub `chuitrai`) that is also a DevSecOps demo. Reply to me in Vietnamese, write code and comments in English.

# GOAL
Turn `app/web/` into a **beautiful, hacker/cyber-AI-flavoured, highly interactive portfolio** whose signature feature is a **"Red-Team Console"**: visitors can fire *safe, scripted attacks against the site's own live API* and watch the defences (403 authorization, 409 rate limit, inert XSS) respond in real time, each with a plain-language explanation. The portfolio must also work great as a normal website for a recruiter who never opens the console.

Success = a recruiter understands who Bao is in 10 seconds, a technical visitor spends 2 minutes playing with the console, and every number/claim on the page is true.

# STEP 0 — AUDIT FIRST (do not write code before this)
Read and summarise in ≤ 15 lines: `app/web/index.html`, `app.js`, `api.js`, `world.js`, `style.css`, `nginx.conf`, `Dockerfile`, `app/api/internal/server/server.go`, `docs/WORKLOG.md`, `docs/03-PHASE2-APP-PIPELINE-QUEST.md`. Then post a short plan (files you will touch, visual concept, command list) and **wait for my "go"** before editing.

# HARD CONSTRAINTS (non-negotiable; violating any = failure)
1. **Scope.** Only edit inside `app/web/` plus a new entry at the top of `docs/WORKLOG.md`. Do NOT touch `app/api/`, `app/chart/`, `infra/`, `config/`, `scripts/`, `bench/`. If you think a backend change is needed, stop and ask.
2. **CSP is fixed** (set in both `nginx.conf` and the `<meta>` in `index.html`):
   `default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://avatars.githubusercontent.com; frame-src 'self'; object-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'self'`.
   Consequences you must respect: no inline `<script>`, no inline event handlers (`onclick=`), no `eval`/`new Function`, no CDN scripts, no remote images, no `<style>` blocks and no `style="..."` attributes in markup (set styles through CSS classes or `element.style.prop = ...`, which is allowed), `fetch` only to same origin.
3. **No `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`.** All text from the API or users (comments, README markdown, titles, errors) is inserted with `textContent`/DOM construction only. README markdown is shown as plain text, never rendered as HTML.
4. **No build step.** Vanilla ES modules, no npm, no bundler. three.js is already vendored in `vendor/` (keep using it only if you need WebGL). Prefer Canvas 2D / CSS for effects.
5. **Dockerfile must ship everything.** `app/web/Dockerfile` currently copies only `index.html style.css app.js api.js world.js`, `fonts/`, `vendor/`. The folders `assets/` and `papers/` that the page already references are NOT copied, so they would 404 in the cluster image. Fix this (add `COPY assets ...` and `COPY papers ...`, plus any new file/folder you create) and prove it with `docker compose up --build` (see acceptance).
6. **Do not change the API contract or its security behaviour.** The 403/409 behaviours below are required by the course rubric. The front end adapts to them, never the reverse.
7. **Truthfulness.** Keep all real CV content (papers, internships, awards, links) from the current `index.html`/`app.js`; never invent facts. Fix these known false statements: the text says "Go 1.24" (real: Go 1.26, see `app/api/go.mod`) and "GitHub OAuth 2.0 PKCE" (real: the backend uses a random `state` cookie, **no PKCE**; say "OAuth 2.0 with state"). If you are unsure whether a claim is true, mark it `TODO(verify)` in your report instead of publishing it.
8. **Original design only.** Remove every "Minecraft"/"Steve"/"shader pack" mention in code, comments, alt text and UI, and remove the dependency on `assets/mc-shader-bg.jpg` (a game screenshot we may not own). Replace it with original procedural art (canvas/CSS). Do not copy another portfolio's code or art; do not use game, film or brand names/logos.
9. **Secrets.** Never print or store tokens/passwords. Do not commit anything. Do not create or edit `run-local.bat`. Before finishing run `bash scripts/check-no-secrets.sh` and report the output verbatim.
10. **Rate limits are shared per visitor IP.** `GET /status` allows 10 requests/min/IP; `POST /papers/:id/view` allows 5 per (IP, paper)/min; comments 5/min per account; login 20/min. **Never poll** `/status` or call `/view` in a loop. Call `/view` once when a paper is opened (the existing code does this). Fetch `/status` once on load and on the `status` command only.

# API CONTRACT (verified against the code; base path `/api/v1`, same origin)
Errors are JSON `{"error":"..."}`. Auth is `Authorization: Bearer <jwt>`. Status codes are intentionally non-standard: **missing/invalid/expired token or insufficient role → 403 (not 401)**; **rate limit exceeded → 409 (not 429)** with a `Retry-After` header (seconds). Every 403 has body `{"error":"forbidden","reason":"<reason>"}` and header `X-Auth-Reason: <reason>`. Reasons confirmed in code: `bad_token`, `expired`, `owner`; `no_token` and `role` are expected from the missing-token and role checks (grep `s.deny(` in `app/api/internal/server/` to confirm before you rely on them).

| Method & path | Auth | Request | Success response |
|---|---|---|---|
| `GET /auth/methods` | none | – | `{"password":bool,"github":bool}` |
| `POST /login` | none (only exists when `password` is true) | `{"username","password"}` | `200 {"token","expires_at"(RFC3339),"role"}`; bad creds → `401` |
| `GET /auth/github/login` | none (only if `github` is true) | browser navigation | redirects to GitHub; callback redirects to `/#token=…&expires_at=…&role=…` or `/#login_error=…` (already handled by `consumeLoginFragment()` in `api.js`; keep it) |
| `GET /status` | none, **10/min/IP → 409** | – | `{"version","uptime_seconds"}` |
| `GET /papers?q=&tag=&sort=` | none | `q` ≤ 100 chars, `tag` ≤ 24 chars, `sort` = `new`\|`views`; bad values → 400 | `{"papers":[Paper]}` |
| `GET /tags` | none | – | `{"tags":[{"tag","count"}]}` |
| `GET /stats` | none | – | `{"papers","comments","views","top_papers":[{"id","title","views"}]}` |
| `GET /papers/:id` | none | – | `Paper` |
| `POST /papers/:id/view` | none, **5/min per (IP,paper) → 409** | – | `{"views":n}` |
| `GET /papers/:id/file` | none | – | the PDF (show in an `<iframe src>`; same origin is allowed) |
| `GET /papers/:id/readme` | none | – | `{"repo","markdown","truncated","fetched_at"}` (plain text only) |
| `GET /papers/:id/comments` | none | – | `{"comments":[Comment]}` |
| `GET /me` | user | – | `{"user","role","avatar"}`; **no token → 403** |
| `POST /papers/:id/comments` | user, **5/min per account → 409** | `{"body","parent_id"?}` | `201 Comment`; duplicate text → `409 {"error":"duplicate comment"}` |
| `PATCH /comments/:id` | owner only | `{"body"}` | `Comment`; not owner → 403 |
| `DELETE /comments/:id` | owner or admin | – | `204` no body; others → 403, reason `owner` |
| `POST /papers` | **admin** | `{"title","abstract","tags":[],"repo_url","video_url","demo_url"}` | `201 Paper`; role `user` → 403 |
| `POST /papers/:id/file` | **admin** | multipart PDF ≤ 20 MiB (keep the existing field name from `app.js`) | – |
| `DELETE /papers/:id` | **admin** | – | success |

`Paper` = `{id, title, abstract, tags[], repo_url, video_url, demo_url, has_pdf, created_at, views, comment_count}`.
`Comment` = `{id, paper_id, parent_id?, author, avatar, body, created_at, edited_at?}`.
`avatar` may only be displayed when it starts with `https://avatars.githubusercontent.com/` (the existing helper does this; keep it).
`/metrics`, `/healthz`, `/readyz` are NOT reachable from the browser (nginx only proxies `/api/`): do not use them.
The current `app.js` also contains hard-coded portfolio entries (real papers/projects with `thumb_url`, `pdf_url`). Keep them as the content that renders even when the API is down (graceful degradation: show a small "API offline — showing cached portfolio" badge instead of an empty page).

# PRODUCT SPEC

## A. Two layers, one page
1. **Public layer (default view).** Cinematic hero (name, one-line role, animated scramble-to-text headline), CV sections (research, projects, awards, creative corner), and **dossier cards** for papers/projects: classification-style header, tag chips, view counter, "clearance level" badge derived from `views` (e.g. L1 < 10, L2 < 50, L3 ≥ 50 — your thresholds, documented in a comment), links (repo/video/demo/PDF/README).
2. **Console layer.** A docked terminal (toggle with the button and with `` Ctrl+` ``; `Esc` closes). Autocomplete with Tab, ↑/↓ history, `clear`, and a "demo script" button that types the best commands for a first-time visitor. The console must be fully keyboard operable and have an ARIA live region for output.

## B. Console commands (every command maps to a real API call; print the HTTP method, path, status code and the relevant headers)
- Info: `help`, `whoami` (calls `GET /me`; without a token the **expected result is 403** — show it as "denied by design", not as a bug), `status`, `stats`, `tags`.
- Browse: `ls [--tag <t>] [--sort new|views]`, `search <q>`, `cat <id>`, `readme <id>`, `open <id>` (opens that paper's dossier panel).
- Session: `login` (opens the existing login UI; only offer the methods returned by `GET /auth/methods`), `logout`.
- **Attacks** (the signature feature). Each one prints: the exact request sent, the real response, then a **"DEFENCE"** box naming the control that stopped it and where it lives (e.g. "JWT role check in the authorization middleware", "fixed-window rate limiter: 10 req/min/IP", "textContent rendering + CSP").
  - `attack no-token` → `GET /me` without a token → expect **403**, reason `no_token`.
  - `attack forged-jwt` → same call with a random fake `Bearer` token → expect **403**, reason `bad_token`.
  - `attack privilege` → requires a logged-in non-admin; `POST /papers` → expect **403**, reason `role`. If not logged in, explain how to log in first. Never send a real payload that could create data; the request must be rejected before any write (if the visitor *is* admin, refuse to run this command and say why).
  - `attack flood` → requires explicit confirmation (`y/N`); sends exactly 12 sequential `GET /status`, animates a gauge, expects ~10×200 then **409** with `Retry-After`. Client-side cooldown: refuse to run again for 60 s (it consumes the visitor's own per-IP budget). Say clearly that this only throttles the visitor's own IP.
  - `attack replay-view` → 7 sequential `POST /papers/:id/view` on one chosen paper, expect **409** after the 5th. Same cooldown rule.
  - `attack xss` → shows a payload string such as `<img src=x onerror=alert(1)>` rendered **inertly** in a local sandbox panel via `textContent` (no network write, no real comment is posted), and explains CSP + textContent.
- Easter eggs: `sudo`, `warp world` (and the Konami code) open the existing first-person voxel world (`world.js`) as "Level 2". Keep it working; just remove the Minecraft naming.

## C. Visual system (make it striking, but original)
- Palette: near-black blue/green base, one neon accent (e.g. acid green or cyan), one warning accent (amber/red for 403/409). Contrast ≥ 4.5:1 for body text.
- Typography: a monospace for the console/labels and a geometric sans for headings. Prefer **self-hosting** the fonts (download woff2 of the OFL-licensed fonts already in use into `fonts/`, add `@font-face`, then remove `fonts.googleapis.com`/`fonts.gstatic.com` from the CSP in BOTH `nginx.conf` and the `<meta>`). If you cannot download them, keep the current Google Fonts and say so in the report.
- Motion: text scramble/decode on headings, subtle CRT scanlines and vignette (CSS only), animated knowledge graph on canvas (nodes = papers/projects, node size = views, edges = shared tags computed from `GET /papers`; hover shows a mini dossier, click opens it), a procedural "network grid" or voxel-field background drawn on canvas.
- Request visualiser: when any API call happens, a thin "packet" travels across a mini network diagram (browser → nginx → api) and the status chip turns green (2xx), amber (409), red (403). This makes the 403/409 behaviour visible.
- Comments are shown as "intercepted transcripts" (monospace, author, time), with reply and edit as today.
- Performance and accessibility: 60 fps target on a mid-range laptop; pause all animation when the tab is hidden (`visibilitychange`); honour `prefers-reduced-motion` (no scramble, no scanlines, static graph); a visible "Low-power mode" toggle; responsive down to 360 px; every interactive element reachable by keyboard with a visible focus ring; images have meaningful `alt`.

# ACCEPTANCE CRITERIA (run them yourself and report evidence, not intentions)
1. `node --check` passes for every `.js` file in `app/web/` (ES modules: use `node --input-type=module --check < file` if needed).
2. `grep -rnE "innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function|onclick=|style=\"" app/web --include=*.js --include=*.html` returns nothing (vendor/ excluded). `grep -rniE "minecraft|steve|mc-shader" app/web` returns nothing.
3. With the stack running (`docker compose up --build` from the repo root; web is at `http://localhost:8081`): the home page loads with **zero CSP violations and zero errors in the browser console**; every image and PDF referenced by the page returns 200 (this proves the Dockerfile change).
4. Each `attack …` command produces the expected status (403/403/403/409/409) and prints the DEFENCE box. Show the console transcript.
5. `bash scripts/check-matrix.sh` still passes (you did not touch the backend; this is the regression guard).
6. Throttled-CPU sanity check: with DevTools CPU 4× slowdown the page remains usable, and with `prefers-reduced-motion` enabled no decorative animation runs.
7. `bash scripts/check-no-secrets.sh` output is attached verbatim. (Known pre-existing findings in `run-local.bat` and in git history are not yours; just list them.)

# DELIVERABLES
- Code in `app/web/` and the updated `app/web/Dockerfile`.
- A new top entry in `docs/WORKLOG.md` in the existing format: what you changed, **only commands you actually ran and their real results** under "Đã chạy", everything else under "Chưa chạy", and any `TODO(verify)` claims. Do not edit other people's entries.
- Final message in Vietnamese: a table of the 7 acceptance checks (pass/fail/not run with reason), screenshots or transcript paths, and the list of things you were unsure about. Do not commit or push.

# WORKING STYLE
Work in small steps: (1) audit and plan → wait for "go"; (2) design tokens + layout + content parity; (3) console + commands; (4) attacks + defence boxes; (5) graph + visual effects; (6) accessibility/performance pass; (7) Dockerfile + acceptance. After each step, run the relevant checks. If a requirement conflicts with another, stop and ask instead of guessing.

---HẾT PROMPT---

## Ghi chú cho Bảo (không dán vào agent)

1. **Hai việc bạn nên tự làm trước khi giao**: commit giao diện hiện tại (hoặc để lại làm baseline), và bỏ `run-local.bat` khỏi lần commit.
2. Prompt buộc agent **dừng ở bước 0 chờ "go"**. Đây là chủ ý: đọc kế hoạch của nó trước khi nó sửa vài nghìn dòng.
3. Prompt chỉ cho sửa `app/web/`. Nếu sau này muốn endpoint mới (ví dụ ghi log tấn công để hiển thị live), đó là việc backend riêng, làm ở phiên khác.
4. Kết quả của agent là *lời khai*, không phải bằng chứng. Tự chạy lại `docker compose up --build`, mở `http://localhost:8081`, thử từng lệnh `attack`, rồi báo kết quả cho tôi kiểm tra chéo.
