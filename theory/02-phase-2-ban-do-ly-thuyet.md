# Lý thuyết — Phase 2: bản đồ kiến thức và các tình huống business hay gặp

> Đọc cùng `docs/03-PHASE2-APP-PIPELINE-QUEST.md` (kế hoạch). Mỗi mục nêu: cần hiểu gì, vì sao dự án cần, và bẫy thường gặp. Một số điểm tôi ghi "cần kiểm chứng" vì chưa chạy thật trên máy bạn.

## 1. Bản đồ: kiến thức nào nối với phần nào của dự án

```
HTTP & REST ──▶ status code đúng ngữ nghĩa ──▶ ma trận 403/200/409 (barem Security)
AuthN/AuthZ ──▶ JWT + RBAC ───────────────────▶ barem "phân quyền user/admin"
Middleware  ──▶ log JSON, metrics, rate limit ─▶ Phase 7 Prometheus, Phase 8 EFK, barem 409
12-factor   ──▶ config qua env, stateless ─────▶ Phase 3 Helm/Secret, replicas
Probes      ──▶ /healthz, /readyz ─────────────▶ rolling update của ArgoCD
Docker      ──▶ multi-stage, cache layer ──────▶ bảng đo Fast-Lane (Phase 5)
Test        ──▶ table-driven, httptest ────────▶ stage "Test" trong Jenkinsfile
```

Đọc theo thứ tự trên: mỗi tầng là nền cho tầng dưới.

## 2. HTTP và REST

- **Idempotent**: gọi nhiều lần cho cùng kết quả. GET, PUT, DELETE idempotent; POST không. Hệ quả: người dùng bấm hai lần "thêm quest" sẽ ra hai quest.
- **Mã trạng thái cần thuộc:** 200 OK, 201 Created, 204 No Content, 400 dữ liệu sai, 401 chưa xác thực, 403 không đủ quyền, 404 không có, 409 xung đột, 429 quá nhiều request.
- **Hai chỗ barem lệch chuẩn, phải ghi rõ trong báo cáo:**
  - Chuẩn: thiếu token → **401**. Barem: **403**.
  - Chuẩn: vượt giới hạn → **429**. Barem: **409** (chuẩn dùng 409 cho xung đột trạng thái).
  Ta làm theo barem nhưng cần giải thích bạn biết sự khác nhau; giám khảo thường hỏi đúng chỗ này.
- **Hệ quả của lệch chuẩn:** giao diện không phân biệt được "hết hạn token" với "bị cấm" vì cả hai đều là 403. Cách xử lý ở mục 9.

## 3. Xác thực và phân quyền

| Khái niệm | Câu hỏi nó trả lời | Trong dự án |
|---|---|---|
| AuthN | Bạn là ai? | `login` đổi tài khoản/mật khẩu lấy token |
| AuthZ | Bạn được làm gì? | middleware kiểm `role` của token với route |
| RBAC | Quyền gắn theo vai trò | `user`: chỉ đọc; `admin`: đọc, thêm, xoá |

**JWT gồm 3 phần** `header.payload.signature`, mã hoá base64 (không phải mã hoá bí mật: **ai cũng đọc được payload**, chỉ không sửa được vì có chữ ký). Hệ quả: không bỏ dữ liệu nhạy cảm vào token.

Bẫy thường gặp:
- **Thuật toán `none` / nhầm thuật toán:** khi kiểm chữ ký phải ép đúng thuật toán đã chọn (ví dụ HS256), không tin trường `alg` của token.
- **Secret yếu hoặc nằm trong repo:** secret đọc từ biến môi trường, sinh ngẫu nhiên đủ dài. Phase 3 sẽ đưa vào Kubernetes Secret.
- **Token không thu hồi được:** JWT hợp lệ tới khi hết hạn. Đặt hạn ngắn (ví dụ 30 phút) vì ta không có kho lưu phiên.
- **Lưu token ở `localStorage` dễ bị XSS đánh cắp.** Lab chấp nhận, nhưng phải ghi là đánh đổi; cookie `HttpOnly` an toàn hơn đối với XSS nhưng kéo theo vấn đề CSRF.
- **So sánh mật khẩu:** băm (bcrypt), so sánh thời gian không đổi. Với 2 tài khoản demo vẫn nên làm đúng để làm thói quen.

## 4. Middleware và thứ tự chạy

Thứ tự đề xuất: `request-id → log → metrics → rate-limit → auth → handler`.

- Đặt `log` và `metrics` **ngoài cùng** để ghi cả request bị từ chối (403, 409); nếu đặt sau auth thì các lần bị chặn sẽ biến mất khỏi log, đúng thứ bạn muốn thấy khi điều tra tấn công.
- Rate limit đặt **trước** auth cho endpoint công khai; không cần lưu trạng thái xác thực mới tính được.
- Handler panic không được làm sập server: có middleware `recover`.

## 5. Rate limiting

| Thuật toán | Cách hoạt động | Nhược điểm |
|---|---|---|
| Fixed window | Đếm trong cửa sổ cố định mỗi phút | Dồn 10 request cuối phút trước + 10 đầu phút sau = 20 trong vài giây |
| Sliding window | Đếm trong khoảng "60 giây gần nhất" | Tốn bộ nhớ hơn |
| Token bucket | Xô đổ đầy dần, mỗi request lấy một | Hơi khó giải thích với barem "10 request/phút" |

Barem nói "quá 10 request trong 1 phút", nên **sliding window hoặc fixed window đều đáp ứng**; chọn fixed window cho đơn giản và kiểm thử dễ, ghi rõ nhược điểm.

Giới hạn thật cần biết:
- **Theo IP**: sau Ingress/HAProxy, thứ ứng dụng thấy là IP của proxy. Phải đọc `X-Forwarded-For`, và **chỉ tin header này khi request đến từ proxy của mình**, nếu không kẻ tấn công tự gửi header giả để lách giới hạn. Cần kiểm chứng ở Phase 9.
- **In-memory**: mỗi pod đếm riêng; 2 pod là giới hạn thực tế 20/phút. Lý do dự án giữ `replicas: 1`. Cách đúng cho production là kho dùng chung (Redis) hoặc rate limit ở Ingress.
- **Dọn bộ nhớ:** bản đồ IP phải được dọn định kỳ, nếu không là rò bộ nhớ.

## 6. Quan sát được (observability)

- **Metrics** có 3 loại chính: counter (chỉ tăng: số request), gauge (lên xuống: số kết nối), histogram (phân bố: thời gian xử lý).
- **Cardinality** là bẫy lớn nhất: label `path` phải là *mẫu route* (`/quests/:id`), không phải đường dẫn thật. Nếu dùng đường dẫn thật, mỗi id sinh một chuỗi thời gian mới, Prometheus phình bộ nhớ.
- **Log có cấu trúc (JSON)**: Fluentd/Elasticsearch parse trực tiếp, tìm theo `path`, `method`, `status` đúng yêu cầu barem. Dùng `request_id` để nối các dòng log của một request.
- **Không ghi vào log:** token, mật khẩu, nội dung body nhạy cảm. Log thường được nhiều người đọc hơn dữ liệu gốc.

## 7. Đóng gói theo 12-factor (liên quan Kubernetes)

- **Config qua biến môi trường** (cổng, secret, phiên bản). Cùng một image chạy ở local, preview, prod chỉ khác biến.
- **Stateless:** không lưu gì quan trọng trong tiến trình. Dự án vi phạm có chủ đích (store in-memory); đây là nợ kỹ thuật cần ghi.
- **Log ra stdout**, không ghi file: Kubernetes thu log từ stdout.
- **Graceful shutdown:** khi nhận SIGTERM, ngừng nhận request mới, xử lý nốt request đang chạy rồi thoát. Không có cái này thì mỗi lần rolling update sẽ rớt một số request.
- **Hai loại probe:** `liveness` ("tiến trình còn sống không", sai thì bị restart) và `readiness` ("sẵn sàng nhận traffic chưa", sai thì bị rút khỏi Service). Đừng gộp làm một; probe sai gây vòng lặp restart.

## 8. Docker cho Go

- **Multi-stage:** build trong image có compiler, copy file chạy sang image nhỏ. Image nhỏ pull nhanh hơn, ít bề mặt tấn công.
- **Thứ tự lớp quyết định tốc độ build**: copy `go.mod`/`go.sum` và tải dependency **trước**, copy mã nguồn **sau**. Đổi một dòng code không làm mất cache của lớp dependency. Đây chính là cơ chế bạn sẽ đo ở Phase 5, nên Phase 2 phải viết Dockerfile đúng ngay từ đầu để có baseline công bằng.
- **Chạy bằng user không phải root**; không đưa secret vào image (nằm lại trong lịch sử lớp).
- **Ghim phiên bản image gốc** (không dùng `latest`), cùng lý do tái lập như box Vagrant.

## 9. Các tình huống business/product hay gặp (và cách xử lý trong app này)

| # | Tình huống | Hậu quả nếu bỏ qua | Cách xử lý |
|---|---|---|---|
| 1 | Pod restart, dữ liệu in-memory mất | Quest admin vừa thêm biến mất | Ghi rõ giới hạn; nạp quest mẫu lúc khởi động; nâng cấp sau lên kho bền vững nếu cần |
| 2 | Người dùng bấm "thêm" hai lần | Hai quest trùng | Vô hiệu nút khi đang gửi; server kiểm trùng tên (trả 409) |
| 3 | Hai admin cùng xoá một quest | Người sau nhận lỗi bất ngờ | DELETE idempotent: xoá quest không còn tồn tại trả 404 và giao diện coi như đã xong |
| 4 | Token hết hạn giữa phiên, API trả 403 (theo barem) | Giao diện tưởng bị cấm quyền, người dùng không hiểu | Khi đã có token mà nhận 403 ở thao tác đọc, thử đăng nhập lại; hoặc thêm header `X-Auth-Reason: expired` để giao diện phân biệt |
| 5 | Nhiều người dùng chung một IP (văn phòng, NAT) | Một người dùng nhiều làm cả nhóm bị 409 | Ghi nhận giới hạn của rate limit theo IP; production nên giới hạn theo tài khoản/khoá API |
| 6 | Kẻ tấn công giả header `X-Forwarded-For` | Lách rate limit | Chỉ tin header khi đến từ proxy tin cậy |
| 7 | Đoán mật khẩu `login` hàng loạt | Lộ tài khoản | Giới hạn riêng cho `login` (chống brute force); khoá tạm sau N lần sai |
| 8 | Nhập tên quest chứa `<script>` | XSS | Giao diện dùng `textContent`, không dùng `innerHTML`; server giới hạn độ dài |
| 9 | Gửi body khổng lồ | Hết RAM | Giới hạn kích thước body ở server |
| 10 | Rolling update: web bản mới gọi api bản cũ | Lỗi tạm thời hoặc sai dữ liệu | Thay đổi API tương thích ngược; đổi API theo hai bước (thêm trước, bỏ sau) |
| 11 | Deploy lúc đang có request | Rớt request | Graceful shutdown + readiness probe |
| 12 | Đổi `JWT_SECRET` | Mọi token cũ vô hiệu, mọi người bị đăng xuất | Chủ động, thông báo; kế hoạch xoay khoá cần hỗ trợ hai khoá cùng lúc nếu muốn không gián đoạn |
| 13 | Đồng hồ máy lệch (kiểu VM sau khi laptop ngủ, bạn đã gặp ở `docs/02` E2) | Token "chưa hợp lệ" hoặc hết hạn sớm | Cho phép lệch nhỏ (leeway) khi kiểm hạn |
| 14 | Alert theo số lượng 403 | Báo động giả hoặc bỏ lỡ tấn công | Tách counter theo lý do (`no_token`, `bad_token`, `role`) để phân biệt lỗi người dùng với dò quét |
| 15 | Log lỡ ghi token | Lộ credential qua hệ thống log | Không ghi header `Authorization`; xem lại trước khi bật EFK |

## 10. Kiểm thử

- **Table-driven test** trong Go: một bảng (method, đường dẫn, token) → mã mong đợi. Chính là ma trận kiểm thử của kế hoạch, chạy bằng `httptest` không cần mở cổng.
- **Race detector** (`go test -race`): store in-memory và bộ đếm rate limit được nhiều goroutine truy cập, phải có mutex; cờ này bắt lỗi truy cập đồng thời.
- Test rate limit cần **đồng hồ giả** (truyền thời gian vào hàm), nếu không phải chờ thật 60 giây.
- Ba tầng: test đơn vị (logic), test HTTP (middleware + handler), ma trận `curl` trên bản chạy thật. Tầng cuối chỉ chứng minh tích hợp, không thay hai tầng đầu.

## 11. Tự kiểm tra

1. Vì sao `log` và `metrics` phải nằm ngoài cùng chuỗi middleware?
2. Thiếu token và token đúng nhưng role `user` gọi `DELETE` đều trả 403. Làm sao phân biệt chúng trong metrics?
3. Vì sao sửa mã nguồn một dòng không nên làm Docker build lại phần tải dependency?
4. Chạy 2 pod thì rate limit 10 request/phút thực tế thành bao nhiêu, và vì sao?
5. Tình huống số 4: token hết hạn trả 403 theo barem, giao diện nên làm gì?

<details>
<summary>Đáp án gợi ý</summary>

1. Để ghi cả request bị chặn bởi auth/rate limit; nếu đặt sau, các request đáng chú ý nhất biến mất khỏi dữ liệu.
2. Counter `authz_denied_total` có label `reason` (`no_token`, `bad_token`, `role`).
3. Vì lớp copy `go.mod`/`go.sum` + tải dependency đứng trước lớp copy mã nguồn; Docker chỉ build lại từ lớp đầu tiên bị đổi trở xuống.
4. Khoảng 20/phút (mỗi pod đếm riêng, traffic chia đều); vì bộ đếm nằm trong bộ nhớ từng pod.
5. Nếu đang có token mà nhận 403 ở thao tác đọc thì đăng nhập lại; hoặc dùng header lý do để phân biệt. Với 403 ở thao tác ghi bằng token còn hạn thì mới là bị cấm thật.

</details>
