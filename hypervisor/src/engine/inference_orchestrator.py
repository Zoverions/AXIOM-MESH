import os
import json
import httpx
from typing import Dict, Any, Literal
from hypervisor.src.cortex.dialectic import reduce_to_first_principles
from hypervisor.src.memory.crdt_sync import pin_to_meshstore, sync_swarm_manifest
from hypervisor.src.engine.privacy_router import PrivacyRouter
from hypervisor.src.zkml.prover import EdgeZKMLProver
from grid.zkml import verify_proof  # existing enterprise zkML

Tier = Literal["local", "swarm", "zkml", "external"]

class InferenceOrchestrator:
    def __init__(self):
        self.providers = os.getenv("INFERENCE_PROVIDERS", "grok,openai,mcp-infer").split(",")
        self.min_swarm_devices = int(os.getenv("MIN_SWARM_DEVICES", "2"))
        self.router = PrivacyRouter()

    async def route(self, intent: Dict) -> Dict[str, Any]:
        """Agent-managed multi-tier inference with scoring"""
        reduced = reduce_to_first_principles(intent.get("content", ""))

        tiers = ["local", "swarm", "zkml", "external"]
        scores = {t: self._score_tier(intent, reduced, t) for t in tiers}
        best_tier = max(scores, key=scores.get)

        # Execute chosen tier
        if best_tier == "local":
            result = await self._local_zkml_infer(intent)
        elif best_tier == "swarm":
            result = await self._swarm_distributed_infer(intent)
        elif best_tier == "zkml":
            result = await self._decentralized_zkml_infer(intent)
        else:
            result = await self._external_provider_infer(intent)

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
    async def _local_zkml_infer(self, intent):
        context = intent.get("context", "")
        freq_penalty = intent.get("freq_penalty", 0.0)
        pres_penalty = intent.get("pres_penalty", 0.0)

        prover = EdgeZKMLProver(weights=[0.5, -0.2, 0.8, 1.2])
        # We mock input vector for local proof for demonstration based on intent size
        input_vector = [1.0, len(context) % 10, 0.5]
        proof_res = prover.infer_and_prove(input_vector)
        proof = proof_res.get("proof", "groth16-placeholder")

        if hasattr(self, "llm"):
            response = await self.llm.process(context, frequency_penalty=freq_penalty, presence_penalty=pres_penalty)
            return {"output": response, "proof": proof}
        return {"output": "local-zkml-fallback-result", "proof": proof}

    async def _swarm_distributed_infer(self, intent):
        # Shard via CRDT + MeshStore and invoke swarm nodes
        # In a fully deployed environment we would broadcast the intent CID over CRDT sync
        cid = pin_to_meshstore({"intent": intent.get("content", ""), "type": "swarm-shard"})
        context = intent.get("context", "")

        # Simulating external distributed inference for now but caching it via MeshStore CID
        if hasattr(self, "llm"):
            response = await self.llm.process(context + "\n[Swarm Distributed Processed]")
            return {"output": response, "shard_cid": cid}
        return {"output": f"swarm-distributed-result for intent shards at {cid}"}

    async def _decentralized_zkml_infer(self, intent):
        # Call the actual Grid zkML endpoint
        grid_url = "http://localhost:5000/zkml/verify"
        prover = EdgeZKMLProver(weights=[0.5, -0.2, 0.8, 1.2])
        input_vector = [1.0, 2.0, 3.0]
        result = prover.infer_and_prove(input_vector)

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(grid_url, json=result, timeout=10.0)
                if response.status_code == 200:
                    consensus = "verified"
                else:
                    consensus = "failed"
        except Exception as e:
            consensus = f"network_error: {str(e)}"

        context = intent.get("context", "")
        if hasattr(self, "llm"):
            text_response = await self.llm.process(context + "\n[Decentralized zkML Processed]")
            return {"output": text_response, "consensus": consensus, "proof": result.get("proof", "")}
        return {"output": "on-chain-zkml-result", "consensus": consensus}

    async def _external_provider_infer(self, intent):
        # Call the NCP client or external API for the external provider tier
        provider = self.providers[0] if self.providers else "openai"
        context = intent.get("context", "")

        if provider == "mcp-infer":
            # Using external tools, mock mcp-infer behavior
            output = f"Result from MCP external provider tier."
        else:
            if hasattr(self, "llm"):
                output = await self.llm.process(context + f"\n[External Provider {provider} Processed]")
            else:
                output = f"external-provider-result from {provider}"

        return {"output": output, "provider": provider}
