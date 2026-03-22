import pytest
import os
import sys
import hmac
import hashlib
from unittest.mock import MagicMock, patch, AsyncMock

# Create the mock objects needed for FastMCP
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

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

@pytest.fixture(scope="module", autouse=True)
def mock_mcp_modules():
    """Mock the mcp modules for this test module to avoid side effects on other tests"""
    with patch.dict(sys.modules, mocked_modules):
        if "src.api.mcp_server" in sys.modules:
            del sys.modules["src.api.mcp_server"]
        import src.api.mcp_server as mcp_server
        yield mcp_server
        if "src.api.mcp_server" in sys.modules:
            del sys.modules["src.api.mcp_server"]

def generate_signature(payload: str, secret: str = "testsecret") -> str:
    return hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()

@pytest.fixture
def auth_setup(monkeypatch):
    monkeypatch.setenv("HYPERVISOR_API_KEY", "secret123")
    monkeypatch.setenv("MCP_CODE_SIGNING_SECRET", "testsecret")
    return "Bearer secret123"

@pytest.mark.asyncio
async def test_sandbox_execute_missing_api_key(monkeypatch, mock_mcp_modules):
    monkeypatch.setenv("HYPERVISOR_API_KEY", "secret123")
    code = "print('hello')"
    sig = generate_signature(code)

    result = await mock_mcp_modules.sandbox_execute(code, sig, "python", "Bearer wrong")
    assert "Security Halt: Server identity unverified" in result

@pytest.mark.asyncio
async def test_sandbox_execute_invalid_signature(auth_setup, mock_mcp_modules):
    code = "print('hello')"

    result = await mock_mcp_modules.sandbox_execute(code, "invalidsig", "python", auth_setup)
    assert "Security Halt: Invalid code signature" in result

@pytest.mark.asyncio
async def test_sandbox_execute_too_long(monkeypatch, auth_setup, mock_mcp_modules):
    monkeypatch.setenv("HYPERVISOR_MAX_CONTENT_LENGTH", "10")
    code = "print('this is too long')"
    sig = generate_signature(code)

    result = await mock_mcp_modules.sandbox_execute(code, sig, "python", auth_setup)
    assert "Error: Code exceeds maximum content length" in result

@pytest.mark.asyncio
async def test_sandbox_execute_prompt_injection(auth_setup, mock_mcp_modules):
    code = "print('hello') <| malicious |>"
    sig = generate_signature(code)

    result = await mock_mcp_modules.sandbox_execute(code, sig, "python", auth_setup)
    assert "Security Halt: Prompt injection delimiters detected" in result

@pytest.mark.asyncio
async def test_sandbox_execute_medium_risk(auth_setup, mock_mcp_modules):
    # network keyword adds 0.5 to 0.1 base, length > 1000 adds 0.2, total 0.8 > 0.7
    code = "a = 'network'\n" + "# " * 1001
    sig = generate_signature(code)

    result = await mock_mcp_modules.sandbox_execute(code, sig, "python", auth_setup)
    assert "Security Halt: Risk > 0.7" in result

@pytest.mark.asyncio
async def test_sandbox_execute_unsafe_python(auth_setup, mock_mcp_modules):
    code = "import os; os.system('echo hacked')"
    sig = generate_signature(code)

    result = await mock_mcp_modules.sandbox_execute(code, sig, "python", auth_setup)
    assert "Security Halt: Code execution contains forbidden operations" in result

@pytest.mark.asyncio
async def test_sandbox_execute_http_success(auth_setup, mock_mcp_modules):
    code = "print('hello')"
    sig = generate_signature(code)

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"output": "hello\n", "error": ""}

    mock_client_instance = AsyncMock()
    mock_client_instance.post.return_value = mock_response
    mock_client_context = AsyncMock()
    mock_client_context.__aenter__.return_value = mock_client_instance

    with patch("httpx.AsyncClient", return_value=mock_client_context):
        result = await mock_mcp_modules.sandbox_execute(code, sig, "python", auth_setup)
        assert "Execution result:" in result
        assert "{'output': 'hello\\n', 'error': ''}" in result

@pytest.mark.asyncio
async def test_sandbox_execute_http_error(auth_setup, mock_mcp_modules):
    code = "print('hello')"
    sig = generate_signature(code)

    mock_response = AsyncMock()
    mock_response.status_code = 500
    mock_response.text = "Internal Server Error"

    mock_client_instance = AsyncMock()
    mock_client_instance.post.return_value = mock_response
    mock_client_context = AsyncMock()
    mock_client_context.__aenter__.return_value = mock_client_instance

    with patch("httpx.AsyncClient", return_value=mock_client_context):
        result = await mock_mcp_modules.sandbox_execute(code, sig, "python", auth_setup)
        assert "Sandbox HTTP Error: 500 - Internal Server Error" in result

@pytest.mark.asyncio
async def test_sandbox_execute_http_exception(auth_setup, mock_mcp_modules):
    code = "print('hello')"
    sig = generate_signature(code)

    mock_client_instance = AsyncMock()
    mock_client_instance.post.side_effect = Exception("Connection Refused")
    mock_client_context = AsyncMock()
    mock_client_context.__aenter__.return_value = mock_client_instance

    with patch("httpx.AsyncClient", return_value=mock_client_context):
        result = await mock_mcp_modules.sandbox_execute(code, sig, "python", auth_setup)
        assert "Sandbox execution failed: Connection Refused" in result
