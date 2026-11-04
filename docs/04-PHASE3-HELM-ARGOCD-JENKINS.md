# 04 — Phase 3: Helm chart, config repo, ArgoCD, Jenkins (1.5 điểm)

> Trạng thái: **đang làm**. Chặng A, B đã có script; C đến F chưa viết. Cập nhật bảng "Tiến độ" khi xong từng chặng.

## 1. Quyết định đã chốt (có ngày, có lý do)

| # | Quyết định | Lý do | Đánh đổi / điều phải nhớ |
|---|---|---|---|
| D1 | Docker Hub: tài khoản `chuitrai2901`, repo **public** (`chuitrai2901/paper-blocks-api`, `chuitrai2901/paper-blocks-web`) | Cụm kéo image không cần `imagePullSecret`; đơn giản cho phase 3 | Ai cũng kéo được image: **không bao giờ** đưa secret vào image hay `ENV` lúc build |
| D2 | Hai repo GitHub **public**: `paper-blocks` (code + chart) và `paper-blocks-config` (values + manifest ArgoCD) | ArgoCD đọc được mà không cần lưu credential Git trong cụm | **Công khai = ai cũng đọc được lịch sử git.** Config repo tuyệt đối không chứa secret (JWT, mật khẩu, client secret). Secret tạo bằng `kubectl create secret` và không vào git. Lỡ commit secret thì phải **đổi secret**, xoá commit không đủ |
| D3 | ArgoCD Application **nhiều nguồn** (multi-source): chart lấy từ `paper-blocks`, values lấy từ `paper-blocks-config` | Đúng mẫu GitOps: CI chỉ sửa một dòng tag trong config repo, không đụng code | Cần ArgoCD >= 2.6 (ta cài bản mới nhất nên ổn) |
| D4 | Đăng nhập GitHub trong cụm: thử **OAuth App thứ hai** (mỗi App chỉ một callback URL) | Demo có đăng nhập thật | Chưa chắc GitHub nhận callback `http://<ip>:30080`; nếu không được, dùng `ENABLE_PASSWORD_LOGIN` làm dự phòng |
| D5 | StorageClass: `local-path-provisioner` (PV nằm trên đĩa worker) | Cụm kubeadm không có StorageClass; chỉ một worker nên PV gắn node không vấn đề | `reclaimPolicy: Delete`: xoá PVC là mất dữ liệu. PVC trong chart phải chống bị ArgoCD prune |
| D6 | Công cụ (`kubectl`, `helm`) chạy trên **máy host**, nối cụm qua `infra/vagrant/admin.conf` | `/vagrant` trong VM chỉ là `infra/vagrant`, không thấy chart/values; không cần `vagrant reload` | Cần cài `kubectl` và `helm` bản Windows (`winget`). `admin.conf` là secret toàn quyền cụm: đã gitignore, **không bao giờ đưa lên repo công khai** |
| D7 | Worker 8 GB RAM | Argo CD ~0,7 GB + Jenkins ~1 GB + app + (sau này) EFK | Vagrantfile mặc định là 6144: muốn 8 GB phải `WORKER_MEM=8192` rồi `vagrant reload worker` |

## 2. Tiến độ

| Chặng | Nội dung | Script / file | Trạng thái |
|---|---|---|---|
| A | Kiểm tra công cụ host + kết nối cụm | `infra/k8s/00-check-tools.sh` | **đạt** |
| B | StorageClass `local-path` mặc định + kiểm chứng PVC | `infra/k8s/01-install-storage.sh` | **đạt** |
| C | Helm chart `app/chart/paper-blocks`, đẩy image, cài thử bằng `helm install` | `02-push-images.sh`, `03-helm-smoke.sh`, `app/chart/paper-blocks/` | **đạt** |
| D1 | Cài ArgoCD (NodePort 30081) | `04-install-argocd.sh`, `infra/k8s/values/argocd.yaml` | script đã viết, chờ chạy |
| D2 | Config repo + Application multi-source, ArgoCD tự đồng bộ | `config/` (repo riêng), `05-bootstrap-app.sh`, `scripts/check-no-secrets.sh` | script đã viết, chờ chạy |
| E | Jenkins (NodePort, persistence) | chưa viết | — |
| F | `verify-phase3.sh`, snapshot `phase3-ok`, lỗi thực tế, theory | chưa viết | — |

## 2b. Thiết kế chart (vì sao như vậy)

| Chi tiết | Lý do |
|---|---|
| Service tên cố định `api`, `web` | `nginx.conf` proxy `http://api:8080`; tên phải đúng ở mọi namespace. Hệ quả: một release mỗi namespace (khớp mô hình preview: mỗi PR một namespace) |
| `api` dùng `strategy: Recreate`, `replicas: 1` | SQLite một người ghi; rolling update sẽ có lúc hai pod cùng mở một file. Rate limit nằm trong RAM nên nhiều pod cũng làm sai số đếm |
| PVC có 3 lớp chống xoá nhầm | `helm.sh/resource-policy: keep`, ArgoCD `Prune=false,Delete=false`; vì `local-path` có `reclaimPolicy: Delete` nên mất PVC là mất dữ liệu |
| `existingSecret`, chart không tự tạo secret | Repo public (D2). Thiếu secret thì pod báo `CreateContainerConfigError`, rõ hơn là chạy với secret rỗng |
| ConfigMap có `checksum` trong annotation pod | Đổi cấu hình thì pod tự khởi động lại (biến môi trường chỉ đọc lúc pod bắt đầu) |
| `readOnlyRootFilesystem` cho api, chỉ ghi được `/data` và `/tmp` | Giảm bề mặt tấn công; `/tmp` là emptyDir vì gin đệm upload lớn ra đĩa tạm |
| `externalTrafficPolicy: Local` + `TRUSTED_PROXIES=10.244.0.0/16` | NodePort mặc định SNAT làm mất IP client, mọi người dùng chung một bucket rate limit. `Local` giữ IP thật; hệ quả: chỉ truy cập được qua IP **worker** (node có pod web) |
| Annotation `prometheus.io/*` trên pod api | Sẵn cho phase 7 |

## 2c. Lỗi thực tế đã gặp ở Phase 3

| # | Triệu chứng | Nguyên nhân | Cách xử lý |
|---|---|---|---|
| Q1 | `kubectl get nodes` từ host: `dial tcp 192.168.56.10:6443: connectex ... failed to respond` (timeout, không phải refused) | Hai VM chưa chạy (host vừa khởi động lại). Timeout = gói tin không có ai trả lời; refused mới là có máy nhưng không có dịch vụ | `cd infra/vagrant && vagrant status`, rồi `vagrant up`. Đợi 1 đến 2 phút cho API server lên hẳn |
| Q2 | Chặng B: PVC `Bound` nhưng pod thử nghiệm không `Succeeded` sau 180 giây, `Events: <none>` | Cụm vừa bật lại, worker và kubelet chưa kịp ổn định. Chạy lại sau ít phút thì đạt | Sau `vagrant up`, chạy `kubectl get nodes` đến khi cả hai `Ready` và `kubectl get pods -A` không còn pod chưa Running rồi mới cài đặt gì. Script chặng B giờ in sẵn chẩn đoán khi thất bại |
| Q3 | `check-no-secrets.sh` báo lịch sử chứa `-----BEGIN OPENSSH PRIVATE KEY-----` | Repo cũ (`origin` đang trỏ `viettel-devops-app`, 41 commit từ các dự án trước) từng commit nhầm thư mục `.vagrant/` có private key SSH của VM. Xoá file ở commit mới **không** xoá khỏi lịch sử, và `git push` đẩy cả lịch sử | Đẩy repo mới từ một nhánh `--orphan` (lịch sử sạch, một commit) lên repo mới `paper-blocks`, giữ repo cũ làm remote riêng. Key này chỉ vào được VM local nhưng vẫn không nên công khai: nên đặt repo cũ ở chế độ Private |

## 2d. Quy ước hai repo (D2)

| Repo GitHub | Nội dung | Thư mục local | Remote |
|---|---|---|---|
| `chuitrai/paper-blocks` (public) | mã nguồn, chart, infra, docs | thư mục gốc project | `origin` |
| `chuitrai/paper-blocks-config` (public) | `values-prod.yaml`, `apps/paper-blocks.yaml` | `config/` (git riêng, bị `.gitignore` của repo gốc bỏ qua) | `origin` của `config/` |

ArgoCD đọc cả hai qua HTTPS công khai (không cần credential). Bạn đẩy bằng SSH (`git@github-personal:...`), hai việc này độc lập nhau.

Rủi ro đã biết của repo công khai: ai cũng thấy `values-prod.yaml`, gồm IP lab `192.168.56.x` (không định tuyến ra Internet, vô hại) và tên đăng nhập admin GitHub (vốn đã công khai). Không có gì khác nhạy cảm vì secret nằm trong cụm.

## 3. Việc bạn cần làm tay (không thể tự động)

1. Cài `kubectl` và `helm` trên Windows nếu `00-check-tools.sh` báo thiếu: `winget install Kubernetes.kubectl` và `winget install Helm.Helm`, rồi **mở lại Git Bash** để PATH có hiệu lực.
2. `docker login` bằng tài khoản `chuitrai2901` (cần ở chặng C).
3. Tạo hai repo GitHub **public** rỗng: `paper-blocks` và `paper-blocks-config` (không tick "Add README" để push lần đầu khỏi xung đột).
4. Tạo OAuth App thứ hai cho cụm (chặng C/D, tôi hướng dẫn khi tới).
