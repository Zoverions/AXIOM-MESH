import pytest
from fastapi.testclient import TestClient
import base64
import json
import os
import sys

from src.api.server import app
from src.recovery.bundle_manager import RecoveryBundleManager
from src.recovery.cloud_storage import CloudStorageFactory

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_teardown(monkeypatch):
    import cryptography.fernet
    key = cryptography.fernet.Fernet.generate_key()
    monkeypatch.setenv("HYPERVISOR_API_KEY", "test_key")
    monkeypatch.setenv("RECOVERY_KEY", key.decode("utf-8"))

    # We must patch SecretManager to return 'test_key' so the signature check works
    from src.core.secrets import SecretManager
    monkeypatch.setattr(SecretManager, "get_secret", lambda x: "test_key" if x == "HYPERVISOR_API_KEY" else None)

def test_backup_providers():
    res = client.get("/backup/providers")
    assert res.status_code == 200
    assert "gdrive" in res.json()["providers"]
    assert "onedrive" in res.json()["providers"]

def test_create_backup_local():
    headers = {
        "X-Axiom-Timestamp": "1234567890000",
        "X-Axiom-Nonce": "test-nonce",
        "X-Axiom-Signature": "dummy"
    }

    import hmac
    import hashlib
    timestamp = "1234567890000"
    nonce = "test-nonce"
    body_dict = {"node_id": "test_node"}
    body_str = json.dumps(body_dict).encode("utf-8")

    # Needs a real timestamp to pass expiration check if we actually call it, but server.py checks expiration.
    # We can mock verify_signature to make this simpler, or use real timestamp
    import time
    timestamp = str(int(time.time() * 1000))
    payload = f"{timestamp}:{nonce}:{json.dumps(body_dict).replace(' ', '')}"
    sig = hmac.new("test_key".encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()

    headers["X-Axiom-Timestamp"] = timestamp
    headers["X-Axiom-Signature"] = sig

    res = client.post("/backup/create", json=body_dict, headers=headers)
    assert res.status_code == 200
    assert "bundle" in res.json()
    assert res.json()["status"] == "success"

def test_create_backup_cloud():
    body_dict = {
        "node_id": "test_node",
        "cloud_provider": "gdrive",
        "cloud_credentials": "test_token"
    }

    import time, hmac, hashlib
    timestamp = str(int(time.time() * 1000))
    nonce = "test-nonce"
    payload = f"{timestamp}:{nonce}:{json.dumps(body_dict).replace(' ', '')}"
    sig = hmac.new("test_key".encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()

    headers = {
        "X-Axiom-Timestamp": timestamp,
        "X-Axiom-Nonce": nonce,
        "X-Axiom-Signature": sig
    }

    from unittest.mock import patch
    with patch("src.recovery.cloud_storage.CloudStorageFactory.get_provider") as mock_get_provider:
        mock_provider = mock_get_provider.return_value
        mock_provider.upload_file.return_value = "mock_file_id"

        res = client.post("/backup/create", json=body_dict, headers=headers)

        assert res.status_code == 200
        assert res.json()["status"] == "success"
        assert "uploaded" in res.json()["message"]
        mock_provider.upload_file.assert_called_once()

def test_restore_backup_local():
    manager = RecoveryBundleManager()
    bundle_data = manager.create_bundle("test_node")
    payload_b64 = base64.b64encode(bundle_data).decode("utf-8")

    body_dict = {"payload": payload_b64}

    import time, hmac, hashlib
    timestamp = str(int(time.time() * 1000))
    nonce = "test-nonce"
    payload = f"{timestamp}:{nonce}:{json.dumps(body_dict).replace(' ', '')}"
    sig = hmac.new("test_key".encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()

    headers = {
        "X-Axiom-Timestamp": timestamp,
        "X-Axiom-Nonce": nonce,
        "X-Axiom-Signature": sig
    }

    res = client.post("/backup/restore", json=body_dict, headers=headers)
    assert res.status_code == 200
    assert res.json()["status"] == "success"
