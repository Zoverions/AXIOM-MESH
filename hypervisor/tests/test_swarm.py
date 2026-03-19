import pytest
from unittest.mock import patch, MagicMock
from src.evolution.swarm import SwarmManager, GRID_URL

@pytest.fixture
def swarm_manager():
    return SwarmManager(node_id="test_node_123")

@patch('src.evolution.swarm.requests.get')
@patch('time.sleep')
def test_get_swarms_success(mock_sleep, mock_get, swarm_manager):
    # Mocking a successful response
    mock_response = MagicMock()
    mock_response.status_code = 200
    expected_data = [{"id": "swarm1"}, {"id": "swarm2"}]
    mock_response.json.return_value = expected_data
    mock_get.return_value = mock_response

    result = swarm_manager.get_swarms()

    assert result == expected_data
    mock_get.assert_called_once_with(f"{GRID_URL}/swarm", timeout=5)
    mock_sleep.assert_not_called()

@patch('src.evolution.swarm.requests.get')
@patch('time.sleep')
def test_get_swarms_failure(mock_sleep, mock_get, swarm_manager):
    # Mocking a failure response
    mock_response = MagicMock()
    mock_response.status_code = 500
    mock_response.text = "Internal Server Error"
    mock_get.return_value = mock_response

    result = swarm_manager.get_swarms()

    assert result == []
    mock_get.assert_called_once_with(f"{GRID_URL}/swarm", timeout=5)
    mock_sleep.assert_not_called()

@patch('src.evolution.swarm.requests.get')
@patch('time.sleep')
def test_get_swarms_exception_retry(mock_sleep, mock_get, swarm_manager):
    # Mocking an exception being raised on requests.get
    mock_get.side_effect = Exception("Connection Error")

    result = swarm_manager.get_swarms()

    assert result == []
    assert mock_get.call_count == 3  # max_retries
    assert mock_sleep.call_count == 2 # delay for first 2 attempts

@patch('src.evolution.swarm.uuid.uuid4')
@patch('src.evolution.swarm.requests.post')
@patch('time.sleep')
def test_create_swarm_success(mock_sleep, mock_post, mock_uuid, swarm_manager):
    task_id = "task_456"
    expected_swarm_id = "mocked-uuid-1234"
    mock_uuid.return_value = expected_swarm_id

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_post.return_value = mock_response

    result = swarm_manager.create_swarm(task_id)

    assert result == expected_swarm_id
    mock_post.assert_called_once()
    args, kwargs = mock_post.call_args
    assert args[0] == f"{GRID_URL}/swarm"
    assert kwargs['json'] == {
        "id": expected_swarm_id,
        "taskId": task_id,
        "nodes": ["test_node_123"],
        "status": "pending"
    }
    mock_sleep.assert_not_called()

@patch('src.evolution.swarm.uuid.uuid4')
@patch('src.evolution.swarm.requests.post')
@patch('time.sleep')
def test_create_swarm_failure(mock_sleep, mock_post, mock_uuid, swarm_manager):
    task_id = "task_456"
    mock_uuid.return_value = "mocked-uuid-1234"

    mock_response = MagicMock()
    mock_response.status_code = 500
    mock_response.text = "Error creating swarm"
    mock_post.return_value = mock_response

    result = swarm_manager.create_swarm(task_id)

    assert result is None
    mock_post.assert_called_once()
    mock_sleep.assert_not_called()

@patch('src.evolution.swarm.requests.post')
@patch('time.sleep')
def test_create_swarm_exception_retry(mock_sleep, mock_post, swarm_manager):
    task_id = "task_456"
    mock_post.side_effect = Exception("Connection Error")

    result = swarm_manager.create_swarm(task_id)

    assert result is None
    assert mock_post.call_count == 3
    assert mock_sleep.call_count == 2

@patch('src.evolution.swarm.requests.post')
@patch('time.sleep')
def test_join_swarm_success(mock_sleep, mock_post, swarm_manager):
    swarm_id = "swarm_789"
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_post.return_value = mock_response

    result = swarm_manager.join_swarm(swarm_id)

    assert result is True
    mock_post.assert_called_once()
    args, kwargs = mock_post.call_args
    assert args[0] == f"{GRID_URL}/swarm/join"
    assert kwargs['json'] == {
        "swarmId": swarm_id,
        "nodeId": "test_node_123"
    }
    mock_sleep.assert_not_called()

@patch('src.evolution.swarm.requests.post')
@patch('time.sleep')
def test_join_swarm_failure(mock_sleep, mock_post, swarm_manager):
    swarm_id = "swarm_789"
    mock_response = MagicMock()
    mock_response.status_code = 400
    mock_response.text = "Bad Request"
    mock_post.return_value = mock_response

    result = swarm_manager.join_swarm(swarm_id)

    assert result is False
    mock_post.assert_called_once()
    mock_sleep.assert_not_called()

@patch('src.evolution.swarm.requests.post')
@patch('time.sleep')
def test_join_swarm_exception_retry(mock_sleep, mock_post, swarm_manager):
    swarm_id = "swarm_789"
    mock_post.side_effect = Exception("Connection Error")

    result = swarm_manager.join_swarm(swarm_id)

    assert result is False
    assert mock_post.call_count == 3
    assert mock_sleep.call_count == 2
