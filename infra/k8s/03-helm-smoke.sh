#!/usr/bin/env bash
# Chặng C (2/2): chứng minh chart đúng bằng cách cài THỦ CÔNG (helm install) vào namespace pb-dev,
# trước khi giao cho ArgoCD. Nếu chart sai, ta thấy lỗi ở đây chứ không phải trong giao diện ArgoCD.
# Dùng:  bash infra/k8s/03-helm-smoke.sh [tag]        Gỡ sạch:  bash infra/k8s/03-helm-smoke.sh --clean
set -uo pipefail
source "$(dirname "$0")/lib.sh"

NS="${NS:-pb-dev}"
CHART="$ROOT/app/chart/paper-blocks"
CHART_ARG="$(cygpath -m "$CHART" 2>/dev/null || echo "$CHART")"
HUB="${DOCKERHUB_USER:-chuitrai2901}"
TAG="${1:-0.1.0}"
BASE="http://${WORKER_IP}:30080"

if [ "${1:-}" = "--clean" ]; then
  helm -n "$NS" uninstall pb 2>/dev/null
  kubectl delete namespace "$NS" --ignore-not-found   # xoá cả PVC (đã có annotation keep nhưng namespace bị xoá thì mất hết)
  echo "Đã gỡ $NS"; exit 0
fi

SETS=(--set "api.image.repository=$HUB/paper-blocks-api" --set "web.image.repository=$HUB/paper-blocks-web"
      --set "api.image.tag=$TAG" --set "web.image.tag=$TAG"
      --set passwordLogin=true --set api.seedDemo=true)

step "1. helm lint"
helm lint "$CHART_ARG" "${SETS[@]}" && ok "chart hợp lệ" || { bad "helm lint lỗi"; exit 1; }

step "2. Namespace + Secret (secret sinh ngẫu nhiên, KHÔNG nằm trong git)"
kubectl create namespace "$NS" --dry-run=client -o yaml | kubectl apply -f - >/dev/null
rand() { head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'; }
if kubectl -n "$NS" get secret paper-blocks-secrets >/dev/null 2>&1; then
  ok "secret đã có, dùng lại"
else
  kubectl -n "$NS" create secret generic paper-blocks-secrets \
    --from-literal=JWT_SECRET="$(rand 24)" \
    --from-literal=USER_PASSWORD="u-$(rand 6)" \
    --from-literal=ADMIN_PASSWORD="a-$(rand 6)" >/dev/null && ok "đã tạo secret"
fi
UPASS=$(kubectl -n "$NS" get secret paper-blocks-secrets -o jsonpath='{.data.USER_PASSWORD}' | base64 -d)
APASS=$(kubectl -n "$NS" get secret paper-blocks-secrets -o jsonpath='{.data.ADMIN_PASSWORD}' | base64 -d)

step "3. Kiểm tra manifest với API server thật (dry-run phía server)"
helm template pb "$CHART_ARG" -n "$NS" "${SETS[@]}" | kubectl apply -n "$NS" --dry-run=server -f - >/dev/null \
  && ok "API server chấp nhận mọi manifest" || { bad "API server từ chối manifest"; exit 1; }

step "4. helm install (chờ pod Ready, tối đa 5 phút)"
if helm upgrade --install pb "$CHART_ARG" -n "$NS" "${SETS[@]}" --wait --timeout 5m; then
  ok "release pb đã triển khai"
else
  bad "helm install lỗi hoặc pod không Ready. Chẩn đoán:"
  kubectl -n "$NS" get pods -o wide
  kubectl -n "$NS" describe pods | grep -E "^Name:|Warning|Error|Failed|Back-off|Events" | head -25
  kubectl -n "$NS" logs deploy/api --tail=15 2>&1
  exit 1
fi
kubectl -n "$NS" get pods,svc,pvc -o wide

step "5. Truy cập từ máy host qua NodePort ($BASE)"
curl -fsS -m 10 "$BASE/healthz" >/dev/null && ok "web /healthz" || bad "không gọi được $BASE/healthz (IP worker đúng? pod web nằm trên worker?)"
N=$(curl -fsS -m 10 "$BASE/api/v1/papers" 2>/dev/null | grep -o '"id":' | wc -l)
[ "$N" -ge 9 ] && ok "API qua nginx trả $N paper mẫu" || bad "API qua nginx trả $N paper (mong đợi 9)"

step "6. Ma trận barem qua NodePort (403/200/409)"
kubectl -n "$NS" port-forward svc/api 18080:8080 >/dev/null 2>&1 & PF=$!
trap 'kill $PF 2>/dev/null' EXIT
for _ in $(seq 1 10); do curl -fs -m 2 http://localhost:18080/healthz >/dev/null 2>&1 && break; sleep 1; done
# /metrics không được nginx công khai ra ngoài: kiểm bằng port-forward thẳng tới api
if USER_PASSWORD="$UPASS" ADMIN_PASSWORD="$APASS" METRICS_BASE=http://localhost:18080 bash "$ROOT/scripts/check-matrix.sh" "$BASE"; then
  ok "ma trận đạt"
else
  bad "ma trận chưa đạt (xem dòng FAIL phía trên)"
fi

echo
echo "Mật khẩu của namespace $NS (chỉ để thử, nằm trong Secret): user=$UPASS  admin=$APASS"
echo "Mở trình duyệt: $BASE"
[ "$FAIL" -eq 0 ] && echo "CHẶNG C: ĐẠT" || echo "CHẶNG C: CHƯA ĐẠT"
exit "$FAIL"
