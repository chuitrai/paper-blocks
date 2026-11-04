# 03 — Phase 2: Ứng dụng demo (portfolio paper, thế giới khối hộp)

> Tài liệu thiết kế, thay thế bản "Pipeline Quest" cũ. Ứng dụng vẫn chỉ là phương tiện cho CI/CD, nhưng nay là một portfolio thật hơn: có dữ liệu bền vững, đăng nhập GitHub, tải paper, comment. Trạng thái: **API khung (quests, JWT, rate limit, metrics) đã chạy và đạt ma trận**; phần dưới là những gì sẽ đổi và thêm.

## 1. Phạm vi đã chốt

| | v1 (làm bây giờ) | v2 (sau Phase 13, nếu còn thời gian) |
|---|---|---|
| Paper | tải PDF lên, tiêu đề, tóm tắt, thẻ; xem PDF trong trang | chế độ đọc tương tác, chú thích trên đoạn văn |
| GitHub | đăng nhập GitHub để comment; gắn URL repo công khai và hiện README | liệt kê repo của chủ portfolio qua OAuth |
| Video / demo | **liên kết** (TikTok, YouTube, trang demo) hiện dạng thẻ; nhúng có sandbox nếu nguồn cho phép | trình phát nhúng đầy đủ |
| Comment | thêm, xem, xoá comment của mình; admin xoá bất kỳ | trả lời lồng nhau, báo cáo vi phạm |
| Giao diện | thế giới khối hộp nguyên bản: bản đồ, level, nhân vật, thẻ paper | hoạt ảnh phong phú, âm thanh |

"Paper tương tác" ở v1 hiểu là: xem PDF ngay trên trang, kèm repo, video, demo và comment bên cạnh. Chế độ đọc tương tác đầy đủ để v2, vì nó lớn bằng cả phần còn lại cộng lại.

**Về phong cách khối hộp:** thiết kế nguyên bản bằng CSS và canvas (đất, cỏ, đá, nước, nhân vật tự đặt). Không dùng tên, logo, texture, font hay nhân vật của Minecraft. Không ghi tên Minecraft trong giao diện hay báo cáo.

## 2. Kiến trúc

```
Trình duyệt ──▶ web (nginx, tĩnh) ──/api/──▶ api (Go + Gin, replicas: 1)
                                              ├─ SQLite (modernc.org/sqlite, thuần Go, không CGO)
                                              ├─ thư mục /data/papers (PDF)    ◀── PVC
                                              ├─ gọi api.github.com: OAuth + README (có cache)
                                              └─ /metrics, log JSON
```

- **SQLite thuần Go** (`modernc.org/sqlite`) để giữ `CGO_ENABLED=0` và image distroless như hiện nay. Đánh đổi: chậm hơn bản C, không quan trọng ở quy mô này.
- **Một ghi tại một thời điểm**: SQLite hợp với `replicas: 1`. Kéo theo hai hệ quả cho Kubernetes ở Phase 3:
  1. Deployment phải dùng chiến lược **`Recreate`**, không dùng `RollingUpdate`: ổ đĩa kiểu RWO và SQLite không cho hai pod cùng ghi, rolling update sẽ có lúc hai pod cùng chạy.
  2. Cluster kubeadm của bạn **chưa có StorageClass mặc định**, nên PVC sẽ kẹt `Pending`. Phase 3 cần cài local-path-provisioner hoặc tạo PV `hostPath` thủ công. Đây là việc phải làm, không phải tuỳ chọn.
- **Preview environment (Phase 6)** phải dùng `emptyDir` cho dữ liệu, không dùng chung PVC với bản chính, nếu không PR nào cũng ghi vào cùng một DB.

## 3. Mô hình dữ liệu

```
papers   (id, title, abstract, tags, pdf_file, repo_url, video_url, demo_url, created_at, views)
comments (id, paper_id, parent_id, author_login, author_avatar, body, created_at, edited_at)
```
`views`, `parent_id`, `edited_at` được thêm sau: `migrate()` kiểm tra cột có chưa rồi mới `ALTER`, nên DB cũ nâng cấp tại chỗ và chạy lại nhiều lần vẫn an toàn (có test).
Chỉ lưu `login` và avatar từ GitHub, **không lưu access token của người xem**: token chỉ dùng một lần để lấy danh tính rồi bỏ.

## 4. API

| Method | Đường dẫn | Ai | Kết quả |
|---|---|---|---|
| GET | `/api/v1/auth/github/login` | công khai | chuyển hướng sang GitHub (kèm `state` chống CSRF) |
| GET | `/api/v1/auth/github/callback` | công khai | đổi `code` lấy danh tính, cấp JWT của ta |
| POST | `/api/v1/login` | công khai | đăng nhập mật khẩu, **chỉ bật khi `ENABLE_PASSWORD_LOGIN=true`** (xem mục 5) |
| GET | `/api/v1/status` | công khai, giới hạn tốc độ | giữ nguyên, quá 10/phút → **409** |
| GET | `/api/v1/me` | đăng nhập | 200; không token → **403** (URL "phải xác thực" cho barem) |
| GET | `/api/v1/papers`, `/papers/{id}` | công khai | 200 |
| GET | `/api/v1/papers/{id}/readme` | công khai | README của repo đã gắn, cache |
| POST | `/api/v1/papers` | admin | 201 (multipart: PDF + trường) ; user/không token → **403** |
| DELETE | `/api/v1/papers/{id}` | admin | 204 ; user/không token → **403** |
| GET | `/api/v1/papers/{id}/file` | công khai | phục vụ PDF an toàn (xem mục 5) |
| GET | `/api/v1/papers/{id}/comments` | công khai | 200 |
| POST | `/api/v1/papers/{id}/comments` | đăng nhập | 201 ; không token → **403** |
| DELETE | `/api/v1/comments/{id}` | chủ comment hoặc admin | 204 ; người khác → **403** |
| GET | `/api/v1/papers?q=&tag=&sort=` | công khai | tìm tiêu đề/tóm tắt, lọc một tag, `sort=new\|views`; tham số sai → 400 |
| GET | `/api/v1/tags` | công khai | tag và số paper, nhiều nhất trước |
| GET | `/api/v1/stats` | công khai | tổng paper/comment/lượt xem và 5 paper xem nhiều nhất |
| POST | `/api/v1/papers/{id}/view` | công khai, 5 lần/phút/(IP, paper) | ghi một lượt xem; vượt hạn mức → **409** |
| PATCH | `/api/v1/comments/{id}` | chỉ chủ comment | 200; admin hay người khác → **403** (admin chỉ được xoá, không được sửa lời người khác) |

Trả lời comment: `POST /papers/{id}/comments` nhận thêm `parent_id`. Chỉ một cấp: cha phải là comment gốc của **cùng paper**, ngược lại 400. Xoá comment gốc xoá luôn các reply (khoá ngoại `ON DELETE CASCADE`). Metric mới: `paper_views_total`, `comments_total{action=created|replied|edited|deleted}`.

**Xung đột barem và cách giải.** Barem: `user` gọi `POST/DELETE` → 403, `admin` → 2xx. Ta thoả bằng cách: tài nguyên mà barem kiểm (`/papers`) đúng như vậy (chỉ admin ghi). Comment là một endpoint riêng cho người xem. Trong tài liệu nộp phải nói rõ ma trận barem áp dụng cho `/papers`, và giải thích vì sao comment khác. Vai trò admin = tài khoản GitHub có `login` trùng biến `ADMIN_GITHUB_LOGIN` (là bạn).

## 5. Bảo mật: những chỗ dễ sai nhất

**Đăng nhập GitHub (OAuth)**
- Tham số `state` ngẫu nhiên, gắn với cookie ngắn hạn, kiểm khi callback (chống CSRF đăng nhập).
- Việc đổi `code` lấy token làm ở **server**; `client_secret` nằm trong Kubernetes Secret, không bao giờ xuống trình duyệt.
- Sau khi lấy danh tính, ta cấp JWT riêng. Quyền hạn lấy từ `login`, không tin gì từ phía client.
- **Cần kiểm chứng:** địa chỉ callback phải là địa chỉ trình duyệt của bạn truy cập được và đã đăng ký trong GitHub OAuth App. Cluster của bạn chạy cục bộ nên callback sẽ dạng `http://192.168.56.x:<NodePort>/...`; tôi chưa chắc GitHub chấp nhận `http` cho địa chỉ không phải `localhost`. Nếu không, phải dùng `localhost` qua port-forward hoặc HTTPS tự ký ở Phase 9.
- `ENABLE_PASSWORD_LOGIN`: barem cần `curl` với tài khoản `user`/`admin`, mà GitHub OAuth không `curl` được. Giữ đăng nhập mật khẩu **chỉ để chạy ma trận kiểm thử và làm evidence**, tắt mặc định, bật bằng biến môi trường. Phải ghi nó là nợ bảo mật có chủ đích.

**Tải PDF lên**
- Chỉ admin được tải. Giới hạn dung lượng (ví dụ 20 MB), đọc từ luồng có chặn trên, không nạp hết vào RAM.
- Kiểm **nội dung thật** (4 byte đầu `%PDF-`), không tin đuôi file hay `Content-Type` do client gửi.
- Lưu bằng tên do server sinh (UUID), không dùng tên file của client (tránh path traversal).
- Phục vụ với `Content-Type: application/pdf`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox`; không bao giờ để PDF được hiểu là HTML.
- Không quét virus ở v1: ghi nhận là rủi ro vì chỉ admin tải.

**README từ GitHub và comment (nội dung do người khác viết)**
- Chỉ nhận URL dạng `https://github.com/<owner>/<repo>` đúng mẫu nghiêm ngặt; server tự gọi `api.github.com`, **không bao giờ lấy URL tuỳ ý do client gửi** (chống SSRF).
- README là markdown; phải render rồi **làm sạch HTML** trước khi hiển thị, hoặc hiển thị dạng văn bản thuần ở v1. Comment hiển thị bằng `textContent`.
- Cache README phía server (ví dụ 10 phút) vì API GitHub không đăng nhập có giới hạn thấp (khoảng 60 lần/giờ/IP theo trí nhớ, bạn nên kiểm tra lại).

**Video / demo**
- Chỉ nhận URL `https`; lưu dạng liên kết. Khi nhúng, dùng `iframe` với thuộc tính `sandbox` và danh sách nguồn cho phép. Không chạy mã demo của ai trên cluster.
- Nhúng TikTok nạp script bên thứ ba; mặc định v1 hiện thẻ liên kết, nhúng là tuỳ chọn.

**Comment**
- Giới hạn độ dài, giới hạn tần suất theo tài khoản (không chỉ theo IP, vì nhiều người chung IP), chống trùng nội dung gửi liên tiếp.

## 6. Ảnh hưởng đến các phase sau

| Phase | Thay đổi |
|---|---|
| 3 (Helm) | Chart thêm PVC + StorageClass, Secret (JWT, OAuth, mật khẩu), `strategy: Recreate`; cài local-path-provisioner |
| 4–5 (CI/CD) | Test có thêm DB; build dùng `modernc.org/sqlite` nên vẫn `CGO_ENABLED=0` |
| 6 (Preview) | `emptyDir` cho dữ liệu; OAuth callback khác nhau mỗi preview → preview dùng đăng nhập mật khẩu hoặc tắt comment |
| 7 (Prometheus) | Thêm metric: số paper, số comment, lỗi GitHub, kích thước DB |
| 8 (EFK) | Log thêm sự kiện upload, đăng nhập (không ghi token) |
| 9–11 (Security) | Giữ ma trận barem trên `/papers`; thêm test cho upload và OAuth state |

## 7. Giao diện thế giới khối hộp

- Bản đồ dạng lưới khối: mỗi paper là một "toà nhà" hoặc "hòn đảo" khối hộp; bấm vào để mở trang paper. Nhân vật khối hộp tự đặt đi trên bản đồ.
- Trang paper: khung PDF ở giữa, cột bên là repo/README, video, demo, và comment.
- Bảng màu giới hạn, khối vẽ bằng CSS (`box-shadow`/`transform`) hoặc canvas; không ảnh ngoài. Font pixel: bạn bỏ file vào `app/web/fonts/`, không có thì dùng monospace.
- Tôi sẽ chụp ảnh bản xem trước để tự kiểm tra bố cục; việc đánh giá "đẹp" là của bạn.

## 8. Thứ tự làm

1. Refactor API: thêm SQLite + migration, bảng `papers`/`comments`; đổi `quests` thành `papers` giữ nguyên ma trận barem; cập nhật test.
2. Tải/phục vụ PDF an toàn + test (file giả, quá lớn, sai magic bytes).
3. OAuth GitHub (`state`, callback, cấp JWT) + `ENABLE_PASSWORD_LOGIN`; test bằng máy chủ GitHub giả.
4. README (cache, mẫu URL nghiêm ngặt) + comment + test phân quyền comment.
5. `check-matrix.sh` mới chạy xanh.
6. Web: thế giới khối hộp, trang paper, đăng nhập, comment.
7. Dockerfile (thêm thư mục `/data`, user không root ghi được), `docker-compose.yml` với volume.
8. Đo thời gian build làm baseline cho `bench/`.
9. Mở rộng để có traffic cho phần DevOps: lượt xem, thống kê, tìm kiếm/lọc tag, sửa/trả lời comment, 9 paper DevOps mẫu (`SEED_DEMO`, chỉ nạp khi DB trống), kịch bản k6 `bench/k6/traffic.js` (người đọc, người bình luận, người "phá" để ra 403/409).

## 9. Việc bạn cần chuẩn bị

1. **Đăng ký GitHub OAuth App** (Settings → Developer settings → OAuth Apps). Callback tạm: `http://localhost:8080/api/v1/auth/github/callback`. Lấy `Client ID` và `Client Secret`, bỏ vào `.env` (đã gitignore). **Không dán secret vào chat.** Tôi sẽ viết mã đọc từ biến môi trường, và test bằng GitHub giả nên không cần secret của bạn.
2. Cho tôi biết `login` GitHub của bạn để đặt `ADMIN_GITHUB_LOGIN` (không phải bí mật).
3. Font pixel (tuỳ chọn).

## 10. Lỗi thực tế đã gặp ở Phase 2

Mỗi dòng: triệu chứng, nguyên nhân gốc, cách sửa. Các lỗi dưới đây đều không nằm ở logic ứng dụng.

| # | Triệu chứng | Nguyên nhân | Cách sửa / phòng tránh |
|---|---|---|---|
| P1 | `check-matrix.sh` ra 404 ở `/papers`, `/me` và 409 ở `/status` | Bản server **cũ** vẫn đang chiếm cổng 8080, nên request đến bản cũ (chưa có route mới); thêm nữa `go run .` bị chạy sai thư mục (`cannot find main module`, không thấy `../../.env`) | `netstat -ano \| grep ":8080"` rồi `taskkill //PID <pid> //F`; luôn chạy từ `app/api`; đợi 1 phút giữa hai lần chạy vì `/status` giới hạn 10/phút |
| P2 | `curl` trả `{"error":"invalid body"}` | Gõ `\ -d` (có dấu cách sau `\`) nên shell cắt lệnh, `-d` không được gửi | Viết lệnh trên một dòng, hoặc `\` phải là ký tự cuối dòng; dùng biến `TOKEN` |
| P3 | Ma trận báo `000` ở bước upload PDF, kéo theo `GET file` 404 | `000` **không phải mã HTTP**: curl tự lỗi, chưa nhận được phản hồi. Script tạo file tạm bằng `mktemp` ở `/tmp/...`; nếu `curl` chạy là `curl.exe` của Windows thì không hiểu đường dẫn kiểu MSYS này, không mở được file để gửi. File không lên thì `GET file` tất nhiên 404 | File tạm đặt ở thư mục hiện tại (đường dẫn tương đối) và `trap` để xoá; `code()` dùng `curl -sS` để lỗi của chính curl được in ra, không còn im lặng |
| P4 | `golang:1.23-alpine` không build được `go 1.26.0` | Phiên bản image thấp hơn dòng `go` trong `go.mod` | Image build dùng `golang:1.26-alpine`; giữ hai nơi này khớp nhau |
| P5 | `GET /status` lần 11 trong một phút trả 409 | Đúng thiết kế (barem) chứ không phải lỗi; giao diện chỉ gọi `/status` một lần khi tải trang | Khi tự thử bằng curl, đừng gọi dồn; k6 có kịch bản "abuser" cố ý chạm hạn mức |

Bài học chung: khi mã trạng thái là `000`, hay một kết quả không khớp với code vừa sửa, hãy kiểm tra **công cụ và môi trường** (tiến trình cũ, thư mục chạy, phiên bản curl) trước khi nghi ngờ code.

## 11. Kiến thức nền

Xem `theory/02-phase-2-ban-do-ly-thuyet.md` (HTTP, JWT/RBAC, middleware, rate limit, observability, Docker). Phần OAuth, tải file và SQLite trên Kubernetes tôi sẽ bổ sung vào cùng file khi làm bước tương ứng.
