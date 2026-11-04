#!/usr/bin/env bash
# Đo thời gian build image: baseline cho phần Fast-Lane CI/CD.
# Chạy từ thư mục gốc project:  bash bench/baseline-build.sh
# Ba phép đo cho mỗi image (api, web):
#   cold    build không cache         (CI runner mới tinh)
#   warm    build lại, không đổi gì   (mọi layer hit cache)
#   code    đổi một dòng mã nguồn     (trường hợp thường gặp nhất: cache phải giữ layer dependency)
# Kết quả nối vào bench/results/baseline.csv; số liệu này là "trước", Fast-Lane sẽ đo "sau" cùng cách.
set -euo pipefail
cd "$(dirname "$0")/.."
command -v docker >/dev/null || { echo "Không tìm thấy docker"; exit 1; }
docker info >/dev/null 2>&1 || { echo "Docker daemon chưa chạy (mở Docker Desktop)"; exit 1; }

OUT=bench/results/baseline.csv
mkdir -p bench/results
[ -f "$OUT" ] || echo "date,image,case,seconds" > "$OUT"
NOW=$(date +%Y-%m-%dT%H:%M:%S)

timeit() { # timeit <image> <case> <docker build args...>
  local img=$1 cs=$2; shift 2
  local s e
  s=$(date +%s.%N)
  DOCKER_BUILDKIT=1 docker build -q -t "pb-$img:bench" "$@" >/dev/null
  e=$(date +%s.%N)
  local sec; sec=$(awk -v a="$s" -v b="$e" 'BEGIN{printf "%.1f", b-a}')
  echo "$NOW,$img,$cs,$sec" | tee -a "$OUT"
}

touch_code() { # đổi một dòng mã để vô hiệu hoá đúng layer COPY nguồn
  case "$1" in
    api) echo "// bench $(date +%s%N)" >> app/api/main.go ;;
    web) echo "/* bench $(date +%s%N) */" >> app/web/style.css ;;
  esac
}
restore_code() {
  case "$1" in
    api) sed -i '$ d' app/api/main.go ;;
    web) sed -i '$ d' app/web/style.css ;;
  esac
}

for img in api web; do
  ctx=app/$img
  timeit "$img" cold --no-cache "$ctx"
  timeit "$img" warm "$ctx"
  touch_code "$img"
  trap 'restore_code api; restore_code web' EXIT # nếu Ctrl+C giữa chừng vẫn trả lại file
  timeit "$img" code "$ctx"
  restore_code "$img"
  trap - EXIT
done

echo; echo "Đã ghi vào $OUT"; column -s, -t < "$OUT" 2>/dev/null || cat "$OUT"
