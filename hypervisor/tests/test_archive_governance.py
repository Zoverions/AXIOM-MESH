import pytest
import os
import json
import time
from cryptography.fernet import Fernet
from memory.archive import DeepArchive

def test_encryption_governance(tmp_path):
    key = Fernet.generate_key().decode()
    os.environ["MEMORY_ENCRYPTION_KEY"] = key

    storage_path = tmp_path / "enc_archive.json"
    archive = DeepArchive(storage_path=str(storage_path))

    archive.add("Secret research data", {"source": "AI"})

    # Read the raw file directly - it should be encrypted
    with open(str(storage_path), "rb") as f:
        raw = f.read()

    # Validating raw data isn't plain JSON
    with pytest.raises(Exception):
        json.loads(raw.decode("utf-8"))

    # Attempting to load without key should raise ValueError
    os.environ.pop("MEMORY_ENCRYPTION_KEY")
    with pytest.raises(ValueError, match="Archive data is not valid JSON"):
        DeepArchive(storage_path=str(storage_path))

    # Loading with correct key should work
    os.environ["MEMORY_ENCRYPTION_KEY"] = key
    archive2 = DeepArchive(storage_path=str(storage_path))
    results = archive2.search("Secret research data")
    assert len(results) == 1
    assert results[0]["content"] == "Secret research data"

def test_ttl_governance(tmp_path):
    os.environ.pop("MEMORY_ENCRYPTION_KEY", None)
    os.environ["MEMORY_TTL_DAYS"] = "1"

    storage_path = tmp_path / "ttl_archive.json"
    archive = DeepArchive(storage_path=str(storage_path))

    archive.add("Old data")

    # Tamper with the internal file to simulate time passing
    with open(str(storage_path), "r") as f:
        data = json.load(f)

    node_id = list(data["nodes"].keys())[0]
    # Set timestamp to 2 days ago
    data["nodes"][node_id]["timestamp"] = time.time() - (2 * 86400)

    with open(str(storage_path), "w") as f:
        json.dump(data, f)

    # Re-initialize to trigger TTL cleanup
    archive2 = DeepArchive(storage_path=str(storage_path))

    results = archive2.search("Old")
    assert len(results) == 0

def test_export_and_delete(tmp_path):
    os.environ.pop("MEMORY_ENCRYPTION_KEY", None)
    os.environ.pop("MEMORY_TTL_DAYS", None)

    storage_path = tmp_path / "ctrl_archive.json"
    archive = DeepArchive(storage_path=str(storage_path))

    archive.add("First node")
    archive.add("Second node")

    # Test export
    export_str = archive.export_data()
    export_json = json.loads(export_str)
    assert len(export_json["nodes"]) == 2

    # Test delete
    node_id = list(export_json["nodes"].keys())[0]
    assert archive.delete_node(node_id) is True

    # Test clear
    archive.clear()

    # Verify export is empty
    export_str_empty = archive.export_data()
    export_json_empty = json.loads(export_str_empty)
    assert len(export_json_empty["nodes"]) == 0

@pytest.mark.asyncio
async def test_bilateral_severance_zeroization(tmp_path):
    os.environ.pop("MEMORY_ENCRYPTION_KEY", None)
    os.environ.pop("MEMORY_TTL_DAYS", None)

    storage_path = tmp_path / "severance_archive.json"

    from memory.archive import DistributedDeepArchive
    archive = DistributedDeepArchive(storage_path=str(storage_path))

    # Add shared memory
    archive.add("Shared secret between peers")

    assert len(archive.search("Shared")) == 1

    # Try invalid severances
    with pytest.raises(ValueError):
        await archive.sever_bond("peer123", "short_invalid_proof")

    import json
    from unittest.mock import patch

    # Build a valid mock proof string (just needs to be >= 64 chars)
    valid_mock_proof = json.dumps({"proof": "valid_mock_proof_string_a_a_a_a_a_a_a_a_a_a_a_a_a_a_a_a_a_a_a_a_a_a_a_a_a"})

    # Ensure memory is zeroized on severance
    with patch('httpx.AsyncClient.post') as mock_post:
        mock_post.return_value.status_code = 200
        assert await archive.sever_bond("peer123", valid_mock_proof) is True

    assert len(archive.search("Shared")) == 0
    assert os.path.exists(str(storage_path))

    # Reload and ensure data is gone
    archive2 = DistributedDeepArchive(storage_path=str(storage_path))
    assert len(archive2.search("Shared")) == 0
