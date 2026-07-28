import sys
import subprocess
import json
import sympy as sp
import select

def map_intent_to_math_args(normalized_intent):
    """
    Translates a canonical intent into math operations.
    """
    task = normalized_intent.get("canonical_task")
    expr_str = normalized_intent.get("expression", "")
    params = normalized_intent.get("parameters", {})

    if task == "solve":
        # Assume expr_str is equation like "x**2 - 4 = 0"
        # Parse and solve
        try:
            # Simple parsing, assume form "expr = 0"
            if "=" in expr_str:
                left, right = expr_str.split("=", 1)
                eq = sp.Eq(sp.sympify(left), sp.sympify(right))
                solutions = sp.solve(eq)
            else:
                # Assume expr = 0
                eq = sp.sympify(expr_str)
                solutions = sp.solve(eq)
            return {"operation": "solve", "equation": expr_str, "solutions": str(solutions)}
        except Exception as e:
            return {"error": str(e)}
    elif task == "simplify":
        try:
            simplified = sp.simplify(expr_str)
            return {"operation": "simplify", "expression": expr_str, "result": str(simplified)}
        except Exception as e:
            return {"error": str(e)}
    else:
        return {"error": "Unknown task"}

def execute_math_operation(args):
    """
    Executes the math operation.
    """
    return args  # Since it's pure python

if __name__ == "__main__":
    # If run as a script, check stdin
    intent_processed = False

    dr, _, _ = select.select([sys.stdin], [], [], 0.0)
    if dr:
        raw_intent = sys.stdin.read()
        if raw_intent.strip():
            from normalize_intent import normalize_intent
            normalized = normalize_intent(raw_intent)
            result = map_intent_to_math_args(normalized)
            print(json.dumps(result))
            intent_processed = True

    if not intent_processed:
        # Default
        result = {"message": "Math capsule ready"}
        print(json.dumps(result))