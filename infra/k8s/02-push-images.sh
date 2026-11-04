#!/usr/bin/env bash
# Chặng C (1/2): build image api + web và đẩy lên Docker Hub để cụm kéo về.
# Cần: Docker Desktop đang chạy và đã `docker login` bằng tài khoản Docker Hub.
# Dùng:  bash infra/k8s/02-push-images.sh [tag]      (mặc định tag 0.1.0)
set -euo pipefail
cd "$(dirname "$0")/../.."

HUB="${DOCKERHUB_USER:-chuitrai2901}"
TAG="${1:-0.1.0}"

docker info >/dev/null 2>&1 || { echo "Docker daemon chưa chạy (mở Docker Desktop)"; exit 1; }

for svc in api web; do
  img="$HUB/paper-blocks-$svc:$TAG"
  echo "== build $img"
  docker build -t "$img" "app/$svc"
  echo "== push $img"
  if ! docker push "$img"; then
    echo "Push thất bại. Đã chạy 'docker login' bằng tài khoản $HUB chưa?" >&2
    exit 1
  fi
done

echo
echo "Xong. Kiểm tra image ở chế độ PUBLIC (cụm kéo không cần mật khẩu):"
for svc in api web; do echo "  https://hub.docker.com/r/$HUB/paper-blocks-$svc"; done
echo "Nếu repo đang Private: Settings -> Visibility -> Make public. Gói miễn phí chỉ cho 1 repo private."
