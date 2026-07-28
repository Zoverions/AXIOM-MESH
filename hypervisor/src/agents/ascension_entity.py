from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Protocol

from hypervisor.src.zkml.prover import EdgeZKMLProver


class SkillCapsuleLoader(Protocol):
    def load(self, identity: str) -> dict[str, Any]:
        ...


class GovernanceGridClient(Protocol):
    async def submit_bicameral_proposal(self, proposal: dict[str, Any]) -> dict[str, Any]:
        ...

    async def vote(self, payload: dict[str, Any]) -> dict[str, Any]:
        ...


class TaskRequestMarketClient(Protocol):
    async def submit_task(self, payload: dict[str, Any]) -> dict[str, Any]:
        ...


@dataclass
class InferenceEnvelope:
    identity: str
    capsule_id: str
    model_commitment: str
    input_vector: list[float]
    output_vector: list[float]
    zkml_proof: str
    vk: str
    settings: str
    cpor_causal_hash: str


class AscensionEntity:
    """Generative post-biological heir with proof-carrying governance actions."""

    def __init__(
        self,
        identity: str,
        capsule_loader: SkillCapsuleLoader,
        grid_client: GovernanceGridClient,
        zkml_prover: EdgeZKMLProver | None = None,
        graph_memory: Any | None = None,
        task_market_client: TaskRequestMarketClient | None = None,
    ):
        self.identity = identity
        self.capsule_loader = capsule_loader
        self.grid_client = grid_client
        self.zkml_prover = zkml_prover or EdgeZKMLProver()
        self.graph_memory = graph_memory
        self.task_market_client = task_market_client
        self.skill_capsule = self.capsule_loader.load(identity)

    async def self_mandate(self) -> dict[str, Any]:
        proposal = await self.generate_governance_proposal()
        result = await self.grid_client.submit_bicameral_proposal(proposal)
        await self._write_graph_memory("proposal_submitted", proposal)
        return result

    async def execute_skillcapsule_workflow(self, workflow_input: dict[str, Any]) -> dict[str, Any]:
        policy_vector = self._build_policy_vector()
        envelope = self._infer_with_proofs(policy_vector)
        workflow = {
            "identity": self.identity,
            "capsule_id": envelope.capsule_id,
            "input": workflow_input,
            "inference": {
                "output": envelope.output_vector,
                "proof": envelope.zkml_proof,
                "model_commitment": envelope.model_commitment,
            },
            "executed_at": datetime.now(tz=timezone.utc).isoformat(),
        }
        await self._write_graph_memory("workflow_executed", workflow)
        return workflow

    async def submit_market_task(self, task_payload: dict[str, Any]) -> dict[str, Any]:
        if self.task_market_client is None:
            raise RuntimeError("TaskRequestMarket client is not configured")

        envelope = self._infer_with_proofs(self._build_policy_vector())
        signed_payload = {
            "identity": self.identity,
            "task": task_payload,
            "zkml": {
                "proof": envelope.zkml_proof,
                "vk": envelope.vk,
                "settings": envelope.settings,
                "model_commitment": envelope.model_commitment,
            },
        }
        result = await self.task_market_client.submit_task(signed_payload)
        await self._write_graph_memory("task_submitted", signed_payload)
        return result

    async def vote_on_proposal(self, proposal_id: str, support: bool, voting_weight: int) -> dict[str, Any]:
        envelope = self._infer_with_proofs(self._build_policy_vector())
        vote_payload = {
            "identity": self.identity,
            "proposal_id": proposal_id,
            "support": support,
            "voting_weight": voting_weight,
            "zkml_proof": envelope.zkml_proof,
            "model_commitment": envelope.model_commitment,
            "timestamp": datetime.now(tz=timezone.utc).isoformat(),
        }
        result = await self.grid_client.vote(vote_payload)
        await self._write_graph_memory("dao_vote", vote_payload)
        return result

    async def generate_governance_proposal(self) -> dict[str, Any]:
        policy_vector = self._build_policy_vector()
        envelope = self._infer_with_proofs(policy_vector)
        return {
            "type": "Ascension_Governance_Proposal",
            "identity": self.identity,
            "capsule_id": envelope.capsule_id,
            "proposal": {
                "title": f"Ascension proposal for {self.identity}",
                "intent": "Maintain sovereign policy continuity from verified skill capsule.",
                "generated_at": datetime.now(tz=timezone.utc).isoformat(),
            },
            "proof_bundle": {
                "model_commitment": envelope.model_commitment,
                "zkml_proof": envelope.zkml_proof,
                "vk": envelope.vk,
                "settings": envelope.settings,
                "cpor_causal_hash": envelope.cpor_causal_hash,
            },
            "inference": {
                "input": envelope.input_vector,
                "output": envelope.output_vector,
            },
        }

    def _build_policy_vector(self) -> list[float]:
        weights = self.skill_capsule.get("weights") or [0.1, 0.2, 0.3]
        return [float(v) for v in weights[:3]]

    async def _write_graph_memory(self, event_type: str, payload: dict[str, Any]) -> None:
        if self.graph_memory is None:
            return
        if getattr(self.graph_memory, "graph", None) is None:
            return
        node_id = f"ascension::{self.identity}::{event_type}::{int(datetime.now(tz=timezone.utc).timestamp())}"
        self.graph_memory.graph.add_node(node_id, **{"event_type": event_type, "payload": payload})

    def _infer_with_proofs(self, policy_vector: list[float]) -> InferenceEnvelope:
        result = self.zkml_prover.infer_and_prove(policy_vector)
        causal_payload = {
            "identity": self.identity,
            "capsule_id": self.skill_capsule.get("capsule_id", "unknown"),
            "model_commitment": result["model_commitment"],
            "input": result["input"],
            "output": result["output"],
            "go_impl": "grid/zkml/cpor/causal_graph.go",
        }
        causal_hash = hashlib.sha256(json.dumps(causal_payload, sort_keys=True).encode()).hexdigest()

        return InferenceEnvelope(
            identity=self.identity,
            capsule_id=self.skill_capsule.get("capsule_id", "unknown"),
            model_commitment=result["model_commitment"],
            input_vector=result["input"],
            output_vector=result["output"],
            zkml_proof=result["proof"],
            vk=result["vk"],
            settings=result["settings"],
            cpor_causal_hash=causal_hash,
        )
