import pytest
import sys
from unittest.mock import MagicMock, patch

mcp_mock = MagicMock()
class MockFastMCP:
    def __init__(self, *args, **kwargs):
        pass
    def tool(self, *args, **kwargs):
        def decorator(func):
            return func
        return decorator

mcp_mock.server.fastmcp.FastMCP = MockFastMCP

mocked_modules = {
    'mcp': mcp_mock,
    'mcp.server': mcp_mock.server,
    'mcp.server.fastmcp': mcp_mock.server.fastmcp
}

# Apply the patch immediately so the import below can succeed.
with patch.dict(sys.modules, mocked_modules):
    # This correctly avoids importing mcp but imports the target function
    from src.api.mcp_server import is_safe_code

def test_is_safe_code_safe():
    code = "print('hello world')"
    assert is_safe_code(code) is True

def test_is_safe_code_syntax_error():
    code = "print('hello world"
    assert is_safe_code(code) is False

def test_is_safe_code_forbidden_imports():
    forbidden_modules = ["os", "sys", "subprocess", "shlex", "pty", "socket"]
    for module in forbidden_modules:
        code = f"import {module}"
        assert is_safe_code(code) is False

        code = f"import {module} as foo"
        assert is_safe_code(code) is False

        code = f"import sys, {module}"
        assert is_safe_code(code) is False

def test_is_safe_code_forbidden_import_from():
    forbidden_modules = ["os", "sys", "subprocess", "shlex", "pty", "socket"]
    for module in forbidden_modules:
        code = f"from {module} import foo"
        assert is_safe_code(code) is False

        code = f"from {module}.sub import foo"
        assert is_safe_code(code) is False

def test_is_safe_code_forbidden_calls():
    forbidden_funcs = ["__import__", "eval", "exec", "open"]
    for func in forbidden_funcs:
        code = f"{func}('foo')"
        assert is_safe_code(code) is False

def test_is_safe_code_allowed_calls():
    code = "sum([1, 2, 3])"
    assert is_safe_code(code) is True

    code = "len('hello')"
    assert is_safe_code(code) is True
