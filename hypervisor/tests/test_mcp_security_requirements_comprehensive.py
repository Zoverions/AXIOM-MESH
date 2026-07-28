import os
import sys
import math
from unittest.mock import MagicMock, patch

import pytest

# Mock FastMCP dependency
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

mocked_modules = {
    "mcp": mcp_mock,
    "mcp.server": mcp_mock.server,
    "mcp.server.fastmcp": mcp_mock.server.fastmcp,
    "pydantic": MagicMock(),
    "httpx": MagicMock(),
}

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

@pytest.fixture(scope="module")
def mcp_server_module():
    with patch.dict(sys.modules, mocked_modules):
        if "src.api.mcp_server" in sys.modules:
            del sys.modules["src.api.mcp_server"]
        import src.api.mcp_server as mcp_server
        yield mcp_server
        if "src.api.mcp_server" in sys.modules:
            del sys.modules["src.api.mcp_server"]

@pytest.mark.parametrize("payload", [
    "safe payload",
    "",
    "A" * 10000,
])
def test_safe_payloads(mcp_server_module, payload):
    result = mcp_server_module.apply_mcp_security_requirements(payload, risk_score=0.0)
    assert result is None

@pytest.mark.parametrize("payload", [
    "payload with <| delimiter",
    "payload with |> delimiter",
    "<| injection |>",
    "prefix <| |> suffix",
])
def test_delimiters_blocked(mcp_server_module, payload):
    result = mcp_server_module.apply_mcp_security_requirements(payload, risk_score=0.0)
    assert "Security Halt: Prompt injection delimiters detected" in result

@pytest.mark.parametrize("risk_score, expected_halt", [
    (0.0, False),
    (0.7, False),
    (0.70001, True),
    (0.8, True),
    (0.9, True),
    (0.90001, True),
    (1.0, True),
])
def test_risk_score_thresholds(mcp_server_module, risk_score, expected_halt):
    result = mcp_server_module.apply_mcp_security_requirements("safe", risk_score=risk_score)
    if expected_halt:
        assert "Security Halt: Risk >" in result
    else:
        assert result is None

def test_invalid_payload_type(mcp_server_module):
    # Should fail closed if payload is not a string
    result = mcp_server_module.apply_mcp_security_requirements(None, risk_score=0.0)
    assert "Security Halt: Invalid payload type" in result or result is not None

    result = mcp_server_module.apply_mcp_security_requirements(123, risk_score=0.0)
    assert "Security Halt: Invalid payload type" in result or result is not None

def test_invalid_risk_score_type(mcp_server_module):
    # Should fail closed if risk_score is not a float/int
    result = mcp_server_module.apply_mcp_security_requirements("safe", risk_score="high")
    assert "Security Halt: Invalid risk score" in result or result is not None

def test_special_float_risk_scores(mcp_server_module):
    # NaN and Inf should be rejected
    result = mcp_server_module.apply_mcp_security_requirements("safe", risk_score=float('nan'))
    assert "Security Halt" in result

    result = mcp_server_module.apply_mcp_security_requirements("safe", risk_score=float('inf'))
    assert "Security Halt" in result

def test_precedence(mcp_server_module):
    # Delimiter check should happen before risk check
    result = mcp_server_module.apply_mcp_security_requirements("<|", risk_score=0.95)
    assert "Prompt injection delimiters detected" in result
