@echo off
chcp 65001 >nul
REM ============================================================
REM  WarmMemo 一次性 Git 初始化脚本（只需跑这一次）
REM  注意：本仓库根目录就是扩展根（manifest.json 在根），
REM        这样酒馆「Install Extension from URL」才能成功。
REM  用法：1) 先在 GitHub 网页新建空仓库 six-floor431/st（若已建可跳过）
REM        2) 确认下面 REPO_URL 与你的仓库一致
REM        3) 双击本文件
REM ============================================================

set "REPO_URL=https://github.com/six-floor431/st.git"

cd /d "%~dp0"

git init
git add -A
git commit -m "init: WarmMemo 温度记忆扩展（仓库根即扩展根）"
git branch -M main
git remote add origin %REPO_URL%
git push -u origin main

echo.
echo ============================================================
echo  首次推送完成！之后更新只需双击 update.bat
echo  酒馆里用 Install Extension from URL：%REPO_URL%
echo ============================================================
pause
