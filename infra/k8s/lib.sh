# Dùng chung cho các script trong infra/k8s (source, không chạy trực tiếp).
# Các script này chạy TRÊN MÁY HOST (Git Bash) và nói chuyện với cụm qua admin.conf do Phase 1 xuất ra.
# Lý do không chạy trong VM: thư mục /vagrant của VM chỉ là infra/vagrant, không thấy chart và values.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONF="$ROOT/infra/vagrant/admin.conf"
if [ ! -f "$CONF" ]; then
  echo "Không thấy $CONF. Cụm Phase 1 đã chạy và 'vagrant up' đã xuất admin.conf chưa?" >&2
  exit 1
fi
# kubectl.exe/helm.exe là chương trình Windows: cần đường dẫn dạng C:/..., không phải /c/...
export KUBECONFIG="$(cygpath -m "$CONF" 2>/dev/null || echo "$CONF")"

MASTER_IP="${MASTER_IP:-192.168.56.10}"
WORKER_IP="${WORKER_IP:-192.168.56.11}"

rand() { head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'; }   # rand N = N byte ngẫu nhiên, in dạng hex

ok()   { echo "  [OK]   $*"; }
bad()  { echo "  [FAIL] $*"; FAIL=1; }
step() { echo; echo "== $*"; }
FAIL=0
