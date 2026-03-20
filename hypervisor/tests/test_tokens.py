import pytest
import sys
import os
import time
import asyncio
from unittest.mock import patch

# Set secret BEFORE importing the app
os.environ["CAPABILITY_TOKEN_SECRET"] = "test_secret_for_tests"

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from fastapi.testclient import TestClient
from src.api.server import app
from src.core.node_validator import NodeValidator
import httpx

def test_token_issue_and_validate():
    client = TestClient(app)

    # 1. Requester requests token from Token Issuer
    req = {
        "requester_id": "req-1",
        "capsule_id": "cap-1",
        "consent_proof": "valid-proof",
        "data_scope": "feature_vector_only"
    }
    res = client.post("/token/issue", json=req)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "issued"
    token = data["token"]

    # 2. Node validates token before execution
    validator = NodeValidator()
    payload = validator.validate_token(
        token=token,
        expected_capsule_id="cap-1",
        expected_data_scope="feature_vector_only",
        nonce="nonce-123"
    )
    assert payload["capsule_id"] == "cap-1"
    assert payload["data_scope"] == "feature_vector_only"
    assert payload["compute_budget"]["cpu_ms"] == 1000

def test_token_expired():
    client = TestClient(app)
    req = {
        "requester_id": "req-2",
        "capsule_id": "cap-2",
        "consent_proof": "valid",
        "data_scope": "data",
        "ttl_seconds": -1 # Expired immediately
    }
    res = client.post("/token/issue", json=req)
    token = res.json()["token"]

    validator = NodeValidator()
    with pytest.raises(ValueError, match="Token has expired"):
        validator.validate_token(token, "cap-2", "data")

def test_token_mismatch_capsule_id():
    client = TestClient(app)
    req = {
        "requester_id": "req-3",
        "capsule_id": "cap-correct",
        "consent_proof": "valid",
        "data_scope": "data"
    }
    res = client.post("/token/issue", json=req)
    token = res.json()["token"]

    validator = NodeValidator()
    with pytest.raises(ValueError, match="Capsule ID mismatch"):
        validator.validate_token(token, "cap-wrong", "data")

def test_token_mismatch_data_scope():
    client = TestClient(app)
    req = {
        "requester_id": "req-4",
        "capsule_id": "cap-4",
        "consent_proof": "valid",
        "data_scope": "scope-correct"
    }
    res = client.post("/token/issue", json=req)
    token = res.json()["token"]

    validator = NodeValidator()
    with pytest.raises(ValueError, match="Data scope mismatch"):
        validator.validate_token(token, "cap-4", "scope-wrong")

def test_token_replay_attack():
    client = TestClient(app)
    req = {
        "requester_id": "req-5",
        "capsule_id": "cap-5",
        "consent_proof": "valid",
        "data_scope": "data"
    }
    res = client.post("/token/issue", json=req)
    token = res.json()["token"]

    validator = NodeValidator()

    # First use with nonce should succeed
    validator.validate_token(token, "cap-5", "data", nonce="nonce-unique-1")

    # Second use with same nonce should fail
    with pytest.raises(ValueError, match="Token replay detected"):
        validator.validate_token(token, "cap-5", "data", nonce="nonce-unique-1")

@pytest.mark.asyncio
async def test_token_revocation_propagation():
    client = TestClient(app)

    # Issue a token
    req = {
        "requester_id": "req-6",
        "capsule_id": "cap-6",
        "consent_proof": "valid",
        "data_scope": "data"
    }
    res = client.post("/token/issue", json=req)
    token = res.json()["token"]

    # Revoke the token via Token Issuer
    revoke_res = client.post("/token/revoke", json={"token": token, "requester_id": "req-6"})
    assert revoke_res.status_code == 200

    validator = NodeValidator()

    # Mock httpx response for sync_revocations
    mock_response = httpx.Response(200, json={"revoked_tokens": [token]})

    with patch("httpx.AsyncClient.get", return_value=mock_response) as mock_get:
        # Node syncs revocations
        await validator.sync_revocations()

        # Validation should fail because it's in the node's local revoked list
        with pytest.raises(ValueError, match="Token has been revoked"):
            validator.validate_token(token, "cap-6", "data")

@pytest.mark.asyncio
async def test_token_revocation_network_partition():
    # If the network fails, the node validator catches the exception and does not crash.
    # It still uses its local cache.
    validator = NodeValidator()
    validator.revoked_tokens.add("offline-revoked-token")

    with patch("httpx.AsyncClient.get", side_effect=httpx.ConnectError("Network partition")):
        await validator.sync_revocations()

    # Still fails for tokens cached locally
    with pytest.raises(ValueError, match="Token has been revoked"):
        validator.validate_token("offline-revoked-token", "cap", "data")

@pytest.mark.asyncio
async def test_background_sync():
    validator = NodeValidator(sync_interval_seconds=1)

    # Mock httpx response for sync_revocations
    mock_response = httpx.Response(200, json={"revoked_tokens": ["token-from-bg"]})

    with patch("httpx.AsyncClient.get", return_value=mock_response) as mock_get:
        validator.start_background_sync()
        await asyncio.sleep(1.2)
        validator.stop_background_sync()

        assert "token-from-bg" in validator.revoked_tokens
