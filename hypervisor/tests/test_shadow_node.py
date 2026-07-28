import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from hypervisor.shadow.ShadowNode import ShadowNode


@pytest.mark.asyncio
async def test_ingest_and_query_snapshot_uses_fossil_archive():
    with patch("hypervisor.shadow.ShadowNode.PrivateVault") as mock_vault:
        vault_instance = MagicMock()
        vault_instance.store = AsyncMock()
        mock_vault.return_value = vault_instance

        node = ShadowNode("did:example:123")
        await node.ingest_epistemic_snapshot("decision-log", {"claim": "A"})

        queried = await node.query_epistemic_snapshot("decision-log")

        assert queried is not None
        assert queried["snapshot_id"] == "decision-log"
        assert queried["payload"]["claim"] == "A"
        vault_instance.store.assert_called_once()


@pytest.mark.asyncio
async def test_list_snapshot_ids_returns_sorted_ids():
    with patch("hypervisor.shadow.ShadowNode.PrivateVault"):
        node = ShadowNode("did:example:123")
        await node.ingest_epistemic_snapshot("zeta", {"x": 1})
        await node.ingest_epistemic_snapshot("alpha", {"x": 2})

        snapshot_ids = await node.list_snapshot_ids()

        assert snapshot_ids == ["alpha", "zeta"]


@pytest.mark.asyncio
async def test_contribute_to_dark_pool_rejected_for_fossil_mode():
    with patch("hypervisor.shadow.ShadowNode.PrivateVault"):
        node = ShadowNode("did:example:123")
        with pytest.raises(RuntimeError, match="Fossil Node archive"):
            await node.contribute_to_dark_pool()
