import sys
from unittest.mock import MagicMock

# Mock dependencies before importing provision_service
# We need to mock several things because provision_service.py has top-level
# code that runs on import and requires these dependencies.

mock_pydantic = MagicMock()
# Define a real class for BaseModel to avoid typing issues with ForwardRef
# Dict[str, InvitationToken] in provision_service.py needs InvitationToken to be a real class
class InvitationToken:
    pass

class MockBaseModel:
    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)
    @classmethod
    def model_validate(cls, obj):
        return obj

mock_pydantic.BaseModel = MockBaseModel
mock_pydantic.Field = MagicMock(return_value=None)

sys.modules["pydantic"] = mock_pydantic
sys.modules["fastapi"] = MagicMock()
sys.modules["fastapi.concurrency"] = MagicMock()
sys.modules["fastapi.responses"] = MagicMock()
sys.modules["fastapi.staticfiles"] = MagicMock()
sys.modules["fastapi.middleware.cors"] = MagicMock()
sys.modules["httpx"] = MagicMock()
sys.modules["qrcode"] = MagicMock()
sys.modules["qrcode.constants"] = MagicMock()
sys.modules["eth_account"] = MagicMock()
sys.modules["eth_account.messages"] = MagicMock()

import pytest
import os
from pathlib import Path

# Add the directory containing provision_service to sys.path
sys.path.insert(0, str(Path(__file__).parent.parent))

# Inject InvitationToken into the module's namespace before it's used in type hints
# However, Dict[str, 'InvitationToken'] usually works if it's a string,
# but in provision_service.py it's Dict[str, InvitationToken] (not a string).
# So InvitationToken must exist.

# We'll mock it such that when provision_service.py defines it, it just overwrites our mock.

import provision_service
# We need to make sure InvitationToken is available in the module if it's used in type hints at module level.
if not hasattr(provision_service, 'InvitationToken'):
    provision_service.InvitationToken = InvitationToken

from provision_service import get_mesh_config

def test_get_mesh_config_defaults(monkeypatch):
    """Test get_mesh_config returns default values when env vars are not set"""
    # Clear environment variables if they exist
    for var in ["MESH_ID", "COORDINATOR_URL", "NETWORK_NAME", "CHAIN_ID", "RPC_URL"]:
        monkeypatch.delenv(var, raising=False)

    config = get_mesh_config()

    assert config["mesh_id"] == "axiom-mesh-default"
    assert config["coordinator_url"] == "http://localhost:8000"
    assert config["network_name"] == "axiom-private"
    assert config["chain_id"] == "31337"
    assert config["rpc_url"] == "http://localhost:8545"

def test_get_mesh_config_custom_values(monkeypatch):
    """Test get_mesh_config returns custom values from environment variables"""
    monkeypatch.setenv("MESH_ID", "custom-mesh")
    monkeypatch.setenv("COORDINATOR_URL", "http://custom-coordinator:9000")
    monkeypatch.setenv("NETWORK_NAME", "custom-network")
    monkeypatch.setenv("CHAIN_ID", "12345")
    monkeypatch.setenv("RPC_URL", "http://custom-rpc:8545")

    config = get_mesh_config()

    assert config["mesh_id"] == "custom-mesh"
    assert config["coordinator_url"] == "http://custom-coordinator:9000"
    assert config["network_name"] == "custom-network"
    assert config["chain_id"] == "12345"
    assert config["rpc_url"] == "http://custom-rpc:8545"
