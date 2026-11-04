#!/usr/bin/env bash
# Chặng D (1/2): cài ArgoCD bằng Helm chart chính thức, dịch vụ web dạng NodePort 30081.
# Idempotent. Phiên bản chart được GHIM vào infra/k8s/versions.env ở lần chạy đầu tiên (để lần sau tái lập đúng bản đó).
# Dùng:  bash infra/k8s/04-install-argocd.sh
set -uo pipefail
source "$(dirname "$0")/lib.sh"

VERS_FILE="$ROOT/infra/k8s/versions.env"
# shellcheck disable=SC1090
[ -f "$VERS_FILE" ] && source "$VERS_FILE"
VALUES="$(cygpath -m "$ROOT/infra/k8s/values/argocd.yaml" 2>/dev/null || echo "$ROOT/infra/k8s/values/argocd.yaml")"

step "1. Thêm kho chart argo"
helm repo add argo https://argoproj.github.io/argo-helm --force-update >/dev/null && helm repo update argo >/dev/null \
  && ok "kho argo sẵn sàng" || { bad "không tải được kho chart (mạng?)"; exit 1; }

if [ -z "${ARGOCD_CHART_VERSION:-}" ]; then
  ARGOCD_CHART_VERSION=$(helm search repo argo/argo-cd -o json | sed -n 's/.*"version":"\([^"]*\)".*/\1/p' | head -1)
  [ -n "$ARGOCD_CHART_VERSION" ] || { bad "không xác định được phiên bản chart mới nhất"; exit 1; }
  echo "ARGOCD_CHART_VERSION=$ARGOCD_CHART_VERSION" >> "$VERS_FILE"
  echo "  đã GHIM chart argo-cd $ARGOCD_CHART_VERSION vào infra/k8s/versions.env (nên commit file này)"
else
  echo "  dùng chart argo-cd $ARGOCD_CHART_VERSION (đã ghim)"
fi

step "2. helm install argocd (chờ tối đa 10 phút; kéo image lần đầu khá lâu)"
if helm upgrade --install argocd argo/argo-cd -n argocd --create-namespace \
     --version "$ARGOCD_CHART_VERSION" -f "$VALUES" --wait --timeout 10m; then
  ok "ArgoCD đã triển khai"
else
  bad "cài ArgoCD lỗi. Chẩn đoán:"
  kubectl -n argocd get pods -o wide
  kubectl -n argocd describe pods | grep -E "^Name:|Warning|Failed|Back-off|OOMKilled" | head -20
  exit 1
fi
kubectl -n argocd get pods
kubectl -n argocd get svc argocd-server

step "3. Truy cập"
URL="http://${WORKER_IP}:30081"
CODE=$(curl -s -o /dev/null -m 10 -w '%{http_code}' "$URL")
[ "$CODE" = "200" ] && ok "$URL trả 200" || bad "$URL trả $CODE (pod argocd-server Ready chưa? IP đúng chưa?)"
PASS=$(kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' 2>/dev/null | base64 -d)
echo
echo "Giao diện ArgoCD: $URL"
echo "Tài khoản: admin    Mật khẩu ban đầu: ${PASS:-<chưa có secret, đợi vài giây rồi chạy lại>}"
echo "(Đổi mật khẩu rồi xoá secret argocd-initial-admin-secret khi dùng thật; ở đây chỉ là môi trường lab.)"

echo; [ "$FAIL" -eq 0 ] && echo "CHẶNG D1: ĐẠT" || echo "CHẶNG D1: CHƯA ĐẠT"
exit "$FAIL"
