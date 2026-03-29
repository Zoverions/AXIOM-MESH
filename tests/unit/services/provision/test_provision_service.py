import os
import pytest
import json
import base64
import hashlib
from typing import Dict, Any

# Ensure we can import the module correctly
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../../")))

from services.provision.provision_service import sign_payload, verify_signature

def test_sign_payload_basic():
    """Test signing a basic payload"""
    payload = {"test": "data", "id": 123}
    secret = "test-secret"

    signed = sign_payload(payload, secret)

    # Check format
    assert "." in signed
    encoded_payload, signature = signed.rsplit('.', 1)

    # Verify payload encoding
    decoded_payload = json.loads(base64.urlsafe_b64decode(encoded_payload.encode()).decode())
    assert decoded_payload == payload

    # Verify signature length (HMAC-SHA256 hex digest is 64 chars)
    assert len(signature) == 64

    # Verify with verify_signature
    verified = verify_signature(signed, secret)
    assert verified == payload

def test_sign_payload_default_secret(monkeypatch):
    """Test signing with default secret from environment"""
    payload = {"test": "default"}

    # Mock environment variable
    monkeypatch.setenv("AXIOM_MESH_SECRET", "mock-env-secret")

    signed = sign_payload(payload)
    verified = verify_signature(signed, "mock-env-secret")

    assert verified == payload

    # Check that it fails with a different secret
    assert verify_signature(signed, "wrong-secret") is None

def test_sign_payload_deterministic():
    """Test that signing the same payload with the same secret gives the same result"""
    payload = {"a": 1, "b": 2}
    secret = "secret123"

    # In python dict order might not be preserved, but json.dumps(sort_keys=True) is used
    payload2 = {"b": 2, "a": 1}

    signed1 = sign_payload(payload, secret)
    signed2 = sign_payload(payload2, secret)

    assert signed1 == signed2

def test_sign_payload_different_secrets():
    """Test that different secrets give different signatures"""
    payload = {"test": "data"}

    signed1 = sign_payload(payload, "secret-A")
    signed2 = sign_payload(payload, "secret-B")

    assert signed1 != signed2

    # The encoded payload part should be the same
    assert signed1.split('.')[0] == signed2.split('.')[0]

    # The signature part should be different
    assert signed1.split('.')[1] != signed2.split('.')[1]

def test_sign_payload_different_payloads():
    """Test that different payloads give different signatures"""
    secret = "common-secret"

    signed1 = sign_payload({"test": "data1"}, secret)
    signed2 = sign_payload({"test": "data2"}, secret)

    assert signed1 != signed2
    assert signed1.split('.')[1] != signed2.split('.')[1]

def test_sign_payload_empty_dict():
    """Test signing an empty dictionary"""
    payload = {}
    secret = "secret"

    signed = sign_payload(payload, secret)
    verified = verify_signature(signed, secret)

    assert verified == payload

def test_verify_signature_tampered_payload():
    """Test that tampering with the payload invalidates the signature"""
    payload = {"role": "user"}
    secret = "secret"

    signed = sign_payload(payload, secret)
    encoded_payload, signature = signed.split('.')

    # Tamper with the payload
    tampered_payload = {"role": "admin"}
    tampered_encoded = base64.urlsafe_b64encode(json.dumps(tampered_payload).encode()).decode()

    tampered_signed = f"{tampered_encoded}.{signature}"

    assert verify_signature(tampered_signed, secret) is None
