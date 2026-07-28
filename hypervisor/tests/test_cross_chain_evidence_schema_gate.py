import json
from pathlib import Path

from scripts.verify_cross_chain_evidence_schema import validate_file
from src.verifiers.custom_chain_verifier import SovereignCrossChainVerifier
from src.verifiers.grid_verifier_adapter import GridVerifierAdapter


def _claim() -> dict:
    return {
        "claim_id": "claim-123",
        "source_chain_id": 943,
        "tx_hash": "0xabc",
        "log_index": 7,
        "block_number": 987654,
        "token": "AXM",
        "amount": "1000",
        "recipient": "0xfeed",
    }


def test_schema_gate_accepts_sovereign_shadow_bundle(tmp_path: Path):
    verifier = SovereignCrossChainVerifier(evidence_dir=str(tmp_path), shadow_mode=True)
    result = verifier.verify_claim(_claim(), evidence_bundle={"source": "layerzero", "proof_ref": "proof-1"})

    errors = validate_file(Path(result["evidence_path"]))
    assert errors == []


def test_schema_gate_accepts_bridge_delay_queue_bundle(tmp_path: Path):
    adapter = GridVerifierAdapter(bridge_delay_dir=str(tmp_path), zk_light_client_enabled=True)
    result = adapter.evaluate_claim(_claim(), policy_context={"risk_class": "high"})

    errors = validate_file(Path(result["bridge_delay_path"]))
    assert errors == []


def test_schema_gate_rejects_bundle_without_signature(tmp_path: Path):
    payload = {
        "schema_version": "cross_chain_evidence_bundle.v2",
        "bundle_type": "sovereign_shadow",
        "replay_id": "a" * 64,
        "generated_at_utc": "2026-04-08T00:00:00Z",
        "shadow_mode": True,
        "evidence_bundle": {"source": "layerzero"},
        "decision": {"status": "shadow_accept"},
    }
    bad_path = tmp_path / "bad.json"
    bad_path.write_text(json.dumps(payload), encoding="utf-8")

    errors = validate_file(bad_path)
    assert any("provenance_signature" in err for err in errors)
