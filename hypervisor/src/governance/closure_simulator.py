from typing import Dict, Any, Tuple

class StatutePolicyEncoder:
    """
    Encodes governance policies and statutes into evaluable rule structures.
    """
    def __init__(self):
        self.policies: Dict[str, Dict[str, Any]] = {}

    def encode_policy(self, name: str, conditions: Dict[str, Any]):
        """
        Stores a policy definition.

        Args:
            name (str): The identifier for the policy.
            conditions (Dict[str, Any]): A dictionary mapping state keys to required values.
        """
        self.policies[name] = conditions

class GovernanceClosureSimulator:
    """
    Simulates the application of governance policies to determine if a
    proposed state satisfies all encoded constraints (closure).
    """
    def __init__(self, encoder: StatutePolicyEncoder):
        self.encoder = encoder

    def evaluate_closure(self, state: Dict[str, Any], policy_name: str) -> Tuple[bool, str]:
        """
        Evaluates whether a given state satisfies all conditions of a specific policy.

        Args:
            state (Dict[str, Any]): The proposed state variables and their values.
            policy_name (str): The name of the policy to evaluate against.

        Returns:
            Tuple[bool, str]: (True, "Closure achieved") if all conditions met,
                              (False, failure reason) otherwise.
        """
        if policy_name not in self.encoder.policies:
            return False, f"Policy '{policy_name}' not found."

        conditions = self.encoder.policies[policy_name]

        for key, required_value in conditions.items():
            if key not in state:
                return False, f"Missing required state key: '{key}'"

            # Simple equality check for this simulation
            if state[key] != required_value:
                return False, f"Condition failed for '{key}': expected {required_value}, got {state[key]}"

        return True, "Closure achieved"
