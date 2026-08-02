@echo off
chcp 65001 >nul
REM ============================================================
REM  ContextPro 一次性 Git 初始化脚本（只需跑这一次）
REM  用法：1) 先在 GitHub 网页新建一个空仓库，名叫 context-pro
REM        2) 把下面的 REPO_URL 改成你的仓库地址
REM        3) 双击本文件或在终端运行
REM ============================================================

set "REPO_URL=https://github.com/YOUR_GITHUB_USERNAME/context-pro.git"

cd /d "%~dp0"

git init
git add -A
git commit -m "init: ContextPro 酒馆原生扩展（总结楼层/向量本地化/重排云端/关系力图）"
git branch -M main
git remote add origin %REPO_URL%
git push -u origin main

echo.
echo ============================================================
echo  首次推送完成！以后更新只需双击 update.bat
echo ============================================================
pause
