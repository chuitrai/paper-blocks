#!/usr/bin/env bash
# Chặng D (2/2): giao ứng dụng cho ArgoCD. Làm đúng một lần "mồi": tạo secret rồi apply Application.
# Điều kiện: (1) ArgoCD đã cài (04), (2) hai repo GitHub public đã push: paper-blocks (có chart) và paper-blocks-config,
#            (3) image 0.1.0 đã ở Docker Hub (02), (4) namespace pb-dev của chặng C đã gỡ (trùng NodePort 30080).
# Dùng:  bash infra/k8s/05-bootstrap-app.sh
set -uo pipefail
source "$(dirname "$0")/lib.sh"

NS=paper-blocks
GH="${GITHUB_USER:-chuitrai}"
APP_REPO="https://github.com/$GH/paper-blocks"
CFG_REPO="https://github.com/$GH/paper-blocks-config"
APP_YAML="$ROOT/config/apps/paper-blocks.yaml"
BASE="http://${WORKER_IP}:30080"

step "1. Điều kiện tiên quyết"
[ -f "$APP_YAML" ] || { bad "không thấy $APP_YAML"; exit 1; }
if kubectl get namespace pb-dev >/dev/null 2>&1; then
  bad "namespace pb-dev (chặng C) đang chiếm NodePort 30080. Gỡ trước:  bash infra/k8s/03-helm-smoke.sh --clean"
  exit 1
fi
kubectl -n argocd get deploy argocd-server >/dev/null 2>&1 && ok "ArgoCD có mặt" || { bad "chưa có ArgoCD: chạy 04-install-argocd.sh trước"; exit 1; }
# Kiểm tra từ máy host rằng ArgoCD SẼ thấy được file chart (nếu 404 nghĩa là chưa push, hoặc repo còn private)
curl -fsI -m 15 "https://raw.githubusercontent.com/$GH/paper-blocks/main/app/chart/paper-blocks/Chart.yaml" >/dev/null 2>&1 \
  && ok "app repo công khai và có chart ($APP_REPO)" || { bad "không đọc được chart ở $APP_REPO (đã push nhánh main chưa? repo public chưa?)"; exit 1; }
curl -fsI -m 15 "https://raw.githubusercontent.com/$GH/paper-blocks-config/main/values-prod.yaml" >/dev/null 2>&1 \
  && ok "config repo công khai và có values-prod.yaml ($CFG_REPO)" || { bad "không đọc được values-prod.yaml ở $CFG_REPO"; exit 1; }

step "2. Namespace + Secret (sinh ngẫu nhiên, không vào git)"
kubectl create namespace "$NS" --dry-run=client -o yaml | kubectl apply -f - >/dev/null
if kubectl -n "$NS" get secret paper-blocks-secrets >/dev/null 2>&1; then
  ok "secret đã có, giữ nguyên"
else
  kubectl -n "$NS" create secret generic paper-blocks-secrets \
    --from-literal=JWT_SECRET="$(rand 24)" \
    --from-literal=USER_PASSWORD="u-$(rand 6)" \
    --from-literal=ADMIN_PASSWORD="a-$(rand 6)" >/dev/null && ok "đã tạo secret paper-blocks-secrets"
fi

step "3. Áp dụng ArgoCD Application"
kubectl apply -f "$(cygpath -m "$APP_YAML" 2>/dev/null || echo "$APP_YAML")" && ok "đã apply Application paper-blocks"

step "4. Chờ ArgoCD đồng bộ (Synced + Healthy), tối đa 5 phút"
S=""; H=""
for i in $(seq 1 60); do
  S=$(kubectl -n argocd get application paper-blocks -o jsonpath='{.status.sync.status}' 2>/dev/null)
  H=$(kubectl -n argocd get application paper-blocks -o jsonpath='{.status.health.status}' 2>/dev/null)
  echo "  [$i/60] sync=${S:-?} health=${H:-?}"
  [ "$S" = "Synced" ] && [ "$H" = "Healthy" ] && break
  sleep 5
done
if [ "$S" = "Synced" ] && [ "$H" = "Healthy" ]; then
  ok "Application Synced + Healthy"
else
  bad "chưa Synced/Healthy sau 5 phút. Chẩn đoán:"
  kubectl -n argocd get application paper-blocks -o jsonpath='{range .status.conditions[*]}{.type}{": "}{.message}{"\n"}{end}'
  kubectl -n "$NS" get pods -o wide 2>&1
  kubectl -n argocd logs deploy/argocd-repo-server --tail=15 2>&1
fi

step "5. Truy cập ứng dụng"
curl -fsS -m 10 "$BASE/healthz" >/dev/null && ok "web $BASE/healthz" || bad "không gọi được $BASE/healthz"
N=$(curl -fsS -m 10 "$BASE/api/v1/papers" 2>/dev/null | grep -o '"id":' | wc -l)
[ "$N" -ge 1 ] && ok "API trả $N paper" || bad "API không trả paper nào"

echo
echo "ArgoCD: http://${WORKER_IP}:30081      Ứng dụng: $BASE"
echo "Mật khẩu user/admin trong cụm (để chạy ma trận):"
echo "  USER_PASSWORD=\$(kubectl -n $NS get secret paper-blocks-secrets -o jsonpath='{.data.USER_PASSWORD}' | base64 -d)"
echo "  ADMIN_PASSWORD=\$(kubectl -n $NS get secret paper-blocks-secrets -o jsonpath='{.data.ADMIN_PASSWORD}' | base64 -d)"
[ "$FAIL" -eq 0 ] && echo "CHẶNG D2: ĐẠT" || echo "CHẶNG D2: CHƯA ĐẠT"
exit "$FAIL"
