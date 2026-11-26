@echo off
cd /d "%~dp0"
if not exist "D:\kokoro-env\Scripts\python.exe" (
  echo Cannot find D:\kokoro-env\Scripts\python.exe
  pause
  exit /b 1
)
"D:\kokoro-env\Scripts\python.exe" auto-speech.py --kokoro
if errorlevel 1 pause
