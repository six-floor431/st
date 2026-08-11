@echo off
chcp 65001 >nul 2>&1
title ComfyUI (CORS已开启 - 供温记生图使用)

echo ============================================
echo   ComfyUI CORS 启动器（温记生图专用）
echo ============================================
echo.
echo 此脚本用以下参数启动 ComfyUI：
echo   --enable-cors-header "*"    解决浏览器跨域拦截
echo   --disable-header-check      解决 403 Forbidden（Host/Origin 校验）
echo   --listen 127.0.0.1          监听本地
echo.
echo 如果你的 ComfyUI 不在默认路径，请修改下面的 COMFYUI_PATH 变量。
echo.

REM ===== 配置区：按你的实际路径修改 =====
REM 路径1：如果你用的是 ComfyUI_windows_portable（自带 python_embeded）
set "COMFYUI_PATH=C:\ComfyUI_windows_portable\ComfyUI"

REM 路径2：如果你是 git clone 的源码 + 自己装的环境，改成你的路径
REM set "COMFYUI_PATH=D:\ComfyUI"

REM Python 路径：便携版用 python_embeded，源码版用系统 python
set "PYTHON_PATH=C:\ComfyUI_windows_portable\python_embeded\python.exe"
REM set "PYTHON_PATH=python"
REM ===== 配置区结束 =====

if not exist "%COMFYUI_PATH%\main.py" (
    echo [错误] 找不到 ComfyUI 的 main.py
    echo 请编辑此脚本，修改 COMFYUI_PATH 为你的 ComfyUI 安装路径
    echo.
    pause
    exit /b 1
)

echo 正在启动 ComfyUI...
echo 路径: %COMFYUI_PATH%
echo.

cd /d "%COMFYUI_PATH%"

if exist "%PYTHON_PATH%" (
    "%PYTHON_PATH%" main.py --listen 127.0.0.1 --enable-cors-header "*" --disable-header-check
) else (
    python main.py --listen 127.0.0.1 --enable-cors-header "*" --disable-header-check
)

pause
