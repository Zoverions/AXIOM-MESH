import pytest
import sys
import os
import time
import asyncio
from unittest.mock import MagicMock, AsyncMock

# Add hypervisor/src to sys.path
sys.path.append(os.path.join(os.path.dirname(__file__), "..", "src"))

from cortex.autoresearch import AutoResearchDaemon

def test_autoresearch_daemon_mock_flow():
    # Setup mock archive
    mock_archive = MagicMock()
    daemon = AutoResearchDaemon(archive=mock_archive)

    # Test initialization
    assert daemon.archive == mock_archive
    assert not daemon.running

    # Test manual forage (to avoid waiting 10s in thread)
    # The topic is random from a list (e.g., 'decentralized consensus').
    # Without ncp/llm, it uses the hardcoded topics and hits real API.
    # To mock the exception case, we can monkeypatch httpx.AsyncClient.
    import httpx

    class FakeExceptionClient:
        async def __aenter__(self):
            return self
        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass
        async def get(self, *args, **kwargs):
            raise Exception("Network Error")

    original_client = httpx.AsyncClient
    httpx.AsyncClient = FakeExceptionClient

    # Patch asyncio.sleep to avoid waiting during retries
    original_sleep = asyncio.sleep
    async def fake_sleep(*args, **kwargs):
        pass
    asyncio.sleep = fake_sleep

    try:
        daemon._forage()
    finally:
        httpx.AsyncClient = original_client
        asyncio.sleep = original_sleep

    # Verify that archive.add was NOT called, because it handles exceptions
    # by logging and returning, instead of inserting mock data (when no offline LLM is provided).
    assert not mock_archive.add.called

@pytest.mark.anyio
async def test_autoresearch_daemon_real_forage_mocked():
    mock_archive = AsyncMock()
    mock_llm = AsyncMock()
    mock_llm.process.side_effect = ["quantum entanglement", "Structured logic summary"]
    mock_ncp = AsyncMock()
    mock_ncp.fetch_context.return_value = "NCP Context"

    daemon = AutoResearchDaemon(archive=mock_archive, llm=mock_llm, ncp_client=mock_ncp)

    # Also patch asyncio.sleep to speed up tests that might have real HTTP fallback errors locally
    original_sleep = asyncio.sleep
    async def fake_sleep(*args, **kwargs):
        pass
    asyncio.sleep = fake_sleep

    try:
        await daemon._async_forage()
    finally:
        asyncio.sleep = original_sleep

    assert mock_archive.sync_to_grid.called
    args, kwargs = mock_archive.sync_to_grid.call_args
    assert kwargs["metadata"]["source"] == "autoresearch_daemon"
    assert "topic" in kwargs["metadata"]
    assert "provenance_confidence" in kwargs["metadata"]
    assert kwargs["content"] == "Structured logic summary"

def test_autoresearch_daemon_lifecycle():
    mock_archive = MagicMock()
    daemon = AutoResearchDaemon(archive=mock_archive)

    # Start daemon
    daemon.start()
    assert daemon.running is True
    assert daemon.thread is not None
    assert daemon.thread.is_alive()

    # Stop daemon
    daemon.stop()
    assert daemon.running is False
    # thread.join() is called, so it should not be alive
    assert not daemon.thread.is_alive()
