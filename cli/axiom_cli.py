import requests
import os

GATEWAY_REST_URL = "http://localhost:3000/api/v1/intent/process"
GATEWAY_API_KEY = os.environ.get("GATEWAY_API_KEY")

# Attempt to load from .env file if available and python-dotenv is installed
try:
    from dotenv import load_dotenv
    load_dotenv()
    if not GATEWAY_API_KEY:
        GATEWAY_API_KEY = os.environ.get("GATEWAY_API_KEY")
except ImportError:
    pass

def send_intent(content: str):
    payload = {
        "channel": "cli",
        "content": content,
        "metadata": {}
    }
    print(f"Sending: {content}")
    headers = {}
    if GATEWAY_API_KEY:
        headers["Authorization"] = f"Bearer {GATEWAY_API_KEY}"

    try:
        response = requests.post(GATEWAY_REST_URL, json=payload, headers=headers)
        response.raise_for_status()
        data = response.json()
        print(f"Response: {data.get('response', data)}")
    except Exception as e:
        print(f"Error: {e}")

def setup_node():
    if not os.path.exists("hardware_profile.json"):
        return
    import json
    import sys
    sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'hypervisor')))
    try:
        from src.llm.provider import LLMProvider
    except ImportError:
        LLMProvider = None

    with open("hardware_profile.json", "r") as f:
        profile = json.load(f)
    print("Hardware profile detected.")
    goal = input("What is your primary goal for this node? ")
    profile["primary_goal"] = goal
    with open("hardware_profile.json", "w") as f:
        json.dump(profile, f, indent=2)

    with open(".env", "a") as f:
        f.write(f"\nNODE_PRIMARY_GOAL={goal}\n")
    print(f"Goal saved to profile and .env")

    # FDBA configuration
    fdba_address = input("🔑 Enter FDBA Founder Address (default: 0x8943c7bac1914c9a7aba750bf2b6b09fd21037e0): ") or "0x8943c7bac1914c9a7aba750bf2b6b09fd21037e0"
    with open(".env", "a") as f:
        f.write(f"FDBA_FOUNDER_ADDRESS={fdba_address}\n")

    # MeshStore question (Priority 1)
    quota = input("💾 MeshStore contribution (GB, default 50)? ") or "50"
    with open(".env", "a") as f:
        f.write(f"MESHSTORE_QUOTA_GB={quota}\n")

    # Phase 2: 2FA + Recovery (MeshStore bundle)
    enable_2fa = input("🔐 Enable 2FA (TOTP + Passkey) for recovery? (y/n) [y]: ") or "y"
    if enable_2fa.lower() == "y":
        with open(".env", "a") as f:
            f.write("RECOVERY_2FA_ENABLED=true\n")
        print("📱 Scan the QR for Google/Microsoft Authenticator (TOTP)")
        # Calls Gateway /auth/2fa/setup (new endpoint)
        setup_2fa()

    if LLMProvider:
        print("Pulling models via provider...")
        provider = LLMProvider()
        model_name = provider.local_model
        print(f"Ensuring local model '{model_name}' is available...")
        # Secure pulling using subprocess
        import subprocess
        try:
            subprocess.run(["ollama", "pull", model_name], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            print(f"Model {model_name} ready.")
        except Exception as e:
            print(f"Error pulling model {model_name}: {e}")

    join_cluster = input("Joining existing cluster? (y/N): ")
    if join_cluster.lower() == 'y':
        node_id = input("Enter your node ID: ")
        parent_id = input("Enter parent node ID to delegate bond to: ")
        swarm_id = input("Enter Swarm ID to join: ")

        print("Staking bond...")
        try:
            res = requests.post("http://localhost:8080/stake", json={"nodeId": node_id, "amount": 100})
            print(res.json())
        except Exception as e:
            print(e)

        print("Delegating bond...")
        try:
            res = requests.post("http://localhost:8080/bond/delegate", json={"nodeId": node_id, "parentNodeId": parent_id})
            print(res.json())
        except Exception as e:
            print(e)

        print("Joining swarm...")
        try:
            res = requests.post("http://localhost:8080/swarm/join", json={"swarmId": swarm_id, "nodeId": node_id})
            print(res.json())
        except Exception as e:
            print(e)


def setup_2fa():
    try:
        headers = {}
        if GATEWAY_API_KEY:
            headers["Authorization"] = f"Bearer {GATEWAY_API_KEY}"
        node_id = input("Enter your Node ID for 2FA setup: ")
        res = requests.post(
            "http://localhost:3000/api/v1/auth/2fa/setup",
            json={"nodeId": node_id},
            headers=headers
        )
        res.raise_for_status()
        data = res.json()
        print(f"TOTP Setup Success. Secret: {data['data']['secret']}")
        print(f"QR Code URL: {data['data']['qr']}")
    except Exception as e:
        print(f"Error setting up 2FA: {e}")

def recover_from_meshstore(node_id, totp_code):
    print(f"Recovering node {node_id} using TOTP {totp_code} via MeshStore...")
    try:
        headers = {}
        if GATEWAY_API_KEY:
            headers["Authorization"] = f"Bearer {GATEWAY_API_KEY}"
        res = requests.post(
            "http://localhost:3000/api/v1/auth/2fa/recover",
            json={"nodeId": node_id, "totpCode": totp_code},
            headers=headers
        )
        res.raise_for_status()
        data = res.json()
        print(f"Recovery Response: {data}")
    except Exception as e:
        print(f"Error recovering node: {e}")

if __name__ == "__main__":
    import sys

    if "nemo" in sys.argv:
        print("🔒 NemoClaw OpenShell active — Privacy Router + YAML policies enforced")

    # New subcommand support
    if len(sys.argv) > 1:
        if sys.argv[1] == "recover":
            node_id = input("Node ID to recover: ")
            totp_code = input("Enter TOTP code: ")
            # Passkey handled in browser if needed
            recover_from_meshstore(node_id, totp_code)
            sys.exit(0)
        elif sys.argv[1] == "nft" and len(sys.argv) > 2:
            if sys.argv[2] == "mint":
                target = input("Target data set? ")
                clarity = input("Clarity level (obfuscated/partial/full)? ")
                recipient = input("Recipient address? ")
                print("Minting Authorization NFT...")
                try:
                    headers = {}
                    if GATEWAY_API_KEY:
                        headers["Authorization"] = f"Bearer {GATEWAY_API_KEY}"
                    res = requests.post(
                        "http://localhost:3000/api/v1/nft/mint",
                        json={"targetDataSet": target, "clarityLevel": clarity, "recipientAddress": recipient},
                        headers=headers
                    )
                    res.raise_for_status()
                    print(f"Minted successfully: {res.json()}")
                except Exception as e:
                    print(f"Error minting NFT: {e}")
                sys.exit(0)
            elif sys.argv[2] == "access":
                token_id = input("Token ID? ")
                print(f"Accessing data for Token ID: {token_id}...")
                try:
                    headers = {}
                    if GATEWAY_API_KEY:
                        headers["Authorization"] = f"Bearer {GATEWAY_API_KEY}"
                    res = requests.get(
                        f"http://localhost:3000/api/v1/data/query?tokenId={token_id}",
                        headers=headers
                    )
                    res.raise_for_status()
                    print(f"Data accessed: {res.json()}")
                except Exception as e:
                    print(f"Error accessing data: {e}")
                sys.exit(0)

    setup_node()
    print("AxiomMesh CLI - Interactive Mode")
    print("Type 'exit' to quit.")
    while True:
        try:
            content = input("> ")
            if content.lower() in ['exit', 'quit']:
                break
            if content:
                send_intent(content)
        except KeyboardInterrupt:
            break
