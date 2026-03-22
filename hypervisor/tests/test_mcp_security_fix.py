import pytest
import os
import hmac
import hashlib
import ast

def get_verify_code_signature():
    file_path = os.path.join(os.path.dirname(__file__), "../src/api/mcp_server.py")
    with open(file_path, "r") as f:
        tree = ast.parse(f.read())

    func_node = None
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name == "verify_code_signature":
            func_node = node
            break

    if not func_node:
        raise Exception("Could not find verify_code_signature function")

    # To run this, we need os, hashlib, hmac in context
    module = ast.Module(body=[func_node], type_ignores=[])
    code = compile(module, filename="<ast>", mode="exec")

    # Mock SecretManager for later if needed, but for now we just want to test current state
    class MockSecretManager:
        @staticmethod
        def get_secret(name, default=None):
            return os.environ.get(name, default)

    context = {
        "os": os,
        "hashlib": hashlib,
        "hmac": hmac,
        "SecretManager": MockSecretManager
    }
    exec(code, context)
    return context["verify_code_signature"]

verify_code_signature = get_verify_code_signature()

def test_verify_code_signature_fails_without_secret():
    # Ensure MCP_CODE_SIGNING_SECRET is NOT set
    if "MCP_CODE_SIGNING_SECRET" in os.environ:
        del os.environ["MCP_CODE_SIGNING_SECRET"]

    code = "print('hello')"
    # This is the expected signature if it uses "default_signing_secret"
    default_secret = "default_signing_secret".encode()
    expected_sig = hmac.new(default_secret, code.encode(), hashlib.sha256).hexdigest()

    # Now, this should raise a RuntimeError because it no longer uses the hardcoded default
    with pytest.raises(RuntimeError) as exc_info:
        verify_code_signature(code, expected_sig)
    assert "MCP_CODE_SIGNING_SECRET is not configured" in str(exc_info.value)

def test_verify_code_signature_with_env_secret():
    os.environ["MCP_CODE_SIGNING_SECRET"] = "my_real_secret"
    code = "print('hello')"
    secret = "my_real_secret".encode()
    expected_sig = hmac.new(secret, code.encode(), hashlib.sha256).hexdigest()

    assert verify_code_signature(code, expected_sig) is True
    del os.environ["MCP_CODE_SIGNING_SECRET"]
