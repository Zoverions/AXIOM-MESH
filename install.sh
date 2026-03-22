#!/usr/bin/env bash
set -euo pipefail

AUTO_INSTALL="${AUTO_INSTALL:-0}"
ENV_FILE=".env"
MACHINE_ROLE="${MACHINE_ROLE:-}"
MESHSTORE_QUOTA_DEFAULT="${MESHSTORE_QUOTA_GB:-50}"
LAUNCH_MODE="${LAUNCH_MODE:-}"
USER_PRIORITY="${USER_PRIORITY:-}"
NETWORK_WALLET_ADDRESS="${NETWORK_WALLET_ADDRESS:-}"
RPC_URL="${RPC_URL:-}"

prompt_env() {
  local key="$1" default_val="$2" prompt_msg="$3"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    return
  fi

  local input=""
  if [[ "$AUTO_INSTALL" == "1" ]]; then
    input="$default_val"
  else
    read -r -p "$prompt_msg [$default_val]: " input
    input=${input:-$default_val}
  fi

  printf '%s=%s\n' "$key" "$input" >> "$ENV_FILE"
}

prompt_choice() {
  local prompt="$1" default="$2"
  local answer=""
  if [[ "$AUTO_INSTALL" == "1" ]]; then
    echo "$default"
    return
  fi
  read -r -p "$prompt [$default]: " answer
  echo "${answer:-$default}"
}

echo "=========================================================="
echo "   AxiomMesh v2.2 - Install + Launch Preflight + Host Safety"
echo "=========================================================="

validate_prerequisites() {
  local missing=()
  if ! command -v python3 >/dev/null 2>&1; then missing+=("python3"); fi
  if ! command -v docker >/dev/null 2>&1; then missing+=("docker"); fi
  if ! command -v make >/dev/null 2>&1; then missing+=("make"); fi

  if [ ${#missing[@]} -gt 0 ]; then
    echo "-> Missing prerequisites detected: ${missing[*]}"
    echo "-> Deterministic Remediation Actions:"
    for m in "${missing[@]}"; do
      case "$m" in
        "python3") echo "   - Install python3: sudo apt-get install -y python3 (Ubuntu) or brew install python (macOS)" ;;
        "docker")  echo "   - Install docker: curl -fsSL https://get.docker.com | sh" ;;
        "make")    echo "   - Install make: sudo apt-get install -y make (Ubuntu) or brew install make (macOS)" ;;
      esac
    done
    if [[ "$AUTO_INSTALL" == "1" ]]; then
      echo "-> AUTO_INSTALL=1 set. Please resolve missing dependencies and try again."
      exit 1
    else
      read -r -p "-> Press Enter once remediated to re-run checks..."
      validate_prerequisites
    fi
  else
    echo "-> All prerequisites validated."
  fi
}

validate_prerequisites

FIRST_RUN=false
if [[ ! -f "$ENV_FILE" ]]; then
  echo "# AxiomMesh Environment Configuration" > "$ENV_FILE"
  FIRST_RUN=true
  echo "-> First run detected, initiating bootstrap wizard."
fi

if [[ -z "$MACHINE_ROLE" ]]; then
  MACHINE_ROLE=$(prompt_choice "Machine role (dedicated-mesh/shared-machine/minimal-edge)" "shared-machine")
fi
if [[ -z "$LAUNCH_MODE" ]]; then
  LAUNCH_MODE=$(prompt_choice "Launch mode (local-mesh/single-node/launch-network)" "local-mesh")
fi
if [[ -z "$USER_PRIORITY" ]]; then
  USER_PRIORITY=$(prompt_choice "Primary priority (performance/security/cost/autonomy)" "security")
fi

PROFILE_PATH=$(python3 scripts/generate_machine_profile.py --machine-role "$MACHINE_ROLE" --output config/machine_profile.json)
echo "-> Machine profile generated at: $PROFILE_PATH"

RECOMMENDED_MODEL=$(python3 - <<'PY'
import json
from pathlib import Path
profile = json.loads(Path('config/machine_profile.json').read_text())
print(profile.get('recommended_local_model', 'llama3:8b'))
PY
)

echo "-> Recommended local model: $RECOMMENDED_MODEL"

if [[ "$LAUNCH_MODE" == "launch-network" && "$AUTO_INSTALL" != "1" ]]; then
  if [[ -z "$RPC_URL" ]]; then
    read -r -p "Enter RPC URL for funding checks (e.g. https://rpc.pulsechain.com) [optional]: " RPC_URL
  fi
  if [[ -z "$NETWORK_WALLET_ADDRESS" ]]; then
    read -r -p "Enter network wallet address for funding checks (optional): " NETWORK_WALLET_ADDRESS
  fi
fi

echo "-> Running network launch preflight..."
PRECHECK_JSON=$(python3 scripts/network_launch_preflight.py --launch-mode "$LAUNCH_MODE" --rpc-url "$RPC_URL" --wallet-address "$NETWORK_WALLET_ADDRESS")
echo "$PRECHECK_JSON"

REQUESTED_FUNDING_ETH=$(python3 -c 'import json,sys; obj=json.load(sys.stdin); print(obj.get("estimated_min_funding_eth",0))' <<< "$PRECHECK_JSON")
CURRENT_BALANCE=$(python3 -c 'import json,sys; obj=json.load(sys.stdin); print(obj.get("wallet_balance_eth",0))' <<< "$PRECHECK_JSON")
NEXT_ACTION=$(python3 -c 'import json,sys; obj=json.load(sys.stdin); print(obj.get("next_action",""))' <<< "$PRECHECK_JSON")

echo "-> Preflight recommendation: $NEXT_ACTION"

if [[ "$LAUNCH_MODE" == "launch-network" && "$AUTO_INSTALL" != "1" ]]; then
  echo "Estimated bootstrap funding required: ~${REQUESTED_FUNDING_ETH} ETH"
  echo "Current detected wallet balance: ${CURRENT_BALANCE} ETH"

  FUNDING_DECISION=$(prompt_choice "Fund network wallet now? (yes/no/skip-to-local)" "no")
  if [[ "$FUNDING_DECISION" == "skip-to-local" ]]; then
    LAUNCH_MODE="local-mesh"
    echo "-> Switched to local-mesh mode as requested."
  fi
fi

if [ "$LAUNCH_MODE" = "launch-network" ]; then
    python3 scripts/network_launch_preflight.py --launch-mode "$LAUNCH_MODE" --rpc-url "$RPC_URL" --wallet-address "$NETWORK_WALLET_ADDRESS" --deploy
    echo "Network launched. Founder controls locked to canonical address."
fi

FREE_DISK=$(python3 - <<'PY'
import shutil
print(int(shutil.disk_usage('/').free/1024/1024/1024))
PY
)

if [[ "$AUTO_INSTALL" == "1" ]]; then
  MESHSTORE_QUOTA_GB="$MESHSTORE_QUOTA_DEFAULT"
else
  read -r -p "How much storage for MeshStore (GB, default ${MESHSTORE_QUOTA_DEFAULT})? " QUOTA
  MESHSTORE_QUOTA_GB=${QUOTA:-$MESHSTORE_QUOTA_DEFAULT}
fi

if (( MESHSTORE_QUOTA_GB > FREE_DISK )); then
  echo "Requested quota ${MESHSTORE_QUOTA_GB}GB exceeds free disk ${FREE_DISK}GB; capping at ${FREE_DISK}GB."
  MESHSTORE_QUOTA_GB="$FREE_DISK"
fi

python3 - <<PY
import json
from pathlib import Path
p = Path('config/machine_profile.json')
data = json.loads(p.read_text())
data['storageOffer'] = {'capacityGB': int(${MESHSTORE_QUOTA_GB}), 'type': 'ipfs-meshstore'}
data['user_priority'] = '${USER_PRIORITY}'
data['launch_mode'] = '${LAUNCH_MODE}'
p.write_text(json.dumps(data, indent=2) + '\n')
PY

prompt_env "MACHINE_ROLE" "$MACHINE_ROLE" "Machine role"
prompt_env "MACHINE_PROFILE_PATH" "config/machine_profile.json" "Machine profile path"
prompt_env "MESHSTORE_QUOTA_GB" "$MESHSTORE_QUOTA_GB" "MeshStore quota in GB"
prompt_env "LAUNCH_MODE" "$LAUNCH_MODE" "Launch mode"
prompt_env "USER_PRIORITY" "$USER_PRIORITY" "Primary user priority"
prompt_env "NETWORK_WALLET_ADDRESS" "$NETWORK_WALLET_ADDRESS" "Network wallet address (for launch-network)"
prompt_env "RPC_URL" "$RPC_URL" "RPC URL (for launch-network)"
prompt_env "ESTIMATED_BOOTSTRAP_FUNDING_ETH" "$REQUESTED_FUNDING_ETH" "Estimated bootstrap funding (ETH)"
prompt_env "LLM_PROVIDER" "openai" "Choose default LLM provider (openai/anthropic/local)"
prompt_env "OPENAI_API_KEY" "" "Enter OpenAI API Key (leave blank if local)"
prompt_env "DISCORD_TOKEN" "" "Enter Discord Bot Token (leave blank to skip)"
prompt_env "WHATSAPP_SESSION" "" "Enter WhatsApp Session ID or Path (leave blank to skip)"
prompt_env "NCP_SERVERS" "http://localhost:8080" "Enter comma-separated NCP server URLs"
prompt_env "MCP_SERVERS" "" "Enter comma-separated MCP server SSE URLs"
prompt_env "FDBA_FOUNDER_ADDRESS" "0x1c2cbabf75e1938ed2f2c59e734e83aa5fbe1b73" "Enter FDBA Founder Address"
prompt_env "LOCAL_MODEL_FALLBACK" "$RECOMMENDED_MODEL" "Local model fallback"

mkdir -p sandbox/policies
if [[ ! -f "sandbox/policies/default.yaml" ]]; then
  cat > sandbox/policies/default.yaml <<'YAML'
sandbox:
  filesystem: ["/meshstore/**"]
  network: ["ncp-servers"]
  privacy:
    level: local-only
YAML
fi

if command -v ipfs >/dev/null 2>&1; then
  CID=$(ipfs add -q sandbox/policies/default.yaml | tail -n 1 || true)
  if [[ -n "$CID" ]]; then
    prompt_env "DEFAULT_POLICY_CID" "$CID" "Default policy CID"
  fi
else
  echo "-> ipfs not found; skipping DEFAULT_POLICY_CID generation"
fi

echo "=========================================================="
echo "   Starting AxiomMesh Platform "
echo "=========================================================="
if [[ "$LAUNCH_MODE" == "launch-network" ]]; then
  echo "Running in launch-network mode; ensure wallet funding + deployment approvals are complete."
  echo "Starting local control plane services with: make up"
  make up
else
  echo "Running 'make up' to build and start docker-compose services..."
  make up
fi

echo ""
echo "Installation complete!"
python3 -m hypervisor.src.orchestrator --mode public-pool &
echo "Dashboard: http://localhost:3000"
echo "CLI: make cli"
