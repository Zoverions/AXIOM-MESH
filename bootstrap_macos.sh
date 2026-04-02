# AXIOM-MESH Universal Bootstrap for macOS
# Run in Terminal:
# curl -sSL https://raw.githubusercontent.com/your-org/axiom-mesh/main/bootstrap_macos.sh | bash

set -e

echo "========================================"
echo "AXIOM-MESH macOS Bootstrap"
echo "========================================"

# 1. Check for Homebrew
if ! command -v brew &> /dev/null; then
    echo "[!] Homebrew not found. Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    # Add to PATH for Apple Silicon
    if [[ $(uname -m) == 'arm64' ]]; then
        eval "$(/opt/homebrew/bin/brew shellenv)"
    else
        eval "$(/usr/local/bin/brew shellenv)"
    fi
fi

# 2. Install Dependencies
echo "[•] Checking dependencies..."

if ! command -v git &> /dev/null; then
    echo "[•] Installing Git..."
    brew install git
fi

if ! command -v docker &> /dev/null; then
    echo "[!] Docker not found."
    echo "    Option 1: Install Docker Desktop (Recommended for GUI users)"
    echo "    Option 2: Install colima (Lightweight CLI alternative)"
    read -p "Install colima? [Y/n]: " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        brew install colima docker
        echo "[•] Starting colima..."
        colima start
    else
        echo "[!] Please download and install Docker Desktop from https://www.docker.com/products/docker-desktop"
        echo "[!] After installation, start Docker Desktop and re-run this script."
        exit 1
    fi
fi

# 3. Clone Repository
INSTALL_DIR="$HOME/axiom-mesh"
if [ -d "$INSTALL_DIR" ]; then
    echo "[•] Existing installation found. Updating..."
    cd "$INSTALL_DIR"
    git pull
else
    echo "[•] Cloning repository..."
    git clone https://github.com/your-org/axiom-mesh.git "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

# 4. Run Setup
if [ -f "install.sh" ]; then
    echo "[•] Running install.sh..."
    chmod +x install.sh
    ./install.sh
fi

echo "[✓] Installation Complete!"
echo "Next steps: cd $INSTALL_DIR && ./start.sh (if available)"
