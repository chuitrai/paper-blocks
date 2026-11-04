#!/usr/bin/env bash
# CHẠY TRƯỚC KHI PUSH lên repo công khai. Tìm file và nội dung giống secret trong cả file đã theo dõi
# lẫn file mới chưa add (git add . sẽ kéo chúng vào). Không thay thế được việc tự đọc `git status` và `git diff`.
# Dùng (từ bất kỳ thư mục nào trong repo):  bash scripts/check-no-secrets.sh
cd "$(git rev-parse --show-toplevel)" || { echo "không phải repo git"; exit 1; }
FAIL=0
bad() { echo "  [FAIL] $*"; FAIL=1; }

echo "1. File không bao giờ được vào repo công khai"
# --cached: đã theo dõi hoặc đã add; --others --exclude-standard: file mới chưa bị .gitignore chặn (sẽ vào nếu `git add .`)
FILES=$( { git ls-files --cached; git ls-files --others --exclude-standard; } | sort -u)
FILEPAT='(^|/)(admin\.conf|join-command\.sh|\.env|private_key|id_rsa|id_ed25519)$|\.(pem|key|pfx|p12|db|db-wal|db-shm)$|(^|/)\.vagrant/'
BADFILES=$(echo "$FILES" | grep -E "$FILEPAT")
if [ -n "$BADFILES" ]; then
  bad "các file sau sẽ lên repo công khai:"
  echo "$BADFILES" | sed 's/^/         /'
else
  echo "  [OK]   không có file nhạy cảm theo tên"
fi

echo "2. Nội dung giống secret"
PATTERNS='ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|gho_[A-Za-z0-9]{20,}|dckr_pat_[A-Za-z0-9_-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|client-certificate-data:|client-key-data:|GITHUB_CLIENT_SECRET=[^ "$]{12,}|JWT_SECRET=[^ "$]{12,}|(USER|ADMIN)_PASSWORD=[^ "$.]{8,}'
HITS=$(git grep --untracked -nIE "$PATTERNS" -- . ':!scripts/check-no-secrets.sh' ':!.env.example' 2>/dev/null)
if [ -n "$HITS" ]; then
  bad "có nội dung giống secret (kiểm tra từng dòng, loại bỏ rồi ĐỔI secret nếu đó là secret thật):"
  echo "$HITS" | sed 's/^/         /' | cut -c1-160
else
  echo "  [OK]   không thấy mẫu secret quen thuộc"
fi

echo "3. LỊCH SỬ git của nhánh hiện tại (push là đẩy cả lịch sử, không chỉ bản mới nhất)"
if git rev-parse --verify -q HEAD >/dev/null; then
  N=$(git rev-list --count HEAD)
  OLD=$(git grep -nIE "$PATTERNS" $(git rev-list HEAD | head -300) -- . ':!.env.example' ':!scripts/check-no-secrets.sh' 2>/dev/null | cut -c42-170 | head -5)
  OLDF=$(git log HEAD --name-only --pretty=format: | grep -E "$FILEPAT" | sort -u | head -5)
  if [ -n "$OLD$OLDF" ]; then
    bad "lịch sử ($N commit) chứa secret hoặc file nhạy cảm, ví dụ:"
    { echo "$OLD"; echo "$OLDF"; } | grep -v '^$' | sed 's/^/         /'
    echo "         Xoá file ở commit mới KHÔNG đủ: nó vẫn nằm trong lịch sử. Hãy đẩy một lịch sử sạch:"
    echo "           git checkout --orphan clean-main && git add -A && git commit -m 'Initial commit' && git push <remote> clean-main:main"
  else
    echo "  [OK]   $N commit, không thấy secret trong lịch sử"
  fi
else
  echo "  (chưa có commit nào)"
fi

echo
[ "$FAIL" -eq 0 ] && echo "AN TOÀN ĐỂ PUSH (theo các mẫu trên)" || echo "CHƯA AN TOÀN: sửa rồi chạy lại"
exit "$FAIL"
