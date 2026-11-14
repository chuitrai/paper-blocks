# Nhật ký bàn giao (WORKLOG)

> Mục MỚI NHẤT nằm trên cùng. Mỗi phiên làm việc thêm một mục; **không sửa mục của người khác**.
> Quy ước: "Đã chạy" chỉ ghi những gì có kết quả thật do người chạy báo lại. Mã viết ra mà chưa ai chạy phải nằm ở "Chưa chạy".

---

## 2026-11-13 — Claude (Cowork) — chụp lại hiện trạng repo

**Nhánh/remote:** nhánh `clean-main`, `origin` = `chuitrai/paper-blocks` (đã push, `origin/main` = `3c3fbb7`). `old-origin` = `chuitrai/viettel-devops-app` (lịch sử cũ có private key của VM, xem docs/04 Q3).

**Đã chạy và đạt (người dùng báo):**
- Phase 1: cluster 1 master + 1 worker, `verify.sh` đạt.
- Phase 2: `go test`, `check-matrix.sh` (cả mục mới: PATCH, reply, search, tags, stats, view), đăng nhập GitHub ra `gh:chuitrai` quyền admin, `docker compose up` ở cổng 8081.
- Phase 3: chặng A, B, C đạt. ArgoCD đã cài (có đăng nhập), `infra/k8s/versions.env` ghim chart `10.12.0`.

**Chưa chạy / chưa ai báo kết quả:**
- `go test ./...` sau khi thêm `extras_test.go` (tìm kiếm, tag, view, reply, nâng cấp DB cũ, seed 9 paper).
- `bench/baseline-build.sh` (chưa có `bench/results/`), nên chưa có số baseline cho Fast-Lane.
- Kết quả in ra của `04-install-argocd.sh` (dòng `CHẶNG D1`), và toàn bộ `05-bootstrap-app.sh`.
- `config/` **không có `.git`** nên repo `paper-blocks-config` chưa được khởi tạo/push từ thư mục này; `05` sẽ dừng ở bước kiểm tra nếu repo đó chưa có `values-prod.yaml`.
- Hiển thị PDF trong iframe trên Chrome thật; OAuth App thứ hai cho cụm (callback `http://192.168.56.11:30080/...`, `github.clientId` trong `values-prod.yaml` còn trống).

**Chưa commit trong working tree:** giao diện web được viết lại (`app/web/{app.js,index.html,style.css,world.js}`, +3525/-612, không phải do Claude viết ở các phiên trước), `evidence/phase1/*`, `infra/k8s/versions.env` (nên commit), `run-local.bat` (KHÔNG commit: chứa mật khẩu và JWT secret cứng).

**Điểm cần chú ý ở giao diện mới (Claude mới chỉ grep, chưa chạy):**
- CSP vẫn nguyên, không dùng `innerHTML`, `Dockerfile` của web vẫn khớp danh sách file; app.js vẫn gọi các endpoint mới.
- Tên và mô tả có nhắc "Steve" và "Minecraft" (comment trong `world.js`, tiêu đề trong `run-local.bat`). Quy ước dự án là nhân vật và tài sản **tự thiết kế**, không dùng tên/thương hiệu có sẵn; nên đổi trước khi repo công khai làm CV.

**Việc kế tiếp (theo thứ tự):**
1. Dọn working tree: quyết định tên gọi trong UI; không commit `run-local.bat`; `bash scripts/check-no-secrets.sh`; commit `versions.env` và UI; push.
2. Khởi tạo và push repo config (`cd config && git init -b main && ...`, lệnh đầy đủ trong docs/04 hoặc câu trả lời cùng phiên).
3. Chạy `go test ./...` và `bash infra/k8s/05-bootstrap-app.sh`, báo lại kết quả.
4. Đặt repo cũ `viettel-devops-app` về Private.
5. Chặng E (Jenkins), chặng F (`verify-phase3.sh`, `vagrant snapshot save phase3-ok`).
6. TRƯỚC khi tối ưu Fast-Lane: chạy `bash bench/baseline-build.sh` để có số "trước".

**Tài liệu còn cũ:** `docs/04` (dòng đầu và bảng tiến độ D1/D2), `docs/01` mục 2 và 3 (còn mô tả ứng dụng `items` cũ, thực tế là Paper Blocks + SQLite). Lý thuyết đã gộp thành một file `theory/00-LY-THUYET-TONG-HOP.md` (có Phase 1.2, OAuth, SQLite, Helm/GitOps/ArgoCD, Jenkins/Fast-Lane); chưa có Ingress/HAProxy/TLS, Ansible, ApplicationSet chi tiết.
