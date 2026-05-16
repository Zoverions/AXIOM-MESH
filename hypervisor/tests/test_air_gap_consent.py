import os
import json
import pytest
from unittest.mock import patch, MagicMock
from cryptography.fernet import Fernet
from cryptography.fernet import InvalidToken

from hypervisor.shadow.AirGapConsent import AirGapConsent

class MockCipher:
    def __init__(self, key=None):
        self.key = key or Fernet.generate_key()

class MockShadowNodeInstance:
    def __init__(self):
        self.phantom_did = "test_phantom_did_123"
        self.cipher = MockCipher()
        self.bridge_enabled = False

@pytest.fixture
def mock_node():
    return MockShadowNodeInstance()

@patch('qrcode.QRCode')
def test_generate_qr_consent(mock_qrcode, mock_node):
    # Mock the QR code object and its make_image method
    mock_qr_instance = MagicMock()
    mock_qrcode.return_value = mock_qr_instance
    mock_image = MagicMock()
    mock_qr_instance.make_image.return_value = mock_image

    result = AirGapConsent.generate_qr_consent(mock_node)

    # Check if the result is correct
    assert result == "shadow_consent_qr.png"

    # Check if save was called
    mock_image.save.assert_called_once_with("shadow_consent_qr.png")

    # Check if add_data was called with hex string
    mock_qr_instance.add_data.assert_called_once()
    added_data = mock_qr_instance.add_data.call_args[0][0]

    # Verify the encrypted data
    f = Fernet(mock_node.cipher.key)
    decrypted_str = f.decrypt(bytes.fromhex(added_data)).decode()
    data = json.loads(decrypted_str)

    assert data["action"] == "ENABLE_SHADOW_BRIDGE"
    assert data["phantomDIDHash"] == mock_node.phantom_did
    assert "timestamp" in data
    assert "nonce" in data

def test_verify_usb_consent_success(mock_node):
    f = Fernet(mock_node.cipher.key)
    consent_data = {
        "action": "ENABLE_SHADOW_BRIDGE",
        "phantomDIDHash": mock_node.phantom_did,
        "timestamp": 1234567890,
        "nonce": "testnonce"
    }
    encrypted = f.encrypt(json.dumps(consent_data).encode('utf-8')).hex()

    result = AirGapConsent.verify_usb_consent(encrypted, mock_node)

    assert result is True
    assert mock_node.bridge_enabled is True

def test_verify_usb_consent_invalid_action(mock_node):
    f = Fernet(mock_node.cipher.key)
    consent_data = {
        "action": "DISABLE_SHADOW_BRIDGE",
        "phantomDIDHash": mock_node.phantom_did,
        "timestamp": 1234567890,
        "nonce": "testnonce"
    }
    encrypted = f.encrypt(json.dumps(consent_data).encode('utf-8')).hex()

    result = AirGapConsent.verify_usb_consent(encrypted, mock_node)

    assert result is False
    assert mock_node.bridge_enabled is False

def test_verify_usb_consent_invalid_hex(mock_node):
    invalid_hex = "this_is_not_valid_hex!"
    with pytest.raises(ValueError):
        AirGapConsent.verify_usb_consent(invalid_hex, mock_node)

def test_verify_usb_consent_invalid_encryption(mock_node):
    different_key = Fernet.generate_key()
    f = Fernet(different_key)
    consent_data = {
        "action": "ENABLE_SHADOW_BRIDGE",
        "phantomDIDHash": mock_node.phantom_did,
    }
    encrypted = f.encrypt(json.dumps(consent_data).encode('utf-8')).hex()

    # Trying to decrypt with mock_node's key should fail
    with pytest.raises(InvalidToken):
        AirGapConsent.verify_usb_consent(encrypted, mock_node)