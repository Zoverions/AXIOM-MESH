import os
import time
import requests
import json
import uuid

def register_node(node_url: str):
    node_id = f"node-{uuid.uuid4().hex[:8]}"

    # Normally this would be collected via the HardwareScanner
    payload = {
        "node_id": node_id,
        "cpu_cores": 16,
        "cpu_features": ["avx2", "avx512"],
        "gpu_model": "NVIDIA RTX 4090",
        "gpu_mem_gb": 24.0,
        "has_tee": False,
        "ram_gb": 64.0,
        "storage_gb": 2000.0,
        "bandwidth_mbps": 1000.0,
        "service_classes": ["compute", "inference", "training"],
        "latency_score": 15.5,
        "trust_score": 0.99,
        "last_seen_ts": int(time.time())
    }

    api_key = os.environ.get("HYPERVISOR_API_KEY", "dummy_key_for_testing")
    timestamp = str(int(time.time() * 1000))
    nonce = uuid.uuid4().hex

    import hmac
    import hashlib

    body_str = json.dumps(payload)
    sig_payload = f"{timestamp}:{nonce}:{body_str}"

    mac = hmac.new(api_key.encode('utf-8'), sig_payload.encode('utf-8'), hashlib.sha256).hexdigest()

    headers = {
        "Content-Type": "application/json",
        "X-Axiom-Timestamp": timestamp,
        "X-Axiom-Nonce": nonce,
        "X-Axiom-Signature": mac
    }

    try:
        response = requests.post(f"{node_url}/node/register", json=payload, headers=headers)
        response.raise_for_status()
        print(f"Successfully registered node {node_id}")
        print(response.json())
    except requests.exceptions.RequestException as e:
        print(f"Failed to register node: {e}")
        if hasattr(e, 'response') and e.response is not None:
            print(e.response.text)

if __name__ == "__main__":
    grid_url = os.environ.get("GRID_URL", "http://localhost:5000")
    register_node(grid_url)
