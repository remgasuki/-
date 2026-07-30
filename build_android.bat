@echo off
chcp 65001 >nul
echo ================================================
echo   大乐透数据分析模型 - Android APK 打包脚本
echo ================================================
echo.

REM 检查 Java
java -version >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Java JDK，请先安装 JDK 11+
    echo 下载地址: https://adoptium.net/
    pause
    exit /b 1
)

REM 检查 Android SDK
if not defined ANDROID_HOME (
    if not defined ANDROID_SDK_ROOT (
        echo [提示] 未设置 ANDROID_HOME 环境变量
        echo 请确保已安装 Android Studio 或 Android SDK 命令行工具
        echo.
        echo 推荐方式:
        echo   1. 安装 Android Studio: https://developer.android.com/studio
        echo   2. 设置环境变量 ANDROID_HOME 指向 SDK 目录
        echo      例如: set ANDROID_HOME=C:\Users\%%USERNAME%%\AppData\Local\Android\Sdk
        echo.
        echo 如果已安装 Android Studio，请手动设置 ANDROID_HOME 后重试
        pause
        exit /b 1
    )
)

echo [1/3] 检查 Gradle Wrapper...
cd /d "%~dp0android"
if not exist "gradlew.bat" (
    echo [错误] 缺少 Gradle Wrapper，请确保项目完整
    pause
    exit /b 1
)

echo [2/3] 开始构建 APK...
call gradlew.bat assembleRelease

if %errorlevel% neq 0 (
    echo.
    echo [错误] 构建失败，请检查错误信息
    echo 常见问题:
    echo   1. Android SDK 版本不匹配
    echo   2. 网络问题导致依赖下载失败
    echo   3. JDK 版本不兼容
    pause
    exit /b 1
)

echo [3/3] 构建完成！
echo.
echo APK 输出路径: app\build\outputs\apk\release\大乐透数据分析模型_v1.2-release.apk
echo ================================================
echo 安装方式:
echo   1. 将 APK 文件传输到 Android 设备
echo   2. 在设备上打开文件管理器找到 APK
echo   3. 点击安装（需允许"未知来源"安装）
echo ================================================
pause