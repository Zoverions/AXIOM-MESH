# AXIOM-MESH Universal Installation Guide

## One-Command Installers

### Linux (Debian/Ubuntu/Fresh VPS)
```bash
curl -sSL https://raw.githubusercontent.com/your-org/axiom-mesh/main/install.sh | bash
```
*Automatically detects fresh systems and installs curl, git, docker, etc.*

### macOS
```bash
curl -sSL https://raw.githubusercontent.com/your-org/axiom-mesh/main/bootstrap_macos.sh | bash
```
*Installs Homebrew (if missing), Git, and Docker (via Colima or Desktop).*

### Windows (PowerShell as Administrator)
```powershell
powershell -ExecutionPolicy Bypass -c "Invoke-RestMethod -Uri 'https://raw.githubusercontent.com/your-org/axiom-mesh/main/bootstrap.ps1' | Invoke-Expression"
```
*Installs Chocolatey (if missing), Git, and Docker Desktop.*

### Android (Termux)
```bash
pkg install curl && curl -sSL https://raw.githubusercontent.com/your-org/axiom-mesh/main/bootstrap_termux.sh | bash
```
*Installs Git, Python, and configures remote Docker if needed.*

### Universal Python Fallback (Any OS with Python 3)
```bash
curl -sSL https://raw.githubusercontent.com/your-org/axiom-mesh/main/bootstrap.py | python3
```
*Cross-platform installer that handles detection and setup automatically.*

---

## Features

- **Self-Bootstrapping**: Detects missing dependencies and installs them automatically.
- **Interactive Prompts**: Asks for confirmation before installing heavy packages (optional).
- **Idempotent**: Safe to run multiple times; updates existing installations.
- **Platform Specific**: Uses native package managers (apt, brew, choco, pkg).
- **Docker Flexibility**: Supports native Docker, Colima (macOS), or remote Docker hosts (Android).

## Configuration

Edit the `REPO_URL` variable in each script to point to your actual repository.

## Troubleshooting

- **Windows**: Ensure you run PowerShell as Administrator.
- **macOS**: If Docker Desktop fails, the script offers Colima as an alternative.
- **Android**: Native Docker requires root; the script defaults to remote Docker configuration.
- **Linux**: Requires sudo privileges for apt installation.
