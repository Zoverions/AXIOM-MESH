import pytest
from fastapi.testclient import TestClient
import sys
import os

# Add hypervisor to sys.path to allow importing from src
sys.path.append(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from hypervisor.src.api.server import app

client = TestClient(app)

def test_get_metrics_structure():
    """
    Test the /metrics endpoint to ensure it returns the correct JSON structure
    and HTTP 200 status code.
    """
    response = client.get("/metrics")

    assert response.status_code == 200

    data = response.json()

    # Assert top-level keys
    assert "requests" in data
    assert "errors" in data
    assert "intents" in data

    # Assert values are integers
    assert isinstance(data["requests"], int)
    assert isinstance(data["errors"], int)

    # Assert nested structure for 'intents'
    intents = data["intents"]
    assert "success" in intents
    assert "error" in intents
    assert "degraded" in intents

    # Assert nested values are integers
    assert isinstance(intents["success"], int)
    assert isinstance(intents["error"], int)
    assert isinstance(intents["degraded"], int)
