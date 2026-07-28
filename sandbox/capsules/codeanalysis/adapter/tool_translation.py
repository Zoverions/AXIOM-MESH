import sys
import subprocess
import json
import ast
import select

def map_intent_to_code_args(normalized_intent):
    """
    Translates a canonical intent into code analysis operations.
    """
    task = normalized_intent.get("canonical_task")
    code_str = normalized_intent.get("code", "")
    params = normalized_intent.get("parameters", {})

    if task == "parse":
        try:
            tree = ast.parse(code_str)
            return {"operation": "parse", "status": "success", "ast_dump": ast.dump(tree)}
        except Exception as e:
            return {"error": str(e)}
    elif task == "check":
        try:
            compile(code_str, "<string>", "exec")
            return {"operation": "check", "status": "success", "message": "Syntax is correct"}
        except SyntaxError as e:
            return {"operation": "check", "status": "error", "error": str(e)}
        except Exception as e:
            return {"error": str(e)}
    else:
        return {"error": "Unknown task"}

if __name__ == "__main__":
    # If run as a script, check stdin
    intent_processed = False

    dr, _, _ = select.select([sys.stdin], [], [], 0.0)
    if dr:
        raw_intent = sys.stdin.read()
        if raw_intent.strip():
            from normalize_intent import normalize_intent
            normalized = normalize_intent(raw_intent)
            result = map_intent_to_code_args(normalized)
            print(json.dumps(result))
            intent_processed = True

    if not intent_processed:
        # Default
        result = {"message": "Code analysis capsule ready"}
        print(json.dumps(result))
