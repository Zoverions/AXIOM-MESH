#!/usr/bin/env python3

import sys
import os
import json
import time

# Add the root directory to PYTHONPATH to import hypervisor modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from hypervisor.src.api.server import validate_causal_reasoning_attestation

def main():
    schema_path = "schemas/causal_reasoning_attestation.v1.json"
    if not os.path.exists(schema_path):
        print(f"Schema not found: {schema_path}")
        sys.exit(1)

    print(f"Loading schema from {schema_path}")

    # Generate a valid payload
    valid_payload = {
        "attestation_id": "attest-123",
        "intent_id": "intent-456",
        "model_commitment": "hash1",
        "input_commitment": "hash2",
        "output_commitment": "hash3",
        "causal_graph": {
            "root_hash": "hash4",
            "serialization_hash": "hash5",
            "nodes": [
                {
                    "node_id": "node-1",
                    "step_type": "observation",
                    "evidence_hash": "hash6",
                    "attention_weight": 0.5,
                    "timestamp_ms": int(time.time() * 1000)
                },
                {
                    "node_id": "node-2",
                    "step_type": "decision",
                    "evidence_hash": "hash7",
                    "attention_weight": 0.8,
                    "timestamp_ms": int(time.time() * 1000)
                }
            ],
            "edges": [
                {
                    "from": "node-1",
                    "to": "node-2",
                    "relation": "depends_on"
                }
            ]
        },
        "consensus_context": {
            "task_profile": "task-abc",
            "participants": [
                {
                    "node_id": "peer-1",
                    "attention_score": 0.9,
                    "reliability_score": 0.95
                }
            ]
        },
        "proof_bundle": {
            "zkml_proof": "proof1",
            "causal_proof": "proof2",
            "signature": "sig1"
        },
        "nonce": "nonce123",
        "timestamp_ms": int(time.time() * 1000)
    }

    print("Testing valid payload...")
    is_valid, mismatches = validate_causal_reasoning_attestation(valid_payload)
    if not is_valid:
        print(f"Valid payload failed validation: {mismatches}")
        sys.exit(1)
    print("Valid payload passed.")

    import copy

    # Generate an invalid payload
    invalid_payload = copy.deepcopy(valid_payload)
    invalid_payload["causal_graph"]["nodes"][0]["step_type"] = "invalid_type"

    print("Testing invalid payload...")
    is_valid, mismatches = validate_causal_reasoning_attestation(invalid_payload)
    if is_valid:
        print("Invalid payload passed validation (expected failure).")
        sys.exit(1)
    print(f"Invalid payload failed as expected with mismatches: {mismatches}")

    # Test missing fields
    missing_payload = copy.deepcopy(valid_payload)
    del missing_payload["consensus_context"]

    print("Testing payload with missing field...")
    is_valid, mismatches = validate_causal_reasoning_attestation(missing_payload)
    if is_valid:
        print("Missing payload passed validation (expected failure).")
        sys.exit(1)
    print(f"Missing payload failed as expected with mismatches: {mismatches}")

    print("CPoR schema validation completed successfully.")
    sys.exit(0)

if __name__ == "__main__":
    main()
