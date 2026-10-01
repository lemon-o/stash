@echo off
chcp 65001 >nul
title Stash Custom Standalone
echo ========================================================
echo   启动 Stash 定制单机独立版 (直接运行编译后的纯暗黑定制UI)
echo ========================================================
echo.
echo 访问地址: http://localhost:9999
echo.
"%~dp0bin\stash-win.exe" -c "%~dp0data\config.yml" -u "%~dp0ui\v2.5\build"
pause
