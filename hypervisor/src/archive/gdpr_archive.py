"""GDPR-focused archive helpers for AXIOM-MESH.

Implements deterministic erase tombstones for subject-driven deletion workflows.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone


@dataclass(frozen=True)
class ArchiveTombstone:
    subject_id: str
    record_hash: str
    reason: str
    created_at_iso: str


def create_tombstone(subject_id: str, record_hash: str, reason: str = "gdpr-erasure") -> ArchiveTombstone:
    now = datetime.now(tz=timezone.utc).isoformat()
    return ArchiveTombstone(
        subject_id=subject_id,
        record_hash=record_hash,
        reason=reason,
        created_at_iso=now,
    )
