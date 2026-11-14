# Lý thuyết tổng hợp — Paper Blocks DevSecOps

> Một file duy nhất cho mọi lý thuyết của dự án (gộp từ `01-phase-1.1-vagrant.md` và `02-phase-2-ban-do-ly-thuyet.md`, thêm phần Kubernetes, Helm/GitOps/ArgoCD, CI/CD). Không thuộc bộ `docs/` bắt buộc. Thực hành xem `docs/`.
>
> **Quy ước độ tin cậy:** link trong Phần F đều đã được tìm thấy bằng tìm kiếm trên domain chính thức; link ghi "(chưa kiểm)" tôi chưa mở. Tóm tắt từ kết quả tìm kiếm, không phải từ việc đọc trọn trang, nên khi đọc hãy lấy trang gốc làm chuẩn.

## Mục lục

- [Kế hoạch đọc trong một ngày](#kế-hoạch-đọc-trong-một-ngày)
- **Phần A — Nền hạ tầng:** [A1 Vagrant](#a1-vagrant) · [A2 Kubernetes + kubeadm](#a2-kubernetes-và-kubeadm-phase-12)
- **Phần B — Ứng dụng:** [B1 HTTP/REST](#b1-http-và-rest) · [B2 AuthN/AuthZ](#b2-xác-thực-và-phân-quyền) · [B3 Middleware](#b3-middleware-và-thứ-tự-chạy) · [B4 Rate limit](#b4-rate-limiting) · [B5 Observability](#b5-quan-sát-được-observability) · [B6 12-factor](#b6-đóng-gói-theo-12-factor) · [B7 SQLite/upload/OAuth](#b7-sqlite-upload-và-github-oauth) · [B8 Docker](#b8-docker-cho-go) · [B9 Tình huống business](#b9-tình-huống-businessproduct) · [B10 Kiểm thử](#b10-kiểm-thử)
- **Phần C — Phase 3:** [C1 Image/registry](#c1-image-registry-tag-và-digest) · [C2 Helm](#c2-helm) · [C3 Storage](#c3-storage-pvc-và-storageclass) · [C4 Service/NodePort](#c4-service-nodeport-và-ip-client) · [C5 GitOps + ArgoCD](#c5-gitops-và-argocd)
- **Phần D — CI/CD:** [D1 Jenkins + luồng tag](#d1-jenkins-và-luồng-ci-theo-tag) · [D2 Fast-Lane](#d2-fast-lane-build-nhanh-và-preview-env)
- [Phần E — Tự kiểm tra tổng hợp](#phần-e--tự-kiểm-tra-tổng-hợp)
- [Phần F — Nguồn tham khảo](#phần-f--nguồn-tham-khảo)
- [Phụ lục — Điều tôi chưa kiểm chứng](#phụ-lục--điều-tôi-chưa-kiểm-chứng)

---

## Kế hoạch đọc trong một ngày

Sắp xếp theo **thứ tự bạn sẽ cần** (chặng D/E của Phase 3 đang chờ), không theo thứ tự phase. Thời lượng là **ước lượng của tôi**, chưa phải số đo. Tổng ≈ 5–6 giờ gồm nghỉ.

| Khối | Nội dung | Đọc phần này | Nguồn (Phần F) | ~Thời gian |
|---|---|---|---|---|
| 1 | GitOps + ArgoCD (cần ngay cho chặng D) | C5, C3 | F1, F2, F3, F4 | 75 phút |
| 2 | Helm (hiểu chart bạn đã có) | C2 | F5 | 40 phút |
| 3 | Kubernetes bên dưới (vì sao script Phase 1 viết thế) | A2 | F6 | 50 phút |
| 4 | Jenkins + luồng CI theo tag (chặng E, Phase 4) | D1 | F7 | 40 phút |
| 5 | Docker cache + registry (cho Fast-Lane, Phase 5) | C1, D2, B8 | F8 | 40 phút |
| 6 | Bảo mật ứng dụng (barem 3 điểm Security) | B1–B4, B7 | F9 | 50 phút |
| 7 | Quan sát được (Phase 7–8) | B5, B6 | F10 | 25 phút |
| 8 | Vagrant (đã xong, đọc để nhớ khi bảo vệ) | A1 | F11 | 20 phút |

Cách đọc mỗi khối: (1) đọc phần tự viết trong file này trước, (2) mở nguồn tương ứng và chỉ đọc mục được chỉ định, (3) làm các câu trong Phần E của khối đó **không nhìn đáp án**. Nếu trả lời sai hai câu liên tiếp thì quay lại phần đó, đừng đọc tiếp.

Nếu chỉ có 3 giờ: khối 1, 2, 4 (đủ để làm chặng D, E mà hiểu mình đang làm gì).

---

# PHẦN A — NỀN HẠ TẦNG

## A1. Vagrant

> Phase 1 chia hai nửa: **1.1 Vagrant** (dựng và quản lý máy ảo, mục này) và **1.2 Kubernetes bên trong VM** (mục A2). Thực hành xem `docs/02-PHASE1-KUBERNETES-VA-LOI-THUC-TE.md`.

### A1.1 Vagrant giải quyết vấn đề gì

Cài một cluster Kubernetes bằng tay trên VM gồm hàng chục bước. Làm một lần thì được; làm lại lần hai thì không ai nhớ đã gõ gì, và nếu hỏng thì không biết hỏng do bước nào. Vagrant biến việc đó thành **một file mô tả (`Vagrantfile`)** và **một lệnh (`vagrant up`)**. Cùng file, cùng lệnh, ra cùng một kết quả: đó là **khả năng tái lập**, giá trị cốt lõi của công cụ này.

Vagrant không tự chạy máy ảo. Nó là **lớp điều phối** gọi phần mềm khác làm việc thật:

```
Vagrantfile (bạn viết)
     │  đọc
     ▼
  Vagrant  ──gọi VBoxManage──▶  VirtualBox (provider) ──▶ VM Ubuntu
     │
     └──SSH vào VM──▶ chạy script (provisioner) cài phần mềm bên trong
```

### A1.2 Năm khái niệm cần nắm

| Khái niệm | Là gì | Trong dự án |
|---|---|---|
| **Box** | Ảnh đĩa OS dựng sẵn, dùng làm gốc để tạo VM | `bento/ubuntu-22.04` bản `202510.26.0` |
| **Provider** | Phần mềm ảo hoá thật sự chạy VM | VirtualBox |
| **Provisioner** | Công cụ cài đặt *bên trong* VM sau khi nó boot | `shell`, chạy các script `.sh` |
| **Network** | Card mạng gắn cho VM | NAT (tự có) + host-only `192.168.56.x` |
| **Synced folder** | Thư mục dùng chung host ⇄ VM | thư mục `infra/vagrant` thành `/vagrant` |

Ba sự thật hay bị hiểu sai:

1. **Provisioner mặc định chỉ chạy một lần** cho mỗi VM (lần `up` đầu). `vagrant up` lần sau trên VM đã có sẽ *không* chạy lại script. Muốn chạy lại: `vagrant provision`. Hệ quả: script phải **idempotent** (chạy lặp lại không phá hỏng gì), vì bạn sẽ chạy lại khi debug.
2. **Vagrantfile là chương trình Ruby, không phải cấu hình tĩnh.** Nó được chạy lại mỗi lần bạn gõ bất kỳ lệnh `vagrant` nào, kể cả `status`. Đừng đặt việc nặng hay có tác dụng phụ trong đó.
3. **Vagrant nhớ VM nào thuộc về thư mục nào** qua thư mục `.vagrant/` (đã gitignore). Xoá `.vagrant/` mà VM còn trong VirtualBox thì Vagrant "mất dấu" nó, VM thành mồ côi.

### A1.3 Vòng đời của một VM

| Lệnh | Làm gì | Ghi chú |
|---|---|---|
| `vagrant up` | Tạo VM nếu chưa có, boot, provision lần đầu | Lần đầu tải box (~vài trăm MB) |
| `vagrant provision` | Chạy lại script trên VM đang chạy | Có thể chọn: `--provision-with init-master` |
| `vagrant halt` | Tắt VM, giữ đĩa | Cách tắt đúng. Đừng tắt cưỡng bức trong VirtualBox |
| `vagrant reload` | halt + up, áp lại cấu hình mạng/RAM | Không chạy lại provision trừ khi thêm `--provision` |
| `vagrant destroy -f` | Xoá VM và đĩa | Box đã tải vẫn được giữ lại |
| `vagrant global-status --prune` | Dọn danh sách VM Vagrant nhớ | Dùng sau khi dọn tay |

Quy tắc an toàn: **đóng mọi phiên `vagrant ssh` và cửa sổ VM trước khi `destroy`**. Chúng ta đã gặp đúng lỗi này (xem A1.8).

### A1.4 Mổ xẻ Vagrantfile của dự án

Đọc theo thứ tự khối trong `infra/vagrant/Vagrantfile`.

**Tham số ở đầu file**

```ruby
K8S_MINOR  = ENV.fetch("K8S_MINOR", "1.36")
WORKER_MEM = ENV.fetch("WORKER_MEM", "6144").to_i
NODES = [ { name: "master", ... }, { name: "worker", ... } ]
```

- `ENV.fetch(tên, mặc định)` cho phép đổi tham số mà không sửa file: `WORKER_MEM=4096 vagrant up`.
- `.to_i` vì biến môi trường luôn là chuỗi, RAM phải là số.
- Mảng `NODES` tách **dữ liệu khỏi logic**: muốn thêm worker, thêm một dòng, vòng lặp bên dưới tự lo.
- Quy ước: biến môi trường cho thứ **đổi theo máy** (RAM), hằng số trong file cho thứ **đổi theo phiên bản** (version K8s).

**Box và ghim phiên bản**

```ruby
config.vm.box = "bento/ubuntu-22.04"
config.vm.box_version = "202510.26.0"
config.vm.box_check_update = false
config.vm.boot_timeout = 600
```

- `box_version`: nếu không ghim, "bản mới nhất" thay đổi theo thời gian, build lại sau nửa năm có thể ra OS khác và bạn không biết vì sao cluster hỏng. **Ghim phiên bản là điều kiện của tái lập.**
- `boot_timeout`: thời gian tối đa chờ SSH lên (mặc định 300s). Tăng số này chỉ che triệu chứng; nếu vẫn timeout thì VM đang gặp vấn đề khác (thường là Hyper-V chặn VirtualBox, xem A1.8).

**Synced folder**

```ruby
config.vm.synced_folder ".", "/vagrant", SharedFoldersEnableSymlinksCreate: false
```

Thư mục chứa Vagrantfile trên host xuất hiện thành `/vagrant` trong VM (cơ chế `vboxsf`, cần Guest Additions, bento có sẵn). Dự án dùng nó làm **kênh trao đổi giữa các VM**: master ghi `join-command.sh` và `admin.conf`, worker đọc. `SymlinksCreate: false` chặn VM tạo symlink ra ngoài thư mục chia sẻ.

**Vòng lặp tạo máy**

```ruby
NODES.each do |n|
  config.vm.define n[:name], primary: n[:name] == "master" do |node|
```

`define` khai báo từng máy trong dự án nhiều máy. Vagrant tạo chúng **tuần tự theo thứ tự khai báo**, nên master (cùng `init_master.sh`) xong trước khi worker bắt đầu. Đừng dựa hoàn toàn vào thứ tự này: worker vẫn tự chờ file join tối đa 5 phút. Quy tắc: **thứ tự ngầm là tối ưu, vòng chờ là bảo hiểm.**

**Hostname và hai card mạng**

```ruby
node.vm.hostname = n[:host]
node.vm.network "private_network", ip: n[:ip]
```

| Card | Loại | IP | Dùng để |
|---|---|---|---|
| 1 | NAT (Vagrant tự thêm) | `10.0.2.15` *trên mọi VM* | Ra Internet; Vagrant SSH vào qua cổng 2222 trên `127.0.0.1` |
| 2 | Host-only (`private_network`) | `192.168.56.10` / `.11` | Node ⇄ node, host ⇄ node |

IP của card 1 giống hệt nhau trên cả hai máy. Nếu Kubernetes lấy nhầm IP này thì hai node trông như một. Đó là lý do bước 7 của `bootstrap.sh` ép `--node-ip` (xem A2).

**Cấu hình VirtualBox**

| Dòng | Tác dụng | Lý do |
|---|---|---|
| `vb.memory`, `vb.cpus` | RAM, CPU | master 4GB/2, worker 6GB/3 |
| `vb.gui = ENV["VB_GUI"]=="1"` | Mở cửa sổ console | `VB_GUI=1 vagrant up` để xem VM khi debug boot |
| `vb.linked_clone = true` | Dùng chung đĩa gốc, chỉ lưu phần thay đổi | Nhanh, tiết kiệm đĩa. Đánh đổi: A1.5 |
| `--natdnshostresolver1 on` | DNS của VM qua resolver của host | Tránh `apt`/pull image bị treo |
| `--ioapic on` | Bật IO-APIC | VirtualBox cần cho VM nhiều CPU |

**Truyền tham số và provisioner**

```ruby
env = { "K8S_MINOR" => K8S_MINOR, "NODE_IP" => n[:ip], ... }
node.vm.provision "bootstrap", type: "shell", path: "bootstrap.sh", env: env
```

- `env` đưa tham số xuống script qua biến môi trường. Script dùng `: "${NODE_IP:?}"` để **dừng ngay nếu thiếu biến** thay vì chạy tiếp với giá trị rỗng.
- Tên provisioner cho phép chạy riêng: `vagrant provision --provision-with bootstrap`.
- Master chạy `bootstrap` rồi `init-master`; worker chạy `bootstrap` rồi `join-worker`.
- Script chạy bằng **root** (mặc định).

### A1.5 Linked clone: tiện nhưng có cái bẫy

Với `linked_clone = true`, lần đầu Vagrant tạo một **VM gốc** (log: "Preparing master VM for linked clones", tên dạng `ubuntu-22.04-amd64_<số>`), chụp snapshot, rồi `k8s-master`, `k8s-worker` là các VM con chỉ lưu phần khác biệt so với gốc. Tài liệu VirtualBox provider của Vagrant xác nhận: linked clone chỉ dùng differencing disk, và VM gốc không bị Vagrant tự xoá.

- **Không bao giờ xoá hay tự bật VM gốc.** Các VM con phụ thuộc vào nó.
- VM con khi tạo nằm trong thư mục tạm `temp_clone_<số>`, rồi mới đổi tên thành `k8s-master`. Nếu việc này bị gián đoạn, bạn có VM "ma" hoặc thư mục rác chặn việc đổi tên.

### A1.6 Business case

**Bài toán:** cần cluster Kubernetes nhiều node để làm CI/CD, preview environment, monitoring, logging, với ngân sách ≈ $0.

| Phương án | Chi phí | Tái lập | Multi-node | Nhược điểm |
|---|---|---|---|---|
| Cloud (EC2/GCE) | $$ mỗi giờ | tốt (Terraform) | có | Ngân sách không cho; quên tắt là mất tiền |
| minikube / kind | 0 | tốt | hạn chế | Một node thật (barem 0.5đ), khác kubeadm thật |
| Cài tay trên VM | 0 | **kém** | có | Không chứng minh được "chạy lại từ đầu" |
| **Vagrant + kubeadm** | 0 | **tốt** | có | Tốn RAM host, phụ thuộc VirtualBox, chậm hơn container |

Giá trị cụ thể: (1) **tái lập = bằng chứng**: `vagrant destroy -f && vagrant up` chứng minh dựng được từ con số 0; (2) chi phí lỗi bằng 0, phá cluster khi học là bình thường; (3) hạ tầng là code trong git; (4) điều kiện cho bảng đo Fast-Lane: số đo trước/sau chỉ so sánh được khi môi trường giống hệt nhau.

**Giới hạn thành thật:** đây là môi trường học và rehearsal, không phải production (một master, ảo hoá lồng, đĩa ảo chậm, mạng host-only). Số đo CI/CD là *tương đối* (trước/sau), không phải số tuyệt đối để so với cloud.

**Giấy phép:** Vagrant của HashiCorp chuyển sang giấy phép BUSL từ 2023; dùng học tập/nội bộ không vướng. Tôi chưa kiểm tra lại điều khoản hiện hành, hãy đối chiếu trang giấy phép chính thức trước khi viết vào báo cáo.

### A1.7 Bảo mật

Bối cảnh: lab trên máy cá nhân. Mục tiêu là **không tạo thói quen xấu và không làm lộ thứ nhạy cảm**.

| Rủi ro | Vì sao nguy hiểm | Xử lý |
|---|---|---|
| `admin.conf`, `join-command.sh` nằm trong thư mục dự án | `admin.conf` là chứng chỉ **cluster-admin**; `join-command.sh` cho máy lạ gia nhập cluster (24h). `git add .` nhầm là lộ | `.gitignore`; không chụp màn hình có token/hash làm evidence |
| Box không ghim phiên bản | Rủi ro chuỗi cung ứng | Ghim `box_version` |
| Symlink từ VM ra host | VM bị chiếm quyền đọc/ghi file khác của host | `SharedFoldersEnableSymlinksCreate: false` |
| Script tải thứ chạy bằng root | Nguồn tải bị compromise thì cả cluster bị | Không dùng `curl \| bash`; key GPG tải riêng, repo apt ký bằng `signed-by`. Còn yếu: manifest Calico lấy theo **tag** (tag có thể bị di chuyển), cải tiến sau là ghim checksum |

**Bài học thực tế (xảy ra trong dự án):** thư mục `.vagrant/` có `private_key` của VM từng bị commit vào lịch sử git của repo cũ. Xoá file ở commit mới **không xoá** nó khỏi lịch sử; đó là lý do repo hiện tại được đẩy từ nhánh `--orphan` sạch và có `scripts/check-no-secrets.sh` quét cả lịch sử. Đã an toàn sẵn: Vagrant thay khoá SSH công khai bằng khoá ngẫu nhiên từng máy, cổng SSH forward `2222` chỉ bind `127.0.0.1`, mạng host-only không route ra LAN. Chấp nhận nhưng ghi trong báo cáo: một master (không HA), secret trong etcd chưa mã hoá.

### A1.8 Lỗi thực tế đã gặp

| Triệu chứng | Nguyên nhân | Bài học |
|---|---|---|
| `Timed out while waiting for the machine to boot` | Windows giữ tính năng ảo hoá (Hyper-V/WSL2/Memory Integrity); VirtualBox chạy chế độ chậm | Tăng timeout không sửa gốc |
| SSH vào "master" nhưng hostname là `vagrant`, không có `kubeadm` | Vào nhầm VM gốc của linked clone | Luôn `vagrant ssh master`, kiểm tra `hostname` |
| `VERR_ALREADY_EXISTS` khi đổi tên `temp_clone_...` | `destroy` bị gián đoạn (còn phiên SSH mở) | Đóng SSH/cửa sổ VM trước khi `destroy` |
| `VERR_FILE_NOT_FOUND`, `list vms` thấy `temp_clone_...` | VM "ma" | `VBoxManage unregistervm <uuid>` (không `--delete`), `closemedium`, xoá `.vagrant/` |
| Lệnh PowerShell báo `command not found` | Đang gõ trong Git Bash | Hai shell khác nhau, kiểm tra dấu nhắc |
| `kubectl` timeout tới `192.168.56.10:6443` | VM đang tắt sau khi host khởi động lại | `vagrant up`, chờ 1–3 phút (docs/04 Q1) |

### A1.9 Điểm yếu còn lại (tự phê bình)

1. Thư mục chia sẻ làm kênh trao đổi bí mật là đánh đổi đơn giản-đổi-lấy-an-toàn. Sạch hơn: worker lấy lệnh join qua SSH tới master.
2. Chưa có kiểm tra sức khoẻ chủ động giữa các VM ngoài vòng chờ file.

---

## A2. Kubernetes và kubeadm (Phase 1.2)

> Nền cho `infra/vagrant/bootstrap.sh` (chạy trên mọi node) và `init_master.sh` (chỉ master). Mục tiêu: hiểu **vì sao** mỗi bước tồn tại, để khi lỗi biết nhìn vào đâu.

### A2.1 Các thành phần

```
MASTER (control plane)                      WORKER
┌──────────────────────────────┐            ┌─────────────────────────┐
│ kube-apiserver  ← mọi thứ đều│            │ kubelet  ─ chạy pod     │
│   đi qua đây (kubectl, kubelet)           │ kube-proxy ─ luật Service│
│ etcd  ← kho trạng thái       │            │ containerd ─ chạy container
│ scheduler ← chọn node cho pod│            │ CNI (Calico) ─ mạng pod │
│ controller-manager ← vòng lặp│            └─────────────────────────┘
│   đưa thực tế về mong muốn   │
│ kubelet + containerd + Calico│
└──────────────────────────────┘
```

Ý tưởng cốt lõi là **vòng lặp đối chiếu (reconcile)**: bạn khai báo trạng thái mong muốn (Deployment 1 replica), controller liên tục so với thực tế và sửa. ArgoCD (C5) áp dụng đúng ý tưởng đó ở tầng cao hơn: so Git với cluster.

`kubeadm` chỉ là công cụ **khởi tạo**: nó sinh chứng chỉ, ghi manifest của apiserver/etcd/scheduler/controller-manager vào `/etc/kubernetes/manifests`, và kubelet chạy chúng như *static pod*. Vì vậy `init_master.sh` coi thư mục này không rỗng là dấu hiệu "init dở dang".

### A2.2 Mổ xẻ `bootstrap.sh` (7 bước)

| Bước | Làm gì | Vì sao |
|---|---|---|
| 1 | `swapoff -a` + comment `swap` trong `/etc/fstab` | kubelet mặc định từ chối chạy khi còn swap; sửa `fstab` để reboot không bật lại |
| 2 | Nạp `overlay`, `br_netfilter`; sysctl `bridge-nf-call-iptables`, `ip_forward` | `overlay`: lớp filesystem của container. `br_netfilter` + sysctl: để traffic qua bridge đi qua iptables (Service/NetworkPolicy dựa vào đó). `ip_forward`: node chuyển tiếp gói giữa pod |
| 3 | Ghi `/etc/hosts` | node gọi nhau bằng tên, không phụ thuộc DNS ngoài. Khối `# k8s-nodes-begin/end` bị xoá rồi ghi lại → idempotent |
| 4 | Cài `containerd.io` từ repo Docker | Dự án chọn containerd 2.x vì apt của Ubuntu 22.04 chỉ có 1.7 (script ghi chú đã EOL). Key GPG tải riêng, repo ký bằng `signed-by` |
| 5 | Cài `kubelet kubeadm kubectl` từ `pkgs.k8s.io` + `apt-mark hold` | repo theo **minor** (`v1.36`) nên không vô tình nhảy minor; `hold` chặn `apt upgrade` làm lệch phiên bản giữa các thành phần |
| 6 | `containerd config default`, `SystemdCgroup = true`, đồng bộ pause image, chờ socket sẵn sàng | xem A2.3 |
| 7 | `KUBELET_EXTRA_ARGS=--node-ip=...` | ép kubelet dùng IP host-only, tránh `10.0.2.15` của NAT (A1.4) |

Hai chi tiết đáng học trong cách viết script: biến `APT` có `DPkg::Lock::Timeout=300` (VM mới boot thường bị `unattended-upgrades` giữ khoá apt), và bước 6 **chờ socket thật sự nhận kết nối** thay vì tin `systemctl restart` ("tiến trình đã khởi động" ≠ "đã sẵn sàng").

### A2.3 Cgroup driver và pause image

- **cgroup** là cơ chế kernel giới hạn tài nguyên (CPU/RAM) cho nhóm tiến trình. Có hai "người quản lý" cgroup: `cgroupfs` (runtime tự quản) và `systemd`. Trên hệ dùng systemd, hai bên quản lý song song dễ gây bất ổn.
- Quy tắc từ tài liệu Kubernetes: **kubelet và runtime phải dùng cùng một cgroup driver**. Từ v1.22 kubeadm mặc định kubelet là `systemd`, nên containerd phải đặt `SystemdCgroup = true`. Lệch nhau thì pod crash-loop hoặc control plane chập chờn.
- **Pause image** (sandbox): container nhỏ giữ network namespace cho cả pod. Phiên bản kubeadm kỳ vọng và phiên bản cấu hình trong containerd nên khớp; script lấy từ `kubeadm config images list` rồi `sed` vào `config.toml` (containerd 1.x dùng khoá `sandbox_image`, 2.x dùng `sandbox`; script xử lý cả hai).

### A2.4 Mổ xẻ `init_master.sh`

1. **`DONE_MARK=/var/lib/k8s-init-done`** — chỉ tạo khi `kubeadm init` thành công hoàn toàn. Chỉ dựa vào `admin.conf` để bỏ qua init là sai: file này được ghi giữa chừng, init hỏng nửa vời vẫn để lại nó. Đây là bài học **idempotency**: chọn dấu hiệu "đã xong" chỉ xuất hiện *sau cùng*.
2. **Phát hiện dở dang → `kubeadm reset -f`** rồi xoá `/etc/cni/net.d` và `~/.kube`, sau đó `ensure_containerd` (reset có thể làm containerd chập chờn).
3. **`ensure_containerd`**: containerd chạy với `Restart=always` (chờ vài giây) nên chờ trước, chỉ restart khi chờ mà chưa lên.
4. **`kubeadm config images pull` trước, thử 3 lần**: tách việc tải image (phụ thuộc mạng) khỏi `init` (có timeout), tránh init timeout khi mạng chậm.
5. **`kubeadm init --apiserver-advertise-address=<IP host-only> --pod-network-cidr=10.244.0.0/16`**:
   - `advertise-address`: IP mà apiserver công bố cho node khác. Nếu để mặc định có thể lấy card NAT.
   - `pod-network-cidr`: dải IP cấp cho pod, **không được chồng lên mạng của node** (ghi chú trong script: không dùng `192.168.0.0/16` vì đè lên `192.168.56.0/24`). Dải này cũng là giá trị `TRUSTED_PROXIES=10.244.0.0/16` của chart (C4).
6. **Hàm `dump_diag`** khi init hỏng: in tải máy, container, log etcd/apiserver, kubelet, healthz. Thiết kế "lỗi phải tự giải thích".
7. **Calico**: cài từ manifest theo tag `v3.32.2`, rồi `kubectl set env daemonset/calico-node IP_AUTODETECTION_METHOD=cidr=192.168.56.0/24` — cùng vấn đề card mạng, ép Calico chọn IP theo dải host-only chứ không theo tên card (`eth1`/`enp0s8` khác nhau giữa môi trường).
8. **Xuất `join-command.sh` (token 24h) và `admin.conf` ra `/vagrant`** — chứa secret (A1.7).

### A2.5 CNI và trạng thái NotReady

Node ở trạng thái `NotReady` cho đến khi có plugin mạng (CNI) chạy; CoreDNS cũng `Pending` vì lý do đó. Đây không phải lỗi mà là thứ tự bình thường: `init` → cài CNI → node `Ready`. Calico vừa cấp IP cho pod vừa dựng đường định tuyến giữa các node.

### A2.6 Gỡ lỗi theo lớp (khi cluster lạ)

```
VM sống?            vagrant status            → mạng host-only?  ping 192.168.56.10
containerd sống?    systemctl status containerd; crictl ps
kubelet sống?       journalctl -u kubelet -n 50
apiserver sống?     curl -k https://192.168.56.10:6443/healthz
node Ready?         kubectl get nodes; kubectl -n kube-system get pods
```

Đi từ dưới lên: lớp nào hỏng thì không cần xem lớp trên.

### A2.7 Điểm yếu còn lại

- Manifest Calico theo tag, chưa ghim checksum.
- Một control plane: mất master là mất cluster (chấp nhận trong lab).
- Secret trong etcd chưa mã hoá.

---

# PHẦN B — ỨNG DỤNG (Paper Blocks API + web)

> Đọc cùng `docs/03-PHASE2-APP-PIPELINE-QUEST.md`. Mỗi mục: cần hiểu gì, vì sao dự án cần, bẫy thường gặp.

## B0. Bản đồ: kiến thức nào nối với phần nào của dự án

```
HTTP & REST ──▶ status code đúng ngữ nghĩa ──▶ ma trận 403/200/409 (barem Security)
AuthN/AuthZ ──▶ JWT + RBAC ───────────────────▶ barem "phân quyền user/admin"
Middleware  ──▶ log JSON, metrics, rate limit ─▶ Phase 7 Prometheus, Phase 8 EFK, barem 409
12-factor   ──▶ config qua env ────────────────▶ Phase 3 Helm/Secret
Probes      ──▶ /healthz, /readyz ─────────────▶ rolling update của ArgoCD
SQLite+PVC  ──▶ dữ liệu bền, 1 writer ─────────▶ replicas: 1, strategy Recreate
Docker      ──▶ multi-stage, cache layer ──────▶ bảng đo Fast-Lane (Phase 5)
Test        ──▶ table-driven, httptest ────────▶ stage "Test" trong Jenkinsfile
```

## B1. HTTP và REST

- **Idempotent**: gọi nhiều lần cho cùng kết quả. GET, PUT, DELETE idempotent; POST không. Hệ quả: bấm hai lần "gửi comment" ra hai comment.
- **Mã trạng thái cần thuộc:** 200, 201, 204, 400 dữ liệu sai, 401 chưa xác thực, 403 không đủ quyền, 404, 409 xung đột, 429 quá nhiều request.
- **Hai chỗ barem lệch chuẩn, phải ghi rõ trong báo cáo:**
  - Chuẩn: thiếu token → **401**. Barem: **403**.
  - Chuẩn: vượt giới hạn → **429**. Barem: **409** (chuẩn dùng 409 cho xung đột trạng thái).
  Làm theo barem nhưng phải giải thích được sự khác nhau; giám khảo thường hỏi đúng chỗ này.
- **Hệ quả:** giao diện không phân biệt "hết hạn token" với "bị cấm" vì cả hai là 403. Xử lý ở B9 (#4).

## B2. Xác thực và phân quyền

| Khái niệm | Câu hỏi nó trả lời | Trong dự án |
|---|---|---|
| AuthN | Bạn là ai? | đăng nhập GitHub (hoặc mật khẩu khi `passwordLogin: true`) đổi lấy JWT |
| AuthZ | Bạn được làm gì? | middleware kiểm `role` của token với route |
| RBAC | Quyền gắn theo vai trò | `user`: đọc, bình luận, sửa/xoá bình luận của mình; `admin`: thêm/xoá paper |

**JWT gồm 3 phần** `header.payload.signature`, mã hoá base64 (không phải mã hoá bí mật: **ai cũng đọc được payload**, chỉ không sửa được vì có chữ ký). Không bỏ dữ liệu nhạy cảm vào token.

Bẫy thường gặp:
- **Thuật toán `none` / nhầm thuật toán:** khi kiểm chữ ký phải ép đúng thuật toán (HS256), không tin trường `alg` của token. OWASP cũng cảnh báo không tin khoá/thuật toán do chính token khai báo, và khuyên kiểm `iss`, `aud`.
- **Secret yếu hoặc nằm trong repo:** đọc từ biến môi trường, sinh ngẫu nhiên đủ dài. Trên cluster nằm trong Secret `paper-blocks-secrets` tạo bằng `kubectl`, **không vào git**. (Bài học: `run-local.bat` đang cứng secret → không commit.)
- **Token không thu hồi được:** JWT hợp lệ tới khi hết hạn → đặt hạn ngắn.
- **`localStorage` dễ bị XSS đánh cắp token.** Lab chấp nhận, ghi là đánh đổi; cookie `HttpOnly` an toàn hơn với XSS nhưng kéo theo CSRF.
- **So sánh mật khẩu:** băm, so sánh thời gian không đổi.
- **Chữ ký ≠ bí mật:** JWT đã ký vẫn đọc được; muốn cả bí mật thì phải mã hoá thêm (JWE), thường không cần cho app này.

## B3. Middleware và thứ tự chạy

Thứ tự thực tế của API: `recover → request-id → log → metrics → (rate-limit | auth) → handler`.

- `log` và `metrics` **ngoài** rate-limit/auth để ghi cả request bị từ chối (403, 409); đặt sau thì các lần bị chặn biến mất khỏi dữ liệu, đúng thứ cần thấy khi điều tra tấn công.
- Rate limit đặt **trước** auth cho endpoint công khai; không cần xác thực mới tính được.
- `recover` ngoài cùng: handler panic không được làm sập server.

## B4. Rate limiting

| Thuật toán | Cách hoạt động | Nhược điểm |
|---|---|---|
| Fixed window | Đếm trong cửa sổ cố định mỗi phút | Dồn 10 request cuối phút trước + 10 đầu phút sau = 20 trong vài giây |
| Sliding window | Đếm trong "60 giây gần nhất" | Tốn bộ nhớ hơn |
| Token bucket | Xô đổ đầy dần, mỗi request lấy một | Khó giải thích với barem "10 request/phút" |

Barem "quá 10 request trong 1 phút" → fixed hoặc sliding đều đáp ứng; chọn cái đơn giản, dễ kiểm thử, **ghi rõ nhược điểm**.

Giới hạn trong dự án (xem `server.go`): `/status` 10/phút theo IP (barem); comment 5/phút theo **tài khoản**; view 5/phút theo (IP, paper); login 20/phút. Mỗi loại khoá khác nhau vì mục tiêu khác nhau: chống dò quét (IP), chống spam (tài khoản), chống tăng view ảo (IP+paper).

Giới hạn thật cần biết:
- **Theo IP**: sau NodePort/Ingress/HAProxy, thứ app thấy có thể là IP của proxy. Phải đọc `X-Forwarded-For` và **chỉ tin header khi request đến từ proxy của mình** (`TRUSTED_PROXIES`); nếu không, kẻ tấn công tự gửi header giả để lách. Với NodePort còn phụ thuộc `externalTrafficPolicy: Local` (C4).
- **In-memory**: mỗi pod đếm riêng; 2 pod → giới hạn thực tế ≈ 20/phút. Lý do `replicas: 1`. Production đúng: kho dùng chung (Redis) hoặc rate limit ở Ingress.
- **Dọn bộ nhớ:** bản đồ khoá phải dọn định kỳ, nếu không là rò bộ nhớ.

## B5. Quan sát được (observability)

- **Metrics** có 3 loại chính: counter (chỉ tăng), gauge (lên xuống), histogram (phân bố thời gian). Theo tài liệu Prometheus: dùng đơn vị cơ bản (giây, byte) trong tên; không nhét tên label vào tên metric; hậu tố `_total`, `_sum`, `_count`, `_bucket` dành riêng cho counter/summary/histogram; `le` và `quantile` là label dành riêng.
- **Cardinality** là bẫy lớn nhất: label `path` phải là *mẫu route* (`/papers/:id`), không phải đường dẫn thật. Mỗi id sinh một chuỗi thời gian mới thì Prometheus phình bộ nhớ. Tài liệu Prometheus cũng khuyên không dùng user ID/email làm label.
- **Summary không gộp (aggregate) được** giữa các instance; ưu tiên histogram + `histogram_quantile`.
- **Metric có sẵn trong app:** `http_requests_total`, `paper_views_total`, `comments_total{action=created|replied|edited|deleted}`, bộ đếm từ chối authz theo lý do.
- **Log JSON có cấu trúc**: Elasticsearch parse trực tiếp, tìm theo `path`, `method`, `status` đúng yêu cầu barem. `request_id` nối các dòng log của một request.
- **Không ghi vào log:** token, mật khẩu, header `Authorization`, nội dung nhạy cảm.

## B6. Đóng gói theo 12-factor

- **Config qua biến môi trường** (`DB_PATH`, `WEB_DIR`, `JWT_SECRET`, `TRUSTED_PROXIES`...). Cùng một image chạy ở local, preview, prod chỉ khác biến.
- **Log ra stdout**, không ghi file (yếu tố XI của 12factor): môi trường chạy thu và định tuyến luồng sự kiện; app không biết đích. Nền cho Phase 8.
- **Stateless — vi phạm có chủ đích:** dữ liệu nằm trong SQLite trên PVC (B7), nên chỉ chạy **một** bản; ghi là nợ kỹ thuật.
- **Graceful shutdown:** nhận SIGTERM → ngừng nhận request mới, xử lý nốt request đang chạy, thoát. Không có thì mỗi lần cập nhật rớt một số request.
- **Hai loại probe:** `liveness` ("còn sống không", sai thì bị restart) và `readiness` ("nhận traffic được chưa", sai thì bị rút khỏi Service). Đừng gộp; probe sai gây vòng lặp restart.

## B7. SQLite, upload và GitHub OAuth

**SQLite (`modernc.org/sqlite`, thuần Go, không cần CGO).** Cấu hình dự án dùng: một connection, WAL, `foreign_keys ON`.
- WAL cho phép nhiều reader cùng lúc với **một** writer; writer thứ hai phải chờ. Vì vậy một pod là hợp lý và một connection là đủ cho quy mô này.
- WAL cần các file `-wal`/`-shm` cùng thư mục, và **không hỗ trợ trên network filesystem khi các client ở máy khác nhau**. Đây là lý do dùng PVC `ReadWriteOnce` cục bộ (C3) chứ không phải NFS dùng chung nhiều pod.
- **Migration idempotent:** kiểm `pragma_table_info` rồi mới `ALTER TABLE ADD COLUMN`, để cùng một code nâng cấp được DB cũ lẫn tạo DB mới (test `TestMigrateUpgradesOldDatabase`).
- **Tìm kiếm an toàn:** tham số hoá câu SQL; `LIKE` có `ESCAPE` để `%`/`_` người dùng gõ không thành ký tự đại diện; tag tách bằng `json_each`.

**Upload PDF.** Khung nguyên tắc (OWASP File Upload): allowlist loại file, kiểm loại thật chứ không tin `Content-Type`, tự sinh tên file phía server, đặt ngoài webroot, giới hạn kích thước. Chi tiết dự án đang làm gì: đối chiếu `handlers.go`. Lỗi đã gặp ở ma trận kiểm thử (curl mã `000`) là do đường dẫn `/tmp` mà `curl.exe` trên Windows không đọc được — lỗi môi trường, không phải logic upload (docs/03 P3).

**GitHub OAuth (web application flow).**
1. Chuyển người dùng sang GitHub kèm `client_id`, `redirect_uri`, `state`.
2. GitHub chuyển về `redirect_uri` với `code` và `state`.
3. Server đổi `code` + `client_secret` lấy access token, gọi API lấy danh tính (`gh:chuitrai`).
- **`state`** là chuỗi ngẫu nhiên không đoán được để chống CSRF; không khớp thì huỷ.
- **`redirect_uri`** với OAuth App phải khớp callback URL đã đăng ký. Cụm k8s có origin khác (`http://192.168.56.11:30080`) nên cần **OAuth App thứ hai**; app local và app cụm không dùng chung được callback.
- `client_secret` chỉ ở phía server (Secret), không bao giờ vào code web.
- Chưa kiểm chứng: GitHub chấp nhận callback `http://` trên IP không phải `localhost` (Phụ lục).

## B8. Docker cho Go

- **Multi-stage:** build trong image có compiler, copy file chạy sang image nhỏ. Pull nhanh hơn, ít bề mặt tấn công. Tài liệu Docker còn nêu: nhiều stage có thể build song song.
- **Thứ tự lớp quyết định tốc độ build:** copy `go.mod`/`go.sum` và tải dependency **trước**, copy mã nguồn **sau**. Một lớp đổi thì mọi lớp sau nó bị build lại. Đây là cơ chế đo ở Phase 5, nên Dockerfile phải đúng ngay từ đầu để baseline công bằng.
- **`.dockerignore`** thu nhỏ build context → ít nguyên nhân làm mất cache.
- **Chạy bằng user không phải root**; không đưa secret vào image (nằm lại trong lịch sử lớp).
- **Ghim phiên bản image gốc** (`golang:1.26-alpine`, không `latest`), cùng lý do tái lập như box Vagrant. Bài học thực tế: Dockerfile ghi `1.23` trong khi `go.mod` yêu cầu `1.26` → build hỏng.
- **Web (nginx):** CSP `default-src 'self'` nên thư viện three.js phải **vendor** vào repo, không tải từ CDN.

## B9. Tình huống business/product

| # | Tình huống | Hậu quả nếu bỏ qua | Cách xử lý |
|---|---|---|---|
| 1 | Pod restart | Dữ liệu in-memory mất | Dữ liệu ở SQLite trên PVC; PVC được bảo vệ khỏi prune/xoá (C3) |
| 2 | Người dùng bấm "gửi" hai lần | Hai comment trùng | Vô hiệu nút khi đang gửi; rate limit comment theo tài khoản |
| 3 | Hai admin cùng xoá một paper | Người sau nhận lỗi bất ngờ | DELETE idempotent: 404 cho paper đã mất, giao diện coi như xong |
| 4 | Token hết hạn giữa phiên, API trả 403 (theo barem) | Giao diện tưởng bị cấm quyền | Có token mà 403 ở thao tác đọc → thử đăng nhập lại; hoặc header lý do (`X-Auth-Reason`) để phân biệt |
| 5 | Nhiều người chung một IP (văn phòng, NAT) | Một người dùng nhiều làm cả nhóm bị 409 | Ghi giới hạn; production nên giới hạn theo tài khoản (như comment đang làm) |
| 6 | Giả header `X-Forwarded-For` | Lách rate limit | Chỉ tin khi đến từ proxy tin cậy |
| 7 | Đoán mật khẩu hàng loạt | Lộ tài khoản | Giới hạn riêng cho login; khoá tạm sau N lần sai |
| 8 | Comment chứa `<script>` | XSS | Giao diện dùng `textContent`, không `innerHTML`; CSP chặn script ngoài; server giới hạn độ dài |
| 9 | Gửi body/PDF khổng lồ | Hết RAM/đĩa | Giới hạn kích thước ở server |
| 10 | Rolling update: web mới gọi api cũ | Lỗi tạm thời | API tương thích ngược; đổi API theo hai bước (thêm trước, bỏ sau) |
| 11 | Deploy lúc đang có request | Rớt request | Graceful shutdown + readiness probe |
| 12 | Đổi `JWT_SECRET` | Mọi token cũ vô hiệu | Chủ động, thông báo; muốn không gián đoạn cần hỗ trợ hai khoá cùng lúc |
| 13 | Đồng hồ VM lệch (sau khi laptop ngủ) | Token "chưa hợp lệ"/hết hạn sớm | Cho phép lệch nhỏ (leeway) khi kiểm hạn |
| 14 | Alert theo số lượng 403 | Báo động giả hoặc bỏ lỡ tấn công | Tách counter theo lý do (`no_token`, `bad_token`, `role`, `owner`) |
| 15 | Log lỡ ghi token | Lộ credential qua hệ thống log | Không ghi header `Authorization`; rà lại trước khi bật EFK |
| 16 | Repo công khai làm CV chứa secret/khoá cũ trong lịch sử | Lộ khoá dù đã xoá file | `check-no-secrets.sh` quét cả lịch sử; đẩy từ nhánh `--orphan` sạch; đổi repo cũ về Private |
| 17 | Người xem F5 liên tục để tăng view | Số liệu thống kê sai | Giới hạn view theo (IP, paper) |

## B10. Kiểm thử

- **Table-driven test** trong Go: bảng (method, đường dẫn, token) → mã mong đợi; chạy bằng `httptest` không cần mở cổng. Chính là ma trận kiểm thử của kế hoạch.
- **Race detector** (`go test -race`): bộ đếm rate limit được nhiều goroutine truy cập, phải có mutex; cờ này bắt lỗi truy cập đồng thời.
- Test rate limit cần **đồng hồ giả** (truyền thời gian vào hàm), nếu không phải chờ thật 60 giây.
- Ba tầng: test đơn vị → test HTTP (middleware + handler) → ma trận `curl` (`check-matrix.sh`) trên bản chạy thật. Tầng cuối chỉ chứng minh tích hợp, không thay hai tầng đầu.
- **Tải thật bằng k6** (`bench/k6/traffic.js`): ba kịch bản readers/commenters/abusers, mỗi kịch bản khai báo mã trạng thái *mong đợi* (abusers được phép nhận 409). Mục đích là tạo dữ liệu cho Prometheus/EFK, không phải benchmark hiệu năng.

---

# PHẦN C — PHASE 3: HELM, STORAGE, GITOPS, ARGOCD

## C1. Image, registry, tag và digest

- Tên image: `[registry/]namespace/repo:tag`, ví dụ `docker.io/<user>/paper-blocks-api:0.1.0`. Bỏ phần registry thì mặc định Docker Hub.
- Image là **danh sách lớp (layer)** + **manifest** mô tả các lớp + **config**. Registry lưu lớp theo nội dung, nên hai image dùng chung lớp thì chỉ tải một lần.
- **Tag có thể đổi (mutable)**: `0.1.0` hôm nay có thể trỏ image khác ngày mai nếu ai đó push đè. **Digest** (`sha256:...`) là băm của manifest, **bất biến**: cùng digest = cùng nội dung. Hệ quả thiết kế: mỗi bản phát hành một tag riêng, **không dùng `latest`** và không push đè tag đã dùng — đúng nguyên tắc "versioned and immutable" của GitOps (C5).
- Node k8s kéo image bằng containerd, không bằng Docker. `imagePullPolicy` mặc định: tag khác `latest` → `IfNotPresent`.
- Ràng buộc nền tảng: cluster là `amd64`; build image khác kiến trúc (ví dụ máy ARM) sẽ lỗi `exec format error`. Nút Oracle ARM (kế hoạch sau) sẽ cần image đa kiến trúc hoặc nhãn node.
- Script `infra/k8s/02-push-images.sh`: bạn đã có phần giải thích từng lệnh trong phiên trước.

## C2. Helm

**Helm = trình tạo YAML có tham số + quản lý "bản phát hành" (release).** Chart gồm `Chart.yaml` (metadata), `values.yaml` (mặc định), `templates/` (YAML có chỗ trống Go template). `helm template` chỉ in YAML, `helm install` thì áp vào cluster và ghi lại release.

Công cụ bạn dùng trong chặng B: `helm lint`, `helm template`, rồi `03-helm-smoke.sh` cài thử.

**Cú pháp đáng nhớ trong chart này (`app/chart/paper-blocks`):**

| Cú pháp | Ý nghĩa | Bẫy |
|---|---|---|
| `{{ .Values.api.tag }}` | Đọc giá trị | Thiếu khoá → rỗng, im lặng. Dùng `required` cho thứ bắt buộc |
| `{{- ... -}}` | Cắt khoảng trắng/xuống dòng hai bên | YAML nhạy khoảng trắng; sai là lệch thụt lề |
| `{{ include "x" . \| nindent 4 }}` | Chèn named template rồi xuống dòng + thụt 4 | `include` dùng được trong pipeline, `template` thì không |
| `toYaml` + `nindent` | Chèn nguyên map/list | Số thụt phải lớn hơn thụt của khoá cha |
| `_helpers.tpl` | Chứa named template dùng chung | Tên template là **toàn cục** → tiền tố bằng tên chart |

**Các quyết định thiết kế trong chart và lý do:**

1. **Service tên cố định `api` và `web`**; nginx proxy tới `http://api:8080`. Tên cố định giúp web trỏ API không phụ thuộc tên release. Đổi lại: không cài hai release trong cùng namespace (preview env dùng namespace riêng, D2).
2. **api: `replicas: 1`, `strategy: Recreate`.** SQLite có một writer và rate limit nằm trong bộ nhớ (B4, B7). `Recreate` tắt hết pod cũ *trước* khi tạo pod mới — phù hợp volume một writer; `RollingUpdate` sẽ có lúc hai pod cùng mở một file DB.
3. **Checksum ConfigMap trong annotation của pod**: ConfigMap đổi thì băm đổi → pod template đổi → Deployment tự rollout. Không có thì sửa ConfigMap xong pod vẫn dùng cấu hình cũ.
4. **Secret `paper-blocks-secrets` tạo bằng `kubectl`, không nằm trong chart/git.** Chart chỉ *tham chiếu* tên Secret. Đánh đổi: Secret không được GitOps quản lý (ArgoCD không thấy drift của nó). Cách nâng cấp sau: SealedSecrets/External Secrets.
5. **`readOnlyRootFilesystem` + `emptyDir` ở `/tmp` + PVC ở `/data`**: container không ghi được ngoài hai chỗ cần; kẻ chiếm được tiến trình khó cài thứ gì lên đĩa.
6. **Probe `/healthz` (liveness) và `/readyz` (readiness)** tách riêng (B6).

## C3. Storage: PVC và StorageClass

```
Pod ──dùng──▶ PVC (yêu cầu: 1Gi, RWO) ──gắn với──▶ PV (đĩa thật) ◀──tạo bởi── StorageClass (local-path)
```

- **PVC** là "đơn xin đĩa" của pod; **PV** là đĩa thật; **StorageClass** là công thức tự tạo PV khi có PVC (dynamic provisioning).
- **local-path-provisioner** tạo PV là một thư mục trên **đĩa của một node cụ thể**. Hệ quả: dữ liệu *gắn với node*. Pod bị xếp sang node khác sẽ không thấy dữ liệu; trong cluster 1 worker này thì pod luôn ở worker, nhưng khi thêm node Oracle ARM phải ghim pod bằng nhãn/affinity. (Kiến thức này từ cách local-path hoạt động nói chung; tôi chưa mở tài liệu dự án đó, xem "chưa kiểm" ở F-list.)
- **`volumeBindingMode: WaitForFirstConsumer`** (nếu StorageClass đặt vậy): PVC ở trạng thái `Pending` đến khi có pod dùng nó — **đây là bình thường**, không phải lỗi. Đó là kết quả bạn thấy ở chặng B khi PVC chưa gắn.
- **`reclaimPolicy: Delete`** (mặc định của StorageClass theo tài liệu K8s, và `local-path` của cụm bạn đúng như vậy): xoá PVC → xoá luôn PV và dữ liệu. Với SQLite chứa dữ liệu thật, đây là rủi ro lớn nhất của chart.
- **Hai lớp bảo vệ trong chart:**
  - `helm.sh/resource-policy: keep` → `helm uninstall` không xoá PVC.
  - `argocd.argoproj.io/sync-options: Prune=false,Delete=false` → ArgoCD không prune PVC khi nó biến mất khỏi Git, và không xoá PVC khi xoá Application. Tài liệu ArgoCD: annotation ở mức tài nguyên ghi đè chính sách của Application.
  - Đánh đổi của `Prune=false`: nếu thật sự muốn bỏ PVC, ArgoCD báo `OutOfSync` và bạn phải xoá tay — đó là chủ ý.
- Truy cập `ReadWriteOnce` (RWO): một node gắn tại một thời điểm. Khớp với `replicas: 1`.

## C4. Service, NodePort và IP client

- Loại Service: `ClusterIP` (nội bộ), `NodePort` (mở một cổng 30000–32767 trên **mọi** node), `LoadBalancer` (cần cloud/MetalLB). Barem Phase 3 yêu cầu ArgoCD và Jenkins ở NodePort; dự án chọn web `30080`, ArgoCD `30081`.
- **`externalTrafficPolicy`**:
  - `Cluster` (mặc định): kube-proxy có thể chuyển gói sang node khác và **SNAT** → app thấy IP node, không thấy IP client thật.
  - `Local`: chỉ gửi tới pod *trên cùng node*, **giữ IP client**; node không có pod thì **bỏ gói**. Đây là lý do client phải gọi đúng IP worker (`192.168.56.11`) chứ không phải master.
- Vì sao quan trọng: rate limit theo IP (B4) cần IP thật. Chart đặt `Local` và `TRUSTED_PROXIES=10.244.0.0/16` (dải pod, A2.4).
- Ở Phase 9, HAProxy + Ingress sẽ thêm hai tầng proxy nữa; IP thật sẽ nằm trong `X-Forwarded-For` và logic "chỉ tin proxy của mình" phải được kiểm lại.
- ArgoCD chạy `server.insecure` (HTTP) vì TLS sẽ do Ingress làm sau; đừng mở ra Internet ở dạng này.

## C5. GitOps và ArgoCD

**Bốn nguyên tắc OpenGitOps (v1.0):**
1. **Declarative** — trạng thái mong muốn là khai báo, không phải kịch bản các bước.
2. **Versioned and immutable** — lưu ở nơi có lịch sử, không sửa tại chỗ (→ không `latest`).
3. **Pulled automatically** — tác nhân *kéo* trạng thái về, không bị *đẩy* từ CI.
4. **Continuously reconciled** — tác nhân liên tục so sánh và sửa lệch (drift).

**Ý nghĩa với dự án:** Jenkins (Phase 4) *không* chạy `kubectl apply`. Nó chỉ build, push image rồi **sửa một dòng tag trong repo config**; ArgoCD phát hiện và kéo về. Hai lợi ích: cluster không cần cho CI quyền admin, và mọi thay đổi triển khai đều là một commit → có lịch sử, rollback = `git revert`.

**Vì sao tách repo app và repo config:**
- Commit "đổi tag" của CI không kích hoạt lại CI của app (tránh vòng lặp vô hạn).
- Lịch sử triển khai tách khỏi lịch sử code; quyền ghi có thể khác nhau.
- Repo config chỉ chứa giá trị (`values-prod.yaml`) và định nghĩa `Application`; chart nằm ở repo app.

**Application multi-source của dự án** (`config/apps/paper-blocks.yaml`):

```yaml
sources:
  - repoURL: https://github.com/chuitrai/paper-blocks.git      # chart
    path: app/chart/paper-blocks
    helm:
      valueFiles: [ $values/values-prod.yaml ]                  # $values = gốc repo config
  - repoURL: https://github.com/chuitrai/paper-blocks-config.git
    ref: values                                                 # đặt tên "values"
syncPolicy:
  automated: { prune: true, selfHeal: true }
  syncOptions: [ CreateNamespace=true ]
```

Quy tắc từ tài liệu: `$values` chỉ dùng ở **đầu** đường dẫn; nguồn có `ref` thì **không** được có `chart`; nếu nguồn `ref` không có `path` thì chỉ dùng làm nơi lấy file values.

**Chính sách đồng bộ:**
- `automated` không prune mặc định → dự án bật `prune: true` để tài nguyên bị xoá khỏi Git cũng bị xoá khỏi cluster.
- `selfHeal: true` → ai sửa tay trong cluster thì ArgoCD sửa lại. Bẫy khi debug: bạn `kubectl edit` rồi bị ghi đè sau vài giây; muốn thử nghiệm phải tạm tắt auto-sync.
- `CreateNamespace=true` → tự tạo namespace đích.
- Chu kỳ polling mặc định cỡ vài phút (tài liệu các bản khác nhau ghi 120s+jitter hoặc 180s); muốn tức thì dùng webhook hoặc bấm Refresh/Sync.
- Trạng thái cần phân biệt: `Synced` / `OutOfSync` (Git ≠ cluster) và `Healthy` / `Progressing` / `Degraded` (tài nguyên chạy có ổn không). Hai trục độc lập.

**Lấy mật khẩu admin ban đầu của ArgoCD** (đã hỏi ở phiên trước):

```bash
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d
```

Tên người dùng là `admin`. Nên đổi mật khẩu rồi xoá Secret này.

---

# PHẦN D — CI/CD

## D1. Jenkins và luồng CI theo tag

**Luồng mục tiêu (barem 1.5đ):**

```
git tag v0.2.0 → push tag ─▶ Jenkins (webhook/quét tag)
   ├─ Test (go test) ─┐ song song
   ├─ Lint / scan ────┤
   └─ Build image ────┘
        └─ Push Docker Hub: api:0.2.0, web:0.2.0
              └─ Sửa tag trong repo config (commit + push)
                    └─ ArgoCD (pull) ─▶ rollout lên cluster
```

**Jenkins cần biết:**
- **Jenkinsfile khai báo (declarative)**: `pipeline { agent … stages { stage(...) { steps {...} } } }`. Mỗi stage chứa đúng một trong `steps`, `stages`, `parallel` hay `matrix`; không lồng `parallel` trong `parallel`. `failFast true` dừng các nhánh song song khi một nhánh hỏng. `when { ... }` để chạy stage có điều kiện (ví dụ chỉ khi là tag).
- **Agent trên Kubernetes**: plugin Kubernetes tạo **một pod cho mỗi lần build** rồi xoá; khai báo bằng `agent { kubernetes { yaml ... } }` hoặc `podTemplate`. Container `jnlp` được plugin tự thêm. Ưu điểm: agent sạch, tái lập. Nhược: **mất cache cục bộ mỗi lần** → lý do cần cache ngoài ở D2.
- **Helm chart Jenkins** (`jenkinsci/helm-charts`): bật persistence mặc định, home ở `/var/jenkins_home`, PVC `ReadWriteOnce` 8Gi mặc định; đổi bằng `persistence.size/storageClass`. Thêm pod template qua `agent.podTemplates`. Với chặng E, NodePort đặt qua `controller.serviceType/nodePort` (tên khoá: đối chiếu `VALUES.md` đúng phiên bản chart; tôi chưa kiểm).
- **Credentials**: Docker Hub token và token đẩy vào repo config phải lưu trong Jenkins Credentials, đưa vào pipeline bằng `withCredentials`; không ghi vào Jenkinsfile, và đảm bảo log không in ra (kiểm tra trước khi bật EFK).
- **Chống vòng lặp**: Jenkins sửa repo *config*, không phải repo *app*, nên không tự kích hoạt lại chính nó.
- **Điều chưa chắc (cần kiểm ở Phase 4):** cách kích hoạt theo *tag* (Multibranch Pipeline với "discover tags" hay job riêng với webhook) và hành vi chính xác với phiên bản Jenkins bạn cài.

## D2. Fast-Lane: build nhanh và preview env

> Lớp "mới" ngoài barem. Nguyên tắc số một: **đo baseline trước khi tối ưu** (`bench/baseline-build.sh` → `bench/results/baseline.csv`). Chưa có số "trước" thì mọi con số "sau" vô nghĩa.

**Ba nguồn chậm của build trong CI:**
1. Lớp dependency tải lại mỗi lần (agent mới, không có cache).
2. Build cả hai image dù chỉ đổi một.
3. Các stage chạy tuần tự dù độc lập.

**Kỹ thuật tương ứng:**

| Kỹ thuật | Cơ chế | Lưu ý |
|---|---|---|
| Sắp xếp Dockerfile | Ít đổi ở trên, hay đổi ở dưới (B8) | Miễn phí, làm trước |
| **Registry cache** | `--cache-to type=registry,ref=...,mode=max` và `--cache-from type=registry,ref=...` | Cache là một image riêng trong registry; `mode=max` giữ cả lớp trung gian của multi-stage (mặc định `min` chỉ giữ lớp của image cuối). Import thất bại thì build vẫn tiếp tục. Backend `registry` cần driver `docker-container` (hoặc containerd image store) |
| **Affected-only** | So sánh `git diff` để biết api/web đổi hay không, bỏ qua cái không đổi | Cẩn thận: đổi chart/CI config có thể cần build lại cả hai |
| **Song song hoá** | `parallel { stage(api) stage(web) }` (D1) | Pod agent nhỏ trên cluster 8GB: song song quá mức gây OOM |
| Cache mount | `RUN --mount=type=cache` cho `go build` | Chỉ giúp khi cache tồn tại giữa các build |

**Cách báo cáo cho trung thực:** cùng máy, cùng điều kiện mạng; ghi cả lần *lạnh* (cold), *ấm* (warm) và *đổi một dòng code*; lặp nhiều lần, báo trung vị chứ không báo lần đẹp nhất; nói rõ đây là số **tương đối** trên VirtualBox (A1.6).

**Preview env theo PR (Phase 6):**
- `ApplicationSet` với **Pull Request generator** hỏi API của GitHub để liệt kê PR đang mở, sinh một `Application` cho mỗi PR; PR đóng thì generator không còn trả về PR đó và Application tương ứng bị gỡ (việc namespace/tài nguyên có bị dọn theo hay không phụ thuộc cấu hình prune và finalizer — cần thử ở Phase 6). Có thể lọc theo nhãn (`preview`) để chỉ PR được gắn nhãn mới có môi trường.
- Template dùng `{{.number}}`, `{{.branch}}`, `{{.head_sha}}` để đặt tên namespace và ghim tag image theo commit.
- **Chu kỳ quét mặc định rất dài** (`requeueAfterSeconds` mặc định 30 phút); muốn nhanh thì đặt thấp hơn hoặc dùng webhook. Cú pháp khác nhau giữa các phiên bản (bản cũ `{{branch}}`, bản mới có `goTemplate` và `{{.branch}}`) → kiểm tra đúng phiên bản ArgoCD đã cài (chart `10.12.0`).
- **Ràng buộc tài nguyên:** mỗi preview là một cặp pod api+web + một PVC; với cluster 8GB phải giới hạn số PR đồng thời và đặt `resources.requests` nhỏ. Preview dùng dữ liệu seed riêng, **không** dùng chung PVC với prod.
- **Rủi ro bảo mật:** môi trường preview chạy code của PR trên cluster của bạn, nên đừng tạo cho PR từ người lạ/fork một cách tự động. Lọc theo nhãn `preview` (do người có quyền gắn) là một cổng kiểm soát hợp lý.

---

# PHẦN E — TỰ KIỂM TRA TỔNG HỢP

Làm theo khối đọc (xem bảng đầu file). Trả lời bằng lời của mình, rồi mới mở đáp án.

**Khối 1 — GitOps/ArgoCD/Storage**

1. Jenkins sửa tag trong repo config thay vì chạy `kubectl apply`. Hai lợi ích và một rủi ro mới nảy sinh?
2. Đặt `selfHeal: true`, bạn `kubectl edit deployment` để thử nghiệm. Chuyện gì xảy ra và làm sao thử nghiệm đúng cách?
3. Xoá hẳn khối PVC khỏi chart trong Git. Với cấu hình hiện tại ArgoCD làm gì với PVC, và vì sao đó là chủ ý?
4. PVC ở trạng thái `Pending` ngay sau khi cài chart. Khi nào đó là bình thường?
5. Vì sao `$values/values-prod.yaml` hợp lệ còn `./$values/x.yaml` thì không?

**Khối 2 — Helm**

6. `template` và `include` khác nhau ở đâu, vì sao chart dùng `include ... | nindent`?
7. Sửa ConfigMap mà pod không đổi cấu hình. Chart xử lý điều này bằng cách nào?
8. Vì sao `strategy: Recreate` và không phải `RollingUpdate` cho api?

**Khối 3 — Kubernetes/kubeadm**

9. Hai VM đều có `10.0.2.15`. Nêu **hai** chỗ trong script Phase 1 ép dùng IP host-only.
10. Vì sao đặt `--pod-network-cidr=192.168.0.0/16` sẽ hỏng cluster này?
11. Node `NotReady` ngay sau `kubeadm init` có phải lỗi không?
12. Vì sao `init_master.sh` không dùng "có `admin.conf` thì bỏ qua init"?

**Khối 4–5 — Jenkins/Docker/Fast-Lane**

13. Agent Jenkins là pod dùng một lần. Điều đó làm gì với cache build Docker và cách khắc phục?
14. `mode=min` và `mode=max` của registry cache khác nhau thế nào với Dockerfile nhiều stage?
15. Vì sao phải chạy `baseline-build.sh` *trước* khi sửa Dockerfile/pipeline để tối ưu?
16. Preview env: mặc định bao lâu ApplicationSet mới thấy PR mới, và hai cách rút ngắn?

**Khối 6–7 — Ứng dụng/bảo mật/quan sát**

17. `log` và `metrics` vì sao nằm ngoài rate-limit/auth?
18. Thiếu token và token đúng nhưng role `user` gọi `DELETE` đều trả 403. Phân biệt trong metrics thế nào?
19. Vì sao sửa một dòng code không nên làm Docker tải lại dependency?
20. Chạy 2 pod thì rate limit 10/phút thực tế thành bao nhiêu, vì sao?
21. Token hết hạn trả 403 theo barem, giao diện nên làm gì?
22. Vì sao `path` trong label metric phải là mẫu route?
23. Vì sao SQLite WAL + một pod hợp lý, còn NFS dùng chung nhiều pod thì không?
24. `state` trong OAuth chống tấn công gì?

**Khối 8 — Vagrant**

25. Vì sao `vagrant up` lần hai không cài lại containerd? Muốn ép chạy lại dùng lệnh nào, và vì sao script phải idempotent?
26. Bỏ `box_version` thì rủi ro gì sau 6 tháng và liên quan gì tới "tái lập"?
27. Vì sao không được xoá VM `ubuntu-22.04-amd64_...`?
28. Tăng `boot_timeout` lên 3000 có sửa lỗi timeout khi boot không?

<details>
<summary>Đáp án gợi ý</summary>

1. Lợi ích: cluster không cấp quyền admin cho CI; mọi thay đổi triển khai là một commit (có lịch sử, rollback bằng revert). Rủi ro mới: CI giờ có token **ghi vào repo config** — token đó phải ở Jenkins Credentials, quyền tối thiểu, và không được in ra log.
2. ArgoCD thấy lệch so với Git và ghi đè lại sau vài giây (mặc định self-heal chờ ~5s). Thử nghiệm đúng: tạm tắt auto-sync cho Application, hoặc thử bằng sửa trong Git/nhánh.
3. Không xoá, vì annotation `Prune=false,Delete=false`; Application chuyển `OutOfSync`. Chủ ý vì `local-path` có `reclaimPolicy: Delete` — xoá PVC là mất dữ liệu SQLite.
4. Khi StorageClass dùng `WaitForFirstConsumer`: PVC chờ đến lúc có pod dùng. Chỉ đáng lo nếu pod đã chạy mà PVC vẫn Pending.
5. `$values` chỉ được dùng ở **đầu** đường dẫn và nó resolve tới gốc repo được `ref`.
6. `template` là action, đầu ra không đưa qua pipe được nên không thụt lề được; `include` là hàm, đưa được vào `| nindent N`.
7. Annotation chứa checksum của ConfigMap trên pod template: ConfigMap đổi → checksum đổi → pod template đổi → rollout.
8. SQLite một writer: `RollingUpdate` có thể để hai pod cùng mở file DB. `Recreate` tắt pod cũ trước.
9. (a) `bootstrap.sh` bước 7 ghi `KUBELET_EXTRA_ARGS=--node-ip=...`; (b) `kubeadm init --apiserver-advertise-address`; (c) Calico `IP_AUTODETECTION_METHOD=cidr=192.168.56.0/24`. Nêu hai trong ba là đủ.
10. Dải đó đè lên mạng node `192.168.56.0/24`; định tuyến pod/node xung đột. Script dùng `10.244.0.0/16`.
11. Không: chưa có CNI thì node `NotReady` là thứ tự bình thường; hết sau khi Calico chạy.
12. `admin.conf` được ghi giữa chừng; init hỏng nửa vời vẫn để lại nó. Dùng `DONE_MARK` chỉ tạo sau khi mọi thứ thành công.
13. Mỗi build bắt đầu với cache rỗng. Khắc phục: xuất/nhập cache ra ngoài agent (registry cache), hoặc dùng agent tồn tại lâu.
14. `min` chỉ giữ lớp có trong image cuối; `max` giữ cả lớp ở các stage trung gian (như stage build Go) — thứ thực sự tốn thời gian.
15. Không có số "trước" thì không chứng minh được cải thiện, và không biết khâu nào thật sự chậm.
16. Mặc định 30 phút (`requeueAfterSeconds`). Rút ngắn: đặt giá trị thấp hơn, hoặc cấu hình webhook từ GitHub.
17. Để ghi cả request bị chặn; nếu đặt sau, các request đáng chú ý nhất biến mất khỏi dữ liệu.
18. Counter từ chối có label `reason` (`no_token`, `bad_token`, `role`, `owner`).
19. Lớp copy `go.mod`/`go.sum` + tải dependency đứng trước lớp copy mã nguồn; Docker chỉ build lại từ lớp đầu tiên bị đổi trở xuống.
20. Khoảng 20/phút: mỗi pod đếm riêng trong bộ nhớ, traffic chia đều.
21. Có token mà 403 ở thao tác đọc → đăng nhập lại, hoặc dùng header lý do để phân biệt. Chỉ 403 ở thao tác ghi với token còn hạn mới là bị cấm thật.
22. Mỗi id/đường dẫn thật sinh một chuỗi thời gian mới → cardinality nổ, Prometheus phình bộ nhớ.
23. WAL cần chia sẻ bộ nhớ giữa các tiến trình cùng máy và chỉ có một writer; trên network filesystem với client ở máy khác thì không đảm bảo. PVC cục bộ RWO + một pod khớp ràng buộc đó.
24. CSRF trong luồng đăng nhập: `state` ngẫu nhiên gắn với phiên của bạn; callback không khớp → yêu cầu do bên thứ ba dựng nên, huỷ.
25. Provisioner chỉ chạy một lần mỗi VM; ép chạy bằng `vagrant provision`. Idempotent vì bạn chạy lại khi debug mà không muốn `kubeadm init` phá cluster đang chạy.
26. "Mới nhất" đổi theo thời gian → build lại ra OS khác, có thể hỏng; mất tái lập thì bảng đo trước/sau không so sánh được.
27. Đó là VM gốc của linked clone; các VM con chỉ lưu phần khác biệt.
28. Không. Timeout là triệu chứng; nguyên nhân (thường xung đột ảo hoá) vẫn còn.

</details>

---

# PHẦN F — NGUỒN THAM KHẢO

Chỉ lấy domain chính thức. **Cột "Đọc" ghi chủ đề tôi thấy trong kết quả tìm kiếm**, không phải số mục đã xác nhận; mở trang rồi tìm theo từ khoá. Dấu ★ = nên đọc hôm nay; ○ = đọc nếu còn thời gian.

**F1 — GitOps** (khối 1)

| | Nguồn | Đọc |
|---|---|---|
| ★ | [OpenGitOps — trang chủ](https://opengitops.dev/) và [PRINCIPLES.md](https://github.com/open-gitops/documents/blob/main/PRINCIPLES.md) | Bốn nguyên tắc; ngắn, đọc hết |
| ○ | [OpenGitOps 1.0 announcement](https://opengitops.dev/blog/1.0-announcement/) | Vì sao "latest" vi phạm tính bất biến; pull vs push |

**F2 — ArgoCD: Application nhiều nguồn** (khối 1)

| | Nguồn | Đọc |
|---|---|---|
| ★ | [Multiple Sources for an Application](https://argo-cd.readthedocs.io/en/latest/user-guide/multiple_sources/) | `ref`, `$values`, hạn chế của `ref` + `chart` — khớp đúng `config/apps/paper-blocks.yaml` |
| ○ | [Helm — Argo CD](https://argo-cd.readthedocs.io/en/stable/user-guide/helm/) | Cách ArgoCD dùng Helm (`helm template`, không `helm install`) |

**F3 — ArgoCD: đồng bộ** (khối 1)

| | Nguồn | Đọc |
|---|---|---|
| ★ | [Sync Options](https://argo-cd.readthedocs.io/en/latest/user-guide/sync-options/) | `Prune=false`, `Delete=false`, `CreateNamespace=true` |
| ★ | [Automated Sync Policy](https://argo-cd.readthedocs.io/en/stable/user-guide/auto_sync/) | `prune`, `selfHeal`, chu kỳ |

**F4 — Kubernetes: lưu trữ** (khối 1)

| | Nguồn | Đọc |
|---|---|---|
| ★ | [Storage Classes](https://kubernetes.io/docs/concepts/storage/storage-classes/) | `reclaimPolicy`, `volumeBindingMode: WaitForFirstConsumer` |
| ○ | [Persistent Volumes](https://kubernetes.io/docs/concepts/storage/persistent-volumes/) (chưa kiểm) | PV/PVC vòng đời |
| ○ | [local-path-provisioner](https://github.com/rancher/local-path-provisioner) (chưa kiểm) | PV gắn với node |

**F5 — Helm** (khối 2)

| | Nguồn | Đọc |
|---|---|---|
| ★ | [Named Templates](https://helm.sh/docs/chart_template_guide/named_templates/) | Tên toàn cục, `include` vs `template` |
| ★ | [Appendix: YAML Techniques](https://helm.sh/docs/chart_template_guide/yaml_techniques/) | `toYaml` + `nindent` |
| ○ | [Template Function List](https://helm.sh/docs/chart_template_guide/function_list/) | Tra hàm khi đọc chart |
| ○ | [Chart Best Practices: Templates](https://helm.sh/docs/chart_best_practices/templates/) | Thụt 2 dấu cách, đặt tên |
| ○ | [Chart Development Tips and Tricks](https://helm.sh/docs/howto/charts_tips_and_tricks/) | Mẹo thực hành khi viết chart (mục về tự rollout khi ConfigMap đổi: tôi chưa xác nhận trang có mục này, hãy tìm theo từ khoá) |

**F6 — Kubernetes nền** (khối 3, 5)

| | Nguồn | Đọc |
|---|---|---|
| ★ | [Container Runtimes](https://kubernetes.io/docs/setup/production-environment/container-runtimes/) | Mục cgroup drivers: kubelet và runtime phải cùng driver; containerd `SystemdCgroup` |
| ★ | [Installing kubeadm](https://kubernetes.io/docs/setup/production-environment/tools/kubeadm/install-kubeadm/) | Điều kiện máy (swap, cổng), repo `pkgs.k8s.io` theo minor, `apt-mark hold` |
| ○ | [Cluster Architecture](https://kubernetes.io/docs/concepts/architecture/) | Thành phần control plane/node |
| ○ | [Calico on-premises install](https://docs.tigera.io/calico/latest/getting-started/kubernetes/self-managed-onprem/onpremises) | Manifest, `IP_AUTODETECTION_METHOD` |
| ○ | [Using Source IP](https://kubernetes.io/docs/tutorials/services/source-ip/) | `externalTrafficPolicy: Local` giữ IP client |
| ○ | [Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/) | `Recreate` vs `RollingUpdate` |
| ○ | [Liveness, readiness, startup probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/) | Hai loại probe |

**F7 — Jenkins** (khối 4)

| | Nguồn | Đọc |
|---|---|---|
| ★ | [Pipeline Syntax](https://www.jenkins.io/doc/book/pipeline/syntax/) | Declarative: `stages`, `parallel`, `when`, `failFast`, quy tắc "đúng một trong steps/stages/parallel/matrix" |
| ★ | [Kubernetes plugin](https://plugins.jenkins.io/kubernetes) | Pod agent theo build, `podTemplate`, `podRetention` |
| ★ | [Jenkins Helm chart README](https://github.com/jenkinsci/helm-charts/blob/main/charts/jenkins/README.md) và [VALUES.md](https://github.com/jenkinsci/helm-charts/blob/main/charts/jenkins/VALUES.md) | `persistence.*`, `agent.podTemplates`, service NodePort |
| ○ | [Installing Jenkins on Kubernetes](https://www.jenkins.io/doc/book/installing/kubernetes/) | Tổng quan |
| ○ | [Parallel stages with Declarative Pipeline](https://www.jenkins.io/blog/2017/09/25/declarative-1/) | Lịch sử/ví dụ (bài cũ 2017) |

**F8 — Docker cache và preview env** (khối 5)

| | Nguồn | Đọc |
|---|---|---|
| ★ | [Optimize cache usage in builds](https://docs.docker.com/build/cache/optimize/) | Thứ tự lớp, `.dockerignore`, cache mount, bind mount |
| ★ | [Cache storage backends](https://docs.docker.com/build/cache/backends/) và [Registry cache](https://docs.docker.com/build/cache/backends/registry/) | `--cache-to/--cache-from`, `mode` min / max, yêu cầu driver |
| ○ | [Building best practices](https://docs.docker.com/build/building/best-practices/) | Multi-stage, ghim phiên bản |
| ★ | [ApplicationSet — Pull Request generator](https://argo-cd.readthedocs.io/en/latest/operator-manual/applicationset/Generators-Pull-Request/) | Lọc nhãn, tham số template, `requeueAfterSeconds` |

**F9 — Bảo mật ứng dụng** (khối 6)

| | Nguồn | Đọc |
|---|---|---|
| ★ | [OWASP — JSON Web Token Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_Cheat_Sheet.html) | Thuật toán, độ dài secret HMAC, `iss`/`aud`, JWT không bí mật |
| ★ | [OWASP — File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html) | Allowlist, tên file, vị trí lưu |
| ○ | [OWASP — REST Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html) | Mã trạng thái, JWT, denylist `jti` |
| ★ | [GitHub — Authorizing OAuth apps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps) | Ba bước, `state`, `redirect_uri` |
| ○ | [GitHub — Troubleshooting authorization request errors](https://docs.github.com/en/apps/oauth-apps/maintaining-oauth-apps/troubleshooting-authorization-request-errors) | `redirect_uri_mismatch` |
| ○ | [RFC 7519 — JWT](https://www.rfc-editor.org/rfc/rfc7519.html) | Cấu trúc và claim chuẩn |
| ○ | [RFC 9110 — HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110) (chưa kiểm) | Định nghĩa 403/409; 429 nằm ở RFC 6585 (chưa kiểm) |

**F10 — Quan sát, 12-factor, SQLite** (khối 7)

| | Nguồn | Đọc |
|---|---|---|
| ★ | [Prometheus — Metric and label naming](https://prometheus.io/docs/practices/naming/) | Đơn vị, hậu tố, label |
| ○ | [Prometheus — Histograms and summaries](https://prometheus.io/docs/practices/histograms/) | Vì sao summary không gộp được |
| ★ | [The Twelve-Factor App](https://12factor.net/) và [XI. Logs](https://12factor.net/logs) | Log ra stdout |
| ★ | [SQLite — Write-Ahead Logging](https://www.sqlite.org/wal.html) | Reader/writer, hạn chế network filesystem, checkpoint |
| ○ | [Gin docs](https://gin-gonic.com/docs/) (chưa kiểm) | Router/middleware |

**F11 — Vagrant/VirtualBox** (khối 8)

| | Nguồn | Đọc |
|---|---|---|
| ○ | [VirtualBox provider — Configuration](https://developer.hashicorp.com/vagrant/docs/providers/virtualbox/configuration) | `linked_clone`, `customize` |
| ○ | [VirtualBox provider — Networking](https://developer.hashicorp.com/vagrant/docs/providers/virtualbox/networking) | Private network = host-only; NAT là adapter 1 |
| ○ | [Private Networks](https://developer.hashicorp.com/vagrant/docs/networking/private_network) | `ip:` tĩnh |

---

# PHỤ LỤC — Điều tôi chưa kiểm chứng

1. **Tóm tắt từ kết quả tìm kiếm**, không phải đọc trọn trang: đặc biệt các số mặc định (chu kỳ polling ArgoCD 120s hay 180s tuỳ bản; `requeueAfterSeconds` 30 phút). Kiểm tra theo phiên bản bạn cài (ArgoCD chart `10.12.0`).
2. **Link ghi "(chưa kiểm)"** và các link Kubernetes/Calico: tôi dùng URL chuẩn nhưng chưa mở lại từng trang trong phiên này.
3. **RFC 9110/6585:** tìm kiếm không trả về; đừng trích số mục trong báo cáo khi chưa mở trang gốc.
4. **Jenkins:** tên khoá Helm để đặt NodePort, và cách kích hoạt theo tag, cần đối chiếu đúng phiên bản chart/Jenkins ở Phase 4.
5. **local-path:** "dữ liệu gắn với node" là kiến thức chung về cách provisioner này hoạt động, chưa kiểm trong tài liệu của dự án đó.
6. **OAuth:** GitHub có chấp nhận callback `http://192.168.56.11:30080/...` hay không là việc chưa thử.
7. **Giấy phép Vagrant (BUSL):** chưa đối chiếu điều khoản hiện hành.
8. **Thay đổi so với hai file gốc:** nội dung Vagrant giữ nguyên (thêm vài bổ sung: bài học `.vagrant/private_key`, lỗi `kubectl` timeout, tài liệu xác nhận linked clone); nội dung Phase 2 được cập nhật từ app "quest in-memory" sang Paper Blocks (SQLite, bình luận, view, OAuth). Hai file gốc vẫn khôi phục được từ lịch sử git.
9. **Chưa viết:** lý thuyết Ingress/HAProxy/TLS tự ký (Phase 9), Ansible (Prometheus/EFK, Phase 7–8), ApplicationSet chi tiết (Phase 6). Sẽ thêm vào file này khi tới phase đó.

