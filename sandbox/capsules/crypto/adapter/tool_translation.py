import sys
import json
import select
try:
    from normalize_intent import normalize_intent
except ImportError:
    def normalize_intent(raw_intent): return {"operation": "unknown"}

def map_intent_to_crypto_args(normalized_intent):
    """
    Translates a canonical intent into crypto operations.
    """
    operation = normalized_intent.get("operation")
    algorithm = normalized_intent.get("algorithm")

    if operation == "hash":
        return {"operation": "hash", "algorithm": algorithm, "status": "simulated_success"}
    elif operation == "encrypt":
        return {"operation": "encrypt", "algorithm": algorithm, "status": "simulated_success"}
    else:
        return {"error": "Unknown or unsupported operation"}

if __name__ == "__main__":
    # If run as a script, check stdin
    intent_processed = False

    dr, _, _ = select.select([sys.stdin], [], [], 0.0)
    if dr:
        raw_intent = sys.stdin.read()
        if raw_intent.strip():
            try:
                raw_dict = json.loads(raw_intent)
            except:
                raw_dict = {"text": raw_intent}
            normalized = normalize_intent(raw_dict)
            result = map_intent_to_crypto_args(normalized)
            print(json.dumps(result))
            intent_processed = True

    if not intent_processed:
        # Default
        result = {"message": "Crypto capsule ready"}
        print(json.dumps(result))
