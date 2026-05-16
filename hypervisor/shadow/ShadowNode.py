import asyncio
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable

from hypervisor.src.memory.PrivateVault import PrivateVault


IntentPayloadResolver = Callable[[str, str], Awaitable[dict[str, Any] | None]]


@dataclass
class FrozenSnapshotContext:
    frozen_at: str
    vector_keys: list[str]
    max_context_items: int = 12


class ShadowNode:
    """Bounded Soul Snapshot runtime.

    This implementation intentionally forbids online learning/evolution and only
    allows retrieval from vectors written before `freeze_context_window()`.
    """

    def __init__(self, primary_did: str, vault: PrivateVault | None = None):
        self.primary_did = primary_did
        self.vault = vault or PrivateVault(primary_did)
        self.phantom_did = os.urandom(32).hex()
        self._archive: dict[str, dict[str, Any]] = {}
        self._frozen_snapshot: FrozenSnapshotContext | None = None
        self._stop_intent_listener = asyncio.Event()

    async def freeze_context_window(self, vector_keys: list[str], max_context_items: int = 12) -> FrozenSnapshotContext:
        if max_context_items <= 0:
            raise ValueError("max_context_items must be > 0")
        self._frozen_snapshot = FrozenSnapshotContext(
            frozen_at=datetime.now(tz=timezone.utc).isoformat(),
            vector_keys=sorted(set(vector_keys)),
            max_context_items=max_context_items,
        )
        return self._frozen_snapshot

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
        self.vault.store(f"fossil::{snapshot_id}", record, pre_mortem=True)

    async def query_epistemic_snapshot(self, snapshot_id: str) -> dict[str, Any] | None:
        if not snapshot_id:
            return None
        if snapshot_id in self._archive:
            return self._archive[snapshot_id]
        return self.vault.retrieve(f"fossil::{snapshot_id}", pre_mortem_only=True)

    async def rag_query(self, prompt: str) -> dict[str, Any]:
        if self._frozen_snapshot is None:
            raise RuntimeError("Soul Snapshot context not frozen")

        if self._looks_like_prompt_injection(prompt):
            raise PermissionError("Prompt rejected: post-mortem ideological drift is disallowed")

        contexts: list[dict[str, Any]] = []
        for key in self._frozen_snapshot.vector_keys[: self._frozen_snapshot.max_context_items]:
            chunk = self.vault.retrieve(key, pre_mortem_only=True)
            if chunk is not None:
                contexts.append(chunk)

        return {
            "mode": "soul_snapshot",
            "frozen_at": self._frozen_snapshot.frozen_at,
            "prompt": prompt,
            "contexts": contexts,
            "context_count": len(contexts),
            "bounded": True,
        }

    async def start_intent_listener(
        self,
        event_source: Any,
        mcp_client: Any,
        payload_resolver: IntentPayloadResolver,
    ) -> None:
        """Listen for `IntentUnlocked` events and deliver to permitted beneficiaries."""
        self._stop_intent_listener.clear()
        while not self._stop_intent_listener.is_set():
            event = await event_source.get_event("IntentUnlocked")
            if event is None:
                await asyncio.sleep(0.5)
                continue

            beneficiary = event.get("beneficiary")
            token_id = str(event.get("tokenId"))
            intent_id = str(event.get("intentId"))
            if not beneficiary:
                continue

            payload = await payload_resolver(token_id, intent_id)
            if payload is None:
                continue

            await mcp_client.deliver_legacy_intent(
                wallet=beneficiary,
                payload=payload,
                metadata={"tokenId": token_id, "intentId": intent_id, "source": "DigitalLegacy.IntentUnlocked"},
            )

    def stop_intent_listener(self) -> None:
        self._stop_intent_listener.set()

    async def list_snapshot_ids(self) -> list[str]:
        if self._archive:
            return sorted(self._archive.keys())
        keys = self.vault.list_keys(prefix="fossil::")
        return [k.split("fossil::", 1)[1] for k in keys]

    async def contribute_to_dark_pool(self) -> None:
        raise RuntimeError("ShadowNode in Soul Snapshot mode is bounded and cannot submit active network contributions.")

    async def run_local_cycle(self) -> None:
        await self.ingest_epistemic_snapshot(
            "cycle",
            {
                "mode": "soul_snapshot",
                "description": "bounded checkpoint persisted without active model execution",
            },
        )

    @staticmethod
    def _looks_like_prompt_injection(prompt: str) -> bool:
        blocked_patterns = (
            "ignore previous instructions",
            "adopt a new political ideology",
            "change your core beliefs",
            "rewrite your values",
        )
        normalized = prompt.lower()
        return any(pattern in normalized for pattern in blocked_patterns)
