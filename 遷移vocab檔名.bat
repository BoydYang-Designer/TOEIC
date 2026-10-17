@echo off
chcp 65001 >nul
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
cd /d "%~dp0"
title vocab 檔名遷移工具

if not exist "auto-speech.py" goto nofile
if not exist "migrate_vocab_names.py" goto nofile
set PY=
where py >nul 2>nul && set PY=py
if not defined PY where python >nul 2>nul && set PY=python
if not defined PY goto nopy

:menu
cls
echo ==============================================
echo   vocab 音檔檔名遷移（去掉文章 id）
echo   資料夾：%CD%
echo ==============================================
echo.
echo   1  預覽（只列出會做什麼，不動任何檔案）  ← 先做這個
echo   2  正式執行（改名）
echo   3  還原（回到執行前）
echo   0  離開
echo.
set C=
set /p C=請輸入 1、2、3 或 0，然後按 Enter： 
if "%C%"=="1" goto dry
if "%C%"=="2" goto apply
if "%C%"=="3" goto undo
if "%C%"=="0" goto end
goto menu

:dry
echo.
%PY% migrate_vocab_names.py
echo.
pause
goto menu

:apply
echo.
echo 即將正式改名。舊重複檔會搬到 audio\daily\vocab\_stale（不會刪除），並產生對照表可還原。
echo 如果還沒做過「1 預覽」，建議先取消。
echo.
set OK=
set /p OK=確定要執行請輸入 YES（其他任何輸入都會取消）： 
if /i not "%OK%"=="YES" goto menu
echo.
%PY% migrate_vocab_names.py --apply
echo.
pause
goto menu

:undo
set LAST=
for /f "delims=" %%f in ('dir /b /o-n "vocab-rename-map-2*.csv" 2^>nul') do if not defined LAST set LAST=%%f
if not defined LAST goto noundo
echo.
echo 將依最新的對照表還原：%LAST%
set OK=
set /p OK=確定請輸入 YES： 
if /i not "%OK%"=="YES" goto menu
echo.
%PY% migrate_vocab_names.py --undo "%LAST%"
echo.
pause
goto menu

:noundo
echo.
echo 找不到對照表（vocab-rename-map-時間.csv），表示還沒有正式執行過，沒有東西可以還原。
echo.
pause
goto menu

:nofile
echo.
echo 找不到 auto-speech.py 或 migrate_vocab_names.py。
echo 請把這個檔案和 migrate_vocab_names.py 放在網站根目錄，也就是和 auto-speech.py、daily.json 同一層，再雙擊執行。
echo.
pause
goto end

:nopy
echo.
echo 找不到 Python。請先安裝 Python（python.org，安裝時勾選 Add Python to PATH）。
echo.
pause
goto end

:end
