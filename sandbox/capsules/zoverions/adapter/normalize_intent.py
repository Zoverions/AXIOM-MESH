import json

def normalize_intent(raw_intent):
    """
    Parses and normalizes the intent to prepare for Epistemic Processing.
    """
    try:
        parsed = json.loads(raw_intent)
    except Exception:
        parsed = {"prompt": raw_intent.strip()}

    normalized = {
        "canonical_task": parsed.get("task", "epistemic_processing"),
        "prompt": parsed.get("prompt", ""),
        "parameters": parsed.get("parameters", {})
    }
    return normalized
