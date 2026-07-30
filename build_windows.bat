@echo off
chcp 65001 >nul
echo ================================================
echo   大乐透数据分析模型 - Windows 打包脚本
echo ================================================
echo.

REM 检查 Python
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Python，请先安装 Python 3.9+
    pause
    exit /b 1
)

echo [1/3] 安装依赖...
pip install -r requirements.txt pyinstaller -q

echo [2/3] 开始打包...
pyinstaller build_windows.spec --clean --noconfirm

echo [3/3] 打包完成！
echo.
echo 输出目录: dist\大乐透数据分析模型\
echo 直接运行 dist\大乐透数据分析模型\大乐透数据分析模型.exe 即可
echo ================================================
pause