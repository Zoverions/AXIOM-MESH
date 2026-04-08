import os
from datetime import datetime, timezone
from typing import Any

from hypervisor.src.memory.PrivateVault import PrivateVault


class ShadowNode:
    """Read-only fossil archive for sovereign epistemic artifacts.

    ShadowNode intentionally excludes conversational LLM behavior and any active
    autonomous execution path. It stores immutable historical artifacts and
    serves deterministic retrieval only.
    """

    def __init__(self, primary_did: str):
        self.primary_did = primary_did
        self.vault = PrivateVault(primary_did)
        self.phantom_did = os.urandom(32).hex()
        self._archive: dict[str, dict[str, Any]] = {}

    async def ingest_epistemic_snapshot(self, snapshot_id: str, payload: dict[str, Any]) -> None:
        if not snapshot_id:
            raise ValueError("snapshot_id is required")
        record = {
            "snapshot_id": snapshot_id,
            "stored_at": datetime.now(tz=timezone.utc).isoformat(),
            "payload": payload,
            "phantom_did": self.phantom_did,
        }
        self._archive[snapshot_id] = record
        store_fn = getattr(self.vault, "store", None)
        if callable(store_fn):
            maybe_result = store_fn(f"fossil::{snapshot_id}", record)
            if hasattr(maybe_result, "__await__"):
                await maybe_result

    async def query_epistemic_snapshot(self, snapshot_id: str) -> dict[str, Any] | None:
        if not snapshot_id:
            return None
        if snapshot_id in self._archive:
            return self._archive[snapshot_id]
        retrieve_fn = getattr(self.vault, "retrieve", None)
        if callable(retrieve_fn):
            maybe_result = retrieve_fn(f"fossil::{snapshot_id}")
            if hasattr(maybe_result, "__await__"):
                return await maybe_result
            return maybe_result
        return None

    async def list_snapshot_ids(self) -> list[str]:
        if self._archive:
            return sorted(self._archive.keys())
        list_keys_fn = getattr(self.vault, "list_keys", None)
        if callable(list_keys_fn):
            maybe_result = list_keys_fn(prefix="fossil::")
            keys = await maybe_result if hasattr(maybe_result, "__await__") else maybe_result
            return [k.split("fossil::", 1)[1] for k in keys]
        return []

    async def contribute_to_dark_pool(self) -> None:
        raise RuntimeError(
            "ShadowNode is a Fossil Node archive and cannot submit active network contributions."
        )

    async def run_local_cycle(self) -> None:
        """Compatibility wrapper to persist a minimal fossil cycle checkpoint."""
        await self.ingest_epistemic_snapshot(
            "cycle",
            {
                "mode": "fossil_archive",
                "description": "local checkpoint persisted without active model execution",
            },
        )
