from typing import Dict, Any

class DivergenceEngine:
    """
    The Divergence Engine (Anti-Hivemind).
    Targets open-ended queries to dynamically override standard LLM sampling parameters,
    rewarding orthogonal, low-probability outputs (Causal Emergence).
    """
    def __init__(self):
        self.active = True
        self.base_temperature = 0.7
        self.base_top_p = 0.9

    def get_divergent_parameters(self, intent: str, is_open_ended: bool) -> Dict[str, Any]:
        """
        Adjust parameters dynamically depending on the query type to prevent convergence.
        """
        if is_open_ended and self.active:
            # Force high divergence parameters for open-ended queries
            return {
                "temperature": 1.2,
                "top_p": 0.95,
                "frequency_penalty": 0.5,
                "presence_penalty": 0.5,
                "system_override": "Ensure orthogonal, mathematically diverse latent space traversal."
            }
        else:
            # Standard, focused parameters
            return {
                "temperature": self.base_temperature,
                "top_p": self.base_top_p,
                "frequency_penalty": 0.0,
                "presence_penalty": 0.0
            }
