import json
import os
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict


@dataclass
class QuarantineArtifact:
    namespace_id: str
    reason: str
    created_at: str
    payload_hash: str


class QuarantineSandboxManager:
    """
    Lightweight quarantine namespace manager for EAP phase-1.
    This does not execute untrusted code; it records a deterministic
    quarantine artifact that downstream services can process.
    """

    def __init__(self, audit_path: str = "data/quarantine_events.jsonl") -> None:
        self.audit_path = audit_path

    def fork_namespace(self, reason: str, payload: Dict[str, Any]) -> QuarantineArtifact:
        namespace_id = f"qns_{uuid.uuid4().hex}"
        created_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        payload_blob = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        payload_hash = str(abs(hash(payload_blob)))
        artifact = QuarantineArtifact(
            namespace_id=namespace_id,
            reason=reason,
            created_at=created_at,
            payload_hash=payload_hash,
        )
        self._append_event(
            {
                "event": "quarantine_forked",
                "namespace_id": artifact.namespace_id,
                "reason": artifact.reason,
                "created_at": artifact.created_at,
                "payload_hash": artifact.payload_hash,
            }
        )
        return artifact

    def broadcast_antibody(self, namespace_id: str, antibody_vector: list[float], confidence: float) -> str:
        antibody_id = f"ab_{uuid.uuid4().hex}"
        self._append_event(
            {
                "event": "antibody_broadcast",
                "antibody_id": antibody_id,
                "namespace_id": namespace_id,
                "confidence": confidence,
                "vector_dim": len(antibody_vector),
                "vector_preview": antibody_vector[:4],
                "broadcast_channel": "aicp-stigmergic",
                "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            }
        )
        return antibody_id

    def escalate_false_positive(self, namespace_id: str, resolution_notes: str, authorizing_entity: str) -> Dict[str, Any]:
        """Formal escalation path for recovering false positives from quarantine."""
        event = {
            "event": "escalation_false_positive",
            "status": "false_positive_cleared",
            "namespace_id": namespace_id,
            "resolution_notes": resolution_notes,
            "authorizing_entity": authorizing_entity,
            "cleared_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        }
        self._append_event(event)
        return event

    def _append_event(self, event: Dict[str, Any]) -> None:
        directory = os.path.dirname(self.audit_path) or "."
        os.makedirs(directory, exist_ok=True)
        with open(self.audit_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(event, ensure_ascii=False) + "\n")
