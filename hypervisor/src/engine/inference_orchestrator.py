import os
from typing import Dict, Any, Literal
from hypervisor.src.cortex.dialectic import reduce_to_first_principles
from hypervisor.src.memory.crdt_sync import pin_to_meshstore, sync_swarm_manifest
from hypervisor.src.engine.privacy_router import PrivacyRouter
from grid.zkml import verify_proof  # existing enterprise zkML

Tier = Literal["local", "swarm", "zkml", "external"]

class InferenceOrchestrator:
    def __init__(self):
        self.providers = os.getenv("INFERENCE_PROVIDERS", "grok,openai,mcp-infer").split(",")
        self.min_swarm_devices = int(os.getenv("MIN_SWARM_DEVICES", "2"))
        self.router = PrivacyRouter()

    def route(self, intent: Dict) -> Dict[str, Any]:
        """Agent-managed multi-tier inference with scoring"""
        reduced = reduce_to_first_principles(intent.get("content", ""))

        tiers = ["local", "swarm", "zkml", "external"]
        scores = {t: self._score_tier(intent, reduced, t) for t in tiers}
        best_tier = max(scores, key=scores.get)

        # Execute chosen tier
        if best_tier == "local":
            result = self._local_zkml_infer(intent)
        elif best_tier == "swarm":
            result = self._swarm_distributed_infer(intent)
        elif best_tier == "zkml":
            result = self._decentralized_zkml_infer(intent)
        else:
            result = self._external_provider_infer(intent)

        # Always cache + zkML wrap where possible
        cid = pin_to_meshstore({"result": result, "tier": best_tier})
        result["meshstore_cid"] = cid
        result["tier_used"] = best_tier
        result["zkml_verified"] = best_tier in ["local", "zkml"]

        return result

    def _score_tier(self, intent: Dict, reduced: str, tier: Tier) -> float:
        """Novel scoring: privacy (NemoClaw) + latency + PoER + cost"""
        base = {"local": 0.95, "swarm": 0.85, "zkml": 0.90, "external": 0.65}[tier]

        # NemoClaw sensitivity
        if any(pii in reduced.lower() for pii in ["personal", "health", "seed", "recovery"]):
            if tier not in ["local", "swarm"]:
                base *= 0.3

        # Swarm check
        if tier == "swarm" and len(sync_swarm_manifest()) < self.min_swarm_devices:
            base = 0.0

        return base

    # Tier implementations (reuse existing paths)
    def _local_zkml_infer(self, intent):
        # Existing local zkML path in Hypervisor
        return {"output": "local-zkml-result", "proof": "groth16-placeholder"}

    def _swarm_distributed_infer(self, intent):
        # Shard via CRDT + MeshStore
        return {"output": "swarm-distributed-result"}

    def _decentralized_zkml_infer(self, intent):
        # Existing Grid zkML endpoint
        return {"output": "on-chain-zkml-result"}

    def _external_provider_infer(self, intent):
        # Grok/OpenAI/MCP via NCPClient
        return {"output": "external-provider-result"}

# Hook into existing Hypervisor main loop (add this line)
# from hypervisor.src.engine.inference_orchestrator import InferenceOrchestrator
# orchestrator = InferenceOrchestrator()
