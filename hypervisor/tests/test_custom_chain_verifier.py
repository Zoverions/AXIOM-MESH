import json
from pathlib import Path

from src.verifiers.custom_chain_verifier import SovereignCrossChainVerifier


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


def test_shadow_mode_emits_signed_evidence_bundle(tmp_path: Path):
    verifier = SovereignCrossChainVerifier(evidence_dir=str(tmp_path), shadow_mode=True)

    result = verifier.verify_claim(
        _claim(),
        evidence_bundle={"source": "layerzero", "proof_ref": "proof-1"},
        policy_context={"risk_class": "standard", "required_approvals": 1},
    )

    assert result["status"] == "shadow_accept"
    assert result["settlement_authorized"] is False
    assert result["shadow_mode"] is True

    evidence_path = Path(result["evidence_path"])
    assert evidence_path.exists()
    bundle = json.loads(evidence_path.read_text(encoding="utf-8"))
    assert bundle["schema_version"] == "cross_chain_evidence_bundle.v2"
    assert bundle["bundle_type"] == "sovereign_shadow"
    assert bundle["decision"]["status"] == "shadow_accept"
    assert bundle["provenance_signature"]["algorithm"] == "hmac-sha256"
    assert bundle["provenance_signature"]["signer_id"] == "hypervisor-sovereign-verifier"
    assert len(bundle["provenance_signature"]["signature"]) == 64


def test_rejects_missing_fields_and_high_risk_approval_policy(tmp_path: Path):
    verifier = SovereignCrossChainVerifier(evidence_dir=str(tmp_path), shadow_mode=True)
    claim = _claim()
    del claim["recipient"]

    result = verifier.verify_claim(
        claim,
        evidence_bundle={"source": "layerzero"},
        policy_context={"risk_class": "high", "required_approvals": 1},
    )

    assert result["status"] == "reject"
    assert result["settlement_authorized"] is False
    assert any("missing_claim_fields" in reason for reason in result["reasons"])
    assert "high_risk_requires_2plus_approvals" in result["reasons"]


def test_replay_detection_rejects_duplicate_claim(tmp_path: Path):
    verifier = SovereignCrossChainVerifier(evidence_dir=str(tmp_path), shadow_mode=True)
    claim = _claim()

    first = verifier.verify_claim(claim, evidence_bundle={"source": "layerzero"})
    second = verifier.verify_claim(claim, evidence_bundle={"source": "layerzero"})

    assert first["status"] == "shadow_accept"
    assert second["status"] == "reject"
    assert "replay_detected" in second["reasons"]
