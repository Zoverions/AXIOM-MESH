import pytest
from cryptography.fernet import Fernet
import os
import ast
from shadow.AirGapConsent import AirGapConsent

class MockCipher:
    def __init__(self, key):
        self.key = key

class MockShadowNodeInstance:
    def __init__(self, key, phantom_did="mock_did"):
        self.cipher = MockCipher(key)
        self.phantom_did = phantom_did
        self.bridge_enabled = False

def test_verify_usb_consent_success():
    key = Fernet.generate_key()
    shadow_node = MockShadowNodeInstance(key)

    consent_data = {
        "action": "ENABLE_SHADOW_BRIDGE",
        "phantomDIDHash": shadow_node.phantom_did,
        "timestamp": 1234567890,
        "nonce": "1234567890abcdef"
    }

    encrypted = Fernet(key).encrypt(str(consent_data).encode())

    result = AirGapConsent.verify_usb_consent(encrypted.hex(), shadow_node)

    assert result is True
    assert shadow_node.bridge_enabled is True

def test_verify_usb_consent_invalid_action():
    key = Fernet.generate_key()
    shadow_node = MockShadowNodeInstance(key)

    consent_data = {
        "action": "DISABLE_SHADOW_BRIDGE",
        "phantomDIDHash": shadow_node.phantom_did,
        "timestamp": 1234567890,
        "nonce": "1234567890abcdef"
    }

    encrypted = Fernet(key).encrypt(str(consent_data).encode())

    result = AirGapConsent.verify_usb_consent(encrypted.hex(), shadow_node)

    assert result is False
    assert shadow_node.bridge_enabled is False

def test_verify_usb_consent_no_action():
    key = Fernet.generate_key()
    shadow_node = MockShadowNodeInstance(key)

    consent_data = {
        "something_else": "test",
    }

    encrypted = Fernet(key).encrypt(str(consent_data).encode())

    result = AirGapConsent.verify_usb_consent(encrypted.hex(), shadow_node)

    assert result is False
    assert shadow_node.bridge_enabled is False

def test_verify_usb_consent_malicious_payload():
    key = Fernet.generate_key()
    shadow_node = MockShadowNodeInstance(key)

    # Payload trying to execute arbitrary code via eval, but will fail with ast.literal_eval
    malicious_payload = "__import__('os').system('echo pwned')"

    encrypted = Fernet(key).encrypt(malicious_payload.encode())

    with pytest.raises((ValueError, SyntaxError)):
        AirGapConsent.verify_usb_consent(encrypted.hex(), shadow_node)

    assert shadow_node.bridge_enabled is False
