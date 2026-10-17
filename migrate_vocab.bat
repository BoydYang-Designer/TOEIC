@echo off
chcp 65001 >nul
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
cd /d "%~dp0"
title vocab rename tool

if not exist "auto-speech.py" goto nofile
if not exist "migrate_vocab_names.py" goto nofile
set PY=
where py >nul 2>nul && set PY=py
if not defined PY where python >nul 2>nul && set PY=python
if not defined PY goto nopy

:menu
cls
echo ==============================================
echo   vocab mp3 rename tool
echo ==============================================
echo.
echo   1  Preview  - shows what will happen, changes NOTHING  [do this first]
echo   2  Apply    - really rename the files
echo   3  Undo     - restore to the state before Apply
echo   0  Exit
echo.
set C=
set /p C=Type 1, 2, 3 or 0 then press Enter: 
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
echo About to rename for real. Duplicates go to audio\daily\vocab\_stale (nothing is deleted).
echo A map file is written so you can Undo. Run 1 Preview first if you have not.
echo.
set OK=
set /p OK=Type YES to continue (anything else cancels): 
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
echo Will undo using the newest map file: %LAST%
set OK=
set /p OK=Type YES to continue: 
if /i not "%OK%"=="YES" goto menu
echo.
%PY% migrate_vocab_names.py --undo "%LAST%"
echo.
pause
goto menu

:noundo
echo.
echo No map file (vocab-rename-map-*.csv) found. Apply has not been run, nothing to undo.
echo.
pause
goto menu

:nofile
echo.
echo Cannot find auto-speech.py or migrate_vocab_names.py in this folder.
echo Put this .bat and migrate_vocab_names.py in the site root folder
echo (the same folder as auto-speech.py and daily.json), then double-click again.
echo.
pause
goto end

:nopy
echo.
echo Python not found. Install it from python.org and tick "Add Python to PATH".
echo.
pause
goto end

:end
