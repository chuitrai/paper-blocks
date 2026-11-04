#!/usr/bin/env bash
# Chặng A của Phase 3: kiểm tra máy host đã đủ đồ nghề và nói chuyện được với cụm chưa.
# Chạy từ thư mục gốc project:  bash infra/k8s/00-check-tools.sh
set -uo pipefail
source "$(dirname "$0")/lib.sh"

step "1. Công cụ trên máy host"
for t in kubectl helm docker git; do
  if command -v "$t" >/dev/null 2>&1; then
    case "$t" in
      kubectl) v=$(kubectl version --client 2>&1 | head -1) ;;
      helm)    v=$(helm version --short 2>&1) ;;
      docker)  v=$(docker --version 2>&1) ;;
      git)     v=$(git --version 2>&1) ;;
    esac
    ok "$t: $v"
  else
    case "$t" in
      kubectl) bad "thiếu kubectl. Cài: winget install Kubernetes.kubectl  (rồi mở lại Git Bash)" ;;
      helm)    bad "thiếu helm. Cài: winget install Helm.Helm  (rồi mở lại Git Bash)" ;;
      docker)  bad "thiếu docker (cần để build và push image lên Docker Hub)" ;;
      git)     bad "thiếu git" ;;
    esac
  fi
done
command -v kubectl >/dev/null 2>&1 || { echo; echo "Cài kubectl trước rồi chạy lại."; exit 1; }

step "2. Nói chuyện được với API server ($MASTER_IP:6443)"
if kubectl get nodes >/dev/null 2>&1; then
  ok "kubectl kết nối được cụm"
else
  bad "không kết nối được cụm. Hai VM đang chạy? (cd infra/vagrant && vagrant status)"
  kubectl get nodes 2>&1 | tail -3
  exit 1
fi
kubectl get nodes -o wide

step "3. Tài nguyên node (quyết định Argo CD + Jenkins + app có vừa không)"
kubectl get nodes -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.status.capacity.cpu}{" "}{.status.capacity.memory}{"\n"}{end}' |
  while read -r name cpu mem; do
    mb=$(( ${mem%Ki} / 1024 ))
    echo "  $name: ${cpu} CPU, ${mb} MiB RAM"
  done
WMEM=$(kubectl get node k8s-worker -o jsonpath='{.status.capacity.memory}' 2>/dev/null | sed 's/Ki//')
if [ -n "${WMEM:-}" ]; then
  [ $(( WMEM / 1024 )) -ge 7000 ] && ok "worker >= 7 GB" || echo "  [WARN] worker dưới 7 GB RAM: Argo CD + Jenkins + app sẽ sát. Muốn 8 GB: đặt WORKER_MEM=8192 rồi 'vagrant reload worker'"
fi

step "4. StorageClass (SQLite cần PVC)"
kubectl get storageclass 2>&1
kubectl get storageclass --no-headers 2>/dev/null | grep -q '(default)' && ok "đã có StorageClass mặc định" || echo "  (chưa có StorageClass mặc định: chạy infra/k8s/01-install-storage.sh)"

step "5. Docker Hub"
if docker info >/dev/null 2>&1; then
  ok "Docker daemon chạy"
  docker system info --format '  đăng nhập: {{.IndexServerAddress}}' 2>/dev/null
else
  echo "  [WARN] Docker daemon không chạy: cần khi push image (bước C)"
fi

echo; [ "$FAIL" -eq 0 ] && echo "CHẶNG A: ĐẠT" || echo "CHẶNG A: CHƯA ĐẠT (xem dòng FAIL)"
exit "$FAIL"
