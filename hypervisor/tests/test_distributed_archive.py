import pytest
import asyncio
import json
import os
import sys
from unittest.mock import patch, MagicMock

# Add hypervisor/src to sys.path
sys.path.append(os.path.join(os.path.dirname(__file__), "..", "src"))

from memory.archive import DistributedDeepArchive

class MockAsyncContextManager:
    def __init__(self, mock_ws):
        self.mock_ws = mock_ws
    async def __aenter__(self):
        return self.mock_ws
    async def __aexit__(self, exc_type, exc, tb):
        pass

@pytest.fixture
def distributed_archive(tmp_path):
    storage_path = tmp_path / "distributed_archive.json"
    return DistributedDeepArchive(storage_path=str(storage_path))

def test_generate_zkp(distributed_archive):
    query = "test query"
    proof_str = distributed_archive._generate_zkp(query)
    proof = json.loads(proof_str)

    assert "y" in proof
    assert "t" in proof
    assert "r" in proof

    # Optional: Verify it's valid hex
    int(proof["y"], 16)
    int(proof["t"], 16)
    int(proof["r"], 16)

@pytest.mark.asyncio
async def test_search_distributed_mocked(distributed_archive):
    query = "p2p"

    mock_ws = MagicMock()
    mock_ws.send = MagicMock(return_value=asyncio.Future())
    mock_ws.send.return_value.set_result(None)
    mock_ws.recv = MagicMock(return_value=asyncio.Future())
    mock_ws.recv.return_value.set_result(json.dumps({
        "type": "results",
        "nodes": [
            {"id": "node-1", "content": "P2P Knowledge from Peer", "metadata": {"author": "peer1"}}
        ]
    }))

    with patch("websockets.connect", return_value=MockAsyncContextManager(mock_ws)):
        results = await distributed_archive.search_distributed(query)

        # Verify result contains the mocked peer node
        peer_results = [r for r in results if r.get("metadata", {}).get("source") == "grid_p2p"]
        assert len(peer_results) == 1
        assert peer_results[0]["content"] == "P2P Knowledge from Peer"
        assert peer_results[0]["metadata"]["author"] == "peer1"

@pytest.mark.asyncio
async def test_sync_to_grid_mocked(distributed_archive):
    content = "New knowledge to sync"

    mock_ws = MagicMock()
    mock_ws.send = MagicMock(return_value=asyncio.Future())
    mock_ws.send.return_value.set_result(None)
    mock_ws.recv = MagicMock(return_value=asyncio.Future())
    mock_ws.recv.return_value.set_result(json.dumps({"status": "synced"}))

    mock_response_ipfs = MagicMock()
    mock_response_ipfs.status_code = 200
    mock_response_ipfs.json.return_value = {"Hash": "QmTest123"}

    mock_response_arweave = MagicMock()
    mock_response_arweave.status_code = 200

    async def mock_post(url, *args, **kwargs):
        if "ipfs" in url or "5001" in url:
            return mock_response_ipfs
        elif "arweave" in url:
            return mock_response_arweave
        return MagicMock(status_code=404)

    with patch("websockets.connect", return_value=MockAsyncContextManager(mock_ws)):
        with patch("httpx.AsyncClient.post", side_effect=mock_post):
            await distributed_archive.sync_to_grid(content)

            # Verify ws.send was called with the correct payload structure
            args, _ = mock_ws.send.call_args
            payload = json.loads(args[0])
            assert payload["type"] == "sync"
            assert payload["node"]["content"] == content
            assert payload["node"]["metadata"]["ipfs_cid"] == "QmTest123"
            assert payload["node"]["metadata"]["arweave_tx"] == "mock-arweave-tx"
