#!/usr/bin/env bash
set -e

cd "$(dirname "$0")/app/api"

export JWT_SECRET="supersecretkey123456"
export ENABLE_PASSWORD_LOGIN="true"
export USER_PASSWORD="user123"
export ADMIN_PASSWORD="admin123"
export SEED_DEMO="true"
export WEB_DIR="../web"
export PORT="8080"

echo "========================================================"
echo "  PAPER BLOCKS - DEVOPS, RESEARCH & CREATOR PORTFOLIO"
echo "========================================================"
echo "  Dang chay may chu tai: http://localhost:8080"
echo "  Tai khoan user : user  / user123"
echo "  Tai khoan admin: admin / admin123"
echo "  Nhan Ctrl+C de dung may chu."
echo "========================================================"
echo ""

if [ ! -f ./server.exe ]; then
  echo "Dang build server.exe..."
  go build -o server.exe main.go
fi

./server.exe
