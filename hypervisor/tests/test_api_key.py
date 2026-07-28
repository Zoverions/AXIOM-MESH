import os
import sys
import pytest
from fastapi import HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials
from unittest.mock import patch, MagicMock

# Add hypervisor to sys.path
sys.path.append(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

# Safely extract and test the function without modifying system modules
import ast
from fastapi import status

def get_verify_api_key_func():
    file_path = os.path.join(os.path.dirname(__file__), "../src/api/server.py")
    with open(file_path, "r") as f:
        tree = ast.parse(f.read())

    nodes_to_compile = []
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name in ("get_expected_api_key", "validate_api_key", "verify_api_key"):
            nodes_to_compile.append(node)

    if not nodes_to_compile:
        raise Exception("Could not find verify_api_key functions")

    module = ast.Module(body=nodes_to_compile, type_ignores=[])
    code = compile(module, filename="<ast>", mode="exec")

    class MockSecretManager:
        @staticmethod
        def get_secret(key):
            return os.environ.get(key)

    context = {
        "Request": Request,
        "HTTPAuthorizationCredentials": HTTPAuthorizationCredentials,
        "Depends": lambda x: None,
        "security": None,
        "os": os,
        "HTTPException": HTTPException,
        "status": status,
        "SecretManager": MockSecretManager
    }
    exec(code, context)
    return context["verify_api_key"]

# We use the isolated function instead of importing the whole server
verify_api_key = get_verify_api_key_func()


def test_verify_api_key_success():
    mock_request = MagicMock(spec=Request)
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="valid_key")

    with patch.dict(os.environ, {"HYPERVISOR_API_KEY": "valid_key"}):
        result = verify_api_key(mock_request, credentials)
        assert result == "valid_key"

def test_verify_api_key_missing_env():
    mock_request = MagicMock(spec=Request)
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="valid_key")

    with patch.dict(os.environ, {}, clear=False):
        if "HYPERVISOR_API_KEY" in os.environ:
            del os.environ["HYPERVISOR_API_KEY"]

        with pytest.raises(HTTPException) as exc_info:
            verify_api_key(mock_request, credentials)

        assert exc_info.value.status_code == 500
        assert exc_info.value.detail == "Server configuration error: HYPERVISOR_API_KEY is not set"

def test_verify_api_key_invalid_key():
    mock_request = MagicMock(spec=Request)
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="wrong_key")

    with patch.dict(os.environ, {"HYPERVISOR_API_KEY": "valid_key"}):
        with pytest.raises(HTTPException) as exc_info:
            verify_api_key(mock_request, credentials)

        assert exc_info.value.status_code == 403
        assert exc_info.value.detail == "Invalid API Key"
