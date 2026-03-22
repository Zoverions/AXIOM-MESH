import sys
import subprocess
import json

def map_intent_to_tool_args(normalized_intent):
    """
    Translates a canonical intent into CLI arguments for the `gpd` tool.
    """
    task = normalized_intent.get("canonical_task")
    params = normalized_intent.get("parameters", {})

    args = ["gpd", "--headless"]

    if task == "simulate":
        args.append("simulate")
        if "duration" in params:
            args.extend(["--duration", str(params["duration"])])
        if "timestep" in params:
            args.extend(["--timestep", str(params["timestep"])])

    elif task == "analyze":
        args.append("analyze")
        if "data_file" in params:
            args.extend(["--input", params["data_file"]])

    return args

def execute_tool(args):
    """
    Executes the tool with the provided arguments.
    """
    try:
        result = subprocess.run(args, capture_output=True, text=True, check=True)
        return {
            "status": "success",
            "output": result.stdout,
            "error": result.stderr
        }
    except subprocess.CalledProcessError as e:
        return {
            "status": "error",
            "error": e.stderr,
            "code": e.returncode
        }
    except FileNotFoundError as e:
        return {
            "status": "error",
            "error": "Executable not found. Ensure it is in PATH.",
            "code": 127
        }

import select

if __name__ == "__main__":
    # If run as a script, check if stdin has data without hanging
    import sys
    import os
    import select

    intent_processed = False

    # Check if there is data on stdin
    dr, _, _ = select.select([sys.stdin], [], [], 0.0)
    if dr:
        raw_intent = sys.stdin.read()
        if raw_intent.strip():
            from normalize_intent import normalize_intent
            normalized = normalize_intent(raw_intent)
            args = map_intent_to_tool_args(normalized)
            print(f"Executing: {' '.join(args)}", file=sys.stderr)
            result = execute_tool(args)
            print(json.dumps(result))
            intent_processed = True

    if not intent_processed:
        # Fallback to default behavior if no stdin intent provided or parsed
        args = ["gpd", "--headless"]
        print(f"Executing default: {' '.join(args)}", file=sys.stderr)
        result = execute_tool(args)
        print(json.dumps(result))
