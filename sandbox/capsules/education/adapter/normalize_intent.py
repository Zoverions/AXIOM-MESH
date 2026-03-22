import json

def normalize_intent(intent_payload):
    """
    Normalizes a generic incoming intent for the education capsule.
    """
    if isinstance(intent_payload, str):
        try:
            intent = json.loads(intent_payload)
            if not isinstance(intent, dict):
                intent = {"raw": intent_payload}
        except json.JSONDecodeError:
            intent = {"raw": intent_payload}
    elif isinstance(intent_payload, dict):
        intent = intent_payload
    else:
        intent = {"raw": str(intent_payload)}

    normalized = {
        "canonical_task": intent.get("task", "assess_maturity"),
        "student_id": intent.get("student_id", ""),
        "region": intent.get("region", None),
        "parameters": intent.get("parameters", {})
    }
    return normalized
