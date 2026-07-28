import sys
import os

# Add project root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../')))

from grid.zkml import verify_proof

import json
import base64
from unittest.mock import patch, MagicMock

def test_verify_proof_no_args():
    assert verify_proof("") is False

def test_verify_proof_invalid_json():
    assert verify_proof("invalid json") is False

def test_verify_proof_missing_fields():
    proof_data = {
        "proof": "some_proof",
        "vk": base64.b64encode(b"some_vk").decode('utf-8')
    }
    assert verify_proof(json.dumps(proof_data)) is False

@patch("grid.zkml.ezkl.verify")
def test_verify_proof_valid_mocked(mock_verify):
    mock_verify.return_value = True

    proof_data = {
        "proof": '{"mock": "proof"}',
        "vk": base64.b64encode(b"some_vk").decode('utf-8'),
        "settings": '{"mock": "settings"}'
    }

    assert verify_proof(json.dumps(proof_data)) is True
    mock_verify.assert_called_once()

@patch("grid.zkml.ezkl.verify")
def test_verify_proof_invalid_mocked(mock_verify):
    mock_verify.return_value = False

    proof_data = {
        "proof": '{"mock": "proof"}',
        "vk": base64.b64encode(b"some_vk").decode('utf-8'),
        "settings": '{"mock": "settings"}'
    }

    assert verify_proof(json.dumps(proof_data)) is False
    mock_verify.assert_called_once()

@patch("grid.zkml.ezkl.verify", side_effect=Exception("ezkl error"))
def test_verify_proof_exception(mock_verify):
    proof_data = {
        "proof": '{"mock": "proof"}',
        "vk": base64.b64encode(b"some_vk").decode('utf-8'),
        "settings": '{"mock": "settings"}'
    }

    assert verify_proof(json.dumps(proof_data)) is False
    mock_verify.assert_called_once()
