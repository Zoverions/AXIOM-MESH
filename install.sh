#!/bin/bash

echo "=========================================================="
echo "   AxiomMesh v2.0 - Automated Installation & Hardware Scan "
echo "=========================================================="
echo ""

# Hardware Scan
echo "-> Scanning Hardware..."

# OS
OS_TYPE=$(uname -s 2>/dev/null || echo "Unknown")
case "$OS_TYPE" in
    Linux*)
        if [ -f /etc/os-release ]; then
            OS_PRETTY_NAME=$(grep ^PRETTY_NAME= /etc/os-release | cut -d '=' -f 2 | tr -d '"')
            if [ -z "$OS_PRETTY_NAME" ]; then
                OS_NAME="Linux"
            else
                OS_NAME="Linux ($OS_PRETTY_NAME)"
            fi
        elif [ -n "$(uname -o 2>/dev/null | grep -i android)" ]; then
            OS_NAME="Android"
        else
            OS_NAME="Linux"
        fi
        ;;
    Darwin*)    OS_NAME="macOS" ;;
    CYGWIN*|MINGW32*|MSYS*|MINGW*) OS_NAME="Windows" ;;
    *)          OS_NAME="$OS_TYPE" ;;
esac
echo "  - Operating System: $OS_NAME"

# CPU
CPU_CORES=$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo "Unknown")
echo "  - CPU Cores: $CPU_CORES"

# RAM
if command -v free &> /dev/null; then
    RAM_TOTAL=$(free -h | awk '/^Mem:/ {print $2}')
elif command -v sysctl &> /dev/null; then
    RAM_BYTES=$(sysctl -n hw.memsize 2>/dev/null)
    if [ ! -z "$RAM_BYTES" ]; then
        RAM_TOTAL=$(echo "scale=2; $RAM_BYTES/1024/1024/1024" | bc)G
    else
        RAM_TOTAL="Unknown"
    fi
else
    RAM_TOTAL="Unknown"
fi
echo "  - Total RAM: $RAM_TOTAL"

# GPU / Model Recommendation
RECOMMENDED_MODEL="llama3:8b" # Default low-end model
if command -v nvidia-smi &> /dev/null; then
    GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader | head -n 1)
    GPU_VRAM=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader | head -n 1 | awk '{print $1}')
    echo "  - NVIDIA GPU Detected: $GPU_NAME (${GPU_VRAM}MB VRAM)"

    if [ "$GPU_VRAM" -ge 24000 ]; then
        RECOMMENDED_MODEL="llama3:70b (or command-r-plus if API)"
    elif [ "$GPU_VRAM" -ge 12000 ]; then
        RECOMMENDED_MODEL="mixtral:8x7b"
    fi
elif system_profiler SPDisplaysDataType &> /dev/null; then
    APPLE_GPU=$(system_profiler SPDisplaysDataType | grep "Chipset Model" | awk -F': ' '{print $2}')
    if [ ! -z "$APPLE_GPU" ]; then
        echo "  - Apple Silicon GPU Detected: $APPLE_GPU"
        # Assuming unified memory, check RAM again
        if [[ "$RAM_TOTAL" == *"64"* || "$RAM_TOTAL" == *"128"* ]]; then
             RECOMMENDED_MODEL="llama3:70b"
        elif [[ "$RAM_TOTAL" == *"32"* ]]; then
             RECOMMENDED_MODEL="mixtral:8x7b"
        fi
    else
        echo "  - No dedicated GPU detected."
    fi
else
    echo "  - No dedicated NVIDIA GPU or Apple Silicon detected."
fi

echo ""
echo "-> Recommended Local Model based on scan: $RECOMMENDED_MODEL"
echo "   (This will be used for local inference fallbacks)"
echo ""

# Generate standardized Hardware Profile JSON
cat <<EOF > hardware_profile.json
{
  "os": "$OS_NAME",
  "cpu_cores": "$CPU_CORES",
  "ram": "$RAM_TOTAL",
  "gpu_name": "${GPU_NAME:-$APPLE_GPU}",
  "gpu_vram": "${GPU_VRAM:-Unknown}",
  "recommended_model": "$RECOMMENDED_MODEL"
}
EOF
echo "-> Hardware profile saved to hardware_profile.json"
echo ""

# MeshStore storage allocation
FREE_DISK=$(df -h / | awk 'NR==2 {print $4}' | sed 's/G//')
echo "💾 Detected free disk: ${FREE_DISK}G"
read -p "How much storage for MeshStore (GB, default 50)? " QUOTA
MESHSTORE_QUOTA_GB=${QUOTA:-50}
echo "export MESHSTORE_QUOTA_GB=$MESHSTORE_QUOTA_GB" >> .env

# Append to profile JSON (already generated)
tmp=$(mktemp)
jq --arg quota "$MESHSTORE_QUOTA_GB" '. + {storageOffer: {capacityGB: ($quota | tonumber), type: "ipfs-meshstore"}}' hardware_profile.json > "$tmp" && mv "$tmp" hardware_profile.json

echo "=========================================================="
echo "   Environment Configuration (Interactive Setup) "
echo "=========================================================="

ENV_FILE=".env"
if [ -f "$ENV_FILE" ]; then
    echo "Existing .env file found. We will skip overwriting existing keys."
    source "$ENV_FILE"
else
    touch "$ENV_FILE"
    echo "# AxiomMesh Environment Configuration" > "$ENV_FILE"
fi

prompt_env() {
    local key=$1
    local default_val=$2
    local prompt_msg=$3

    # Check if already exists in .env
    if grep -q "^$key=" "$ENV_FILE"; then
        return
    fi

    read -p "$prompt_msg [$default_val]: " input
    input=${input:-$default_val}
    echo "$key=$input" >> "$ENV_FILE"
}

prompt_env "LLM_PROVIDER" "openai" "Choose default LLM provider (openai/anthropic/local)"
prompt_env "OPENAI_API_KEY" "" "Enter OpenAI API Key (leave blank if local)"
prompt_env "DISCORD_TOKEN" "" "Enter Discord Bot Token (leave blank to skip)"
prompt_env "WHATSAPP_SESSION" "" "Enter WhatsApp Session ID or Path (leave blank to skip)"
prompt_env "NCP_SERVERS" "http://localhost:8080" "Enter comma-separated NCP server URLs"
prompt_env "MCP_SERVERS" "" "Enter comma-separated MCP server SSE URLs"

# Save the recommended model as fallback
if ! grep -q "^LOCAL_MODEL_FALLBACK=" "$ENV_FILE"; then
    echo "LOCAL_MODEL_FALLBACK=$RECOMMENDED_MODEL" >> "$ENV_FILE"
fi

echo ""
echo "Configuration saved to $ENV_FILE!"
echo ""

echo "=========================================================="
echo "   Starting AxiomMesh Platform "
echo "=========================================================="
echo "Running 'make up' to build and start docker-compose services..."

make up

echo ""
echo "Installation complete!"
echo "You can access the Web Dashboard at: http://localhost:3000"
echo "To interact via CLI, run: make cli"
