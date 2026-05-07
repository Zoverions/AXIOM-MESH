#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AXIOM-MESH Universal Bootstrap Installer
Supports: Linux, macOS, Windows (PowerShell/CMD), Android (Termux)
Usage: 
  - Linux/macOS/Android: curl -sSL https://raw.githubusercontent.com/.../bootstrap.py | python3
  - Windows: powershell -c "Invoke-RestMethod ... | python"
"""

import os
import sys
import subprocess
import platform
import shutil
import time

# Configuration
REPO_URL = "https://github.com/your-org/axiom-mesh.git"  # Replace with actual repo
INSTALL_DIR = os.path.expanduser("~/axiom-mesh")
REQUIRED_TOOLS = ["git", "docker", "docker-compose"]

class Colors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'

def log(msg, level="INFO"):
    prefix = f"{Colors.OKGREEN}[✓]{Colors.ENDC}" if level == "OK" else \
             f"{Colors.WARNING}[!]{Colors.ENDC}" if level == "WARN" else \
             f"{Colors.FAIL}[✗]{Colors.ENDC}" if level == "ERR" else \
             f"{Colors.OKBLUE}[•]{Colors.ENDC}"
    print(f"{prefix} {msg}")

def run_command(cmd, capture=False):
    """Runs a command securely without using shell=True."""
    try:
        if isinstance(cmd, str):
            import shlex
            cmd = shlex.split(cmd)
        result = subprocess.run(cmd, shell=False, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        return result.stdout.strip() if capture else None
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None

def detect_os():
    system = platform.system().lower()
    if system == "linux":
        # Check for Android (Termux)
        if "ANDROID_ROOT" in os.environ or os.path.exists("/data/data/com.termux"):
            return "android"
        return "linux"
    elif system == "darwin":
        return "macos"
    elif system == "windows":
        return "windows"
    return "unknown"

def install_package_linux(pkg):
    log(f"Installing {pkg} via apt...", "INFO")
    run_command(["sudo", "apt", "update", "-qq"])
    run_command(["sudo", "apt", "install", "-y", pkg])

def install_package_macos(pkg):
    if not shutil.which("brew"):
        log("Homebrew not found. Installing Homebrew...", "WARN")
        try:
            curl_proc = subprocess.run(["curl", "-fsSL", "https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh"],
                                       check=True, stdout=subprocess.PIPE)
            subprocess.run(["/bin/bash"], input=curl_proc.stdout, check=True)
        except Exception as e:
            log(f"Failed to install Homebrew: {e}", "ERR")
    log(f"Installing {pkg} via brew...", "INFO")
    run_command(["brew", "install", pkg])

def install_package_windows(pkg):
    log(f"Installing {pkg} via Chocolatey...", "INFO")
    # Check if choco exists, if not, try to install it or warn
    if not shutil.which("choco"):
        log("Chocolatey not found. Please install manually or run this script in an Admin PowerShell with Choco installed.", "ERR")
        return False
    run_command(["choco", "install", "-y", pkg])

def install_package_android(pkg):
    log(f"Installing {pkg} via pkg (Termux)...", "INFO")
    run_command(["pkg", "update", "-y"])
    run_command(["pkg", "install", "-y", pkg])

def ensure_dependencies(os_type):
    missing = []
    
    # Check Git
    if not shutil.which("git"):
        missing.append("git")
    
    # Check Docker (Special handling for Android/Windows often requires Desktop app)
    if not shutil.which("docker"):
        if os_type != "android": # Docker doesn't run natively on Termux without hacks/root
            missing.append("docker")
        else:
            log("Note: Native Docker in Termux requires root/unstable branches. Skipping native docker install for now.", "WARN")

    if not missing:
        log("All core dependencies detected.", "OK")
        return True

    log(f"Missing dependencies: {', '.join(missing)}", "WARN")
    response = input("Attempt to auto-install missing dependencies? [Y/n]: ").strip().lower()
    if response == 'n':
        log("Aborting installation due to missing dependencies.", "ERR")
        sys.exit(1)

    for pkg in missing:
        if os_type == "linux":
            install_package_linux(pkg)
        elif os_type == "macos":
            install_package_macos(pkg)
        elif os_type == "windows":
            install_package_windows(pkg)
        elif os_type == "android":
            if pkg == "git":
                install_package_android("git")
            # Docker on Android is complex, usually skipped or delegated to remote daemon

    # Verify again
    if not shutil.which("git"):
        log("Failed to install Git. Please install manually.", "ERR")
        sys.exit(1)

def clone_or_update_repo():
    if os.path.exists(INSTALL_DIR):
        log("Existing installation found. Updating...", "INFO")
        run_command(["git", "-C", INSTALL_DIR, "pull"])
    else:
        log(f"Cloning repository to {INSTALL_DIR}...", "INFO")
        run_command(["git", "clone", REPO_URL, INSTALL_DIR])

def run_setup_script():
    setup_script = os.path.join(INSTALL_DIR, "install.sh")
    if os.path.exists(setup_script):
        log("Running local install.sh...", "INFO")
        # Make executable just in case
        os.chmod(setup_script, 0o755)
        subprocess.run([setup_script], cwd=INSTALL_DIR)
    else:
        log("No install.sh found. Setup complete (manual configuration may be required).", "WARN")

def main():
    print(f"{Colors.HEADER}========================================")
    print("AXIOM-MESH Universal Bootstrap")
    print("========================================")
    print(f"Detected OS: {detect_os().upper()}{Colors.ENDC}\n")

    os_type = detect_os()
    if os_type == "unknown":
        log("Unsupported operating system.", "ERR")
        sys.exit(1)

    # 1. Ensure Dependencies
    ensure_dependencies(os_type)

    # 2. Clone/Update Repo
    clone_or_update_repo()

    # 3. Run Specific Setup
    run_setup_script()

    log("Installation Complete! Welcome to AXIOM-MESH.", "OK")
    print(f"\nNext steps: cd {INSTALL_DIR} && ./start.sh (if available)")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log("\nInstallation cancelled by user.", "WARN")
        sys.exit(130)
    except Exception as e:
        log(f"Unexpected error: {e}", "ERR")
        sys.exit(1)
