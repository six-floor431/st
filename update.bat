@echo off
chcp 65001 >nul
REM ============================================================
REM  WarmMemo 一键更新上传（每次改完代码双击）
REM  推送到 origin/main 后，酒馆的 auto_update 会自动拉取更新。
REM ============================================================
cd /d "%~dp0"

for /f "tokens=*" %%i in ('git config user.name') do set "_un=%%i"
if "%_un%"=="" git config user.name "WarmMemo"
for /f "tokens=*" %%i in ('git config user.email') do set "_ue=%%i"
if "%_ue%"=="" git config user.email "warmmemo@local"

REM 确保 remote 指向真实仓库（防止误改为占位符）
git remote get-url origin >nul 2>&1
if not errorlevel 1 (
  for /f "tokens=*" %%r in ('git remote get-url origin') do set "_ru=%%r"
  echo 当前 remote: %_ru%
  echo %_ru% | findstr /i "YOUR_GITHUB_USERNAME" >nul
  if not errorlevel 1 (
    echo [警告] remote 仍是占位符，已自动修正为真实仓库
    git remote set-url origin https://github.com/six-floor431/st.git
  )
)

set "TS=%date:~0,4%-%date:~5,2%-%date:~8,2% %time:~0,2%:%time:~3,2%"
set "TS=%TS: =0%"

git add -A
git commit -m "update: %TS%" || echo (无新改动，跳过提交)

REM 若本地分支不叫 main 就改之
git branch -M main
git push -u origin main

echo.
echo ============================================================
echo  已推送。酒馆端（扩展页）点一下刷新 / 重启即可自动更新。
echo  若酒馆报 failed to update，多数情况是 GitHub 认证未保存，
echo  见下方说明。
echo ============================================================
pause
