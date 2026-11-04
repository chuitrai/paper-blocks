# 02 — Phase 1: Cluster Kubernetes (kubeadm) và các lỗi thực tế

> Mục tiêu: dựng cluster 1 master + 1 worker (1.0đ barem) **và hiểu vì sao nó hỏng**, vì 90% thời gian Phase 1 là debug, không phải gõ lệnh. File thực thi: `infra/vagrant/`.
>
> **Trạng thái kiểm chứng (nói thẳng):** script đã qua `bash -n`, `ruby -c` và test riêng các lệnh `sed`. Chưa chạy `vagrant up` thật vì môi trường tôi không có VirtualBox. Lần chạy đầu của bạn là lần kiểm chứng thật; lỗi nào gặp mà chưa có ở đây thì dán nguyên văn cho tôi, tôi bổ sung vào mục 4.

## 1. Quyết định kỹ thuật (và vì sao)

| Quyết định | Chọn | Lý do |
|---|---|---|
| Công cụ | kubeadm, 2 VM Vagrant+VirtualBox | Đúng barem 1.0đ; `vagrant destroy && up` cho phép tái lập (Phase 13) |
| Box | `bento/ubuntu-22.04` | Có sẵn VirtualBox Guest Additions, thư mục `/vagrant` chạy ngay |
| Kubernetes | **1.36** (biến `K8S_MINOR`) | 1.37 ra 26/08/2026 mới ~6 tuần tuổi; 1.36 chín hơn, vẫn trong hỗ trợ. Ghi đúng version vào evidence |
| Runtime | **containerd 2.x từ repo Docker** | containerd 1.7 hết vòng đời 30/09/2026, apt Ubuntu 22.04 chỉ có 1.7. Lưu ý: nguồn tin về việc K8s có chặn containerd 1.x ở 1.36/1.37 mâu thuẫn nhau, nên chọn 2.x cho an toàn |
| CNI | Calico v3.32.2 | Có NetworkPolicy; chọn 3.32.2 thay vì 3.33.0 (vừa ra 10/2026) |
| Pod CIDR | **`10.244.0.0/16`** | Xem lỗi 4.1: mặc định 192.168.0.0/16 đè lên mạng node |
| Node IP | host-only `192.168.56.0/24` | Xem lỗi 4.2 |
| Tài nguyên | master 4GB/2 CPU, worker 6GB/3 CPU | Vừa cho host 16GB. Host 8–12GB: `WORKER_MEM=4096 vagrant up` |

## 2. Chuẩn bị trên Windows

1. Tắt xung đột ảo hoá (xem lỗi 3.1) **trước** khi `vagrant up`.
2. Cài Vagrant for Windows và Git for Windows. Dùng **Git Bash**, không dùng WSL.
3. `git config --global core.autocrlf input` (xem lỗi 3.3).
4. Kiểm tra: `VBoxManage --version`, `vagrant --version`.

## 3. Chạy

```bash
cd infra/vagrant
vagrant up                                   # ~10–20 phút lần đầu (tải box + image)
vagrant ssh master -c "bash /vagrant/verify.sh"
```

`verify.sh` kiểm tra 6 tầng: node Ready → IP đúng dải → pod hệ thống → pod gọi pod **chéo node** → Service ClusterIP → DNS. Phase 1 chỉ coi là xong khi in `PHASE 1: ĐẠT`.

Evidence nộp bài (barem): `vagrant ssh master -c "kubectl get nodes -o wide"` và `... "kubectl get pods -A -o wide"`, kèm tài liệu này làm "tài liệu cài đặt".

## 4. Bài giảng: lỗi thực tế theo thứ tự bạn sẽ gặp

Mỗi lỗi: **Triệu chứng → Vì sao → Cách xử lý → Bài học**.

### Nhóm A — Máy host Windows (trước khi có cluster)

**A1. `VERR_NEM_VM_CREATE_FAILED`, hoặc VM boot rất chậm / treo**
- *Vì sao:* VirtualBox cần dùng trực tiếp tính năng ảo hoá của CPU. Trên Windows 11, WSL2, Docker Desktop, Windows Sandbox, **Memory Integrity** (Core isolation) đều bật Hyper-V. VirtualBox khi đó phải chạy qua lớp tương thích rất chậm, hoặc không khởi tạo được VM.
- *Xử lý:* cập nhật VirtualBox; tắt Memory Integrity (Windows Security → Device security → Core isolation); bỏ Hyper-V, Virtual Machine Platform, Windows Hypervisor Platform, Windows Sandbox trong "Turn Windows features on or off"; admin cmd: `bcdedit /set hypervisorlaunchtype off`, rồi **tắt máy hẳn** (Shut down, không Restart). Muốn bật lại: `bcdedit /set hypervisorlaunchtype auto`.
- *Bài học:* tắt Hyper-V nghĩa là mất WSL2 và Docker Desktop backend. Đây là lý do dự án dùng Git Bash, và nên chuẩn bị sẵn quyết định "VirtualBox hay WSL2/Docker Desktop" cho cả đồ án.

**A2. `vagrant up` treo ở "Waiting for machine to boot" rồi timeout**
- *Vì sao:* VT-x/AMD-V tắt trong BIOS, hoặc A1 chưa xử lý xong, hoặc máy thiếu RAM nên VM boot quá chậm.
- *Xử lý:* bật virtualization trong BIOS; mở VirtualBox GUI xem màn hình VM (`config.vm.provider ... vb.gui = true` tạm thời); `boot_timeout` đã nới lên 600s.

**A3. Script lỗi `bash\r: No such file or directory` / `$'\r': command not found`**
- *Vì sao:* Windows lưu xuống dòng CRLF; git `autocrlf=true` biến script thành CRLF; Linux hiểu `\r` là một phần tên lệnh.
- *Xử lý:* repo đã có `.gitattributes` ép `*.sh` về LF. Nếu file đã bị CRLF: `dos2unix file` hoặc clone lại sau khi đặt `autocrlf input`. Vagrant shell provisioner mặc định tự đổi CRLF→LF nên `vagrant up` có thể vẫn chạy, nhưng chạy tay trong VM (`bash /vagrant/verify.sh`) thì sẽ vỡ.
- *Bài học:* lỗi "nhìn đúng mà chạy sai" luôn đáng nghi về ký tự ẩn.

**A4. Lỗi mạng host-only, `The IP address configured for the host-only network is not within the allowed ranges`**
- *Vì sao:* VirtualBox ≥ 6.1.28 giới hạn host-only trong `192.168.56.0/21` (chủ yếu trên Linux/macOS). Dải `192.168.56.x` của dự án hợp lệ; đổi sang dải khác mới lỗi.
- *Xử lý:* giữ dải mặc định, hoặc khai báo thêm dải trong file `networks.conf` của VirtualBox.

### Nhóm B — Bootstrap node (`bootstrap.sh`)

**B1. `Could not get lock /var/lib/dpkg/lock-frontend`**
- *Vì sao:* VM Ubuntu mới boot thường có `unattended-upgrades` đang chạy apt nền.
- *Xử lý:* script dùng `-o DPkg::Lock::Timeout=300` để chờ thay vì chết. Thủ công: đợi, hoặc `sudo systemctl stop unattended-upgrades`.

**B2. `kubeadm init` fail preflight: `[ERROR Swap]`, hoặc `bridge-nf-call-iptables does not exist`**
- *Vì sao:* swap còn bật (kubelet từ chối); hoặc module `br_netfilter` chưa nạp nên sysctl bridge không tồn tại.
- *Chẩn đoán:* `swapon --show` (phải trống); `lsmod | grep br_netfilter`; `sysctl net.bridge.bridge-nf-call-iptables`.
- *Xử lý:* script đã comment dòng swap trong `/etc/fstab` (tắt **vĩnh viễn**, nếu chỉ `swapoff -a` thì reboot là swap quay lại) và ghi module/sysctl vào file trong `/etc/*.d/` (tồn tại qua reboot).

**B3. Node `NotReady`, log kubelet mơ hồ, pod hệ thống restart liên tục**
- *Vì sao (thủ phạm số 1):* **lệch cgroup driver** giữa containerd (mặc định `cgroupfs`) và kubelet (`systemd`). Hai bên cùng giành quản lý một cây cgroup nên hành vi không ổn định, không lỗi rõ ràng.
- *Chẩn đoán:* `grep SystemdCgroup /etc/containerd/config.toml` phải là `true`; `journalctl -u kubelet -n 50 --no-pager`.
- *Xử lý:* script `sed` rồi **kiểm tra lại bằng grep và dừng nếu sai**, thay vì tin là đã đúng.
- *Bài học:* mọi bước cấu hình quan trọng nên có assert ngay sau nó.

**B4. Cảnh báo/lỗi `pause` image (sandbox image) lệch phiên bản**
- *Vì sao:* containerd mang sẵn một phiên bản pause mặc định, kubeadm khuyến nghị bản khác. Thường chỉ là cảnh báo, nhưng nếu registry không kéo được image đó thì pod không tạo nổi sandbox (`failed to get sandbox image`).
- *Xử lý:* script lấy tên pause image từ `kubeadm config images list` và ghi vào config containerd (xử lý cả định dạng 1.x `sandbox_image` lẫn 2.x `sandbox`).

**B5. `kubectl`/`kubeadm` tự nâng cấp bất ngờ**
- *Vì sao:* `apt upgrade` kéo version lên giữa chừng, làm lệch version giữa các node.
- *Xử lý:* `apt-mark hold kubelet kubeadm kubectl`. Nâng cấp là quy trình riêng (`kubeadm upgrade`), không phải `apt upgrade`.

**B6. `kubeadm` báo `connection refused` trên `containerd.sock` dù containerd "đang chạy"** *(gặp thật ở lần chạy đầu)*
- *Triệu chứng:* `failed to create new CRI runtime service ... dial unix /var/run/containerd/containerd.sock: connect: connection refused` ngay sau `kubeadm reset`. Khi vào kiểm tra thì `systemctl status containerd` lại `active (running)`.
- *Vì sao:* bằng chứng là containerd khởi động lại **5 giây sau** lúc lỗi (unit có `Restart=always`, `RestartSec` ≈ 5s). Nghĩa là nó bị dừng/crash ngay khoảng thời gian `reset` và `pull`, rồi systemd tự bật lại. Nguyên nhân khiến nó dừng chưa xác định được; log đầy đủ lúc đó chưa lấy. Khi kiểm tra sau đó thì mọi thứ đã lành, nên **kiểm tra muộn che mất lỗi**.
- *Bài học:* "service active" lúc bạn nhìn không có nghĩa là nó active lúc script chạy. Script phải **chờ tới khi socket thật sự nhận kết nối** (`ctr version`), không tin `systemctl restart` trả về là xong.
- *Xử lý:* `bootstrap.sh` và `init_master.sh` giờ có vòng chờ này, tự retry pull 3 lần và in log containerd khi thất bại. Nếu lỗi lặp lại, lấy bằng chứng ngay: `sudo journalctl -u containerd --no-pager | grep -v "loading plugin" | head -60` và `systemctl show containerd -p NRestarts`.
- Ghi chú: `ls /run/containerd` cần `sudo` (thư mục chỉ root đọc được), "Permission denied" khi không có sudo không phải lỗi.

### Nhóm C — Khởi tạo cluster (`init_master.sh`)

**C1. `kubeadm init` timeout ở "waiting for the kubelet to boot the control plane"**
- *Vì sao:* kéo image control-plane quá chậm (mạng/DNS VM), hoặc kubelet không chạy được control-plane static pod vì lỗi B3.
- *Chẩn đoán:* `sudo crictl ps -a` (container có lên không); `sudo crictl logs <id>`; `journalctl -u kubelet`. Lưu ý: lúc này `kubectl` **chưa dùng được** (apiserver chưa sống), phải dùng `crictl`.
- *Xử lý:* script `kubeadm config images pull` trước để tách việc "tải" khỏi việc "khởi động"; `natdnshostresolver1` trong Vagrantfile giảm treo DNS.

**C2. Hai node cùng `INTERNAL-IP 10.0.2.15`**
- *Vì sao:* mỗi VM VirtualBox có NIC NAT (10.0.2.15, giống hệt nhau) và NIC host-only. Kubelet mặc định lấy IP của card mặc định route → NAT. Hậu quả sau này: Prometheus scrape sai node, `kubectl logs/exec` lỗi, node không gọi nhau được.
- *Xử lý:* `--node-ip` trong `/etc/default/kubelet` (bootstrap), `--apiserver-advertise-address` (init), Calico `IP_AUTODETECTION_METHOD=cidr=192.168.56.0/24` (chọn theo **dải IP**, không theo tên card, vì tên card có thể là `eth1` hoặc `enp0s8` tuỳ box). `verify.sh` mục 2 kiểm tra đúng điều này.

**C3. Calico `Running` nhưng pod ở 2 node không gọi nhau được**
- *Vì sao:* nhiều nguyên nhân dẫn tới cùng triệu chứng: Calico chọn sai interface (C2), pod CIDR đè mạng node (C4), firewall Windows chặn traffic VirtualBox host-only.
- *Chẩn đoán:* đây là lý do `verify.sh` có test pod→pod **chéo node**. Trong cùng 1 node mọi thứ vẫn chạy bình thường nên lỗi này lộ muộn, thường tới Phase 3 khi frontend không gọi được API. `kubectl logs -n kube-system -l k8s-app=calico-node --tail=50`.

**C4. Pod CIDR trùng mạng node**
- *Vì sao:* manifest Calico mặc định thiên về `192.168.0.0/16`, dải này **bao trùm** `192.168.56.0/24` của node. Route tới node bị coi là mạng pod → traffic biến mất. Kế hoạch cũ của dự án trước đây mắc đúng lỗi này.
- *Xử lý:* dùng `10.244.0.0/16` cho pod; Calico tự đọc CIDR theo cấu hình kubeadm. Quy tắc chung: **ba dải (node, pod, service) không được chồng nhau**. Service CIDR mặc định `10.96.0.0/12` nằm ngoài cả hai.

**C5. CoreDNS `Pending`**
- Bình thường tới khi CNI sẵn sàng (chưa có mạng pod thì chưa lên được). Nếu Calico đã chạy mà vẫn Pending: `kubectl describe pod -n kube-system -l k8s-app=kube-dns` đọc `Events`.

### Nhóm D — Join worker

**D1. `couldn't validate the identity of the API Server` / token hết hạn**
- *Vì sao:* bootstrap token mặc định sống 24h; hoặc worker không gọi tới được `192.168.56.10:6443`.
- *Chẩn đoán:* từ worker `curl -k https://192.168.56.10:6443/healthz` (trả `ok` là mạng thông).
- *Xử lý:* trên master `kubeadm token create --print-join-command`.

**D2. Worker join "thành công" nhưng không hiện trong `kubectl get nodes`, hoặc tạo ra 2 cluster riêng**
- *Vì sao:* chạy `kubeadm init` nhầm trên worker (tự thành master của cluster riêng). Đó là lý do `init_master.sh` và `join_worker.sh` tách file và `Vagrantfile` gắn đúng từng loại provision cho từng VM.

**D3. `join-command.sh` không có trên worker**
- *Vì sao:* thư mục `/vagrant` (shared folder VirtualBox) không mount, hoặc master chưa init xong. `join_worker.sh` chờ tối đa 5 phút.
- *Xử lý:* `ls /vagrant` trong worker; `vagrant reload worker`; dự phòng: copy lệnh join bằng tay.
- *Bảo mật:* `join-command.sh` và `admin.conf` là **thông tin xác thực cluster**, đã nằm trong `.gitignore`. Không commit, không dán lên chat/ảnh evidence.

**D4. `timeout during server version negotiating` khi provision** *(gặp thật)*
- Cổng SSH mở nhưng sshd trong VM không kịp trả lời: VM quá tải/boot dở, `bootstrap.sh` chưa hề chạy. Xử lý: giảm tài nguyên (`WORKER_MEM=4096 WORKER_CPUS=2`), `vagrant halt worker && vagrant up worker --provision`. Xem thêm E6.

**D5. `Machine already provisioned` sau một lần provision lỗi** *(gặp thật)*
- Vagrant ghi nhớ "đã thử", không phải "đã thành công". Đừng tin dòng này: kiểm tra thực tế bằng `kubectl get nodes` trên master, rồi ép chạy lại bằng `vagrant provision <máy> --provision-with <tên>`.

**D6. VM "ma" / thư mục rác sau `destroy` bị gián đoạn** *(gặp thật)*
- `VERR_ALREADY_EXISTS` hoặc `VERR_FILE_NOT_FOUND` khi đổi tên `temp_clone_...`. Nguyên nhân: `destroy` khi còn phiên SSH/cửa sổ VM mở. Xử lý: `VBoxManage unregistervm <uuid>` (không `--delete` nếu file đã mất), `closemedium` ổ đĩa mất, xoá thư mục `temp_clone_*` trong `VirtualBox VMs`, xoá `.vagrant/`. **Không đụng VM gốc `ubuntu-22.04-amd64_...`.** Chi tiết: `theory/01-phase-1.1-vagrant.md` mục 5 và 7.

### Nhóm E — Vận hành (những thứ chỉ lộ sau vài ngày)

**E1. Tắt máy rồi bật lại, cluster "hỏng"**
- Hay do VM chưa kịp khởi động xong service. Thứ tự đúng: `vagrant up` (hoặc `vagrant reload`), chờ 1–2 phút, `verify.sh`. `containerd` và `kubelet` đã `enable` nên tự lên theo systemd. Dùng `vagrant halt`, đừng tắt cưỡng bức từ VirtualBox.

**E2. Laptop sleep → `x509: certificate has expired or is not yet valid`**
- *Vì sao:* đồng hồ VM trôi/lệch sau khi host ngủ; TLS và token phụ thuộc thời gian. Xử lý: `sudo systemctl restart systemd-timesyncd`, hoặc `vagrant reload`.

**E3. Pull image lỗi `toomanyrequests` (Docker Hub)**
- *Vì sao:* Docker Hub giới hạn pull ẩn danh theo IP. Cả hai VM đi chung IP NAT nên chạm giới hạn rất nhanh khi pull nhiều image. `verify.sh` dùng `nginx:stable-alpine` từ Docker Hub, ảnh hưởng đúng điểm này.
- *Xử lý:* đăng nhập Docker Hub (tạo imagePullSecret ở Phase 3–4), hoặc dùng registry mirror. Phase 4 sẽ phải giải quyết triệt để vì Jenkins cũng pull/push nhiều.

**E4. Master hết RAM khi cài Jenkins/ArgoCD/EFK**
- Master có taint `NoSchedule`, workload không tự lên master (thiết kế an toàn). Nếu cần vắt tài nguyên: `kubectl taint nodes k8s-master node-role.kubernetes.io/control-plane:NoSchedule-`. Đánh đổi: workload nặng có thể bóp `etcd`/`kube-apiserver`, `kubectl` đơ. Chỉ gỡ khi đã đặt `resources.limits`.

**E6. Node tự `NotReady` rồi tự `Ready` lại, không ai đụng vào gì** *(gặp thật)*
- *Triệu chứng:* `kubectl describe node` có `Kubelet stopped posting node status` trong 1–2 phút; `kube-controller-manager`/`kube-scheduler` có `RESTARTS` > 0 từ lúc dựng cluster.
- *Vì sao:* VM master bị bỏ đói CPU/đĩa khi máy host quá tải (ví dụ khởi động VM worker cùng lúc). Control-plane không gia hạn kịp lease nên restart; kubelet trễ báo cáo nên node bị đánh dấu Unknown. Chưa xác nhận chắc nguyên nhân; bằng chứng là trùng thời điểm với lúc bật worker.
- *Đừng kết luận "cần thời gian khởi động":* Calico báo `CalicoIsUp` từ lúc dựng, node đã Ready cả tiếng trước khi tụt. Xem `LastTransitionTime` của từng condition để phân biệt "chưa từng Ready" với "đang Ready rồi tụt".
- *Xử lý:* giảm tài nguyên (`WORKER_MEM=4096 WORKER_CPUS=2`), đóng chương trình nặng, bật từng VM một và chờ node `Ready` rồi mới bật VM tiếp. Máy yếu: đây là giới hạn thật của cấu hình, không phải lỗi script.

**E5. Chứng chỉ hết hạn sau 1 năm**: `kubeadm certs check-expiration` / `kubeadm certs renew all`.

## 5. Chẩn đoán theo tầng (khi `verify.sh` báo FAIL)

Không đoán mò; đi từ dưới lên, **dừng ở tầng đầu tiên hỏng**:

| Tầng | Câu hỏi | Lệnh |
|---|---|---|
| 1. Host | VM lên chưa, nối mạng chưa? | `vagrant status`; `vagrant ssh worker -c "ping -c1 192.168.56.10"` |
| 2. Runtime | containerd chạy, đúng cgroup? | `systemctl status containerd`; `grep SystemdCgroup /etc/containerd/config.toml` |
| 3. Kubelet | kubelet khoẻ? | `journalctl -u kubelet -n 50 --no-pager` |
| 4. Control-plane | apiserver/etcd sống? | `sudo crictl ps`; `curl -k https://192.168.56.10:6443/healthz` |
| 5. CNI | calico-node chạy trên cả 2 node, đúng IP? | `kubectl get pods -n kube-system -o wide`; `kubectl logs -n kube-system -l k8s-app=calico-node` |
| 6. Service/DNS | kube-proxy, CoreDNS? | `kubectl get svc,endpoints -A`; `kubectl logs -n kube-system -l k8s-app=kube-dns` |
| 7. Pod | pod cụ thể chết ở bước nào? | `kubectl describe pod <tên>` → đọc `Events` cuối trang |

Thứ tự này khớp thứ tự `verify.sh` kiểm tra. Cluster 2 node mà chỉ test trong 1 node sẽ giấu lỗi tầng 5.

## 6. Làm lại sạch và tái lập

```bash
vagrant destroy -f && vagrant up      # tái lập từ đầu (Phase 13 sẽ chạy lại đúng lệnh này)
```
Chỉ reset cluster, giữ VM: trên mỗi node `sudo kubeadm reset -f && sudo rm -rf /etc/cni/net.d`, rồi xoá `join-command.sh` và `admin.conf` trong `infra/vagrant/` trước khi `vagrant provision`. Lỗi nào bạn gặp mà không có ở đây, ghi lại: dán đoạn lỗi và tên tầng vào đây để thành tài liệu.

## 7. Checklist hoàn thành Phase 1

- [ ] `verify.sh` in `PHASE 1: ĐẠT`
- [ ] `kubectl get nodes -o wide`: 2 node Ready, `INTERNAL-IP` thuộc `192.168.56.0/24`
- [ ] `kubectl version` ghi lại đúng phiên bản (không ghi "latest")
- [ ] Ảnh/log hai lệnh barem lưu vào `evidence/phase1/`
- [ ] `vagrant destroy -f && vagrant up` chạy lại không phải sửa tay
- [ ] Không có `join-command.sh`, `admin.conf` trong lịch sử git

## 8. Nguồn

- [kubeadm init](https://kubernetes.io/docs/reference/setup-tools/kubeadm/kubeadm-init/), [Container runtimes + cgroup driver](https://kubernetes.io/docs/setup/production-environment/container-runtimes/)
- [pkgs.k8s.io](https://kubernetes.io/blog/2023/08/15/pkgs-k8s-io-introduction/)
- [Calico on-premises](https://docs.tigera.io/calico/latest/getting-started/kubernetes/self-managed-onprem/onpremises)
- [containerd releases/EOL](https://containerd.io/releases/)
- [VERR_NEM_VM_CREATE_FAILED (diễn đàn VirtualBox)](https://forums.virtualbox.org/viewtopic.php?t=103755&start=15)
