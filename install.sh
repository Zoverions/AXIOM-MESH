#!/usr/bin/env bash
set -euo pipefail

echo "=========================================================="
echo "   AXIOM-MESH Bootstrap (Unix/Linux/macOS) - FULL AUTO MODE"
echo "=========================================================="

# Parse early flags so shell-side messaging reflects requested mode.
CAPSULE_TYPE=${CAPSULE_TYPE:-"capsule"}  # skill-pill | capsule | capsule-plus
CURRICULUM_REGION=${CURRICULUM_REGION:-"ontario"}

for arg in "$@"; do
  case "$arg" in
    --capsule=*) CAPSULE_TYPE="${arg#*=}" ;;
    --region=*) CURRICULUM_REGION="${arg#*=}" ;;
  esac
done

if [ "$CAPSULE_TYPE" = "skill-pill" ]; then
  echo "🟢 Installing Skill Pill (ultra-lightweight) – <150 MB RAM"
  # only install minimal kernel + selected pill
elif [ "$CAPSULE_TYPE" = "capsule-plus" ]; then
  echo "🔥 Installing Capsule Plus (full education/governance) – region default: ${CURRICULUM_REGION}"
else
  echo "📦 Installing Standard Capsule layer – region: ${CURRICULUM_REGION}"
fi

# Auto-install Homebrew on macOS if missing
if [[ "$(uname)" == "Darwin" ]] && ! command -v brew >/dev/null 2>&1; then
    echo "Homebrew not found → installing automatically..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

# Auto-install Docker, Make, Node.js via native package managers
missing=()
if ! command -v docker >/dev/null 2>&1; then
    missing+=("docker")
fi
if ! command -v make >/dev/null 2>&1; then
    missing+=("make")
fi
if ! command -v node >/dev/null 2>&1; then
    missing+=("nodejs")
fi

if [[ ${#missing[@]} -gt 0 ]]; then
    echo "📦 Missing: ${missing[*]} → Installing automatically..."
    
    if command -v apt-get >/dev/null 2>&1; then
        # Linux (Debian/Ubuntu)
        sudo apt-get update -qq
        if [[ " ${missing[*]} " =~ " docker " ]]; then
            echo "🐳 Installing Docker..."
            curl -fsSL https://get.docker.com | sh
            sudo usermod -aG docker $USER || true
        fi
        if [[ " ${missing[*]} " =~ " make " ]] || [[ " ${missing[*]} " =~ " nodejs " ]]; then
            sudo apt-get install -y make curl
        fi
        if [[ " ${missing[*]} " =~ " nodejs " ]]; then
            echo "📦 Installing Node.js 20 LTS..."
            curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
            sudo apt-get install -y nodejs
        fi
        
    elif command -v dnf >/dev/null 2>&1; then
        # Linux (Fedora/RHEL)
        if [[ " ${missing[*]} " =~ " docker " ]]; then
            echo "🐳 Installing Docker..."
            sudo dnf install -y docker
            sudo systemctl start docker || true
            sudo usermod -aG docker $USER || true
        fi
        if [[ " ${missing[*]} " =~ " make " ]]; then
            sudo dnf install -y make
        fi
        if [[ " ${missing[*]} " =~ " nodejs " ]]; then
            echo "📦 Installing Node.js..."
            sudo dnf install -y nodejs
        fi
        
    elif command -v brew >/dev/null 2>&1; then
        # macOS
        if [[ " ${missing[*]} " =~ " docker " ]]; then
            echo "🐳 Installing Docker Desktop..."
            brew install --cask docker
        fi
        if [[ " ${missing[*]} " =~ " make " ]]; then
            brew install make
        fi
        if [[ " ${missing[*]} " =~ " nodejs " ]]; then
            echo "📦 Installing Node.js 20 LTS..."
            brew install node@20
        fi
        
    elif command -v pkg >/dev/null 2>&1; then
        # Android/Termux
        echo "📱 Android/Termux detected..."
        pkg install -y make nodejs docker || true
    fi
else
    echo "✅ All core prerequisites met."
fi

# Ensure Python3 is available
if ! command -v python3 >/dev/null 2>&1; then
    echo "python3 is required but not installed. Attempting to install..."
    if command -v apt-get >/dev/null 2>&1; then
        sudo apt-get update && sudo apt-get install -y python3 python3-pip
    elif command -v brew >/dev/null 2>&1; then
        brew install python
    elif command -v pkg >/dev/null 2>&1; then
        pkg install -y python
    else
        echo "Could not find a supported package manager to install Python 3."
        exit 1
    fi
fi

if [[ ! -f "install.py" ]]; then
    echo "Error: install.py not found in the current directory."
    exit 1
fi

echo "Python 3 is ready. Launching universal auto-installer..."
AUTO_INSTALL=1 python3 install.py --auto "$@"
