import json

def normalize_intent(intent_payload):
    """
    Normalizes a generic incoming intent for the education capsule.
    """
    if isinstance(intent_payload, str):
        try:
            intent = json.loads(intent_payload)
        except json.JSONDecodeError:
            intent = {"raw": intent_payload}
    else:
        intent = intent_payload

    normalized = {
        "canonical_task": intent.get("task", "assess_maturity"),
        "student_id": intent.get("student_id", ""),
        "parameters": intent.get("parameters", {})
    }
    return normalized
