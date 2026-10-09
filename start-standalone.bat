@echo off
chcp 65001 >nul
title Stash Standalone
echo ========================================================
echo   启动 Stash 单机版（直接运行编译后的前端）
echo ========================================================
echo.
echo 访问地址: http://localhost:9999
echo.
echo 托盘图标常驻，浏览器会自动打开；退出请右键托盘图标 -> Quit Stash Server。
echo.

:: 注意：-u / --ui-location 这个 flag 实际不生效——Go 侧按 flag 名 "ui-location"
:: 写进 overrides，读取用的却是配置键 "ui_location"，于是被静默忽略、退回内嵌前端。
:: 环境变量 STASH_ui 经 envBinds 映射到 ui_location，才是通的。
set "STASH_ui=%~dp0ui\v2.5\build"
"%~dp0bin\stash-win.exe" -c "%~dp0data\config.yml"
pause
