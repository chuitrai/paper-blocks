#!/usr/bin/env bash
# Chạy trên master:  vagrant ssh master -c "bash /vagrant/verify.sh"
# Kiểm tra theo tầng: node -> IP -> system pod -> mạng pod chéo node -> Service -> DNS.
set -uo pipefail
export KUBECONFIG=${KUBECONFIG:-/home/vagrant/.kube/config}
FAIL=0
ok()   { echo "  [OK]   $*"; }
bad()  { echo "  [FAIL] $*"; FAIL=1; }
trap 'kubectl delete -f /tmp/smoke.yaml --ignore-not-found >/dev/null 2>&1' EXIT

echo "1. Node Ready"
kubectl get nodes -o wide
READY=$(kubectl get nodes --no-headers | awk '$2=="Ready"' | wc -l)
[ "$READY" -eq 2 ] && ok "2/2 node Ready" || bad "chỉ $READY node Ready"

echo "2. INTERNAL-IP phải thuộc 192.168.56.0/24"
BADIP=$(kubectl get nodes -o jsonpath='{range .items[*]}{.status.addresses[?(@.type=="InternalIP")].address}{"\n"}{end}' | grep -vc '^192\.168\.56\.')
[ "$BADIP" -eq 0 ] && ok "IP đúng dải" || bad "có node dùng IP ngoài dải (thường là 10.0.2.15)"

echo "3. Pod hệ thống"
NOTOK=$(kubectl get pods -A --no-headers | awk '$4!="Running" && $4!="Completed"' | wc -l)
[ "$NOTOK" -eq 0 ] && ok "mọi pod Running" || { bad "$NOTOK pod chưa Running"; kubectl get pods -A | grep -vE 'Running|Completed'; }

echo "4. Smoke test mạng (DaemonSet = 1 pod mỗi node, kể cả master)"
cat >/tmp/smoke.yaml <<'EOT'
apiVersion: apps/v1
kind: DaemonSet
metadata: {name: smoke, labels: {app: smoke}}
spec:
  selector: {matchLabels: {app: smoke}}
  template:
    metadata: {labels: {app: smoke}}
    spec:
      tolerations: [{key: node-role.kubernetes.io/control-plane, operator: Exists, effect: NoSchedule}]
      containers: [{name: web, image: "nginx:stable-alpine", ports: [{containerPort: 80}]}]
---
apiVersion: v1
kind: Service
metadata: {name: smoke}
spec:
  selector: {app: smoke}
  ports: [{port: 80, targetPort: 80}]
EOT
kubectl apply -f /tmp/smoke.yaml >/dev/null
kubectl rollout status daemonset/smoke --timeout=240s >/dev/null && ok "DaemonSet chạy trên cả 2 node" || bad "DaemonSet không lên (xem: kubectl describe pod -l app=smoke)"

mapfile -t PODS < <(kubectl get pods -l app=smoke -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.status.podIP}{"\n"}{end}')
if [ "${#PODS[@]}" -eq 2 ]; then
  read -r P1 IP1 <<<"${PODS[0]}"; read -r P2 IP2 <<<"${PODS[1]}"
  kubectl exec "$P1" -- wget -qO- -T 5 "http://${IP2}" >/dev/null 2>&1 && ok "pod->pod chéo node ($IP1 -> $IP2)" || bad "pod->pod chéo node lỗi (CNI/route/firewall)"
  kubectl exec "$P2" -- wget -qO- -T 5 "http://${IP1}" >/dev/null 2>&1 && ok "pod->pod chiều ngược lại" || bad "pod->pod chiều ngược lại lỗi"
  kubectl exec "$P1" -- wget -qO- -T 5 "http://smoke.default.svc.cluster.local" >/dev/null 2>&1 && ok "DNS + Service ClusterIP" || bad "DNS/Service lỗi (CoreDNS hoặc kube-proxy)"
else
  bad "cần đúng 2 pod smoke, thấy ${#PODS[@]}"
fi

echo; [ "$FAIL" -eq 0 ] && echo "PHASE 1: ĐẠT" || echo "PHASE 1: CHƯA ĐẠT - xem docs/02, mục 'Chẩn đoán theo tầng'"
exit "$FAIL"
