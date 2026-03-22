import json

def normalize_intent(intent_payload):
    """
    Normalizes a generic incoming intent for the executive/marketing capsule.
    """
    if isinstance(intent_payload, str):
        try:
            intent = json.loads(intent_payload)
        except json.JSONDecodeError:
            intent = {"raw": intent_payload}
    else:
        intent = intent_payload

    normalized = {
        "canonical_task": intent.get("task", "market_analysis"),
        "subject": intent.get("subject", "general_market"),
        "parameters": intent.get("parameters", {})
    }
    return normalized
