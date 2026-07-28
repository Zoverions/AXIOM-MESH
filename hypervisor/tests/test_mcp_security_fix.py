import pytest
import os
import hmac
import hashlib
import ast

def get_verify_signature():
    file_path = os.path.join(os.path.dirname(__file__), "../src/api/mcp_server.py")
    with open(file_path, "r") as f:
        tree = ast.parse(f.read())

    func_node = None
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name == "verify_signature":
            func_node = node
            break

    if not func_node:
        raise Exception("Could not find verify_signature function")

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
    return context["verify_signature"]

verify_signature = get_verify_signature()

def test_verify_signature_fails_without_secret():
    # Ensure MCP_CODE_SIGNING_SECRET is NOT set
    if "MCP_CODE_SIGNING_SECRET" in os.environ:
        del os.environ["MCP_CODE_SIGNING_SECRET"]

    payload = "print('hello')"
    # This is the expected signature if it uses "default_signing_secret"
    default_secret = "default_signing_secret".encode()
    expected_sig = hmac.new(default_secret, payload.encode(), hashlib.sha256).hexdigest()

    # Now, this should raise a RuntimeError because it no longer uses the hardcoded default
    with pytest.raises(RuntimeError) as exc_info:
        verify_signature(payload, expected_sig)
    assert "MCP_CODE_SIGNING_SECRET is not configured" in str(exc_info.value)

def test_verify_signature_with_env_secret():
    os.environ["MCP_CODE_SIGNING_SECRET"] = "my_real_secret"
    payload = "print('hello')"
    secret = "my_real_secret".encode()
    expected_sig = hmac.new(secret, payload.encode(), hashlib.sha256).hexdigest()

    assert verify_signature(payload, expected_sig) is True
    del os.environ["MCP_CODE_SIGNING_SECRET"]
