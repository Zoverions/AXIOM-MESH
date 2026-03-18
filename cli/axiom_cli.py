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

    # MeshStore question (Priority 1)
    quota = input("💾 MeshStore contribution (GB, default 50)? ") or "50"
    with open(".env", "a") as f:
        f.write(f"MESHSTORE_QUOTA_GB={quota}\n")

    # Basic recovery prompt (keeps 2FA in To-Do List)
    enable_recovery = input("🔐 Enable recovery bundle to MeshStore? (y/n) [y] ") or "y"
    if enable_recovery.lower() == "y":
        with open(".env", "a") as f:
            f.write("RECOVERY_ENABLED=true\n")

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


if __name__ == "__main__":
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
