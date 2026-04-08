"""Grid verifier adapter for optional ZK light-client acceptance.

This adapter allows Grid-bound cross-chain claims to include optional ZK
light-client proof material. Claims that fail proof checks (or provide no proof
when policy requires one) are routed to a deterministic bridge delay queue.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, Optional


@dataclass
class GridVerifierAdapterResult:
    status: str
    accepted: bool
    reason: str
    replay_id: str
    bridge_delay_path: Optional[str] = None


class GridVerifierAdapter:
    """Optional ZK proof adapter with fail-closed bridge delay fallback."""

    def __init__(
        self,
        bridge_delay_dir: str = "evidence/cross-chain/bridge-delay-queue",
        zk_light_client_enabled: bool = False,
        require_zk_for_high_risk: bool = True,
        proof_validator: Optional[Callable[[Dict[str, Any], Dict[str, Any]], bool]] = None,
    ) -> None:
        self.bridge_delay_dir = Path(bridge_delay_dir)
        self.bridge_delay_dir.mkdir(parents=True, exist_ok=True)
        self.zk_light_client_enabled = zk_light_client_enabled
        self.require_zk_for_high_risk = require_zk_for_high_risk
        self.proof_validator = proof_validator or self._default_proof_validator

    def evaluate_claim(
        self,
        claim: Dict[str, Any],
        *,
        zk_proof: Optional[Dict[str, Any]] = None,
        policy_context: Optional[Dict[str, Any]] = None,
        bridge_payload: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Evaluate claim and either accept or route to bridge delay queue."""
        policy_context = policy_context or {}
        bridge_payload = bridge_payload or {}
        replay_id = self._build_replay_id(claim)

        risk_class = str(policy_context.get("risk_class", "standard")).lower()
        zk_required = self.zk_light_client_enabled and (
            risk_class != "high" or self.require_zk_for_high_risk
        )

        if not self.zk_light_client_enabled:
            return self._to_result(
                GridVerifierAdapterResult(
                    status="bridge_only",
                    accepted=True,
                    reason="zk_light_client_disabled",
                    replay_id=replay_id,
                )
            )

        if zk_proof is None:
            if zk_required:
                return self._queue_delay(
                    claim=claim,
                    replay_id=replay_id,
                    reason="missing_zk_light_client_proof",
                    policy_context=policy_context,
                    bridge_payload=bridge_payload,
                )
            return self._to_result(
                GridVerifierAdapterResult(
                    status="bridge_only",
                    accepted=True,
                    reason="zk_optional_no_proof",
                    replay_id=replay_id,
                )
            )

        proof_ok = self.proof_validator(claim, zk_proof)
        if not proof_ok:
            return self._queue_delay(
                claim=claim,
                replay_id=replay_id,
                reason="invalid_zk_light_client_proof",
                policy_context=policy_context,
                bridge_payload=bridge_payload,
                zk_proof=zk_proof,
            )

        return self._to_result(
            GridVerifierAdapterResult(
                status="zk_accept",
                accepted=True,
                reason="zk_light_client_proof_valid",
                replay_id=replay_id,
            )
        )

    @staticmethod
    def _build_replay_id(claim: Dict[str, Any]) -> str:
        replay_basis = "|".join(
            [
                str(claim.get("source_chain_id", "unknown")),
                str(claim.get("tx_hash", "unknown")),
                str(claim.get("log_index", "unknown")),
                str(claim.get("claim_id", "unknown")),
            ]
        )
        return hashlib.sha256(replay_basis.encode("utf-8")).hexdigest()

    @staticmethod
    def _default_proof_validator(claim: Dict[str, Any], zk_proof: Dict[str, Any]) -> bool:
        if not isinstance(zk_proof, dict):
            return False
        proof_ref = zk_proof.get("proof_ref")
        verification_key = zk_proof.get("verification_key")
        receipt_root = zk_proof.get("receipt_root")
        return all(isinstance(item, str) and item for item in [proof_ref, verification_key, receipt_root])

    def _queue_delay(
        self,
        *,
        claim: Dict[str, Any],
        replay_id: str,
        reason: str,
        policy_context: Dict[str, Any],
        bridge_payload: Dict[str, Any],
        zk_proof: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        now = datetime.now(timezone.utc)
        delay_record = {
            "schema_version": "cross_chain_bridge_delay_queue.v1",
            "queued_at_utc": now.isoformat(),
            "replay_id": replay_id,
            "reason": reason,
            "claim": claim,
            "policy_context": policy_context,
            "bridge_payload": bridge_payload,
            "zk_light_client_proof": zk_proof,
        }

        filename = f"{now.strftime('%Y%m%dT%H%M%S%fZ')}_{replay_id[:16]}.json"
        output_path = self.bridge_delay_dir / filename
        output_path.write_text(json.dumps(delay_record, indent=2, sort_keys=True), encoding="utf-8")

        return self._to_result(
            GridVerifierAdapterResult(
                status="bridge_delay_queued",
                accepted=False,
                reason=reason,
                replay_id=replay_id,
                bridge_delay_path=str(output_path),
            )
        )

    @staticmethod
    def _to_result(result: GridVerifierAdapterResult) -> Dict[str, Any]:
        return {
            "status": result.status,
            "accepted": result.accepted,
            "reason": result.reason,
            "replay_id": result.replay_id,
            "bridge_delay_path": result.bridge_delay_path,
        }
