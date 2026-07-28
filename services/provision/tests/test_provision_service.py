import pytest
import sys
from pathlib import Path

# Add the parent directory to the path so we can import provision_service
sys.path.insert(0, str(Path(__file__).parent.parent))

from provision_service import verify_signature, sign_payload, app, token_store, InvitationToken
from fastapi.testclient import TestClient
import time
from eth_account import Account
from eth_account.messages import encode_typed_data

def test_verify_signature_valid():
    payload = {"test": "data", "token_id": "123"}
    secret = "test_secret_123"

    # Generate a valid signed payload
    signed_data = sign_payload(payload, secret)

    # Verify the signature
    result = verify_signature(signed_data, secret)

    # Assert the result is the same as the original payload
    assert result == payload

def test_join_mesh():
    # We need to clear and initialize token store
    token_store.clear()

    test_token_id = "test-token-123"
    token_store[test_token_id] = InvitationToken(
        token_id=test_token_id,
        mesh_id="test-mesh",
        coordinator_url="http://test-coordinator",
        expires_at=time.time() + 3600,
        created_at=time.time(),
        max_uses=1,
    )

    client = TestClient(app)

    # Generate a fresh account
    acct = Account.create()
    wallet_address = acct.address
    timestamp = int(time.time())

    # Missing timestamp
    response = client.post("/api/join", json={
        "token_id": test_token_id,
        "wallet_address": wallet_address,
        "signature": "fake_sig"
    })
    assert response.status_code == 400
    assert "Missing timestamp" in response.json()["detail"]

    # Invalid signature
    response = client.post("/api/join", json={
        "token_id": test_token_id,
        "wallet_address": wallet_address,
        "signature": "0x1234",
        "timestamp": timestamp
    })
    assert response.status_code == 400
    assert "Signature verification failed" in response.json()["detail"] or "Invalid wallet signature" in response.json()["detail"]

    # Valid signature
    domain_data = {
        "name": "AXIOM-MESH",
        "version": "1",
        "chainId": 1
    }
    message_types = {
        "JoinMesh": [
            {"name": "token_id", "type": "string"},
            {"name": "node_address", "type": "address"},
            {"name": "timestamp", "type": "uint256"}
        ]
    }
    message_data = {
        "token_id": test_token_id,
        "node_address": wallet_address,
        "timestamp": timestamp
    }

    signable_message = encode_typed_data(domain_data=domain_data, message_types=message_types, message_data=message_data)
    signed_message = acct.sign_message(signable_message)
    signature = signed_message.signature.hex()

    response = client.post("/api/join", json={
        "token_id": test_token_id,
        "wallet_address": wallet_address,
        "signature": signature,
        "timestamp": timestamp
    })
    assert response.status_code == 200
    assert response.json()["success"] is True

    # Verify token is marked as used
    assert token_store[test_token_id].used is True

def test_verify_signature_invalid():
    payload = {"test": "data", "token_id": "123"}
    secret = "test_secret_123"
    wrong_secret = "wrong_secret_456"

    # Generate a valid signed payload with one secret
    signed_data = sign_payload(payload, secret)

    # Verify the signature with a different secret
    result = verify_signature(signed_data, wrong_secret)

    # Assert the result is None (verification failed)
    assert result is None

def test_verify_signature_tampered_payload():
    import base64
    import json

    payload = {"test": "data", "token_id": "123"}
    secret = "test_secret_123"

    # Generate a valid signed payload
    signed_data = sign_payload(payload, secret)

    # Tamper with the payload part
    encoded_payload, signature = signed_data.rsplit('.', 1)
    tampered_payload = {"test": "tampered", "token_id": "123"}
    tampered_encoded = base64.urlsafe_b64encode(json.dumps(tampered_payload, sort_keys=True).encode()).decode()

    tampered_signed_data = f"{tampered_encoded}.{signature}"

    # Verify the tampered signature
    result = verify_signature(tampered_signed_data, secret)

    # Assert the result is None (verification failed)
    assert result is None

def test_verify_signature_malformed():
    secret = "test_secret_123"

    # Verify a completely malformed string
    result = verify_signature("not.a.valid.signed.data", secret)

    # Assert the result is None
    assert result is None

def test_verify_signature_default_secret(monkeypatch):
    payload = {"test": "data"}
    default_secret = "test_default_secret"

    # Set the environment variable for the default secret
    monkeypatch.setenv("AXIOM_MESH_SECRET", default_secret)

    # Sign without specifying a secret (should use environment variable)
    signed_data = sign_payload(payload)

    # Verify without specifying a secret (should use environment variable)
    result = verify_signature(signed_data)

    # Assert the result is the same as the original payload
    assert result == payload
