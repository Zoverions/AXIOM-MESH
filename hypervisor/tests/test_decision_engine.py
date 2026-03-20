import pytest
import time
from src.decision.engine import DecisionEngine
from src.decision.verifiers.tee_verifier import TEEVerifier
from src.decision.verifiers.zk_verifier import ZKProofVerifier
from src.decision.mpc.orchestrator import MPCOrchestrator

def test_decision_engine_deterministic():
    engine = DecisionEngine()

    # Test TEE selection
    node_caps = {"TEE": True, "zk_proof_gen": False}
    mechanism, rationale = engine.evaluate(
        attestation_policy="TEE_required",
        node_capabilities=node_caps,
        compute_budget=100,
        sensitivity_level="high"
    )
    assert mechanism == "TEE"
    assert "Selected TEE" in rationale

    # Test zk_proof selection
    node_caps = {"TEE": False, "zk_proof_gen": True}
    mechanism, rationale = engine.evaluate(
        attestation_policy="zk_proof_required",
        node_capabilities=node_caps,
        compute_budget=100,
        sensitivity_level="high"
    )
    assert mechanism == "zk_proof"
    assert "Selected zk_proof" in rationale

    # Test MPC selection
    node_caps = {"TEE": False, "zk_proof_gen": False}
    mechanism, rationale = engine.evaluate(
        attestation_policy="none",
        node_capabilities=node_caps,
        compute_budget=100,
        sensitivity_level="multi_party_privacy"
    )
    assert mechanism == "MPC"
    assert "Selected MPC" in rationale

    # Test fallback
    node_caps = {"TEE": False, "zk_proof_gen": False}
    mechanism, rationale = engine.evaluate(
        attestation_policy="none",
        node_capabilities=node_caps,
        compute_budget=100,
        sensitivity_level="low"
    )
    assert mechanism == "sandbox"
    assert "signed sandbox" in rationale

def test_cross_validation_consistency():
    engine = DecisionEngine()

    node_caps_tee = {"TEE": True, "zk_proof_gen": False}
    mechanism_tee, _ = engine.evaluate("TEE_required", node_caps_tee, 100, "high")

    node_caps_zk = {"TEE": False, "zk_proof_gen": True}
    mechanism_zk, _ = engine.evaluate("zk_proof_required", node_caps_zk, 100, "high")

    assert mechanism_tee == "TEE"
    assert mechanism_zk == "zk_proof"

def test_stress_test_mpc_orchestration():
    orchestrator = MPCOrchestrator()
    orchestrator.add_node("node_1")
    orchestrator.add_node("node_2")
    orchestrator.add_node("node_3")

    start_time = time.time()

    results = []
    # Simulate a stress test on MPC orchestration
    for _ in range(10):
        result = orchestrator.orchestrate({"data": "test"})
        results.append(result)

    end_time = time.time()

    assert len(results) == 10
    assert all(r["status"] == "success" for r in results)

    # Since each orchestration takes 0.1s, 10 orchestrations should take at least 1s
    assert (end_time - start_time) >= 1.0

def test_verifiers():
    tee_verifier = TEEVerifier()
    zk_verifier = ZKProofVerifier()

    registry_keys = {"trusted": True}

    assert tee_verifier.verify_quote("valid_quote", registry_keys) == True
    assert tee_verifier.verify_quote("invalid_quote", registry_keys) == False
    assert tee_verifier.verify_quote("valid_quote", {"trusted": False}) == False

    assert zk_verifier.verify_proof("valid_proof", registry_keys) == True
    assert zk_verifier.verify_proof("invalid_proof", registry_keys) == False
    assert zk_verifier.verify_proof("valid_proof", {"trusted": False}) == False
