# Lý thuyết — Phase 1.1: Vagrant

> Phase 1 chia hai nửa: **1.1 Vagrant** (dựng và quản lý máy ảo, file này) và **1.2 các file setup Kubernetes** chạy bên trong VM (`bootstrap.sh`, `init_master.sh`, `join_worker.sh`, `verify.sh`, viết sau). Đây là tài liệu lý thuyết, không thuộc bộ `docs/` bắt buộc. Thực hành xem `docs/02-PHASE1-KUBERNETES-VA-LOI-THUC-TE.md`.

## 1. Vagrant giải quyết vấn đề gì

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

## 2. Năm khái niệm cần nắm

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

## 3. Vòng đời của một VM

| Lệnh | Làm gì | Ghi chú |
|---|---|---|
| `vagrant up` | Tạo VM nếu chưa có, boot, provision lần đầu | Lần đầu tải box (~vài trăm MB) |
| `vagrant provision` | Chạy lại script trên VM đang chạy | Có thể chọn: `--provision-with init-master` |
| `vagrant halt` | Tắt VM, giữ đĩa | Cách tắt đúng. Đừng tắt cưỡng bức trong VirtualBox |
| `vagrant reload` | halt + up, áp lại cấu hình mạng/RAM | Không chạy lại provision trừ khi thêm `--provision` |
| `vagrant destroy -f` | Xoá VM và đĩa | Box đã tải vẫn được giữ lại |
| `vagrant global-status --prune` | Dọn danh sách VM Vagrant nhớ | Dùng sau khi dọn tay |

Quy tắc an toàn: **đóng mọi phiên `vagrant ssh` và cửa sổ VM trước khi `destroy`**. Chúng ta đã gặp đúng lỗi này (xem mục 7).

## 4. Mổ xẻ Vagrantfile của dự án

Đọc theo thứ tự khối trong `infra/vagrant/Vagrantfile`.

### 4.1 Tham số ở đầu file

```ruby
K8S_MINOR  = ENV.fetch("K8S_MINOR", "1.36")
WORKER_MEM = ENV.fetch("WORKER_MEM", "6144").to_i
NODES = [ { name: "master", ... }, { name: "worker", ... } ]
```

- `ENV.fetch(tên, mặc định)` cho phép đổi tham số mà không sửa file: `WORKER_MEM=4096 vagrant up`.
- `.to_i` vì biến môi trường luôn là chuỗi, RAM phải là số.
- Mảng `NODES` tách **dữ liệu khỏi logic**: muốn thêm worker, thêm một dòng, vòng lặp bên dưới tự lo. Không copy-paste hai khối `define`.
- Quy ước: biến môi trường cho thứ **đổi theo máy** (RAM), hằng số trong file cho thứ **đổi theo phiên bản** (version K8s).

### 4.2 Box và ghim phiên bản

```ruby
config.vm.box = "bento/ubuntu-22.04"
config.vm.box_version = "202510.26.0"
config.vm.box_check_update = false
config.vm.boot_timeout = 600
```

- `box_version`: nếu không ghim, "bản mới nhất" thay đổi theo thời gian, build lại sau nửa năm có thể ra OS khác và bạn không biết vì sao cluster hỏng. **Ghim phiên bản là điều kiện của tái lập.**
- `boot_timeout`: thời gian tối đa chờ SSH lên (mặc định 300s). Tăng số này chỉ che triệu chứng; nếu vẫn timeout thì VM đang gặp vấn đề khác (thường là Hyper-V chặn VirtualBox, xem mục 6).

### 4.3 Synced folder

```ruby
config.vm.synced_folder ".", "/vagrant", SharedFoldersEnableSymlinksCreate: false
```

Thư mục chứa Vagrantfile trên host xuất hiện thành `/vagrant` trong VM (cơ chế `vboxsf`, cần Guest Additions, bento có sẵn). Dự án dùng nó làm **kênh trao đổi giữa các VM**: master ghi `join-command.sh` và `admin.conf`, worker đọc. Tuỳ chọn `SymlinksCreate: false` chặn VM tạo symlink ra ngoài thư mục chia sẻ (đây là cảnh báo bạn thấy lúc `vagrant up`).

### 4.4 Vòng lặp tạo máy

```ruby
NODES.each do |n|
  config.vm.define n[:name], primary: n[:name] == "master" do |node|
```

`define` khai báo từng máy trong một dự án nhiều máy (multi-machine). Vagrant tạo chúng **tuần tự theo thứ tự khai báo**, nên master (cùng `init_master.sh`) xong trước khi worker bắt đầu. Đừng dựa hoàn toàn vào thứ tự này: worker vẫn tự chờ file join tối đa 5 phút. Quy tắc: **thứ tự ngầm là tối ưu, vòng chờ là bảo hiểm.**

### 4.5 Hostname và hai card mạng

```ruby
node.vm.hostname = n[:host]
node.vm.network "private_network", ip: n[:ip]
```

Mỗi VM có **hai card mạng**:

| Card | Loại | IP | Dùng để |
|---|---|---|---|
| 1 | NAT (Vagrant tự thêm) | `10.0.2.15` *trên mọi VM* | Ra Internet; Vagrant SSH vào qua cổng 2222 trên `127.0.0.1` |
| 2 | Host-only (`private_network`) | `192.168.56.10` / `.11` | Node ⇄ node, host ⇄ node |

IP của card 1 giống hệt nhau trên cả hai máy. Nếu Kubernetes lấy nhầm IP này thì hai node trông như một. Đó là lý do phần setup K8s (Phase 1.2) phải ép dùng card 2.

### 4.6 Cấu hình VirtualBox

| Dòng | Tác dụng | Lý do |
|---|---|---|
| `vb.memory`, `vb.cpus` | RAM, CPU | master 4GB/2, worker 6GB/3 |
| `vb.gui = ENV["VB_GUI"]=="1"` | Mở cửa sổ console | `VB_GUI=1 vagrant up` để xem VM khi debug boot |
| `vb.linked_clone = true` | Dùng chung đĩa gốc, chỉ lưu phần thay đổi | Nhanh, tiết kiệm đĩa. Đánh đổi: xem mục 5 |
| `--natdnshostresolver1 on` | DNS của VM qua resolver của host | Tránh `apt`/pull image bị treo |
| `--ioapic on` | Bật IO-APIC | VirtualBox cần cho VM nhiều CPU |

### 4.7 Truyền tham số và provisioner

```ruby
env = { "K8S_MINOR" => K8S_MINOR, "NODE_IP" => n[:ip], ... }
node.vm.provision "bootstrap", type: "shell", path: "bootstrap.sh", env: env
```

- `env` đưa tham số xuống script qua biến môi trường. Script dùng `: "${NODE_IP:?}"` để **dừng ngay nếu thiếu biến** thay vì chạy tiếp với giá trị rỗng.
- Tên provisioner (`"bootstrap"`) cho phép chạy riêng: `vagrant provision --provision-with bootstrap`.
- Master chạy `bootstrap` rồi `init-master`; worker chạy `bootstrap` rồi `join-worker`. Phân vai bằng `if n[:name] == "master"`.
- Script chạy bằng **root** (mặc định). Mọi lệnh trong đó có toàn quyền trong VM.

## 5. Linked clone: tiện nhưng có cái bẫy

Với `linked_clone = true`, lần đầu Vagrant tạo một **VM gốc** (log: "Preparing master VM for linked clones", tên dạng `ubuntu-22.04-amd64_<số>`), chụp snapshot, rồi `k8s-master`, `k8s-worker` là các VM con chỉ lưu phần khác biệt so với gốc.

- **Không bao giờ xoá hay tự bật VM gốc.** Các VM con phụ thuộc vào nó; xoá thì Vagrant báo mất VM gốc.
- VM con khi tạo nằm trong thư mục tạm `temp_clone_<số>`, rồi mới đổi tên thành `k8s-master`. Nếu việc này bị gián đoạn, bạn có VM "ma" (đăng ký trong VirtualBox nhưng file đã mất) hoặc thư mục rác chặn việc đổi tên.

## 6. Business case

**Bài toán:** cần cluster Kubernetes nhiều node để làm CI/CD, preview environment, monitoring, logging, với ngân sách ≈ $0.

| Phương án | Chi phí | Tái lập | Multi-node | Nhược điểm |
|---|---|---|---|---|
| Cloud (EC2/GCE) | $$ mỗi giờ | tốt (Terraform) | có | Ngân sách không cho; quên tắt là mất tiền |
| minikube / kind | 0 | tốt | hạn chế | Một node thật (barem 0.5đ), khác kubeadm thật |
| Cài tay trên VM | 0 | **kém** | có | Không chứng minh được "chạy lại từ đầu" |
| **Vagrant + kubeadm** | 0 | **tốt** | có | Tốn RAM host, phụ thuộc VirtualBox, chậm hơn container |

Giá trị cụ thể:

1. **Tái lập = bằng chứng.** `vagrant destroy -f && vagrant up` chứng minh dựng được từ con số 0 (Phase 13 của dự án).
2. **Chi phí lỗi bằng 0.** Phá cluster khi học là bình thường: xoá và dựng lại trong ~15 phút.
3. **Hạ tầng là code trong git.** `git diff` cho biết hôm qua đổi gì.
4. **Điều kiện cho bảng đo Fast-Lane.** Số đo trước/sau tối ưu chỉ so sánh được khi môi trường đo giống hệt nhau giữa các lần.

**Giới hạn thành thật:** đây là môi trường học và rehearsal, không phải production (một master, ảo hoá lồng, đĩa ảo chậm, mạng host-only). Số đo CI/CD của bạn là *tương đối* (trước/sau), không phải con số tuyệt đối để so với cloud.

**Giấy phép:** Vagrant của HashiCorp chuyển sang giấy phép BUSL từ 2023; dùng học tập/nội bộ không vướng. Tôi chưa kiểm tra lại điều khoản hiện hành, nên bạn hãy đối chiếu trang giấy phép chính thức trước khi viết vào báo cáo.

## 7. Những lỗi thực tế Vagrant + VirtualBox đã gặp trong dự án này

| Triệu chứng | Nguyên nhân | Bài học |
|---|---|---|
| `Timed out while waiting for the machine to boot` | Windows giữ tính năng ảo hoá (Hyper-V/WSL2/Memory Integrity); VirtualBox chạy chế độ chậm (biểu tượng con rùa) | Tăng timeout không sửa gốc. Giải quyết xung đột ảo hoá hoặc chấp nhận chậm |
| SSH vào "master" nhưng hostname là `vagrant`, không có `kubeadm` | Vào nhầm VM gốc của linked clone (hoặc VM chưa provision) | Luôn dùng `vagrant ssh master`, kiểm tra `hostname` ngay |
| `VERR_ALREADY_EXISTS` khi đổi tên `temp_clone_...` | `destroy` bị gián đoạn (còn phiên SSH mở), thư mục VM cũ còn sót | Đóng SSH/cửa sổ VM trước khi `destroy` |
| `VERR_FILE_NOT_FOUND` khi đổi tên, `list vms` thấy `temp_clone_...` | VM "ma" còn đăng ký nhưng file đã xoá | `VBoxManage unregistervm <uuid>` (không `--delete`), `closemedium` ổ đĩa mất, xoá `.vagrant/` |
| Lệnh PowerShell báo `command not found` | Đang gõ trong Git Bash | Git Bash và PowerShell là hai shell khác nhau, kiểm tra dấu nhắc trước khi dán lệnh |

## 8. Bảo mật

Bối cảnh: lab trên máy cá nhân. Mục tiêu là **không tạo thói quen xấu và không làm lộ thứ nhạy cảm**.

**Cần xử lý (đã xử lý):**

| Rủi ro | Vì sao nguy hiểm | Xử lý |
|---|---|---|
| `admin.conf`, `join-command.sh` nằm trong thư mục dự án | `admin.conf` là chứng chỉ **cluster-admin**; `join-command.sh` cho máy lạ gia nhập cluster (24h). `git add .` nhầm là lộ | Đã `.gitignore`; không chụp màn hình có token/hash làm evidence |
| Box không ghim phiên bản | Rủi ro chuỗi cung ứng: bản "mới nhất" của box bên thứ ba có thể đổi | Đã ghim `box_version` |
| Symlink từ VM ra host | VM bị chiếm quyền có thể dùng symlink đọc/ghi file khác của host | `SharedFoldersEnableSymlinksCreate: false` |
| Script tải thứ chạy bằng root | Nguồn tải bị compromise thì cả cluster bị | Không dùng `curl \| bash`; key GPG tải riêng, repo apt ký bằng `signed-by`. Còn yếu: manifest Calico lấy theo **tag** (tag có thể bị di chuyển), nên cải tiến sau là ghim checksum |

**Đã an toàn sẵn:**

- Khoá SSH: Vagrant thay khoá "không an toàn" công khai bằng khoá ngẫu nhiên riêng cho từng máy ngay lần boot đầu. Cổng SSH forward `2222` chỉ bind vào `127.0.0.1`.
- Host-only network `192.168.56.0/24` không route ra LAN; người cùng Wi-Fi không truy cập được. Đổi sang `public_network` thì VM nhìn thấy cả LAN và bề mặt tấn công đổi hẳn.
- User `vagrant` có sudo không mật khẩu là mặc định của mọi box: chấp nhận trong lab, **không bao giờ** dùng lại tài khoản/khoá này ngoài lab.

**Chấp nhận, nhưng ghi trong báo cáo:** một master (không HA), secret trong etcd chưa mã hoá, mọi tiến trình trên host Windows đều đọc được `admin.conf` trong thư mục chia sẻ.

**Trước mỗi commit hoặc chụp evidence:**

- [ ] `git status` không có `admin.conf`, `join-command.sh`, `.vagrant/`
- [ ] Ảnh không chứa token (dạng `abcdef.0123456789abcdef`), hash `sha256:...`, nội dung kubeconfig
- [ ] `git log -p -S"kubeadm join"` không thấy lệnh join thật

## 9. Điểm yếu còn lại của Vagrantfile (tự phê bình)

1. Dùng thư mục chia sẻ làm kênh trao đổi bí mật là đánh đổi đơn giản-đổi-lấy-an-toàn. Cách sạch hơn: worker lấy lệnh join qua SSH tới master.
2. Chưa có kiểm tra sức khoẻ chủ động giữa các VM ngoài vòng chờ file.
3. Chưa kiểm chứng đầu-cuối trên máy thật tại thời điểm viết file này.

## 10. Tự kiểm tra

1. Vì sao chạy `vagrant up` lần hai không cài lại containerd? Muốn ép chạy lại dùng lệnh nào, và vì sao script phải idempotent?
2. Hai VM đều có IP `10.0.2.15`. Điều gì hỏng nếu Kubernetes quảng bá IP này?
3. Bỏ `box_version` thì rủi ro gì xuất hiện sau 6 tháng, và nó liên quan thế nào tới "tái lập"?
4. Vì sao không được xoá VM `ubuntu-22.04-amd64_...`?
5. Tăng `boot_timeout` lên 3000 có sửa lỗi timeout khi boot không? Vì sao?

<details>
<summary>Đáp án gợi ý</summary>

1. Provisioner chỉ chạy một lần cho mỗi VM; ép chạy lại bằng `vagrant provision`. Script idempotent vì bạn sẽ chạy lại khi debug mà không muốn các bước như `kubeadm init` phá cluster đang chạy.
2. Hai node trông như cùng một máy; node gọi nhau, Prometheus scrape, `kubectl logs/exec` tới sai đích.
3. "Mới nhất" thay đổi theo thời gian nên build lại ra OS khác, có thể hỏng; không còn tái lập thì bảng đo trước/sau không so sánh được.
4. Đó là VM gốc của linked clone; các VM con chỉ lưu phần khác biệt so với nó.
5. Không. Timeout là triệu chứng; nguyên nhân (VM boot quá chậm do xung đột ảo hoá, hoặc VM không boot) vẫn còn, chờ lâu hơn chỉ làm bạn đợi lâu hơn rồi vẫn lỗi.

</details>
