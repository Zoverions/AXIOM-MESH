import hashlib
import json
import datetime

def generate_proof(intent, output):
    """
    Generates a proof for the executed web search intent and its output.
    """
    payload = {
        "intent_hash": hashlib.sha256(json.dumps(intent, sort_keys=True).encode()).hexdigest(),
        "output_hash": hashlib.sha256(json.dumps(output, sort_keys=True).encode()).hexdigest(),
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "attestation_type": "web_search_proof",
        "verifier": "web-verifier"
    }

    payload["signature"] = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()

    return payload