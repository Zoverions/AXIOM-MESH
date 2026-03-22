import pytest
import os
import sys
from unittest.mock import MagicMock, patch

# Create the mock objects needed
mcp_mock = MagicMock()

class MockFastMCP:
    def __init__(self, *args, **kwargs):
        pass
    def tool(self, *args, **kwargs):
        def decorator(func):
            return func
        return decorator

mcp_mock.server.fastmcp.FastMCP = MockFastMCP
mcp_mock.server.fastmcp.Context = MagicMock

# Create a dictionary representing the mocked modules
mocked_modules = {
    'mcp': mcp_mock,
    'mcp.server': mcp_mock.server,
    'mcp.server.fastmcp': mcp_mock.server.fastmcp
}

# Since we're running from tests folder, make sure we can import src correctly
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

@pytest.fixture(scope="module", autouse=True)
def mock_mcp_modules():
    """Mock the mcp modules for this test module to avoid side effects on other tests"""
    with patch.dict(sys.modules, mocked_modules):
        # We must import inside the patched context
        import src.api.mcp_server as mcp_server
        yield mcp_server

@pytest.mark.asyncio
async def test_register_tee_skill_no_expected_key(monkeypatch, mock_mcp_modules):
    # If HYPERVISOR_API_KEY is not set, any auth token passes
    monkeypatch.delenv("HYPERVISOR_API_KEY", raising=False)

    result = await mock_mcp_modules.register_tee_skill("my_skill", {"pub": "key"}, "proof123", "")
    assert "Successfully registered TEE skill" in result
    assert "proof123" in result

@pytest.mark.asyncio
async def test_register_tee_skill_valid_key(monkeypatch, mock_mcp_modules):
    monkeypatch.setenv("HYPERVISOR_API_KEY", "secret123")

    result = await mock_mcp_modules.register_tee_skill("my_skill", {"pub": "key"}, "proof123", "Bearer secret123")
    assert "Successfully registered TEE skill" in result

@pytest.mark.asyncio
async def test_register_tee_skill_invalid_key(monkeypatch, mock_mcp_modules):
    monkeypatch.setenv("HYPERVISOR_API_KEY", "secret123")

    result = await mock_mcp_modules.register_tee_skill("my_skill", {"pub": "key"}, "proof123", "Bearer badsecret")
    assert "Security Halt: Server identity unverified" in result
    assert "Successfully registered TEE skill" not in result

@pytest.mark.asyncio
async def test_register_tee_skill_empty_token(monkeypatch, mock_mcp_modules):
    monkeypatch.setenv("HYPERVISOR_API_KEY", "secret123")

    result = await mock_mcp_modules.register_tee_skill("my_skill", {"pub": "key"}, "proof123", "")
    assert "Security Halt: Server identity unverified" in result

@pytest.mark.asyncio
async def test_register_tee_skill_prompt_injection(monkeypatch, mock_mcp_modules):
    monkeypatch.delenv("HYPERVISOR_API_KEY", raising=False)

    result = await mock_mcp_modules.register_tee_skill("my_skill <| malicious payload |>", {"pub": "key"}, "proof123", "")
    assert "Security Halt: Prompt injection delimiters detected" in result

@pytest.mark.asyncio
async def test_register_tee_skill_prompt_injection_fragment(monkeypatch, mock_mcp_modules):
    monkeypatch.delenv("HYPERVISOR_API_KEY", raising=False)

    result = await mock_mcp_modules.register_tee_skill("my_skill", {"pub": "<| malicious payload |>"}, "proof123", "")
    assert "Security Halt: Prompt injection delimiters detected" in result
