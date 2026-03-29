import os
import time
from unittest.mock import patch
from services.provision.provision_service import generate_config_file, InvitationToken

def test_generate_config_file():
    token = InvitationToken(
        token_id="test-token-123",
        mesh_id="test-mesh",
        coordinator_url="http://test-coord",
        expires_at=time.time() + 3600,
        created_at=time.time(),
        node_type="validator"
    )

    with patch('services.provision.provision_service.get_mesh_config') as mock_config:
        mock_config.return_value = {
            "mesh_id": "test-mesh-id",
            "coordinator_url": "http://test-coord",
            "network_name": "test-net",
            "chain_id": "1234",
            "rpc_url": "http://test-rpc"
        }

        config_content = generate_config_file(token)

        assert "NODE_TYPE=validator" in config_content
        assert "MESH_ID=test-mesh-id" in config_content
        assert "COORDINATOR_URL=http://test-coord" in config_content
        assert "NETWORK_NAME=test-net" in config_content
        assert "CHAIN_ID=1234" in config_content
        assert "RPC_URL=http://test-rpc" in config_content
        assert "JOIN_TOKEN=test-token-123" in config_content
        assert f"JOIN_TOKEN_EXPIRES={token.expires_at}" in config_content
        assert "NODE_ID=node-" in config_content
        assert "API_KEY=" in config_content
        assert "SECRET_KEY=" in config_content
