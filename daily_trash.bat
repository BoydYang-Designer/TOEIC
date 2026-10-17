@echo off
chcp 65001 >nul
cd /d "%~dp0"
where py >nul 2>nul && (py daily_trash.py) || (python daily_trash.py)
echo.
pause
