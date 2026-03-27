@echo off
title AXIOM-MESH Bootstrap (Windows) - FULL AUTO MODE
echo ==========================================================
echo    AXIOM-MESH Bootstrap (Windows) - FULL AUTO MODE
echo ==========================================================

:: Check if Chocolatey is installed
choco -v >nul 2>&1
if %errorlevel% neq 0 (
    echo Chocolatey not found ^|^| installing automatically...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))"
    timeout /t 8 >nul
)

:: Install prerequisites with Chocolatey
echo Installing Make, Node.js, and Docker Desktop...
choco install make nodejs docker-desktop -y --force

:: Refresh environment variables
call refreshenv >nul 2>&1

:: Install Python dependencies
echo Installing Python packages from requirements.txt...
python -m pip install --upgrade pip
python -m pip install -r requirements.txt

:: Launch the universal installer
echo Launching AXIOM-MESH installer...
python install.py

pause
