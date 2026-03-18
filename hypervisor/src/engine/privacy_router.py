# hypervisor/src/engine/privacy_router.py
import os
from src.cortex.dialectic import reduce_to_first_principles
from src.memory.crdt_sync import pin_to_meshstore
import yaml

import subprocess

def load_policy_from_meshstore(cid: str) -> dict:
    # Pull YAML policy CID from existing MeshStore
    try:
        # Use ipfs cli to get content
        result = subprocess.run(['ipfs', 'cat', cid], capture_output=True, text=True, check=True)
        policy = yaml.safe_load(result.stdout)
        return policy
    except Exception:
        return {"sandbox": {"privacy": {"level": "local-only"}}}

class PrivacyRouter:
    def route(self, intent: dict) -> str:
        # Step 1: dialectic reduction (existing)
        reduced = reduce_to_first_principles(intent["content"])

        # Step 2: NemoClaw-style sensitivity check
        if any(pii in reduced.lower() for pii in ["personal", "key", "seed", "recovery"]):
            policy_cid = os.getenv("DEFAULT_POLICY_CID", "")  # stored in MeshStore
            policy = load_policy_from_meshstore(policy_cid)
            if policy.get("sandbox", {}).get("privacy", {}).get("level", "local-only") == "local-only":
                return "local-hypervisor"  # stay inside Sandbox + MeshStore
            return "ncp-external"  # with strict YAML allowlist

        # Default: safe external via NCP
        return "ncp-external"

# Hook into existing NCPClient
from src.engine.ncp_client import NCPClient
NCPClient.route = PrivacyRouter().route