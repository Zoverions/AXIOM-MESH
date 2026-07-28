import pytest
from fastapi.testclient import TestClient
import sys
import os
from unittest.mock import patch, MagicMock

# Set API key BEFORE importing the app
os.environ["HYPERVISOR_API_KEY"] = "TEST_KEY"
os.environ["CAPABILITY_TOKEN_SECRET"] = "TEST_TOKEN_SECRET"
os.environ["AIR_GAP_CONSENT_KEY"] = "TEST_AIR_GAP_KEY"

# Add hypervisor and parent to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from hypervisor.src.api.server import app

client = TestClient(app)

@pytest.fixture(autouse=True)
def mock_api_key_validation():
    with patch("hypervisor.src.api.server.get_expected_api_key", return_value="TEST_KEY"), \
         patch("hypervisor.src.api.server.validate_api_key"):
        yield

def test_verify_reasoning_valid():
    valid_payload = {
        "attestation_id": "test_id",
        "intent_id": "test_intent",
        "model_commitment": "commit_1",
        "input_commitment": "commit_2",
        "output_commitment": "commit_3",
        "consensus_context": {},
        "proof_bundle": {
            "zkml_proof": "zkml",
            "causal_proof": "causal",
            "signature": "sig"
        },
        "nonce": "test_nonce",
        "timestamp_ms": 123456789,
        "causal_graph": {
            "nodes": [
                {"node_id": "n1", "step_type": "observation", "attention_weight": 0.5, "timestamp_ms": 1},
                {"node_id": "n2", "step_type": "decision", "attention_weight": 0.8, "timestamp_ms": 2}
            ],
            "edges": [
                {"from": "n1", "to": "n2", "relation": "depends_on"}
            ]
        }
    }
    response = client.post(
        "/verify/reasoning",
        json=valid_payload,
        headers={"Authorization": "Bearer TEST_KEY"}
    )
    assert response.status_code == 200
    assert response.json()["verdict"] == "accepted"

def test_verify_reasoning_invalid():
    invalid_payload = {
        "attestation_id": "test_id",
        # Missing fields to trigger failures
    }
    response = client.post(
        "/verify/reasoning",
        json=invalid_payload,
        headers={"Authorization": "Bearer TEST_KEY"}
    )
    assert response.status_code == 200
    assert response.json()["verdict"] == "rejected"
    assert "missing_field:intent_id" in response.json()["mismatches"]
