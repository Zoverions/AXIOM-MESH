#!/usr/bin/env bash
set -euo pipefail

echo "=========================================================="
echo "   AXIOM-MESH Bootstrap (Unix/Linux/macOS)                 "
echo "=========================================================="

if ! command -v python3 >/dev/null 2>&1; then
    echo "python3 is required but not installed."
    echo "Attempting to install python3..."
    if command -v apt-get >/dev/null 2>&1; then
        sudo apt-get update && sudo apt-get install -y python3
    elif command -v brew >/dev/null 2>&1; then
        brew install python
    elif command -v pkg >/dev/null 2>&1; then
        pkg install -y python
    else
        echo "Could not find a supported package manager to install Python 3."
        echo "Please install Python 3 manually."
        exit 1
    fi
fi

if [[ ! -f "install.py" ]]; then
    echo "Error: install.py not found in the current directory."
    exit 1
fi

echo "Python 3 is installed. Handing over to cross-platform installer (install.py)..."
python3 install.py
