import sys
import json
import select

def filter_causal_fidelity(prompt_data):
    """
    Ingress Filter: Apply the principle of Causal Fidelity.
    Separates the prompt into "Signal" (Hardware) and "Noise" (Operator's Noise).
    """
    return {
        "signal": "Extracting physical facts/structural realities from data.",
        "noise": "Identifying catastrophic predictions/cultural assumptions.",
        "filtered_data": prompt_data
    }

def apply_information_theoretic_hierarchy(filtered_data):
    """
    Analytical Engine: Evaluate the data through the Information-Theoretic Hierarchy (ITH).
    Maps the problem across Substrate, OS, and UI layers.
    """
    return {
        "substrate": "Raw resources/atoms of the problem.",
        "os": "Rules, laws, or physics governing the system.",
        "ui": "Conscious agent's experience.",
        "analysis": "Root cause shifted to OS or Substrate layer.",
        "data": filtered_data
    }

def evaluate_zoverions_hamiltonian(ith_analysis):
    """
    Evaluative Matrix: Run through the Zoverions Hamiltonian.
    Maximize Capacity (C) and Optionality (O) while minimizing Entropy (S).
    """
    return {
        "capacity_check": "Increasing system's ability to learn.",
        "optionality_check": "Preserving reversibility, avoiding absorbing states.",
        "entropy_check": "Resisting systemic damage.",
        "evaluation": "Action preserves optionality and privacy.",
        "analysis_context": ith_analysis
    }

def synthesize_arena_protocol(evaluation):
    """
    Synthesis Output: Use ARENA Protocol & Semantic Chaos.
    Synthesize opposing viewpoints, steel-man opposing views, and push for cognitive sovereignty.
    """
    return {
        "semantic_chaos": "Finding meaningful anomalies within data.",
        "arena_protocol": "Antagonistic, Recursive, Epistemic, Networked Argumentation applied.",
        "synthesis_result": "Output challenges Operator to make a conscious choice based on structural signal.",
        "final_evaluation": evaluation
    }

def process_intent(raw_intent):
    """
    Process raw intent through the Zoverions Epistemic Lens.
    """
    try:
        intent_data = json.loads(raw_intent)
        prompt_data = intent_data.get("prompt", raw_intent)
    except Exception:
        prompt_data = raw_intent

    filtered = filter_causal_fidelity(prompt_data)
    analyzed = apply_information_theoretic_hierarchy(filtered)
    evaluated = evaluate_zoverions_hamiltonian(analyzed)
    synthesized = synthesize_arena_protocol(evaluated)

    return {
        "operation": "epistemic_processing",
        "lens_applied": "zoverions",
        "output": synthesized
    }

if __name__ == "__main__":
    intent_processed = False
    dr, _, _ = select.select([sys.stdin], [], [], 0.0)

    if dr:
        raw_intent = sys.stdin.read()
        if raw_intent.strip():
            result = process_intent(raw_intent)
            print(json.dumps(result))
            intent_processed = True

    if not intent_processed:
        result = {"message": "Zoverions Epistemic Lens capsule ready. Awaiting Operator input."}
        print(json.dumps(result))
