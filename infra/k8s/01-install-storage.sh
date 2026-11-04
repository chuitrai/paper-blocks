#!/usr/bin/env bash
# Chặng B của Phase 3: cài local-path-provisioner làm StorageClass mặc định, rồi tự kiểm chứng.
# Idempotent: chạy lại an toàn.   bash infra/k8s/01-install-storage.sh
set -uo pipefail
source "$(dirname "$0")/lib.sh"

VER="${LPP_VERSION:-v0.0.37}"   # ghim phiên bản: manifest theo nhánh master có thể đổi bất kỳ lúc nào
URL="https://raw.githubusercontent.com/rancher/local-path-provisioner/${VER}/deploy/local-path-storage.yaml"

step "1. Cài local-path-provisioner ${VER}"
kubectl apply -f "$URL" || { echo "Không áp dụng được manifest (mạng?)"; exit 1; }
kubectl -n local-path-storage rollout status deploy/local-path-provisioner --timeout=240s \
  && ok "provisioner chạy" || { bad "provisioner không lên. Xem: kubectl -n local-path-storage describe pod"; exit 1; }

step "2. Đặt làm StorageClass mặc định"
kubectl patch storageclass local-path -p '{"metadata":{"annotations":{"storageclass.kubernetes.io/is-default-class":"true"}}}' >/dev/null \
  && ok "local-path là mặc định"
kubectl get storageclass

step "3. Kiểm chứng: tạo PVC, ghi file, đọc lại"
# volumeBindingMode=WaitForFirstConsumer: PVC chỉ được cấp khi có pod dùng nó, nên phải dựng cả pod mới thấy Bound.
cleanup() { kubectl delete pod/storage-smoke pvc/storage-smoke --ignore-not-found >/dev/null 2>&1; }
trap cleanup EXIT
cleanup
kubectl apply -f - <<'EOT' >/dev/null
apiVersion: v1
kind: PersistentVolumeClaim
metadata: {name: storage-smoke}
spec:
  accessModes: [ReadWriteOnce]
  resources: {requests: {storage: 64Mi}}
---
apiVersion: v1
kind: Pod
metadata: {name: storage-smoke}
spec:
  restartPolicy: Never
  containers:
    - name: t
      image: busybox
      command: ["sh", "-c", "echo du-lieu-song-sot > /data/x && cat /data/x"]
      volumeMounts: [{name: d, mountPath: /data}]
  volumes: [{name: d, persistentVolumeClaim: {claimName: storage-smoke}}]
EOT
if kubectl wait --for=jsonpath='{.status.phase}'=Succeeded pod/storage-smoke --timeout=180s >/dev/null 2>&1; then
  ok "pod ghi/đọc được: $(kubectl logs storage-smoke 2>/dev/null)"
  kubectl get pvc storage-smoke
else
  bad "pod không chạy xong sau 180s. Chẩn đoán (dán nguyên phần này cho tôi):"
  echo "--- pod (STATUS, NODE):";            kubectl get pod storage-smoke -o wide
  echo "--- node:";                          kubectl get nodes -o wide
  echo "--- phần đầu của describe pod:";     kubectl describe pod storage-smoke | sed -n '1,22p'
  echo "--- sự kiện mới nhất toàn cụm:";     kubectl get events -A --sort-by=.lastTimestamp 2>/dev/null | tail -15
  echo "--- provisioner:";                   kubectl -n local-path-storage get pods; kubectl -n local-path-storage logs deploy/local-path-provisioner --tail=15 2>&1
  echo "--- pod hệ thống không Running:";    kubectl get pods -A --no-headers | awk '$4!="Running" && $4!="Completed"'
  echo "--- giờ trên máy host: $(date -u +%H:%M:%S) UTC. So với giờ trong VM bằng lệnh:"
  echo "    (cd infra/vagrant && vagrant ssh worker -c 'date -u +%H:%M:%S; systemctl is-active kubelet containerd')"
fi

echo; [ "$FAIL" -eq 0 ] && echo "CHẶNG B: ĐẠT" || echo "CHẶNG B: CHƯA ĐẠT"
exit "$FAIL"
