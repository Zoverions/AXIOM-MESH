@echo off
title AXIOM-MESH Bootstrap (Windows) - FULL AUTO MODE
echo ==========================================================
echo    AXIOM-MESH Bootstrap (Windows) - FULL AUTO MODE
echo ==========================================================

:: Auto-install Chocolatey if missing
choco -v >nul 2>&1
if %errorlevel% neq 0 (
    echo Chocolatey not found → installing automatically...
    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
        "Set-ExecutionPolicy Bypass -Scope Process -Force; ^
         [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; ^
         iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))"
)

:: Now hand over to the smart Python installer
if not exist install.py (
    echo Error: install.py not found!
    pause
    exit /b 1
)

python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Python not found → installing automatically via Chocolatey...
    choco install python -y
)

echo Python detected. Launching universal auto-installer...
python install.py %*

pause
