@echo off
chcp 65001 >nul
REM ============================================================
REM  一次性：把 GitHub PAT 存入 Windows 凭据管理器（永久免密 push）
REM  用法：
REM   1) 去 https://github.com/settings/tokens 生成一个有 repo 权限的 token
REM   2) 把下面的 YOUR_PAT_HERE 改成你的 token（ghp_xxx 开头）
REM   3) 双击本文件
REM  之后 update.bat / setup-git.bat 都不用再输密码。
REM ============================================================

set "PAT=YOUR_PAT_HERE"
set "USER=six-floor431"

if "%PAT%"=="YOUR_PAT_HERE" (
  echo [错误] 请先编辑本文件，把 PAT 改成你的真实 token（ghp_xxx）
  pause
  exit /b 1
)

REM 开启 Windows 凭据助手（永久记住）
git config --global credential.helper wincred

REM 写入凭据（host=github.com, user=six-floor431, password=token）
cmdkey /add:github.com /user:%USER% /pass:%PAT% >nul 2>&1

echo.
echo 凭据已写入 Windows 凭据管理器。
echo 现在可以双击 update.bat 一键推送了。
echo （如想验证：在本目录运行 git push -u origin main）
echo.
pause
