#!/usr/bin/env bash
# CHỈ chạy trên master, sau bootstrap.sh. Idempotent: bỏ qua init nếu cluster đã có.
set -euo pipefail

: "${NODE_IP:?}"
CALICO_VERSION="${CALICO_VERSION:-v3.32.2}"
POD_CIDR="${POD_CIDR:-10.244.0.0/16}"   # KHÔNG dùng 192.168.0.0/16: đè lên mạng node 192.168.56.0/24
log() { echo "[init-master] $*"; }

DONE_MARK=/var/lib/k8s-init-done   # chỉ ghi khi kubeadm init THÀNH CÔNG hoàn toàn

dump_diag() {
  echo "================ CHẨN ĐOÁN (kubeadm init thất bại) ================" >&2
  echo "--- tải máy:"; uptime; free -m; nproc
  echo "--- container:"; crictl ps -a 2>&1 | tail -15
  for c in etcd kube-apiserver; do
    id=$(crictl ps -a --name "$c" -q 2>/dev/null | head -1)
    [ -n "$id" ] && { echo "--- log $c (30 dòng cuối):"; crictl logs --tail 30 "$id" 2>&1; }
  done
  echo "--- kubelet:"; journalctl -u kubelet -n 25 --no-pager
  echo "--- healthz:"; curl -ksm 5 "https://${NODE_IP}:6443/healthz" || echo "apiserver không trả lời"
  echo "===================================================================" >&2
}

containerd_ready() { [ -S /run/containerd/containerd.sock ] && ctr --address /run/containerd/containerd.sock version >/dev/null 2>&1; }

# containerd có Restart=always (chờ ~5s): nếu nó vừa bị kill/crash, đợi một chút là tự sống lại.
# Chỉ khi đợi mà vẫn chưa lên mới tự restart; vẫn không lên thì dừng và in log.
ensure_containerd() {
  for i in $(seq 1 20); do containerd_ready && return 0; sleep 1; done
  log "containerd vẫn chưa sẵn sàng sau 20s -> restart"
  systemctl restart containerd || true
  for i in $(seq 1 30); do containerd_ready && return 0; sleep 1; done
  echo "LỖI: containerd không chạy. Trạng thái và log:" >&2
  systemctl status containerd --no-pager >&2 || true
  journalctl -u containerd --no-pager | grep -v 'loading plugin' | tail -60 >&2
  exit 1
}

if [ ! -f "$DONE_MARK" ]; then
  ensure_containerd

  # admin.conf có thể đã được ghi dở bởi lần init trước bị lỗi giữa chừng.
  # Chỉ dựa vào admin.conf để bỏ qua init sẽ để lại cluster hỏng nửa vời -> reset sạch trước.
  if [ -f /etc/kubernetes/admin.conf ] || [ -n "$(ls -A /etc/kubernetes/manifests 2>/dev/null)" ]; then
    log "Phát hiện trạng thái init dở dang -> kubeadm reset. Lý do:"
    [ -f /etc/kubernetes/admin.conf ] && log "  - tồn tại /etc/kubernetes/admin.conf"
    [ -n "$(ls -A /etc/kubernetes/manifests 2>/dev/null)" ] && log "  - /etc/kubernetes/manifests không rỗng: $(ls -A /etc/kubernetes/manifests | tr '\n' ' ')"
    kubeadm reset -f
    rm -rf /etc/cni/net.d "$HOME/.kube"
    ensure_containerd   # reset có thể làm containerd chập chờn (xem docs/02 lỗi B6)
  fi

  log "Pull image control-plane trước (tránh kubeadm init timeout khi mạng chậm)"
  for try in 1 2 3; do
    kubeadm config images pull && break
    [ "$try" -eq 3 ] && { echo "LỖI: pull image thất bại 3 lần" >&2; exit 1; }
    log "pull lỗi, đợi 10s rồi thử lại ($try/3)"; ensure_containerd; sleep 10
  done

  log "kubeadm init"
  if ! kubeadm init \
      --apiserver-advertise-address="${NODE_IP}" \
      --pod-network-cidr="${POD_CIDR}" \
      --node-name="$(hostname)"; then
    dump_diag
    exit 1
  fi
  touch "$DONE_MARK"
else
  log "Cluster đã init xong trước đó, bỏ qua kubeadm init"
fi

log "kubeconfig cho user vagrant"
install -d -o vagrant -g vagrant /home/vagrant/.kube
cp -f /etc/kubernetes/admin.conf /home/vagrant/.kube/config
chown vagrant:vagrant /home/vagrant/.kube/config
export KUBECONFIG=/etc/kubernetes/admin.conf

log "Cài Calico ${CALICO_VERSION}"
kubectl apply -f "https://raw.githubusercontent.com/projectcalico/calico/${CALICO_VERSION}/manifests/calico.yaml"

# Calico tự lấy IP từ interface "đầu tiên" -> thường là NAT 10.0.2.15 (giống nhau trên mọi VM).
# Ép nó chọn theo dải host-only, không phụ thuộc tên card (eth1 / enp0s8).
NODE_CIDR="$(echo "${NODE_IP}" | cut -d. -f1-3).0/24"
kubectl -n kube-system set env daemonset/calico-node IP_AUTODETECTION_METHOD="cidr=${NODE_CIDR}"

log "Chờ calico-node rollout"
kubectl -n kube-system rollout status daemonset/calico-node --timeout=300s

log "Xuất join command + admin.conf ra /vagrant (chứa secret, đã gitignore)"
kubeadm token create --ttl 24h --print-join-command >/vagrant/join-command.sh
chmod 600 /vagrant/join-command.sh
cp -f /etc/kubernetes/admin.conf /vagrant/admin.conf

log "xong. Master:"
kubectl get nodes -o wide
