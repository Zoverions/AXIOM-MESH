# AXIOM-MESH Universal Bootstrap for Windows
# Run this in PowerShell as Administrator:
# powershell -ExecutionPolicy Bypass -File bootstrap.ps1

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "AXIOM-MESH Windows Bootstrap" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# 1. Check for Git
if (!(Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "[!] Git not found. Attempting to install via Chocolatey..." -ForegroundColor Yellow
    
    # Check for Chocolatey
    if (!(Get-Command choco -ErrorAction SilentlyContinue)) {
        Write-Host "[!] Chocolatey not found. Installing Chocolatey..." -ForegroundColor Yellow
        Set-ExecutionPolicy Bypass -Scope Process -Force
        [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
        iex ((New-Object System.Net.WebClient).DownloadString('https://chocolatey.org/install.ps1'))
    }
    
    choco install git -y
    RefreshEnv
}

# 2. Check for Docker Desktop
if (!(Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "[!] Docker not found. Attempting to install via Chocolatey..." -ForegroundColor Yellow
    if (Get-Command choco -ErrorAction SilentlyContinue) {
        choco install docker-desktop -y
        Write-Host "[!] Docker Desktop installed. Please restart your computer or start the Docker Desktop app manually, then re-run this script." -ForegroundColor Red
        exit 1
    } else {
        Write-Host "[x] Cannot install Docker automatically without Chocolatey. Please install Docker Desktop manually." -ForegroundColor Red
        exit 1
    }
}

# 3. Clone Repository
$InstallDir = "$env:USERPROFILE\axiom-mesh"
if (Test-Path $InstallDir) {
    Write-Host "[•] Existing installation found. Updating..." -ForegroundColor Blue
    Set-Location $InstallDir
    git pull
} else {
    Write-Host "[•] Cloning repository..." -ForegroundColor Blue
    git clone https://github.com/your-org/axiom-mesh.git $InstallDir
    Set-Location $InstallDir
}

# 4. Run Linux Subsystem or Native Script if exists
if (Test-Path "install.sh") {
    Write-Host "[•] Running install.sh via WSL/GitBash..." -ForegroundColor Blue
    # Try WSL first
    if (Get-Command wsl -ErrorAction SilentlyContinue) {
        wsl bash ./install.sh
    } elseif (Get-Command bash -ErrorAction SilentlyContinue) {
        bash ./install.sh
    } else {
        Write-Host "[!] No bash environment found. You may need to run setup manually." -ForegroundColor Yellow
    }
}

Write-Host "[✓] Installation Complete!" -ForegroundColor Green
Write-Host "Next steps: cd $InstallDir && .\start.ps1 (if available)" -ForegroundColor Green
