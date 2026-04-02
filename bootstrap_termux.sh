# AXIOM-MESH Universal Bootstrap for Android (Termux)
# Run in Termux:
# curl -sSL https://raw.githubusercontent.com/your-org/axiom-mesh/main/bootstrap_termux.sh | bash

echo "========================================"
echo "AXIOM-MESH Termux Bootstrap"
echo "========================================"

# 1. Update and Install Basic Tools
echo "[•] Updating package lists..."
pkg update -y

echo "[•] Installing Git..."
pkg install -y git python

# Note: Docker doesn't run natively on Termux without root/proot tricks.
# We assume the user will connect to a remote Docker daemon or skip containerization.
if ! command -v docker &> /dev/null; then
    echo "[!] Native Docker is not supported in standard Termux."
    echo "[!] You can either:"
    echo "    1. Install 'docker' via proot-distro (advanced)"
    echo "    2. Configure DOCKER_HOST to point to a remote server"
    read -p "Do you want to configure a remote Docker host now? [y/N]: " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        read -p "Enter remote Docker host (e.g., tcp://192.168.1.50:2375): " DOCKER_HOST
        echo "export DOCKER_HOST=$DOCKER_HOST" >> ~/.bashrc
        export DOCKER_HOST=$DOCKER_HOST
        echo "[✓] Remote Docker host configured."
    else
        echo "[!] Skipping Docker. Some features may not work."
    fi
else
    echo "[✓] Docker detected."
fi

# 2. Clone Repository
INSTALL_DIR="$HOME/axiom-mesh"
if [ -d "$INSTALL_DIR" ]; then
    echo "[•] Existing installation found. Updating..."
    cd "$INSTALL_DIR" || exit
    git pull
else
    echo "[•] Cloning repository..."
    git clone https://github.com/your-org/axiom-mesh.git "$INSTALL_DIR"
    cd "$INSTALL_DIR" || exit
fi

# 3. Run Setup
if [ -f "install.sh" ]; then
    echo "[•] Running install.sh..."
    chmod +x install.sh
    ./install.sh
fi

echo "[✓] Installation Complete!"
echo "Next steps: cd $INSTALL_DIR && ./start.sh (if available)"
