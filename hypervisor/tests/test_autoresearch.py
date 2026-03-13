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
    # It should fallback to mock because llm/ncp are missing
    daemon._forage()

    # Verify something was added to the archive
    assert mock_archive.add.called
    args, kwargs = mock_archive.add.call_args
    assert "content" in kwargs
    assert kwargs["content"] in daemon.mock_data_sources
    assert "metadata" in kwargs
    # It falls back to mock metadata when real forage fails or has no data
    assert kwargs["metadata"]["source"] == "autoresearch_daemon_mock"

@pytest.mark.anyio
async def test_autoresearch_daemon_real_forage_mocked():
    mock_archive = MagicMock()
    mock_llm = AsyncMock()
    mock_llm.process.side_effect = ["quantum entanglement", "Structured logic summary"]
    mock_ncp = AsyncMock()
    mock_ncp.fetch_context.return_value = "NCP Context"

    daemon = AutoResearchDaemon(archive=mock_archive, llm=mock_llm, ncp_client=mock_ncp)

    await daemon._async_forage()

    assert mock_archive.add.called
    args, kwargs = mock_archive.add.call_args
    assert kwargs["metadata"]["source"] == "autoresearch_daemon"
    assert "topic" in kwargs["metadata"]
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
