@echo off
chcp 65001 >nul
echo ================================================
echo   下载 Chart.js 到 Android assets
echo ================================================
echo.

set "OUTPUT=%~dp0android\app\src\main\assets\web\js\chart.min.js"
set "URL=https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"

echo 正在从 CDN 下载 Chart.js...
echo URL: %URL%
echo 目标: %OUTPUT%
echo.

powershell -Command "Invoke-WebRequest -Uri '%URL%' -OutFile '%OUTPUT%'"

if %errorlevel% equ 0 (
    echo [完成] Chart.js 下载成功！
) else (
    echo [错误] 下载失败，请检查网络连接
    echo 手动下载: %URL%
    echo 放置到: %OUTPUT%
)

pause