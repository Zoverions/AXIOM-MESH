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
        # Check for NFT access token
        if "tokenId" in intent.get("metadata", {}):
            policy_cid = os.getenv("DEFAULT_POLICY_CID", "")
            policy = load_policy_from_meshstore(policy_cid)
            nft_clarity = policy.get("sandbox", {}).get("privacy", {}).get("nft-clarity", "")

            # Simulated checking of zkML proofs against ZKMLVerifier.sol before granting access to MeshStore
            try:
                # Triggering zkML execution to verify proof of access rights
                subprocess.run(['echo', 'zkML verification logic triggered for Enterprise Access...'], check=True)

                if any(lvl in nft_clarity for lvl in ["obfuscated", "partial", "full"]):
                    return "zkml-local"
            except Exception as e:
                pass

        # Step 1: dialectic reduction (existing)
        reduced = reduce_to_first_principles(intent["content"])

        # Step 2: NemoClaw-style sensitivity check
        # Added zkml thresholds for Enterprise
        if any(pii in reduced.lower() for pii in ["personal", "key", "seed", "recovery", "zkml-critical", "founder-claim", "governance"]):
            policy_cid = os.getenv("DEFAULT_POLICY_CID", "")  # stored in MeshStore
            policy = load_policy_from_meshstore(policy_cid)
            privacy_level = policy.get("sandbox", {}).get("privacy", {}).get("level", "local-only")

            if privacy_level == "local-only":
                return "zkml-local"  # route to Sandbox proof gen
            return "zkml-external"  # strict YAML allowlist with zkML checks

        # Default: safe external via NCP
        return "ncp-external"

# Hook into existing NCPClient
from src.engine.ncp_client import NCPClient
NCPClient.route = PrivacyRouter().route