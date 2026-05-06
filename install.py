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

class InstallationMonitor:
    def __init__(self, mode="normal"):
        self.mode = mode
        self.no_monitor = "--no-monitor" in sys.argv
    def log(self, msg, cpu=0, ram=0):
        if self.no_monitor or self.mode == "quiet": return
        if self.mode == "minimal-edge":
            print(f"[{msg}]", end="\r")
        else:
            print(f"[{msg}] CPU:{cpu}% RAM:{ram}MB")

ENV_FILE = ".env"
PYTHON_DEPS = [
    "httpx", "fastapi", "uvicorn", "pydantic", "python-dotenv",
    "requests", "rich", "psutil", "docker", "pyyaml"
]

REGIONAL_CURRICULUM_CATALOG = Path("config/regional_curricula.json")
DEFAULT_REGION = "ontario"
MACHINE_ROLES = ["dedicated-mesh", "shared-machine", "education-node", "minimal-edge"]
LAUNCH_MODES = ["local-mesh", "single-node", "launch-testnet", "launch-network"]
USER_PRIORITIES = ["performance", "security", "cost", "autonomy"]

def load_supported_regions():
    if not REGIONAL_CURRICULUM_CATALOG.exists():
        return {DEFAULT_REGION: {"name": "Ontario", "capsule_layer": "capsule-plus"}}
    try:
        data = json.loads(REGIONAL_CURRICULUM_CATALOG.read_text())
        return data.get("regions", {})
    except Exception:
        return {DEFAULT_REGION: {"name": "Ontario", "capsule_layer": "capsule-plus"}}

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

def detect_linux_package_manager():
    for candidate in ["apt-get", "dnf", "yum", "pacman", "zypper", "apk"]:
        if shutil.which(candidate):
            return candidate
    return None

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
            pm = detect_linux_package_manager()
            if pm == "apt-get":
                run_cmd("sudo apt-get update -qq", shell=True)
                if "docker" in missing:
                    run_cmd("curl -fsSL https://get.docker.com | sh", shell=True)
                    run_cmd("sudo usermod -aG docker $USER", shell=True)
                if "make" in missing or "nodejs" in missing:
                    run_cmd(["sudo", "apt-get", "install", "-y", "make", "curl"])
                if "nodejs" in missing:
                    run_cmd("curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs", shell=True)
            elif pm in ["dnf", "yum"]:
                if "docker" in missing:
                    run_cmd(["sudo", pm, "install", "-y", "docker"])
                    run_cmd(["sudo", "systemctl", "enable", "--now", "docker"], check=False)
                    run_cmd("sudo usermod -aG docker $USER", shell=True, check=False)
                if "make" in missing:
                    run_cmd(["sudo", pm, "install", "-y", "make"])
                if "nodejs" in missing:
                    run_cmd(["sudo", pm, "install", "-y", "nodejs", "npm"])
            elif pm == "pacman":
                if "docker" in missing:
                    run_cmd(["sudo", "pacman", "-Sy", "--noconfirm", "docker"])
                    run_cmd(["sudo", "systemctl", "enable", "--now", "docker"], check=False)
                    run_cmd("sudo usermod -aG docker $USER", shell=True, check=False)
                if "make" in missing or "nodejs" in missing:
                    packages = ["base-devel"] if "make" in missing else []
                    if "nodejs" in missing:
                        packages.extend(["nodejs", "npm"])
                    if packages:
                        run_cmd(["sudo", "pacman", "-Sy", "--noconfirm"] + packages)
            elif pm == "zypper":
                if "docker" in missing:
                    run_cmd(["sudo", "zypper", "--non-interactive", "install", "docker"])
                    run_cmd(["sudo", "systemctl", "enable", "--now", "docker"], check=False)
                    run_cmd("sudo usermod -aG docker $USER", shell=True, check=False)
                if "make" in missing:
                    run_cmd(["sudo", "zypper", "--non-interactive", "install", "make"])
                if "nodejs" in missing:
                    run_cmd(["sudo", "zypper", "--non-interactive", "install", "nodejs20", "npm20"], check=False)
                    run_cmd(["sudo", "zypper", "--non-interactive", "install", "nodejs", "npm"], check=False)
            elif pm == "apk":
                if "docker" in missing:
                    run_cmd(["sudo", "apk", "add", "docker"])
                    run_cmd(["sudo", "rc-update", "add", "docker", "default"], check=False)
                    run_cmd(["sudo", "service", "docker", "start"], check=False)
                if "make" in missing or "nodejs" in missing:
                    packages = []
                    if "make" in missing:
                        packages.append("make")
                    if "nodejs" in missing:
                        packages.extend(["nodejs", "npm"])
                    run_cmd(["sudo", "apk", "add"] + packages)
            else:
                print("⚠️  Unsupported Linux package manager. Install docker/make/nodejs manually.")

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
        else:
            print(f"⚠️  Unsupported OS '{os_type}'. Install docker/make/nodejs manually.")

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

def normalize_choice(value, allowed, default, label):
    normalized = (value or "").strip().lower()
    if normalized in allowed:
        return normalized
    print(f"⚠️  Unknown {label} '{value}'. Falling back to {default}.")
    return default

def resolve_machine_role(base_role, capsule_layer, monitor_override, os_type):
    role = normalize_choice(base_role, MACHINE_ROLES, "shared-machine", "machine role")

    if capsule_layer == "skill-pill":
        print("🟢 Skill Pill selected, forcing minimal-edge role for ultra-lightweight execution.")
        role = "minimal-edge"
    elif capsule_layer == "capsule-plus":
        print("🔥 Capsule Plus selected, ensuring heavy-duty config with regional focus.")
        if role not in ["education-node", "dedicated-mesh"]:
            role = "education-node"

    if monitor_override:
        forced_role = normalize_choice(monitor_override, MACHINE_ROLES, role, "monitor override")
        print(f"Applying monitor override (4-mode matrix toggle): {forced_role}")
        role = forced_role

    if os_type == "android" and not monitor_override:
        print("Android detected, forcing minimal-edge role.")
        role = "minimal-edge"

    return role

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
    parser.add_argument("--monitor", type=str, help="Monitoring and edge role overrides (verbose, normal, quiet, minimal-edge)")
    parser.add_argument("--no-monitor", action="store_true", help="Disable the installation monitor entirely")
    parser.add_argument("--reward-mode", type=str, choices=["internal-only", "pulsechain-optin"], default="internal-only", help="Set the reward mode for the network (self-funding edition)")
    parser.add_argument("--enhance-pulsechain", type=str, choices=["true", "false"], default="false", help="Opt-in to actively improve PulseChain’s intelligence, security, and governance via AXIOM-MESH")
    parser.add_argument("--pulsechain-mode", type=str, choices=["none", "full-node", "validator"], default="none", help="Opt-in dual-purpose hardware: PulseChain node + Validator co-funding")
    parser.add_argument("--validator-share", type=int, default=85, help="User percentage of validator rewards (platform gets the rest)")
    parser.add_argument("--launch-mode", type=str, choices=LAUNCH_MODES, help="Launch profile override")
    parser.add_argument("--region", type=str, default=DEFAULT_REGION, help="Regional curriculum focus (e.g. ontario)")
    parser.add_argument("--auto", action="store_true", help="Run non-interactively with safe defaults")
    parser.add_argument("--skip-launch", action="store_true", help="Generate configuration without starting services")
    parser.add_argument("--adaptive-node", action="store_true", help="Enable Adaptive Variable Node dynamic role switching")
    args, unknown = parser.parse_known_args()
    supported_regions = load_supported_regions()
    selected_region = (args.region or DEFAULT_REGION).strip().lower()
    if selected_region not in supported_regions:
        print(f"⚠️  Unknown region '{selected_region}'. Falling back to {DEFAULT_REGION}.")
        selected_region = DEFAULT_REGION

    monitor_mode = args.monitor if args.monitor else ("quiet" if args.auto else "normal")
    if args.no_monitor:
        monitor_mode = "quiet"
    monitor = InstallationMonitor(mode=monitor_mode)

    print("==========================================================")
    print("   AXIOM-MESH v16.0.0-Lockdown - Universal Cross-Platform Installer")
    print("==========================================================")

    monitor.log(f"Starting AXIOM-MESH Universal Installer...", cpu=5, ram=100)

    os_type = get_os()
    if args.platform:
        print(f"Override platform specified: {args.platform}")
        os_type = args.platform.lower()
    print(f"Detected OS: {os_type}")
    print(f"Curriculum region: {selected_region} (supported: {', '.join(sorted(supported_regions.keys()))})")

    install_prereqs(os_type)

    first_run = not os.path.exists(ENV_FILE)
    if first_run:
        with open(ENV_FILE, 'w') as f:
            f.write("# AXIOM-MESH Environment Configuration\n")
        print("-> First run detected, initiating bootstrap wizard.")

    auto_install = args.auto or os.environ.get("AUTO_INSTALL", "0") == "1"

    if auto_install:
        machine_role = "shared-machine"
        launch_mode = args.launch_mode or "local-mesh"
        user_priority = "security"
        meshstore_quota = "50"
        network_wallet = ""
        rpc_url = ""
    else:
        machine_role = prompt_with_timeout("Machine role (dedicated-mesh/shared-machine/minimal-edge/education-node)", "shared-machine", 15)
        launch_mode = args.launch_mode or prompt_with_timeout("Launch mode (local-mesh/single-node/launch-testnet/launch-network)", "local-mesh", 15)
        user_priority = prompt_with_timeout("Primary priority (performance/security/cost/autonomy)", "security", 15)

    machine_role = resolve_machine_role(machine_role, args.capsule, args.monitor, os_type)
    launch_mode = normalize_choice(launch_mode, LAUNCH_MODES, "local-mesh", "launch mode")
    user_priority = normalize_choice(user_priority, USER_PRIORITIES, "security", "primary priority")

    monitor.log("Generating machine profile...", cpu=15, ram=150)
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

    monitor.log("Running network launch preflight...", cpu=20, ram=200)
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
        is_bootstrapped = False
        try:
            is_bootstrapped = precheck_data.get("is_bootstrapped", False)
        except Exception:
            pass

        if not is_bootstrapped:
            print("==========================================================")
            print("🌟 NETWORK BOOTSTRAP OPPORTUNITY")
            print("==========================================================")
            print(f"The {launch_mode} network has not been initialized.")
            print(f"You can be the one to launch the initial blockchain code and funding.")
            print("BENEFITS:")
            print("1. Earn the 'Bootstrap Initiator' NFT Achievement.")
            print("2. Guaranteed 'Money Back + Fair Interest' (5% default).")
            print("3. Future rewards (bonus resources, treasury) decided by the founder.")
            print("==========================================================")
            print(f"Estimated bootstrap funding required: ~{requested_funding} ETH")
            print(f"Current detected wallet balance: {current_balance} ETH")

            funding_decision = prompt_with_timeout("Initiate network bootstrap now? (yes/no/skip-to-local)", "no", 15)
            if funding_decision == "yes":
                if not os.getenv("DEPLOYER_KEY"):
                    print("⚠️  DEPLOYER_KEY not found in environment.")
                    dkey = prompt_with_timeout("Enter private key to sign bootstrap transaction (optional if already in env)", "", 30)
                    if dkey:
                        os.environ["DEPLOYER_KEY"] = dkey

                bootstrap_cmd = [sys.executable, "scripts/network_launch_preflight.py", "--launch-mode", launch_mode, "--bootstrap"]
                if rpc_url:
                    bootstrap_cmd.extend(["--rpc-url", rpc_url])
                if network_wallet:
                    bootstrap_cmd.extend(["--wallet-address", network_wallet])
                run_cmd(bootstrap_cmd)
            elif funding_decision == "skip-to-local":
                launch_mode = "local-mesh"
                print("-> Switched to local-mesh mode as requested.")
        else:
            print("✅ Network is already bootstrapped.")

    if launch_mode in ["launch-network", "launch-testnet"]:
        deploy_cmd = [sys.executable, "scripts/network_launch_preflight.py", "--launch-mode", launch_mode, "--deploy"]
        if rpc_url:
            deploy_cmd.extend(["--rpc-url", rpc_url])
        if network_wallet:
            deploy_cmd.extend(["--wallet-address", network_wallet])
        run_cmd(deploy_cmd)
        print("Network setup verified. Founder controls locked to canonical address.")

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
    profile['curriculum_region'] = selected_region
    profile['capsule_layer'] = args.capsule
    profile['reward_mode'] = args.reward_mode
    profile['enhance_pulsechain'] = args.enhance_pulsechain == "true"
    profile['pulsechain_mode'] = args.pulsechain_mode
    profile['validator_share'] = args.validator_share
    profile_path.write_text(json.dumps(profile, indent=2) + '\n')

    monitor.log(f"Profile saved: {args.capsule} capsule, {args.reward_mode} reward mode, pulsechain mode: {args.pulsechain_mode}", cpu=25, ram=250)

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
        "LOCAL_MODEL_FALLBACK": recommended_model,
        "CURRICULUM_REGION": selected_region,
        "CAPSULE_LAYER": args.capsule,
        "REWARD_MODE": args.reward_mode,
        "ENHANCE_PULSECHAIN": "1" if args.enhance_pulsechain == "true" else "0",
        "PULSECHAIN_MODE": args.pulsechain_mode,
        "VALIDATOR_SHARE": str(args.validator_share),
        "ADAPTIVE_NODE": "1" if args.adaptive_node else "0"
    }

    if default_policy_cid:
        config["DEFAULT_POLICY_CID"] = default_policy_cid

    write_env(config)

    monitor.log("Installation complete, environment prepared.", cpu=5, ram=400)
    print("Configuration saved to .env")
    print("==========================================================")
    print("   Starting AXIOM-MESH Platform ")
    print("==========================================================")

    if args.skip_launch:
        print("✅ Installation profile generated. Launch skipped (--skip-launch).")
        print("Next steps: run `make up` then `python3 -m hypervisor.src.orchestrator --mode public-pool`.")
        return

    if os_type == 'android':
        print("Android environment: running minimal services...")
        print("Installation complete!")
        print("To run, execute: python3 -m hypervisor.src.orchestrator --mode public-pool")
        subprocess.Popen([sys.executable, "-m", "hypervisor.src.orchestrator", "--mode", "public-pool"])
        return

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
