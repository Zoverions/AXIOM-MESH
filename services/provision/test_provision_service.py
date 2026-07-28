import pytest
import sys
import os
import json
import time
from pathlib import Path

# Add directory to path to import provision_service
sys.path.append(os.path.dirname(__file__))

import provision_service

# Use a mock DB file for testing
TEST_DB = Path("/tmp/test_provision_tokens.json")

@pytest.fixture(autouse=True)
def setup_teardown():
    # Setup
    original_db = provision_service.PROVISION_DB
    provision_service.PROVISION_DB = TEST_DB
    provision_service.token_store.clear()

    if TEST_DB.exists():
        TEST_DB.unlink()

    yield

    # Teardown
    if TEST_DB.exists():
        TEST_DB.unlink()
    provision_service.PROVISION_DB = original_db
    provision_service.token_store.clear()

def test_load_token_store_success():
    """Test successfully loading token store and filtering expired tokens"""
    now = time.time()
    valid_token = {
        "token_id": "valid_token",
        "mesh_id": "test_mesh",
        "coordinator_url": "http://localhost",
        "expires_at": now + 3600, # valid for 1 hour
        "created_at": now,
        "used": False,
        "uses_count": 0,
        "max_uses": 1,
        "node_type": "validator",
        "metadata": {}
    }

    expired_token = {
        "token_id": "expired_token",
        "mesh_id": "test_mesh",
        "coordinator_url": "http://localhost",
        "expires_at": now - 3600, # expired 1 hour ago
        "created_at": now - 7200,
        "used": False,
        "uses_count": 0,
        "max_uses": 1,
        "node_type": "validator",
        "metadata": {}
    }

    # Write dummy data to test DB file
    with open(TEST_DB, 'w') as f:
        json.dump({
            "valid_token": valid_token,
            "expired_token": expired_token
        }, f)

    # Call function under test
    provision_service.load_token_store()

    # Verify results
    assert "valid_token" in provision_service.token_store
    assert "expired_token" not in provision_service.token_store
    assert len(provision_service.token_store) == 1

    # Check loaded token is parsed as InvitationToken
    token_obj = provision_service.token_store["valid_token"]
    assert isinstance(token_obj, provision_service.InvitationToken)
    assert token_obj.token_id == "valid_token"

def test_load_token_store_no_file():
    """Test loading token store when file does not exist"""
    # Ensure file doesn't exist
    if TEST_DB.exists():
        TEST_DB.unlink()

    # Store should start empty
    provision_service.token_store.clear()

    # Should safely complete without modifying store
    provision_service.load_token_store()

    assert len(provision_service.token_store) == 0

def test_load_token_store_invalid_json():
    """Test loading token store with corrupted/invalid JSON data"""
    # Write invalid JSON
    with open(TEST_DB, 'w') as f:
        f.write("{invalid json format...")

    # Pre-populate store to verify it gets cleared on error
    provision_service.token_store["dummy"] = provision_service.InvitationToken(
        token_id="dummy", mesh_id="test", coordinator_url="test",
        expires_at=time.time()+100, created_at=time.time()
    )

    # Call function under test
    provision_service.load_token_store()

    # Should clear the store to {} on exception
    assert len(provision_service.token_store) == 0

def test_save_token_store_success():
    """Test successfully saving token store to disk"""
    now = time.time()

    # Add a token to the store
    token = provision_service.InvitationToken(
        token_id="save_test_token",
        mesh_id="test_mesh",
        coordinator_url="http://localhost",
        expires_at=now + 3600,
        created_at=now,
        used=False,
        uses_count=0,
        max_uses=1,
        node_type="validator",
        metadata={}
    )
    provision_service.token_store["save_test_token"] = token

    # Call function under test
    provision_service.save_token_store()

    # Verify file was created and contains correct data
    assert TEST_DB.exists()
    with open(TEST_DB, 'r') as f:
        data = json.load(f)

    assert "save_test_token" in data
    assert data["save_test_token"]["token_id"] == "save_test_token"
    assert data["save_test_token"]["mesh_id"] == "test_mesh"

def test_save_token_store_error(monkeypatch, capsys):
    """Test error handling when saving token store fails"""
    # Mock open to raise an exception
    def mock_open(*args, **kwargs):
        raise IOError("Mock permission denied")

    monkeypatch.setattr("builtins.open", mock_open)

    # Add a token to ensure the loop runs and tries to save
    now = time.time()
    token = provision_service.InvitationToken(
        token_id="save_error_token",
        mesh_id="test_mesh",
        coordinator_url="http://localhost",
        expires_at=now + 3600,
        created_at=now
    )
    provision_service.token_store["save_error_token"] = token

    # Call function under test - should not raise exception
    provision_service.save_token_store()

    # Verify error was printed
    captured = capsys.readouterr()
    assert "Error saving token store" in captured.out

def test_load_token_store_malformed_token():
    """Test loading token store where token data is invalid for InvitationToken"""
    # Missing required fields
    invalid_token_data = {
        "token_id": "bad_token",
        # missing mesh_id and other required fields
    }

    with open(TEST_DB, 'w') as f:
        json.dump({"bad_token": invalid_token_data}, f)

    # Should catch pydantic ValidationError
    provision_service.load_token_store()

    # Should clear the store to {} on exception
    assert len(provision_service.token_store) == 0
