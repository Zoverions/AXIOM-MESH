import hashlib
import json
import datetime

def generate_proof(intent, output):
    """
    Generates a proof for the executed intent and its output.
    This acts as a feasibility sketch/attestation.
    """
    payload = {
        "intent_hash": hashlib.sha256(json.dumps(intent, sort_keys=True).encode()).hexdigest(),
        "output_hash": hashlib.sha256(json.dumps(output, sort_keys=True).encode()).hexdigest(),
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "attestation_type": "mock_proof_carrying_intent",
        "verifier": "gpd-proof-hook"
    }

    # In a production environment, this might involve zk-SNARKs or other cryptographic proofs
    payload["signature"] = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()

    return payload
