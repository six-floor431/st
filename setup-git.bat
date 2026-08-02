@echo off
chcp 65001 >nul
REM ============================================================
REM  WarmMemo 初始化 + 首次推送（只需跑一次）
REM  仓库根即扩展根（manifest.json 在根），酒馆才能 URL 安装。
REM  用法：双击本文件。已初始化过也可重跑（会自动修正 remote）。
REM ============================================================

set "REPO_URL=https://github.com/six-floor431/st.git"

cd /d "%~dp0"

REM 1) 设好 git 身份（空则给默认值，避免 commit 失败）
for /f "tokens=*" %%i in ('git config user.name') do set "_un=%%i"
if "%_un%"=="" git config user.name "WarmMemo"
for /f "tokens=*" %%i in ('git config user.email') do set "_ue=%%i"
if "%_ue%"=="" git config user.email "warmmemo@local"

REM 2) 初始化（已初始化则忽略报错）
git init >nul 2>&1

REM 3) 修正 / 添加 remote（已存在就 set-url，避免 "remote already exists" 报错）
git remote get-url origin >nul 2>&1
if errorlevel 1 (
  git remote add origin %REPO_URL%
) else (
  git remote set-url origin %REPO_URL%
)

REM 4) 提交并推送
git add -A
git commit -m "init: WarmMemo 温度记忆扩展（仓库根即扩展根）" || echo (无新改动，跳过提交)
git branch -M main
git push -u origin main

echo.
echo ============================================================
echo  推送完成！酒馆用 Install Extension from URL：
echo  %REPO_URL%
echo  之后更新只需双击 update.bat
echo ============================================================
pause
