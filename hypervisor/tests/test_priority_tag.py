import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch

import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.api.server import app

client = TestClient(app)

@pytest.fixture
def override_api_key():
    from src.api.server import verify_api_key
    app.dependency_overrides[verify_api_key] = lambda: "valid_key"
    yield
    app.dependency_overrides.clear()


@patch('src.engine.alignment.AlignmentProfile')
def test_priority_tag_success(MockProfile, override_api_key):
    mock_instance = MockProfile.return_value
    mock_instance.update_priority_tag.return_value = {"test_tag": 2.0}

    response = client.post("/priority-tag", json={"tag": "test_tag", "weight": 2.0}, headers={"Authorization": "Bearer valid_key"})
    assert response.status_code == 200
    assert response.json() == {"status": "success", "priority_tags": {"test_tag": 2.0}}
    mock_instance.update_priority_tag.assert_called_once_with("test_tag", 2.0, False)

def test_priority_tag_missing_data(override_api_key):
    # Missing weight
    response = client.post("/priority-tag", json={"tag": "test_tag"}, headers={"Authorization": "Bearer valid_key"})
    assert response.status_code == 400
    assert "Missing tag or weight" in response.text

    # Missing tag
    response = client.post("/priority-tag", json={"weight": 2.0}, headers={"Authorization": "Bearer valid_key"})
    assert response.status_code == 400
    assert "Missing tag or weight" in response.text

@patch('src.engine.alignment.AlignmentProfile')
def test_priority_tag_permission_error(MockProfile, override_api_key):
    mock_instance = MockProfile.return_value
    mock_instance.update_priority_tag.side_effect = PermissionError("Bicameral governance approval required to update restricted tag: critical")

    response = client.post("/priority-tag", json={"tag": "critical", "weight": 5.0}, headers={"Authorization": "Bearer valid_key"})
    assert response.status_code == 403
    assert "Bicameral governance approval required" in response.text

@patch('src.engine.alignment.AlignmentProfile')
def test_priority_tag_generic_error(MockProfile, override_api_key):
    mock_instance = MockProfile.return_value
    mock_instance.update_priority_tag.side_effect = Exception("Database error")

    response = client.post("/priority-tag", json={"tag": "test_tag", "weight": 2.0}, headers={"Authorization": "Bearer valid_key"})
    assert response.status_code == 500
    assert "Database error" in response.text
