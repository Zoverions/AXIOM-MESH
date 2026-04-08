"""Sovereign cross-chain verifier (shadow mode).

This module evaluates cross-chain claim evidence in Hypervisor before Grid
settlement paths are authorized. In shadow mode, it never exercises settlement
authority; instead it emits signed evidence bundles for audit and threshold
calibration.
"""

from __future__ import annotations

import hashlib
import hmac
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from src.core.secrets import SecretManager

REQUIRED_CLAIM_FIELDS = {
    "claim_id",
    "source_chain_id",
    "tx_hash",
    "log_index",
    "block_number",
    "token",
    "amount",
    "recipient",
}


@dataclass
class VerificationDecision:
    status: str
    settlement_authorized: bool
    reasons: List[str] = field(default_factory=list)


class SovereignCrossChainVerifier:
    """Evaluates cross-chain claims and emits signed shadow evidence bundles."""

    def __init__(
        self,
        evidence_dir: str = "evidence/cross-chain/sovereign-shadow",
        shadow_mode: bool = True,
        signer_id: str = "hypervisor-sovereign-verifier",
    ) -> None:
        self.evidence_dir = Path(evidence_dir)
        self.evidence_dir.mkdir(parents=True, exist_ok=True)
        self.shadow_mode = shadow_mode
        self.signer_id = signer_id
        self._seen_replay_ids: set[str] = set()

    def verify_claim(
        self,
        claim: Dict[str, Any],
        evidence_bundle: Dict[str, Any],
        policy_context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Verify a cross-chain claim and write a signed evidence bundle."""
        policy_context = policy_context or {}
        now = datetime.now(timezone.utc)

        reasons: List[str] = []
        missing_fields = sorted(REQUIRED_CLAIM_FIELDS - claim.keys())
        if missing_fields:
            reasons.append(f"missing_claim_fields:{','.join(missing_fields)}")

        replay_id = self._build_replay_id(claim)
        if replay_id in self._seen_replay_ids:
            reasons.append("replay_detected")

        if not isinstance(evidence_bundle, dict) or not evidence_bundle:
            reasons.append("invalid_evidence_bundle")

        risk_class = str(policy_context.get("risk_class", "standard")).lower()
        required_approvals = int(policy_context.get("required_approvals", 1))
        if risk_class == "high" and required_approvals < 2:
            reasons.append("high_risk_requires_2plus_approvals")

        decision = self._compute_decision(reasons)

        record: Dict[str, Any] = {
            "schema_version": "cross_chain_sovereign_shadow.v1",
            "generated_at_utc": now.isoformat(),
            "shadow_mode": self.shadow_mode,
            "signer_id": self.signer_id,
            "replay_id": replay_id,
            "claim": claim,
            "policy_context": policy_context,
            "evidence_bundle": evidence_bundle,
            "decision": {
                "status": decision.status,
                "settlement_authorized": decision.settlement_authorized,
                "reasons": decision.reasons,
            },
        }

        signature = self._sign_record(record)
        record["provenance_signature"] = {
            "algorithm": "hmac-sha256",
            "signature": signature,
        }

        if decision.status != "reject":
            self._seen_replay_ids.add(replay_id)

        filename = f"{now.strftime('%Y%m%dT%H%M%S%fZ')}_{replay_id[:16]}.json"
        output_path = self.evidence_dir / filename
        output_path.write_text(json.dumps(record, indent=2, sort_keys=True), encoding="utf-8")

        return {
            "status": decision.status,
            "settlement_authorized": decision.settlement_authorized,
            "reasons": decision.reasons,
            "replay_id": replay_id,
            "evidence_path": str(output_path),
            "shadow_mode": self.shadow_mode,
        }

    def _compute_decision(self, reasons: List[str]) -> VerificationDecision:
        if reasons:
            return VerificationDecision(status="reject", settlement_authorized=False, reasons=reasons)
        if self.shadow_mode:
            return VerificationDecision(
                status="shadow_accept",
                settlement_authorized=False,
                reasons=["shadow_mode_observation_only"],
            )
        return VerificationDecision(status="accept", settlement_authorized=True)

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

    def _sign_record(self, record: Dict[str, Any]) -> str:
        key = self._resolve_signing_key()
        payload = json.dumps(record, sort_keys=True, separators=(",", ":")).encode("utf-8")
        return hmac.new(key.encode("utf-8"), payload, hashlib.sha256).hexdigest()

    @staticmethod
    def _resolve_signing_key() -> str:
        key = SecretManager.get_secret("SOVEREIGN_VERIFIER_SIGNING_KEY", default="")
        if key:
            return key
        fallback = SecretManager.get_secret("CAPABILITY_TOKEN_SECRET", default="")
        if fallback:
            return fallback
        raise ValueError("Missing signing key for sovereign verifier evidence output")
