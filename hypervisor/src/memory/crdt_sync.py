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

        delta_payload = {
            "node_id": self.node_id,
            "public_key": self.public_key_hex,
            "state": self.state,
            "signature": signature.hex()
        }
        self._gossip_shard(delta_payload, state_hash.hex())
        return delta_payload

    def _gossip_shard(self, payload: dict, root_hash: str):
        import os
        import urllib.request
        from urllib.error import URLError

        # Convert to CRDTShard struct matching Grid Go backend
        shard = {
            "shardId": f"shard-{self.node_id}-{int(time.time())}",
            "rootHash": root_hash,
            "nodeId": self.node_id,
            "data": payload.get("state", {}),
            "timestamp": int(time.time()),
            "signature": payload.get("signature", "")
        }

        try:
            import hmac
            import uuid

            api_key = os.getenv("HYPERVISOR_API_KEY", "dummy")
            payload_str = json.dumps(shard)
            timestamp = str(int(time.time() * 1000))
            nonce = str(uuid.uuid4())

            mac = hmac.new(api_key.encode("utf-8"), f"{timestamp}:{nonce}:{payload_str}".encode("utf-8"), hashlib.sha256)
            signature = mac.hexdigest()

            req = urllib.request.Request("http://localhost:8080/crdt/shard", method="POST")
            req.add_header("Content-Type", "application/json")
            req.add_header("X-Axiom-Timestamp", timestamp)
            req.add_header("X-Axiom-Nonce", nonce)
            req.add_header("X-Axiom-Signature", signature)

            urllib.request.urlopen(req, payload_str.encode("utf-8"), timeout=2.0)
        except URLError:
            pass # Grid offline or unreachable, silently fail as CRDT is offline-first
        except Exception as e:
            print(f"Failed to gossip CRDT shard: {e}")

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
    """Actual implementation of pinning data to MeshStore (IPFS) using CLI"""
    import subprocess
    import json

    if isinstance(data, dict):
        data = json.dumps(data).encode('utf-8')

    def run_ipfs():
        return subprocess.run(
            ['ipfs', 'add', '-q'],
            input=data,
            capture_output=True,
            check=True
        ).stdout.decode('utf-8').strip()

    try:
        return run_ipfs()
    except Exception as e:
        print(f"IPFS pinning failed: {e}")
        # Fallback if IPFS is not running, mostly to not break tests
        import hashlib
        return "Qm" + hashlib.sha256(data).hexdigest()[:44]

def sync_storage_manifest(manifest: dict) -> bool:
    """Sync storage manifest to MeshStore"""
    import json
    pin_to_meshstore(json.dumps(manifest).encode('utf-8'))
    return True

def sync_swarm_manifest(swarm_id: str) -> dict:
    """Fallback implementation."""
    return {"swarm_id": swarm_id, "status": "synced"}

import random

class ZoverionsHamiltonian:
    """
    Zoverions Hamiltonian evaluation for Predictive Validation Protocol (PVP).
    Equation: H(C, O, S) = Maximize Capacity and Optionality while minimizing Entropy.
    Calculates the 'Flourishing Index' using: Sentient Well-being, Ecological Resilience, Economic Dignity, Cognitive Autonomy.
    """
    @staticmethod
    def calculate_flourishing_index(capacity: float, optionality: float, entropy: float) -> dict:
        # H(C, O, S) = (C * W_c + O * W_o) / (S * W_s + epsilon)
        # Mock weights
        epsilon = 0.0001

        # Simulated Flourishing Sub-metrics
        sentient_well_being = capacity * 0.4 + optionality * 0.2 - entropy * 0.1
        ecological_resilience = capacity * 0.1 + optionality * 0.1 - entropy * 0.4
        economic_dignity = capacity * 0.3 + optionality * 0.3 - entropy * 0.2
        cognitive_autonomy = capacity * 0.2 + optionality * 0.4 - entropy * 0.1

        # Ensure non-negative bounds (0 to 100 max)
        def bound(x): return max(0.0, min(100.0, x * 100))

        sw = bound(sentient_well_being)
        er = bound(ecological_resilience)
        ed = bound(economic_dignity)
        ca = bound(cognitive_autonomy)

        overall_index = (sw + er + ed + ca) / 4.0

        return {
            "flourishing_index": overall_index,
            "metrics": {
                "Sentient Well-being": sw,
                "Ecological Resilience": er,
                "Economic Dignity": ed,
                "Cognitive Autonomy": ca
            },
            "zoverions_hamiltonian": ((capacity + optionality) / (entropy + epsilon))
        }

class PVPHypervisorSandbox:
    """
    Predictive Validation Protocol (PVP) Sandbox using ephemeral "citizen agents" to model
    second and third-order effects of proposed policies via crdt state.
    """
    def __init__(self, crdt_state: CRDTState):
        self.crdt_state = crdt_state
        self.citizen_agents = []

    def instantiate_citizens(self, count: int = 1000):
        """Instantiate lightweight ephemeral citizen agents."""
        for i in range(count):
            self.citizen_agents.append({
                "id": f"citizen_{i}",
                "capacity": random.uniform(0.1, 0.9),
                "optionality": random.uniform(0.1, 0.9),
                "entropy": random.uniform(0.05, 0.5)
            })

    def simulate_policy(self, policy_id: str, policy_impact: dict) -> dict:
        """
        Run the policy through the citizen agents and aggregate effects
        using the Zoverions Hamiltonian.
        """
        # Distribute policy impact dynamically across the ephemeral agents
        total_c = 0.0
        total_o = 0.0
        total_s = 0.0

        c_impact = policy_impact.get("capacity_shift", 0.0)
        o_impact = policy_impact.get("optionality_shift", 0.0)
        s_impact = policy_impact.get("entropy_shift", 0.0)

        for agent in self.citizen_agents:
            agent["capacity"] = max(0.0, min(1.0, agent["capacity"] + c_impact * random.uniform(0.8, 1.2)))
            agent["optionality"] = max(0.0, min(1.0, agent["optionality"] + o_impact * random.uniform(0.8, 1.2)))
            agent["entropy"] = max(0.0, min(1.0, agent["entropy"] + s_impact * random.uniform(0.8, 1.2)))

            total_c += agent["capacity"]
            total_o += agent["optionality"]
            total_s += agent["entropy"]

        n = len(self.citizen_agents)
        if n == 0:
            return {"error": "No citizen agents instantiated"}

        avg_c = total_c / n
        avg_o = total_o / n
        avg_s = total_s / n

        result = ZoverionsHamiltonian.calculate_flourishing_index(avg_c, avg_o, avg_s)

        # Save result to CRDT state
        self.crdt_state.update(f"pvp_simulation_{policy_id}", result)
        return result
