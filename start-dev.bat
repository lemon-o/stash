@echo off
chcp 65001 >nul
title Stash Custom Dev Environment
echo ========================================================
echo   正在启动 Stash 本地独立定制环境 (纯本地全新独立库)
echo ========================================================
echo.

:: 1. 检查并启动本地独立 Go 后端 (端口 9999)
netstat -ano | findstr LISTENING | findstr "9999" >nul
if %errorlevel% neq 0 (
    echo [1/2] 正在启动本地独立 Stash 后端 (Port: 9999)...
    start "Stash Backend" /B "%~dp0bin\stash-win.exe" -c "%~dp0data\config.yml" --nobrowser
    timeout /t 2 >nul
) else (
    echo [1/2] 本地 Stash 后端已在运行中 (Port: 9999)。
)

:: 2. 启动前端 Vite 热重载开发服务器 (端口 3000)
echo [2/2] 正在启动前端热重载开发服务器 (Port: 3000)...
echo.
echo 浏览器访问地址: http://localhost:3000
echo.
cd /d "%~dp0ui\v2.5"
npx pnpm run start
