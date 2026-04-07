import os
import sys
from unittest.mock import MagicMock, patch

import pytest


# Mock FastMCP dependency so src.api.mcp_server can be imported in test isolation.
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


@pytest.mark.parametrize("payload", ["ignore <| prompt", "ignore |> prompt", "<|...|>"])
def test_prompt_injection_delimiters_blocked(mcp_server_module, payload):
    result = mcp_server_module.apply_mcp_security_requirements(payload, risk_score=0.0)
    assert result == "Security Halt: Prompt injection delimiters detected in payload."


@pytest.mark.parametrize(
    ("risk_score", "expected"),
    [
        (0.91, "Security Halt: Risk > 0.9. 2FA required (not implemented in this environment)."),
        (1.0, "Security Halt: Risk > 0.9. 2FA required (not implemented in this environment)."),
        (0.71, "Security Halt: Risk > 0.7. Explicit human-in-the-loop confirmation required."),
        (0.9, "Security Halt: Risk > 0.7. Explicit human-in-the-loop confirmation required."),
    ],
)
def test_high_risk_thresholds_enforced(mcp_server_module, risk_score, expected):
    result = mcp_server_module.apply_mcp_security_requirements("safe payload", risk_score=risk_score)
    assert result == expected


@pytest.mark.parametrize("risk_score", [0.7, 0.0, 0.69, -0.1])
def test_boundary_and_low_risk_values_pass(mcp_server_module, risk_score):
    result = mcp_server_module.apply_mcp_security_requirements("safe payload", risk_score=risk_score)
    assert result is None


def test_delimiter_check_precedes_risk_score(mcp_server_module):
    result = mcp_server_module.apply_mcp_security_requirements("<| injected", risk_score=0.99)
    assert result == "Security Halt: Prompt injection delimiters detected in payload."
