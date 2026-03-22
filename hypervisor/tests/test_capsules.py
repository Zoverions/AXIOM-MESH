import pytest
from fastapi.testclient import TestClient
import sys
import os
from unittest.mock import patch
import jsonschema

# Ensure the parent directory is in the path to fix absolute imports like `from src.api.server`
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.api.server import app

@patch.dict(os.environ, {"CAPSULE_COMPILER_SECRET": "test_secret"})
def test_capsule_pipeline():
    client = TestClient(app)

    # 1. Intake
    intake_response = client.post("/capsules/intake", json={"source": "mcp-endpoint", "name": "my-capsule"})
    assert intake_response.status_code == 200
    intake_data = intake_response.json()
    assert "capsule_id" in intake_data
    assert intake_data["status"] == "intake_successful"
    capsule_id = intake_data["capsule_id"]
    assert intake_data["manifest"]["name"] == "my-capsule"

    # 2. Compile
    compile_response = client.post("/capsules/compile", json={"capsule_id": capsule_id})
    assert compile_response.status_code == 200
    compile_data = compile_response.json()
    assert compile_data["capsule_id"] == capsule_id
    assert compile_data["status"] == "compiled"
    signature = compile_data["signature"]

    # 3. Verify
    verify_response = client.post("/capsules/verify", json={"capsule_id": capsule_id, "signature": signature})
    assert verify_response.status_code == 200
    verify_data = verify_response.json()
    assert verify_data["capsule_id"] == capsule_id
    assert verify_data["status"] == "verified"

    # 4. Verify invalid signature
    invalid_verify_response = client.post("/capsules/verify", json={"capsule_id": capsule_id, "signature": "invalid-signature"})
    assert invalid_verify_response.status_code == 400

def test_capsule_compile_invalid_id():
    client = TestClient(app)
    compile_response = client.post("/capsules/compile", json={"capsule_id": "invalid-id"})
    assert compile_response.status_code == 400

def test_capsule_intake_validation_error():
    client = TestClient(app)
    with patch("src.api.routers.capsules.intake_payload") as mock_intake:
        mock_intake.side_effect = jsonschema.exceptions.ValidationError("Mocked validation error")
        response = client.post("/capsules/intake", json={"source": "test", "name": "test-capsule"})
        assert response.status_code == 400
        assert "Validation error: Mocked validation error" in response.json()["detail"]

def test_capsule_intake_general_error():
    client = TestClient(app)
    with patch("src.api.routers.capsules.intake_payload") as mock_intake:
        mock_intake.side_effect = Exception("General error occurred")
        response = client.post("/capsules/intake", json={"source": "test", "name": "test-capsule"})
        assert response.status_code == 400
        assert response.json()["detail"] == "General error occurred"
