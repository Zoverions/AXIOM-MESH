#!/usr/bin/env python3
import os
import sys
import platform
import subprocess
import json
import shutil
import threading
import argparse
from pathlib import Path

ENV_FILE = ".env"
PYTHON_DEPS = [
    "httpx", "fastapi", "uvicorn", "pydantic", "python-dotenv",
    "requests", "rich", "psutil", "docker", "pyyaml"
]

def run_cmd(cmd, shell=False, check=True, capture_output=False):
    try:
        res = subprocess.run(cmd, shell=shell, check=check, capture_output=capture_output, text=True)
        if capture_output:
            return res.stdout.strip()
        return True
    except subprocess.CalledProcessError as e:
        print(f"⚠️  Command failed: {cmd}\n   {e}")
        if capture_output:
            return ""
        return False
    except FileNotFoundError:
        if capture_output:
            return ""
        return False

def get_os():
    sys_os = platform.system().lower()
    if sys_os == 'linux':
        if 'PREFIX' in os.environ and 'termux' in os.environ.get('PREFIX', '').lower():
            return 'android'
        return 'linux'
    elif sys_os == 'darwin':
        return 'macos'
    elif sys_os == 'windows':
        return 'windows'
    return sys_os

def install_prereqs(os_type):
    print("🔍 Checking prerequisites...")
    missing = []
    if not shutil.which("docker"):
        missing.append("docker")
    if not shutil.which("make"):
        missing.append("make")
    if not shutil.which("node"):
        missing.append("nodejs")

    if not missing:
        print("✅ All core prerequisites met.")
    else:
        print(f"📦 Missing: {', '.join(missing)} → Installing automatically...")

        if os_type == 'windows':
            # Auto Chocolatey already handled in install.bat, but safe-guard
            if not shutil.which("choco"):
                print("❌ Chocolatey still missing. This should not happen.")
                return

            if "docker" in missing:
                print("🐳 Installing Docker Desktop...")
                run_cmd(["choco", "install", "docker-desktop", "-y", "--force"])
                print("⚠️  Docker Desktop installed. Please RESTART your computer, then run install.bat again.")
                input("Press Enter after restart to continue...")
            if "make" in missing:
                run_cmd(["choco", "install", "make", "-y"])
            if "nodejs" in missing:
                run_cmd(["choco", "install", "nodejs", "-y", "--force"])

        elif os_type == 'linux':
            if shutil.which("apt-get"):
                run_cmd("sudo apt-get update -qq", shell=True)
                if "docker" in missing:
                    run_cmd("curl -fsSL https://get.docker.com | sh", shell=True)
                    run_cmd("sudo usermod -aG docker $USER", shell=True)
                if "make" in missing or "nodejs" in missing:
                    run_cmd(["sudo", "apt-get", "install", "-y", "make", "curl"])
                if "nodejs" in missing:
                    run_cmd("curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs", shell=True)

        elif os_type == 'macos':
            if not shutil.which("brew"):
                print("Homebrew not found. Installing...")
                run_cmd('/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"', shell=True)
            if "docker" in missing:
                run_cmd(["brew", "install", "--cask", "docker"])
            if "make" in missing:
                run_cmd(["brew", "install", "make"])
            if "nodejs" in missing:
                run_cmd(["brew", "install", "node@20"])

        elif os_type == 'android':
            if shutil.which("pkg"):
                run_cmd(["pkg", "install", "-y", "make", "nodejs", "docker"])
            print("📱 Android/Termux → using minimal-edge mode")

    # Always install Python dependencies
    print("🐍 Installing Python dependencies...")
    run_cmd([sys.executable, "-m", "pip", "install", "--upgrade", "pip"])
    run_cmd([sys.executable, "-m", "pip", "install"] + PYTHON_DEPS)

def prompt_with_timeout(prompt, default, timeout=15):
    """Prompt user with a timeout. If timeout is reached, return default."""
    print(f"{prompt} [{default}] (Auto-defaults in {timeout}s): ", end="", flush=True)

    answer = [None]
    def get_input():
        try:
            answer[0] = input()
        except EOFError:
            pass

    t = threading.Thread(target=get_input)
    t.daemon = True
    t.start()
    t.join(timeout)

    if t.is_alive():
        print(f"\nTimeout reached. Using default: {default}")
        return default
    else:
        res = answer[0]
        if res is not None and res.strip() != "":
            return res.strip()
        else:
            return default

def write_env(config):
    env_lines = []
    if os.path.exists(ENV_FILE):
        with open(ENV_FILE, 'r') as f:
            env_lines = f.readlines()

    env_dict = {}
    for line in env_lines:
        line = line.strip()
        if line and not line.startswith('#'):
            if '=' in line:
                k, v = line.split('=', 1)
                env_dict[k] = v

    for k, v in config.items():
        if k not in env_dict or env_dict[k] == "":
            env_dict[k] = str(v)

    with open(ENV_FILE, 'w') as f:
        f.write("# AXIOM-MESH Environment Configuration\n")
        for k, v in env_dict.items():
            f.write(f"{k}={v}\n")

def main():
    parser = argparse.ArgumentParser(description="AXIOM-MESH Universal Cross-Platform Installer")
    parser.add_argument("--capsule", type=str, choices=["skill-pill", "capsule", "capsule-plus"], default="capsule", help="Capsule layer to install")
    parser.add_argument("--platform", type=str, help="Target platform overrides")
    parser.add_argument("--monitor", type=str, help="Monitoring and edge role overrides")
    parser.add_argument("--region", type=str, default="ontario", help="Regional curriculum focus (e.g. ontario)")
    args, unknown = parser.parse_known_args()

    print("==========================================================")
    print("   AXIOM-MESH v16.0.0-Lockdown - Universal Cross-Platform Installer")
    print("==========================================================")

    os_type = get_os()
    if args.platform:
        print(f"Override platform specified: {args.platform}")
        os_type = args.platform.lower()
    print(f"Detected OS: {os_type}")

    install_prereqs(os_type)

    first_run = not os.path.exists(ENV_FILE)
    if first_run:
        with open(ENV_FILE, 'w') as f:
            f.write("# AXIOM-MESH Environment Configuration\n")
        print("-> First run detected, initiating bootstrap wizard.")

    auto_install = os.environ.get("AUTO_INSTALL", "0") == "1"

    if auto_install:
        machine_role = "shared-machine"
        launch_mode = "local-mesh"
        user_priority = "security"
        meshstore_quota = "50"
        network_wallet = ""
        rpc_url = ""
    else:
        machine_role = prompt_with_timeout("Machine role (dedicated-mesh/shared-machine/minimal-edge/education-node)", "shared-machine", 15)

        # Override machine_role if capsule is skill-pill or if platform overrides mandate it
        if args.capsule == "skill-pill":
            print("🟢 Skill Pill selected, forcing minimal-edge role for ultra-lightweight execution.")
            machine_role = "minimal-edge"
        elif args.capsule == "capsule-plus":
            print(f"🔥 Capsule Plus selected, ensuring heavy-duty config with regional focus: {args.region}.")
            if machine_role not in ["education-node", "dedicated-mesh"]:
                machine_role = "education-node"

        if args.monitor:
            print(f"Applying monitor override: {args.monitor}")
            machine_role = args.monitor

        if os_type == 'android':
            print("Android detected, forcing minimal-edge role.")
            machine_role = "minimal-edge"

        launch_mode = prompt_with_timeout("Launch mode (local-mesh/single-node/launch-testnet/launch-network)", "local-mesh", 15)
        user_priority = prompt_with_timeout("Primary priority (performance/security/cost/autonomy)", "security", 15)

    print("Generating machine profile...")
    os.environ["MACHINE_ROLE"] = machine_role
    run_cmd([sys.executable, "scripts/generate_machine_profile.py", "--machine-role", machine_role, "--output", "config/machine_profile.json"])

    profile_path = Path('config/machine_profile.json')
    try:
        profile = json.loads(profile_path.read_text())
        recommended_model = profile.get('recommended_local_model', 'llama3:8b')
    except Exception:
        recommended_model = "llama3:8b"
        profile = {}

    print(f"-> Recommended local model: {recommended_model}")

    if launch_mode in ["launch-network", "launch-testnet"] and not auto_install:
        rpc_url = prompt_with_timeout("Enter RPC URL for funding checks (e.g. https://rpc.pulsechain.com) [optional]", "", 15)
        network_wallet = prompt_with_timeout("Enter network wallet address for funding checks (optional)", "", 15)
    else:
        rpc_url = ""
        network_wallet = ""

    print("-> Running network launch preflight...")
    precheck_cmd = [sys.executable, "scripts/network_launch_preflight.py", "--launch-mode", launch_mode]
    if rpc_url:
        precheck_cmd.extend(["--rpc-url", rpc_url])
    if network_wallet:
        precheck_cmd.extend(["--wallet-address", network_wallet])

    precheck_output = run_cmd(precheck_cmd, capture_output=True)
    print(precheck_output)

    requested_funding = 0
    current_balance = 0
    try:
        precheck_data = json.loads(precheck_output)
        requested_funding = precheck_data.get("estimated_min_funding_eth", 0)
        current_balance = precheck_data.get("wallet_balance_eth", 0)
        next_action = precheck_data.get("next_action", "")
        print(f"-> Preflight recommendation: {next_action}")
    except Exception:
        pass

    if launch_mode in ["launch-network", "launch-testnet"] and not auto_install:
        print(f"Estimated bootstrap funding required: ~{requested_funding} ETH")
        print(f"Current detected wallet balance: {current_balance} ETH")
        funding_decision = prompt_with_timeout("Fund network wallet now? (yes/no/skip-to-local)", "no", 15)
        if funding_decision == "skip-to-local":
            launch_mode = "local-mesh"
            print("-> Switched to local-mesh mode as requested.")

    if launch_mode in ["launch-network", "launch-testnet"]:
        deploy_cmd = [sys.executable, "scripts/network_launch_preflight.py", "--launch-mode", launch_mode, "--deploy"]
        if rpc_url:
            deploy_cmd.extend(["--rpc-url", rpc_url])
        if network_wallet:
            deploy_cmd.extend(["--wallet-address", network_wallet])
        run_cmd(deploy_cmd)
        print("Network launched. Founder controls locked to canonical address.")

    free_disk_gb = shutil.disk_usage('/').free // (1024**3)

    if not auto_install:
        meshstore_quota = prompt_with_timeout("How much storage for MeshStore (GB)?", "50", 15)
    try:
        quota_int = int(meshstore_quota)
    except ValueError:
        quota_int = 50

    if quota_int > free_disk_gb:
        print(f"Requested quota {quota_int}GB exceeds free disk {free_disk_gb}GB; capping at {free_disk_gb}GB.")
        quota_int = free_disk_gb

    profile['storageOffer'] = {'capacityGB': quota_int, 'type': 'ipfs-meshstore'}
    profile['user_priority'] = user_priority
    profile['launch_mode'] = launch_mode
    profile_path.write_text(json.dumps(profile, indent=2) + '\n')

    # Setup Sandbox Default Policy
    policy_dir = Path("sandbox/policies")
    policy_dir.mkdir(parents=True, exist_ok=True)
    policy_file = policy_dir / "default.yaml"

    if machine_role == "education-node":
        default_policy_content = """sandbox:
  filesystem: ["/meshstore/**", "/education/**"]
  network: ["ncp-servers", "open-claw", "nemo-claw"]
  privacy:
    level: safe-external
    location_services: true
"""
    else:
        default_policy_content = """sandbox:
  filesystem: ["/meshstore/**"]
  network: ["ncp-servers"]
  privacy:
    level: local-only
"""

    if not policy_file.exists():
        policy_file.write_text(default_policy_content)

    default_policy_cid = ""
    if shutil.which("ipfs"):
        cid_out = run_cmd(["ipfs", "add", "-q", str(policy_file)], capture_output=True)
        if cid_out:
            default_policy_cid = cid_out.splitlines()[-1]

    config = {
        "MACHINE_ROLE": machine_role,
        "MACHINE_PROFILE_PATH": "config/machine_profile.json",
        "MESHSTORE_QUOTA_GB": str(quota_int),
        "LAUNCH_MODE": launch_mode,
        "USER_PRIORITY": user_priority,
        "NETWORK_WALLET_ADDRESS": network_wallet,
        "RPC_URL": rpc_url,
        "ESTIMATED_BOOTSTRAP_FUNDING_ETH": str(requested_funding),
        "LLM_PROVIDER": "openai",
        "OPENAI_API_KEY": "",
        "DISCORD_TOKEN": "",
        "WHATSAPP_SESSION": "",
        "NCP_SERVERS": "http://localhost:8080",
        "MCP_SERVERS": "",
        "FDBA_FOUNDER_ADDRESS": "0x1c2cbabf75e1938ed2f2c59e734e83aa5fbe1b73",
        "LOCAL_MODEL_FALLBACK": recommended_model
    }

    if default_policy_cid:
        config["DEFAULT_POLICY_CID"] = default_policy_cid

    write_env(config)

    print("Configuration saved to .env")
    print("==========================================================")
    print("   Starting AXIOM-MESH Platform ")
    print("==========================================================")

    if os_type == 'android':
        print("Android environment: running minimal services...")
        print("Installation complete!")
        print("To run, execute: python3 -m hypervisor.src.orchestrator --mode public-pool")
        subprocess.Popen([sys.executable, "-m", "hypervisor.src.orchestrator", "--mode", "public-pool"])
    else:
        if launch_mode in ["launch-network", "launch-testnet"]:
            print(f"Running in {launch_mode} mode; ensure wallet funding + deployment approvals are complete.")
            print("Starting local control plane services with: make up")
        else:
            print("Running 'make up' to build and start docker-compose services...")

        run_cmd(["make", "up"])

        print("Installation complete!")
        subprocess.Popen([sys.executable, "-m", "hypervisor.src.orchestrator", "--mode", "public-pool"])
        print("Dashboard: http://localhost:3000")
        print("CLI: make cli")

if __name__ == "__main__":
    main()
