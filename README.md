# Fast-Lane CI/CD trên Kubernetes

Đồ án Viettel Digital Talent (Cloud): nền theo barem `final.pdf` (kubeadm, Helm/ArgoCD, Jenkins, Prometheus, EFK, HAProxy/Ingress, AuthN/Z, rate limit) cộng lớp **Fast-Lane**: build nhanh có số liệu đo, và preview environment theo từng PR.

Đọc theo thứ tự:
1. [`docs/01-FASTLANE-CICD-PLAN.md`](docs/01-FASTLANE-CICD-PLAN.md) — kế hoạch tổng thể 13 phase.
2. [`docs/02-PHASE1-KUBERNETES-VA-LOI-THUC-TE.md`](docs/02-PHASE1-KUBERNETES-VA-LOI-THUC-TE.md) — Phase 1: dựng cluster (`infra/vagrant/`) + bài giảng lỗi thực tế.

3. [`docs/03-PHASE2-APP-PIPELINE-QUEST.md`](docs/03-PHASE2-APP-PIPELINE-QUEST.md) — Phase 2: ứng dụng demo "Paper Blocks" (API, giao diện 3D, lỗi thực tế).
4. [`docs/04-PHASE3-HELM-ARGOCD-JENKINS.md`](docs/04-PHASE3-HELM-ARGOCD-JENKINS.md) — Phase 3: Helm chart, config repo, ArgoCD, Jenkins (đang làm; có các quyết định đã chốt).

Tài liệu lý thuyết (đọc để hiểu, không thuộc bộ tài liệu bắt buộc của dự án) nằm ở [`theory/`](theory/):
- [`theory/01-phase-1.1-vagrant.md`](theory/01-phase-1.1-vagrant.md) — Phase 1.1: Vagrant (khái niệm, mổ xẻ Vagrantfile, business case, lỗi thực tế, bảo mật). Phase 1.2 (các file setup Kubernetes) sẽ là file kế tiếp.
- [`theory/02-phase-2-ban-do-ly-thuyet.md`](theory/02-phase-2-ban-do-ly-thuyet.md) — Phase 2: bản đồ kiến thức (HTTP, JWT/RBAC, middleware, rate limit, observability, Docker) và 15 tình huống business hay gặp.

Chạy Phase 1 (Git Bash): `cd infra/vagrant && vagrant up && vagrant ssh master -c "bash /vagrant/verify.sh"`

```
app/{api,web,chart}   mã nguồn + Helm chart (app repo)
config/               values.yaml + ArgoCD Application/ApplicationSet (config repo)
infra/                vagrant, ansible (Prometheus, EFK), k8s manifests (Jenkins, ArgoCD, HAProxy)
ci/                   Jenkinsfile, script affected-only, cache
bench/                kịch bản và kết quả đo baseline vs tối ưu
evidence/             ảnh chụp + log nộp bài
```
