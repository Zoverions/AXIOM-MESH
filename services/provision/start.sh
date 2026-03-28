#!/bin/bash
# AXIOM-MESH QR Provisioning Service Launcher
# Starts both the provisioning coordinator and scanner services

set -e

echo "=================================================="
echo "   AXIOM-MESH QR Provisioning System"
echo "=================================================="

# Check if running in Docker or bare metal
if [ -f /.dockerenv ]; then
    echo "🐳 Running in Docker container"
    PROVISION_MODE=${PROVISION_MODE:-"coordinator"}
else
    echo "💻 Running on bare metal/VM"
    PROVISION_MODE=${PROVISION_MODE:-"both"}
fi

# Install dependencies if needed
echo "📦 Checking dependencies..."
python3 -m pip install -q -r requirements.txt 2>/dev/null || {
    echo "⚠️  Installing dependencies..."
    python3 -m pip install -r requirements.txt
}

# Load environment
if [ -f ../../.env ]; then
    echo "📋 Loading environment from ../../.env"
    export $(cat ../../.env | grep -v '^#' | xargs)
elif [ -f .env ]; then
    echo "📋 Loading environment from .env"
    export $(cat .env | grep -v '^#' | xargs)
fi

# Set defaults if not configured
export MESH_ID=${MESH_ID:-"axiom-mesh-default"}
export COORDINATOR_URL=${COORDINATOR_URL:-"http://localhost:8081"}
export NETWORK_NAME=${NETWORK_NAME:-"axiom-private"}
export CHAIN_ID=${CHAIN_ID:-"31337"}
export RPC_URL=${RPC_URL:-"http://localhost:8545"}

echo ""
echo "Configuration:"
echo "  Mesh ID: $MESH_ID"
echo "  Coordinator URL: $COORDINATOR_URL"
echo "  Network: $NETWORK_NAME"
echo "  Chain ID: $CHAIN_ID"
echo ""

start_coordinator() {
    echo "🚀 Starting Provisioning Coordinator on port 8081..."
    echo "   Dashboard: http://localhost:8081"
    echo "   API: http://localhost:8081/api"
    python3 provision_service.py &
    COORDINATOR_PID=$!
    sleep 2
}

start_scanner() {
    echo "🚀 Starting QR Scanner on port 8082..."
    echo "   Scanner UI: http://localhost:8082"
    COORDINATOR_URL="http://localhost:8081" python3 scanner_service.py &
    SCANNER_PID=$!
    sleep 2
}

case "$PROVISION_MODE" in
    coordinator)
        start_coordinator
        ;;
    scanner)
        start_scanner
        ;;
    both)
        start_coordinator
        start_scanner
        ;;
    *)
        echo "❌ Unknown PROVISION_MODE: $PROVISION_MODE"
        echo "   Valid modes: coordinator, scanner, both"
        exit 1
        ;;
esac

echo ""
echo "✅ Services started successfully!"
echo ""
echo "Quick Start:"
echo "  1. Open http://localhost:8081 to generate invitation QR codes"
echo "  2. Use mobile device to scan QR code at http://localhost:8082"
echo "  3. Sign with wallet and download configuration"
echo "  4. Run new node with downloaded config"
echo ""
echo "Press Ctrl+C to stop all services"

# Wait for processes
wait
