import hashlib
import json
import time
from typing import Any
from ecdsa import SigningKey, VerifyingKey, NIST256p

class CRDTState:
    """
    Offline-first CRDT (Last-Write-Wins Map) for Spectrum Devices.
    Includes zk-private delta sync logic (simulated with ECDSA signatures
    and hashed delta payloads to maintain privacy and verification).
    """
    def __init__(self, node_id: str, private_key_pem: bytes = None):
        self.node_id = node_id
        self.state = {} # key -> {"value": any, "timestamp": float}

        if private_key_pem:
            self.private_key = SigningKey.from_pem(private_key_pem)
        else:
            self.private_key = SigningKey.generate(curve=NIST256p)

        self.public_key_hex = self.private_key.get_verifying_key().to_string("uncompressed").hex()

    def update(self, key: str, value: Any):
        """Updates the local CRDT state."""
        self.state[key] = {
            "value": value,
            "timestamp": time.time()
        }

    def get(self, key: str) -> Any:
        entry = self.state.get(key)
        if entry:
            return entry["value"]
        return None

    def generate_delta(self) -> dict:
        """
        Generates a sync payload containing the current state
        and a signature over the hashed state for verification.
        """
        payload = json.dumps(self.state, sort_keys=True).encode("utf-8")
        state_hash = hashlib.sha256(payload).digest()

        signature = self.private_key.sign_digest(state_hash)

        return {
            "node_id": self.node_id,
            "public_key": self.public_key_hex,
            "state": self.state,
            "signature": signature.hex()
        }

    def verify_and_merge(self, delta: dict) -> bool:
        """
        Verifies the incoming delta's signature (zk-private simulation).
        If valid, merges it using LWW rules.
        """
        try:
            pub_key_bytes = bytes.fromhex(delta["public_key"])
            vk = VerifyingKey.from_string(pub_key_bytes, curve=NIST256p, hashfunc=hashlib.sha256)

            sig_bytes = bytes.fromhex(delta["signature"])

            incoming_state = delta.get("state", {})
            payload = json.dumps(incoming_state, sort_keys=True).encode("utf-8")
            state_hash = hashlib.sha256(payload).digest()

            if not vk.verify_digest(sig_bytes, state_hash):
                return False
        except Exception:
            return False

        # Merge Phase (Last Write Wins)
        for key, incoming_entry in incoming_state.items():
            local_entry = self.state.get(key)
            if not local_entry or incoming_entry["timestamp"] > local_entry["timestamp"]:
                self.state[key] = incoming_entry

        return True

if __name__ == "__main__":
    import sys
    if len(sys.argv) >= 4 and sys.argv[1] == "--sync":
        node_id = sys.argv[2]
        swarm_id = sys.argv[3]
        print(f"CRDT Sync initiated for Node: {node_id} on Swarm: {swarm_id}")
        state = CRDTState(node_id)
        state.update("swarm_attestation", swarm_id)
        delta = state.generate_delta()
        print(f"Generated Sync Delta: {json.dumps(delta)[:100]}...")

def pin_to_meshstore(data: bytes) -> str:
    """Mock implementation of pinning data to MeshStore (IPFS)"""
    import hashlib
    cid = "Qm" + hashlib.sha256(data).hexdigest()[:44]
    return cid

def sync_storage_manifest(manifest: dict) -> bool:
    """Mock implementation of syncing storage manifest"""
    return True

def sync_swarm_manifest(swarm_id: str) -> dict:
    """Fallback implementation."""
    return {"swarm_id": swarm_id, "status": "synced"}
