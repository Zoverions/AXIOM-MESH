import pytest
import sys
import os
import asyncio
from unittest.mock import MagicMock, AsyncMock, patch
from langgraph.graph import StateGraph

# Add hypervisor/src to sys.path
sys.path.append(os.path.join(os.path.dirname(__file__), "..", "src"))

from src.graph.autoresearch_graph import autoresearch_app

@pytest.mark.asyncio
@patch('httpx.AsyncClient')
async def test_autoresearch_offline_modes(mock_client):
    # Mock offline mode where all requests fail with network error
    mock_instance = AsyncMock()
    mock_instance.__aenter__.return_value = mock_instance
    mock_instance.post.side_effect = Exception("Offline Mode")
    mock_client.return_value = mock_instance

    initial_state = {
        "intent": "Research in offline mode",
        "context": "",
        "routing_decision": "",
        "priority_tag": "",
        "treasury_split": {},
        "sandbox_output": "",
        "zkml_verified": False,
        "stake_status": ""
    }

    result = await autoresearch_app.ainvoke(initial_state)

    # Sandbox exec catches the exception
    assert "Sandbox Exception" in result["sandbox_output"]
    assert "Offline Mode" in result["sandbox_output"]

    # zkml verify defaults to False on exception
    assert result["zkml_verified"] is False

    # grid stake skips because zkml verified is False
    assert result["stake_status"] == "Skipped (Not Verified)"

@pytest.mark.asyncio
@patch('httpx.AsyncClient')
async def test_autoresearch_overload_grid_queue(mock_client):
    # Test overload scenarios (e.g., Grid queue is full)
    mock_instance = AsyncMock()
    mock_instance.__aenter__.return_value = mock_instance

    # Simulate sandbox working but grid zkml being unavailable due to queue full
    mock_sandbox_res = AsyncMock()
    class MockRes:
        def __init__(self, status_code, json_data=None):
            self.status_code = status_code
            self._json_data = json_data
        def json(self):
            return self._json_data

    mock_sandbox_res = MockRes(200, {"result": {"stdout": "Success"}})
    mock_grid_zkml_res = MockRes(503)

    async def mock_post(url, *args, **kwargs):
        if "execute" in url.lower() or "4000" in url:
            return mock_sandbox_res
        elif "zkml" in url.lower():
            return mock_grid_zkml_res
        return MockRes(500)

    mock_instance.post = mock_post
    mock_client.return_value = mock_instance

    initial_state = {
        "intent": "Research and overload grid",
        "context": "",
        "routing_decision": "",
        "priority_tag": "",
        "treasury_split": {},
        "sandbox_output": "",
        "zkml_verified": False,
        "stake_status": ""
    }

    result = await autoresearch_app.ainvoke(initial_state)

    assert result["sandbox_output"] == "Success"
    assert result["zkml_verified"] is False
    assert result["stake_status"] == "Skipped (Not Verified)"

@pytest.mark.asyncio
@patch('httpx.AsyncClient')
async def test_autoresearch_bond_severance(mock_client):
    # Test bond severance or slashing scenario
    mock_instance = AsyncMock()
    mock_instance.__aenter__.return_value = mock_instance

    # Simulate sandbox and zkml working, but grid stake fails due to slashed/inactive bond
    mock_sandbox_res = AsyncMock()
    class MockRes:
        def __init__(self, status_code, json_data=None):
            self.status_code = status_code
            self._json_data = json_data
        def json(self):
            return self._json_data

    mock_sandbox_res = MockRes(200, {"result": {"stdout": "Success"}})
    mock_grid_zkml_res = MockRes(200, {"status": "verified"})
    mock_grid_stake_res = MockRes(403, {"error": "bond not active"})

    async def mock_post(url, *args, **kwargs):
        if "execute" in url.lower() or "4000" in url:
            return mock_sandbox_res
        elif "zkml" in url.lower():
            return mock_grid_zkml_res
        elif "stake" in url.lower():
            return mock_grid_stake_res
        return MockRes(500)

    mock_instance.post = mock_post
    mock_client.return_value = mock_instance

    initial_state = {
        "intent": "Research and attempt to stake with inactive bond",
        "context": "",
        "routing_decision": "",
        "priority_tag": "",
        "treasury_split": {},
        "sandbox_output": "",
        "zkml_verified": False,
        "stake_status": ""
    }

    result = await autoresearch_app.ainvoke(initial_state)

    assert result["sandbox_output"] == "Success"
    assert result["zkml_verified"] is True
    assert "Staking Error: 403" in result["stake_status"]
