#!/usr/bin/env bash
# Chạy trên MỌI node. Idempotent: chạy lại an toàn.
# Biến môi trường (do Vagrantfile truyền): K8S_MINOR NODE_IP MASTER_IP WORKER_IP MASTER_HOST WORKER_HOST
set -euo pipefail

: "${K8S_MINOR:?}" "${NODE_IP:?}" "${MASTER_IP:?}" "${WORKER_IP:?}" "${MASTER_HOST:?}" "${WORKER_HOST:?}"

export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a                        # chặn needrestart hỏi tương tác trên Ubuntu 22.04
APT="apt-get -o DPkg::Lock::Timeout=300 -y"      # chờ khoá apt (unattended-upgrades hay giữ khi VM mới boot)

log() { echo "[bootstrap:$(hostname)] $*"; }

log "1/7 Tắt swap (kubelet từ chối chạy nếu còn swap)"
swapoff -a
sed -i '/\sswap\s/ s/^\([^#]\)/#\1/' /etc/fstab

log "2/7 Kernel module + sysctl cho mạng pod"
cat >/etc/modules-load.d/k8s.conf <<EOT
overlay
br_netfilter
EOT
modprobe overlay
modprobe br_netfilter
cat >/etc/sysctl.d/99-k8s.conf <<EOT
net.bridge.bridge-nf-call-iptables  = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward                 = 1
EOT
sysctl --system >/dev/null

log "3/7 /etc/hosts: node gọi nhau bằng tên"
sed -i '/# k8s-nodes-begin/,/# k8s-nodes-end/d' /etc/hosts
cat >>/etc/hosts <<EOT
# k8s-nodes-begin
${MASTER_IP} ${MASTER_HOST}
${WORKER_IP} ${WORKER_HOST}
# k8s-nodes-end
EOT

log "4/7 Cài containerd (repo Docker: bản 2.x còn được hỗ trợ, apt Ubuntu 22.04 chỉ có 1.7 đã EOL)"
$APT update
$APT install ca-certificates curl gpg
install -m 0755 -d /etc/apt/keyrings
if [ ! -f /etc/apt/keyrings/docker.gpg ]; then
  curl -fsSL --retry 5 https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
fi
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  >/etc/apt/sources.list.d/docker.list
$APT update
$APT install containerd.io

log "5/7 Cài kubeadm/kubelet/kubectl v${K8S_MINOR}"
if [ ! -f /etc/apt/keyrings/kubernetes-apt-keyring.gpg ]; then
  curl -fsSL --retry 5 "https://pkgs.k8s.io/core:/stable:/v${K8S_MINOR}/deb/Release.key" \
    | gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg
fi
echo "deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v${K8S_MINOR}/deb/ /" \
  >/etc/apt/sources.list.d/kubernetes.list
$APT update
$APT install kubelet kubeadm kubectl
apt-mark hold kubelet kubeadm kubectl

log "6/7 Cấu hình containerd: SystemdCgroup=true + pause image khớp kubeadm"
mkdir -p /etc/containerd
containerd config default >/etc/containerd/config.toml
sed -i 's/SystemdCgroup = false/SystemdCgroup = true/' /etc/containerd/config.toml
PAUSE_IMG="$(kubeadm config images list 2>/dev/null | grep '/pause:' || true)"
if [ -n "$PAUSE_IMG" ]; then
  # containerd 1.x dùng sandbox_image = "...", 2.x dùng sandbox = '...' trong pinned_images
  sed -i -E "s#^(\s*sandbox_image\s*=\s*).*#\1\"${PAUSE_IMG}\"#; s#^(\s*sandbox\s*=\s*).*#\1'${PAUSE_IMG}'#" /etc/containerd/config.toml
fi
grep -q 'SystemdCgroup = true' /etc/containerd/config.toml || { echo "LỖI: không bật được SystemdCgroup"; exit 1; }
systemctl enable containerd
systemctl restart containerd

# "restart" trả về khi tiến trình đã khởi động, chưa chắc socket đã nhận kết nối. Chờ thật sự sẵn sàng.
READY=0
for i in $(seq 1 30); do
  if [ -S /run/containerd/containerd.sock ] && ctr --address /run/containerd/containerd.sock version >/dev/null 2>&1; then
    READY=1; break
  fi
  sleep 1
done
if [ "$READY" -ne 1 ]; then
  echo "LỖI: containerd không nhận kết nối sau 30s. 40 dòng log cuối:" >&2
  systemctl status containerd --no-pager >&2 || true
  journalctl -u containerd -n 40 --no-pager >&2
  exit 1
fi

log "7/7 Ép kubelet dùng IP mạng riêng ${NODE_IP} (tránh 10.0.2.15 của NAT)"
echo "KUBELET_EXTRA_ARGS=--node-ip=${NODE_IP}" >/etc/default/kubelet
systemctl daemon-reload
systemctl enable kubelet   # chưa start: kubelet sẽ crash-loop tới khi kubeadm init/join, bình thường

log "xong"
