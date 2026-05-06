import pytest
import httpx
import json
import hashlib
from unittest.mock import AsyncMock, patch, MagicMock
from hypervisor.src.agents.hermes_agent import HermesAgent
from hypervisor.policies.hermes_policy import HERMES_POLICY

@pytest.fixture
def hermes_agent():
    return HermesAgent(agent_id="test-agent", owner_address="0x123")

@pytest.mark.asyncio
async def test_execute_task_policy_deny(hermes_agent):
    # Test task initialization denied by policy
    with patch("hypervisor.src.agents.hermes_agent.validate_hermes_action", return_value=False):
        result = await hermes_agent.execute_task("Self-destruct")
        assert result["success"] is False
        assert "denied by security policy" in result["error"]

@pytest.mark.asyncio
async def test_execute_task_success(hermes_agent):
    # Mock successful sandbox execution
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"status": "completed", "success": True, "output": "Task done"}
    mock_response.raise_for_status = MagicMock()

    with patch("httpx.AsyncClient.post", return_value=mock_response):
        with patch("hypervisor.src.agents.hermes_agent.validate_hermes_action", return_value=True):
            result = await hermes_agent.execute_task("Analyze PulseChain")
            assert result["success"] is True
            assert result["output"] == "Task done"

@pytest.mark.asyncio
async def test_governed_action_grid_request(hermes_agent):
    # Mock a high-risk action that needs Grid
    action = {"type": "send_transaction", "amount": 100, "cost": 10}

    # Mock Grid responses
    mock_grid_response = MagicMock()
    mock_grid_response.status_code = 200
    mock_grid_response.json.return_value = {"token": "cap-token-123"}

    with patch("httpx.AsyncClient.post", return_value=mock_grid_response):
        result = await hermes_agent._request_grid_capability(action)
        assert result["status"] == "success"
        assert result["token"] == "cap-token-123"
        assert result["action"] == action

@pytest.mark.asyncio
async def test_sandbox_intermediate_action(hermes_agent):
    # Mock sandbox asking for an action, then completing
    req_action_resp = MagicMock()
    req_action_resp.status_code = 200
    req_action_resp.json.return_value = {
        "status": "requires_action",
        "action": {"type": "browser", "url": "https://example.com"}
    }

    final_resp = MagicMock()
    final_resp.status_code = 200
    final_resp.json.return_value = {"status": "completed", "success": True, "output": "Browsed"}

    with patch("httpx.AsyncClient.post", side_effect=[req_action_resp, final_resp]):
        with patch("hypervisor.src.agents.hermes_agent.validate_hermes_action", return_value=True):
            result = await hermes_agent.execute_task("Browse something")
            assert result["success"] is True
            assert result["output"] == "Browsed"

def test_hermes_policy_validation():
    from hypervisor.policies.hermes_policy import validate_hermes_action

    # Allowed tool
    assert validate_hermes_action({"type": "web_search"}, {}) is True

    # High risk tool (now returns True to allow interception by Hypervisor/HermesAgent)
    assert validate_hermes_action({"type": "send_transaction"}, {}) is True

    # Unknown tool
    assert validate_hermes_action({"type": "unknown_tool"}, {}) is False
