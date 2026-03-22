@echo off
echo ==========================================================
echo    AxiomMesh Bootstrap (Windows)
echo ==========================================================

python --version >nul 2>&1
if %errorlevel% equ 0 goto start_python

echo Python is not installed or not in your PATH.
echo Attempting to install Python via Chocolatey...

choco -v >nul 2>&1
if %errorlevel% neq 0 (
    echo Chocolatey is not installed.
    echo Please install Chocolatey ^(https://chocolatey.org/^) and then re-run this script,
    echo or install Python manually.
    pause
    exit /b 1
)

choco install python -y
if %errorlevel% neq 0 (
    echo Failed to install Python via Chocolatey.
    pause
    exit /b 1
)

echo Python installed. You may need to restart this terminal to update your PATH.
echo Restart your terminal and run install.bat again.
pause
exit /b 1

:start_python

if not exist install.py (
    echo Error: install.py not found in the current directory.
    pause
    exit /b 1
)

echo Python is installed. Handing over to cross-platform installer (install.py)...
python install.py
pause
