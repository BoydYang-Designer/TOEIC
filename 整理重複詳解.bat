@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 整理重複的詳解（同一個字只留一份）...
echo.
python json_merge.py unify || py json_merge.py unify
echo.
pause
