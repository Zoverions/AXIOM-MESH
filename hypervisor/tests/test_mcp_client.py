import pytest
import asyncio
from unittest.mock import patch, AsyncMock, MagicMock
from src.engine.mcp_client import MCPClient

@pytest.fixture
def mcp_client():
    return MCPClient()

@pytest.mark.asyncio
@patch("asyncio.create_subprocess_exec", new_callable=AsyncMock)
async def test_mcp_fetch_context_success(mock_exec, mcp_client):
    """Test successful external tool execution logic."""
    # Ensure there's a server configured to trigger the fetching loop
    mcp_client.servers = ["http://test-mcp"]

    mock_process = AsyncMock()
    mock_process.communicate.return_value = (b"mocked external mcp context", b"")
    mock_process.returncode = 0
    mock_exec.return_value = mock_process

    result = await mcp_client.fetch_context("test intent")

    # Assert that subprocess was called and the result was handled
    assert mock_exec.called
    assert result is not None
    assert type(result) == str

@pytest.mark.asyncio
@patch("asyncio.create_subprocess_exec", new_callable=AsyncMock)
async def test_mcp_fetch_context_timeout(mock_exec, mcp_client):
    """Test resilience against execution timeouts."""
    mcp_client.servers = ["http://test-mcp"]

    mock_process = AsyncMock()

    # Simulate wait_for raising TimeoutError
    async def mock_communicate():
        raise asyncio.TimeoutError("Timeout")

    mock_process.communicate.side_effect = mock_communicate
    mock_exec.return_value = mock_process

    # Execute and verify it doesn't crash
    result = await mcp_client.fetch_context("test intent")

    assert mock_exec.called
    assert result is not None
    assert type(result) == str

@pytest.mark.asyncio
@patch("asyncio.create_subprocess_exec", new_callable=AsyncMock)
async def test_mcp_fetch_context_subprocess_failure(mock_exec, mcp_client):
    """Test resilience against external tool non-zero exit codes."""
    mcp_client.servers = ["http://test-mcp"]

    mock_process = AsyncMock()
    mock_process.communicate.return_value = (b"", b"Tool execution failed")
    mock_process.returncode = 1
    mock_exec.return_value = mock_process

    result = await mcp_client.fetch_context("test intent")

    assert mock_exec.called
    assert result is not None
    assert type(result) == str
