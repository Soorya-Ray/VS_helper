@echo off
powershell.exe -NoProfile -File "%~dp0Start-Demo.ps1" -Provider ollama
if errorlevel 1 pause
