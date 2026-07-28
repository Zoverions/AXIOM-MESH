import pytest
import asyncio
from unittest.mock import patch, AsyncMock, MagicMock
from src.engine.ncp_client import NCPClient

@pytest.fixture
def ncp_client():
    return NCPClient()

@pytest.mark.asyncio
@patch("httpx.AsyncClient.post")
async def test_ncp_fetch_context_success(mock_post, ncp_client):
    """Test successful external tool execution logic."""
    # Ensure there's a server configured to trigger the fetching loop
    ncp_client.servers = ["http://test-ncp"]

    mock_response = MagicMock()
    mock_response.status_code = 200

    # Needs a valid schema payload
    valid_payload = {
        "id": "req-123",
        "session_id": "ncp-session",
        "channel": "ncp",
        "content": "mocked external ncp context",
        "metadata": {"source": "axiom_hypervisor"},
        "timestamp": 1234567890
    }
    mock_response.json.return_value = valid_payload
    mock_post.return_value = mock_response

    result = await ncp_client.fetch_context("test intent")

    # Assert that subprocess was called and the result was handled
    assert mock_post.called
    assert result is not None
    assert isinstance(result, str)
    assert "mocked external ncp context" in result

@pytest.mark.asyncio
@patch("httpx.AsyncClient.post")
async def test_ncp_fetch_context_timeout(mock_post, ncp_client):
    """Test resilience against execution timeouts."""
    ncp_client.servers = ["http://test-ncp"]

    # Simulate wait_for raising TimeoutError
    mock_post.side_effect = asyncio.TimeoutError("Timeout")

    # Execute and verify it doesn't crash
    result = await ncp_client.fetch_context("test intent")

    assert mock_post.called
    assert result is not None
    assert isinstance(result, str)
    assert "Offline or Unreachable" in result

@pytest.mark.asyncio
@patch("httpx.AsyncClient.post")
async def test_ncp_fetch_context_subprocess_failure(mock_post, ncp_client):
    """Test resilience against external tool non-zero exit codes."""
    ncp_client.servers = ["http://test-ncp"]

    mock_response = MagicMock()
    mock_response.status_code = 500
    mock_post.return_value = mock_response

    result = await ncp_client.fetch_context("test intent")

    assert mock_post.called
    assert result is not None
    assert isinstance(result, str)
    assert result == ""
