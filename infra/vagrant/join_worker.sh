#!/usr/bin/env bash
# CHỈ chạy trên worker, sau bootstrap.sh. Chờ master ghi join-command.sh rồi join.
set -euo pipefail

JOIN_FILE=/vagrant/join-command.sh
log() { echo "[join-worker] $*"; }

if [ -f /etc/kubernetes/kubelet.conf ]; then
  log "Node đã join cluster, bỏ qua"
  exit 0
fi

for i in $(seq 1 60); do
  [ -s "$JOIN_FILE" ] && break
  log "Chờ master ghi ${JOIN_FILE}... (${i}/60)"
  sleep 5
done
if [ ! -s "$JOIN_FILE" ]; then
  echo "Không thấy ${JOIN_FILE}. Trên master chạy: kubeadm token create --print-join-command" >&2
  exit 1
fi

bash "$JOIN_FILE"
log "xong trên $(hostname)"
