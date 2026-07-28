import pytest
import asyncio
from unittest.mock import patch, AsyncMock, MagicMock
from src.engine.mcp_client import MCPClient

@pytest.fixture
def mcp_client():
    return MCPClient()

@pytest.mark.asyncio
@patch("src.engine.mcp_client.ClientSession")
@patch("src.engine.mcp_client.sse_client")
async def test_mcp_fetch_context_success(mock_sse_client, mock_client_session, mcp_client):
    """Test successful external tool execution logic."""
    # Ensure there's a server configured to trigger the fetching loop
    mcp_client.servers = ["http://test-mcp"]

    # Mock SSE streams
    mock_streams = (AsyncMock(), AsyncMock())
    mock_sse_client.return_value.__aenter__.return_value = mock_streams

    # Mock Session and its methods
    mock_session_instance = AsyncMock()
    mock_client_session.return_value.__aenter__.return_value = mock_session_instance

    mock_tools_response = MagicMock()
    mock_tool = MagicMock()
    mock_tool.name = "test_tool"
    mock_tool.description = "Test description"
    mock_tools_response.tools = [mock_tool]
    mock_session_instance.list_tools.return_value = mock_tools_response

    mock_prompts_response = MagicMock()
    mock_prompt = MagicMock()
    mock_prompt.name = "test_prompt"
    mock_prompt.description = "Test prompt desc"
    mock_prompts_response.prompts = [mock_prompt]
    mock_session_instance.list_prompts.return_value = mock_prompts_response

    with patch.object(mcp_client, 'verify_peer_compatibility', return_value=True), \
         patch.object(mcp_client, 'check_compatibility', return_value=True):
        result = await mcp_client.fetch_context("test intent")

    assert result is not None
    assert type(result) == str
    assert "test_tool" in result
    assert "test_prompt" in result

@pytest.mark.asyncio
@patch("src.engine.mcp_client.ClientSession")
@patch("src.engine.mcp_client.sse_client")
async def test_mcp_fetch_context_timeout(mock_sse_client, mock_client_session, mcp_client):
    """Test resilience against execution timeouts."""
    mcp_client.servers = ["http://test-mcp"]

    # Simulate connection error
    mock_sse_client.return_value.__aenter__.side_effect = asyncio.TimeoutError("Timeout")

    with patch.object(mcp_client, 'verify_peer_compatibility', return_value=True), \
         patch.object(mcp_client, 'check_compatibility', return_value=True):
        result = await mcp_client.fetch_context("test intent")

    assert result is not None
    assert type(result) == str
    assert "Offline or Unreachable" in result

@pytest.mark.asyncio
@patch("src.engine.mcp_client.ClientSession")
@patch("src.engine.mcp_client.sse_client")
async def test_mcp_fetch_context_subprocess_failure(mock_sse_client, mock_client_session, mcp_client):
    """Test resilience against external tool non-zero exit codes."""
    mcp_client.servers = ["http://test-mcp"]

    # Mock SSE streams
    mock_streams = (AsyncMock(), AsyncMock())
    mock_sse_client.return_value.__aenter__.return_value = mock_streams

    # Mock Session and its methods
    mock_session_instance = AsyncMock()
    mock_client_session.return_value.__aenter__.return_value = mock_session_instance
    mock_session_instance.initialize.side_effect = Exception("Tool execution failed")

    with patch.object(mcp_client, 'verify_peer_compatibility', return_value=True), \
         patch.object(mcp_client, 'check_compatibility', return_value=True):
        result = await mcp_client.fetch_context("test intent")

    assert result is not None
    assert type(result) == str
    assert "Offline or Unreachable" in result
