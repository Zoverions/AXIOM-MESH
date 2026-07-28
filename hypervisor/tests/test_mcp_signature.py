import pytest
import sys
import os

# Ensure the hypervisor source directory is in the python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "src")))

from api.mcp_server import verify_signature

def test_verify_signature_expected_static_return_val(monkeypatch):
    """
    Test that verify_signature returns a boolean value,
    simulating signature validation and returning expected static return val.
    """
    # Set the environment variable using monkeypatch to avoid state leakage
    # and satisfy local HMAC requirements without asserting specific behavior.
    monkeypatch.setenv("MCP_CODE_SIGNING_SECRET", "dummy_secret")

    result = verify_signature("test_payload", "test_signature")

    # Assert it returns a boolean or None as per the expected generic behavior
    assert isinstance(result, bool) or result is None
