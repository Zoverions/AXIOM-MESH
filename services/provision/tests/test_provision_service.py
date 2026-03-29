import os
from unittest.mock import patch
from services.provision.provision_service import get_mesh_config

def test_get_mesh_config_defaults():
    with patch.dict(os.environ, {}, clear=True):
        config = get_mesh_config()
        assert config["mesh_id"] == "axiom-mesh-default"
        assert config["coordinator_url"] == "http://localhost:8000"
        assert config["network_name"] == "axiom-private"
        assert config["chain_id"] == "31337"
        assert config["rpc_url"] == "http://localhost:8545"

def test_get_mesh_config_custom_env():
    custom_env = {
        "MESH_ID": "custom-mesh",
        "COORDINATOR_URL": "http://coordinator.test",
        "NETWORK_NAME": "custom-network",
        "CHAIN_ID": "1234",
        "RPC_URL": "http://rpc.test"
    }
    with patch.dict(os.environ, custom_env, clear=True):
        config = get_mesh_config()
        assert config["mesh_id"] == "custom-mesh"
        assert config["coordinator_url"] == "http://coordinator.test"
        assert config["network_name"] == "custom-network"
        assert config["chain_id"] == "1234"
        assert config["rpc_url"] == "http://rpc.test"
