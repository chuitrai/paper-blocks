# 01 — Fast-Lane CI/CD: kế hoạch tổng thể

> Tài liệu duy nhất của dự án. Nền = barem `final.pdf` (10 điểm). Điểm mới = lớp **Fast-Lane**: CI/CD nhanh có số liệu đo + preview environment theo PR, chạy trên 2 VM và ngân sách ≈ $0.

## 1. Bài toán

> Làm sao mỗi Pull Request có một môi trường thật để review trong vài chục giây, và CI không chậm dần khi số PR tăng, trong khi cluster chỉ có 2 VM và gần như không có tiền cloud?

Chứng minh bằng **bảng đo baseline → tối ưu** (thời gian build, thời gian từ push tới URL chạy được, RAM mỗi preview). Ứng dụng chỉ là phương tiện, giữ nhỏ.

## 2. Ứng dụng demo (tối thiểu)

Microservices 2 thành phần: `web` (nginx + static) và `api` (Go/Gin). Một tài nguyên đơn giản (`/api/v1/items`), stateless, in-memory, `replicas: 1`. Phải đủ để chạm barem:

| Yêu cầu barem | Thiết kế |
|---|---|
| Endpoint cần xác thực, thiếu/sai → **403** | Basic Auth hoặc JWT; middleware trả 403 |
| role `user`: GET 200, POST/DELETE 403 · `admin`: GET 200, POST/DELETE 2xx | RBAC theo role trong token |
| >10 req/phút → **409** | rate limit in-memory theo IP (ghi chú: không đúng khi >1 pod) |
| Metric ra 1 path | `/metrics` (client_golang) |
| Log có path, method, status | JSON log mỗi request |

## 3. Kiến trúc

```
PR mở/push ─▶ Jenkins (agent ephemeral trong K8s)
              ├─ test api ∥ build web              (song song)
              ├─ chỉ build service có thay đổi     (affected-only)
              ├─ BuildKit + cache đẩy lên registry (pod mới vẫn "ấm")
              └─ push image pr-<N>-<sha>, cập nhật config repo
ArgoCD ApplicationSet (PR generator + webhook)
              └─ namespace pr-<N>, ingress pr-<N>.<domain>, ResourceQuota, TTL
PR đóng ─▶ Application bị xoá ─▶ prune namespace

Tag v*.*.* ─▶ luồng prod đúng barem: Jenkins build → Docker Hub → sửa values.yaml config repo → ArgoCD auto-sync
```

Ba repo (GitOps): **app repo** (code + Helm chart), **config repo** (values + ArgoCD manifests), **infra repo** (Vagrant/Ansible/manifests). Trong thư mục này gom 3 phần để làm; khi nộp tách ra theo yêu cầu "PR không chứa source code".

## 4. Các đòn bẩy tốc độ (mỗi cái phải có số đo)

1. **BuildKit thay Kaniko.** Repo Kaniko của Google đã archive từ 06/2025 (chỉ còn fork cộng đồng/Chainguard). BuildKit đẩy cache lên registry nên agent mới với đĩa trống vẫn build ấm. Barem yêu cầu "build bằng docker": BuildKit là builder của Docker, hợp lệ.
2. **Affected-only:** `git diff` quyết định build `api` hay `web`.
3. **Cache module** Go/npm qua PVC hoặc cache mount.
4. **Song song hoá** test/build/scan.
5. **ArgoCD nhận webhook** thay vì poll (giảm từ phút xuống giây).
6. **Preview nhẹ:** ResourceQuota, TTL tự xoá, scale về 0 khi idle.

**Bảng đo cần điền (thư mục `bench/`):**

| Chỉ số | Baseline | Sau tối ưu |
|---|---|---|
| Build `api`, cold cache | | |
| Build `api`, đổi 1 dòng, warm cache | | |
| Commit chỉ đổi `web` → tổng thời gian pipeline | | |
| Push → URL preview truy cập được | | |
| RAM mỗi preview env | | |
| Số preview chạy song song trước khi cluster nghẹt | | |

## 5. Cloud ngân sách ≈ $0

- Oracle đã giảm Always Free Ampere A1 từ 4 OCPU/24GB xuống **2 OCPU/12GB** (06/2026); chỉ dùng tối đa mức này, vượt có thể bị tính phí.
- Máy A1 là **ARM**, VM local là x86 → build multi-arch hoặc node cloud build image ARM riêng.
- Hay gặp "out of capacity"; dự phòng: VPS rẻ hoặc chạy agent trên worker local.
- Vai trò: **tầng offload** (Jenkins agent + BuildKit cache) nối cluster local qua Tailscale. Là phần cộng thêm; không có nó vẫn đủ barem.
- Webhook GitHub không vào được cluster sau NAT → Tailscale Funnel hoặc smee.io; hoặc polling (ghi rõ đánh đổi trong bảng đo).

## 6. Các phase

| # | Phase | Điểm barem | Kết quả cần có | Evidence |
|---|---|---|---|---|
| 1 | K8s kubeadm 1 master + 1 worker (Vagrant+VirtualBox, containerd, Calico, systemd cgroup, `--node-ip` theo `eth1`) | 1.0 | `get nodes -o wide`, `get pods -A -o wide` | ảnh + log |
| 2 | App `api` + `web` chạy local (docker compose), đủ auth/role/rate/metrics/log | nền | curl matrix 403/200/409 | log |
| 3 | Helm chart + config repo + ArgoCD (NodePort) + Jenkins (NodePort) | 1.5 | ArgoCD App Synced, web/API truy cập được | ảnh |
| 4 | CI/CD theo tag đúng barem (baseline, **chưa tối ưu**, đo số) | 1.5 | Stage View, log, diff ArgoCD, app trước/sau | ảnh + log |
| 5 | **Fast-Lane:** BuildKit, cache, affected-only, song song; đo lại | điểm mới | bảng đo mục 4 | `bench/` |
| 6 | **Preview env:** ApplicationSet PR generator, quota, TTL, dọn rác | điểm mới | PR → URL → đóng PR → ns biến mất | ảnh + log |
| 7 | Monitoring: Ansible triển khai Prometheus, scrape `/metrics`; thêm metric CI/preview | 1.5 | Targets UP | ảnh |
| 8 | Logging: Ansible triển khai EFK; tìm log theo path/method/status | 1.5 | Kibana search | ảnh |
| 9 | Security: HAProxy TCP + Ingress HTTPS self-signed | 1.0 | curl https | log |
| 10 | Security: AuthN/AuthZ (403, role) | 1.0 | curl matrix | log |
| 11 | Security: rate limit 409 | 1.0 | 11 request/phút | log |
| 12 | Cloud offload: node ARM + Tailscale, đo lợi ích | điểm mới | số đo + sơ đồ | bench |
| 13 | Tái lập: `vagrant destroy -f && vagrant up` + chạy lại end-to-end; đóng gói nộp | — | docs nộp bài | tất cả |

Thứ tự thực hiện: 1 → 2 → 3 → 4 (baseline) → 5 → 6 → 7–11 → 12 → 13. Làm phase 4 **trước** phase 5 để có baseline thật, đừng tối ưu rồi mới đo.

## 7. Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| RAM host không đủ (master 4GB + worker 8GB) | worker 6GB; preview quota thấp; tắt EFK khi demo CI |
| VirtualBox xung đột Hyper-V/WSL2 trên Windows | dùng Git Bash, tắt Hyper-V; không dùng WSL cho Vagrant |
| Rate limit in-memory sai khi nhiều pod | giữ `replicas: 1`, ghi rõ trong tài liệu |
| Oracle không cấp máy / đổi chính sách | phase 12 là tuỳ chọn, có phương án VPS/local |
| Preview env ăn hết tài nguyên | ResourceQuota + TTL + giới hạn số PR có label `preview` |
| Webhook không vào được cluster | Tailscale Funnel/smee, hoặc polling và ghi đánh đổi |
| Đo số không công bằng | cùng máy, cùng commit, chạy ≥3 lần lấy trung vị |

## 8. Việc tiếp theo

Bắt đầu **Phase 1**. Khi sẵn sàng, tôi sẽ viết `Vagrantfile` + script bootstrap/init/join trong `infra/vagrant/` và hướng dẫn chạy bằng Git Bash.
