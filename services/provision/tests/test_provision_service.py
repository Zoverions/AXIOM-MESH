import pytest
import sys
from pathlib import Path

# Add the parent directory to the path so we can import provision_service
sys.path.insert(0, str(Path(__file__).parent.parent))

from provision_service import verify_signature, sign_payload

def test_verify_signature_valid():
    payload = {"test": "data", "token_id": "123"}
    secret = "test_secret_123"

    # Generate a valid signed payload
    signed_data = sign_payload(payload, secret)

    # Verify the signature
    result = verify_signature(signed_data, secret)

    # Assert the result is the same as the original payload
    assert result == payload

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
