@echo off
setlocal
title Paper Blocks - Minecraft Portfolio
cd /d "%~dp0app\api"
set JWT_SECRET=supersecretkey123456
set ENABLE_PASSWORD_LOGIN=true
set USER_PASSWORD=user123
set ADMIN_PASSWORD=admin123
set SEED_DEMO=true
set WEB_DIR=..\web
set PORT=8080

echo ========================================================
echo   PAPER BLOCKS - MINECRAFT 3D PORTFOLIO
echo ========================================================
echo   Dang chay may chu tai: http://localhost:8080
echo   Tai khoan user : user  / user123
echo   Tai khoan admin: admin / admin123
echo   Nhan Ctrl+C de dung may chu.
echo ========================================================
echo.

server.exe
pause
