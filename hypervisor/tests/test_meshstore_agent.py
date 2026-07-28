import pytest
from unittest.mock import patch, MagicMock

import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from hypervisor.src.agents.meshstore_agent import MeshStoreAgent

@patch('hypervisor.src.agents.meshstore_agent.SecretManager')
def test_meshstore_agent_init(mock_secret_manager):
    # Setup mock return values for SecretManager
    def get_secret_side_effect(key, default=None):
        if key == "MESHSTORE_QUOTA_GB":
            return "100"
        elif key == "NODE_ID":
            return "test_node_id"
        elif key == "GRID_URL":
            return "http://test-grid-url:5000"
        return default

    mock_secret_manager.get_secret.side_effect = get_secret_side_effect

    # Initialize agent
    agent = MeshStoreAgent()

    # Verify attributes
    assert agent.quota == 100
    assert agent.node_id == "test_node_id"
    assert agent.grid_url == "http://test-grid-url:5000"

    # Verify SecretManager calls
    mock_secret_manager.get_secret.assert_any_call("MESHSTORE_QUOTA_GB", 50)
    mock_secret_manager.get_secret.assert_any_call("NODE_ID", "local_node")
    mock_secret_manager.get_secret.assert_any_call("GRID_URL", "http://localhost:5000")


@patch('hypervisor.src.agents.meshstore_agent.requests')
@patch('hypervisor.src.agents.meshstore_agent.sync_storage_manifest')
@patch('hypervisor.src.agents.meshstore_agent.SecretManager')
def test_meshstore_agent_run_quota_greater_than_10(mock_secret_manager, mock_sync_storage, mock_requests):
    # Setup mock return values for SecretManager to make quota > 10
    def get_secret_side_effect(key, default=None):
        if key == "MESHSTORE_QUOTA_GB":
            return "50"
        elif key == "NODE_ID":
            return "test_node_id"
        elif key == "GRID_URL":
            return "http://test-grid-url:5000"
        return default

    mock_secret_manager.get_secret.side_effect = get_secret_side_effect

    mock_sync_storage.return_value = {"status": "synced"}

    agent = MeshStoreAgent()
    agent.run()

    # Verify sync_storage_manifest was called
    mock_sync_storage.assert_called_once()

    # Verify requests.post was called with correct parameters
    mock_requests.post.assert_called_once_with(
        "http://test-grid-url:5000/swarm/join",
        json={"swarmId": "meshstore", "nodeId": "test_node_id"},
        timeout=5
    )


@patch('hypervisor.src.agents.meshstore_agent.requests')
@patch('hypervisor.src.agents.meshstore_agent.sync_storage_manifest')
@patch('hypervisor.src.agents.meshstore_agent.SecretManager')
def test_meshstore_agent_run_requests_exception(mock_secret_manager, mock_sync_storage, mock_requests):
    # Setup mock return values
    def get_secret_side_effect(key, default=None):
        if key == "MESHSTORE_QUOTA_GB":
            return "50"
        elif key == "NODE_ID":
            return "test_node_id"
        elif key == "GRID_URL":
            return "http://test-grid-url:5000"
        return default

    mock_secret_manager.get_secret.side_effect = get_secret_side_effect

    mock_sync_storage.return_value = {"status": "synced"}

    # Simulate an exception when calling requests.post
    mock_requests.post.side_effect = Exception("Network error")

    agent = MeshStoreAgent()

    # Should not raise an exception
    agent.run()

    mock_sync_storage.assert_called_once()
    mock_requests.post.assert_called_once()


@patch('hypervisor.src.agents.meshstore_agent.requests')
@patch('hypervisor.src.agents.meshstore_agent.sync_storage_manifest')
@patch('hypervisor.src.agents.meshstore_agent.SecretManager')
def test_meshstore_agent_run_quota_less_than_or_equal_to_10(mock_secret_manager, mock_sync_storage, mock_requests):
    # Setup mock return values to make quota <= 10
    def get_secret_side_effect(key, default=None):
        if key == "MESHSTORE_QUOTA_GB":
            return "10"
        elif key == "NODE_ID":
            return "test_node_id"
        elif key == "GRID_URL":
            return "http://test-grid-url:5000"
        return default

    mock_secret_manager.get_secret.side_effect = get_secret_side_effect

    mock_sync_storage.return_value = {"status": "synced"}

    agent = MeshStoreAgent()
    agent.run()

    mock_sync_storage.assert_called_once()

    # Verify requests.post was NOT called because quota <= 10
    mock_requests.post.assert_not_called()
