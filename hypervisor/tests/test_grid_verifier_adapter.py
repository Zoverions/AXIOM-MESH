import json
from pathlib import Path

from src.verifiers.grid_verifier_adapter import GridVerifierAdapter


def _claim() -> dict:
    return {
        "claim_id": "claim-zk-1",
        "source_chain_id": 369,
        "tx_hash": "0x1234",
        "log_index": 3,
        "block_number": 123456,
        "token": "AXM",
        "amount": "42",
        "recipient": "0xbeef",
    }


def _proof() -> dict:
    return {
        "proof_ref": "proof-abc",
        "verification_key": "vk-1",
        "receipt_root": "root-9",
    }


def test_accepts_valid_zk_proof_when_enabled(tmp_path: Path):
    adapter = GridVerifierAdapter(bridge_delay_dir=str(tmp_path), zk_light_client_enabled=True)

    result = adapter.evaluate_claim(_claim(), zk_proof=_proof())

    assert result["status"] == "zk_accept"
    assert result["accepted"] is True
    assert result["bridge_delay_path"] is None


def test_queues_bridge_delay_when_zk_missing_for_high_risk(tmp_path: Path):
    adapter = GridVerifierAdapter(bridge_delay_dir=str(tmp_path), zk_light_client_enabled=True)

    result = adapter.evaluate_claim(_claim(), policy_context={"risk_class": "high"})

    assert result["status"] == "bridge_delay_queued"
    assert result["accepted"] is False
    assert result["reason"] == "missing_zk_light_client_proof"
    delay_path = Path(result["bridge_delay_path"])
    assert delay_path.exists()

    payload = json.loads(delay_path.read_text(encoding="utf-8"))
    assert payload["reason"] == "missing_zk_light_client_proof"
    assert payload["schema_version"] == "cross_chain_bridge_delay_queue.v1"


def test_bridge_only_accepts_when_zk_feature_disabled(tmp_path: Path):
    adapter = GridVerifierAdapter(bridge_delay_dir=str(tmp_path), zk_light_client_enabled=False)

    result = adapter.evaluate_claim(_claim())

    assert result["status"] == "bridge_only"
    assert result["accepted"] is True
    assert result["reason"] == "zk_light_client_disabled"
