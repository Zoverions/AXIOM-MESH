import pytest
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from src.zk.graph_proofs import ZKGraphQueryProver

def test_zk_graph_query_prover():
    prover = ZKGraphQueryProver()
    proof_data = prover.generate_query_proof("query-123", "root-hash-456")

    assert proof_data["query_id"] == "query-123"
    assert proof_data["graph_root"] == "root-hash-456"
    assert "zk_proof" in proof_data
    assert proof_data["valid"] is True

    # Verify the proof
    assert prover.verify_query_proof(proof_data) is True

def test_zk_graph_invalid_proof():
    prover = ZKGraphQueryProver()
    proof_data = {
        "query_id": "query-123",
        "graph_root": "root-hash-456",
        "zk_proof": "invalid_hash",
        "valid": True
    }

    assert prover.verify_query_proof(proof_data) is False
