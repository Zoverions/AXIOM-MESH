from typing import List, Dict, Any
from src.cortex.mirofish_mapper import MiroFishMapper

class DivergenceEngine:
    """
    Divergence Engine: Countering the Artificial Hivemind.
    Identifies low-density spatial quadrants in the Miro-map to
    force sampling from diverse memory regions.
    """
    def __init__(self, mapper: MiroFishMapper):
        self.mapper = mapper

    def get_diverse_nodes(self, top_n: int = 5) -> List[str]:
        """
        Returns node IDs from low-density spatial quadrants.
        """
        if not self.mapper.coordinate_plane:
            return []

        # 1. Define Quadrants (e.g., 4 quadrants)
        quadrants: Dict[int, List[str]] = {0: [], 1: [], 2: [], 3: []}

        for node_id, (x, y) in self.mapper.coordinate_plane.items():
            if x >= 0 and y >= 0: q = 0
            elif x < 0 and y >= 0: q = 1
            elif x < 0 and y < 0: q = 2
            else: q = 3
            quadrants[q].append(node_id)

        # 2. Identify the quadrant with the fewest nodes
        sorted_quadrants = sorted(quadrants.items(), key=lambda x: len(x[1]))

        diverse_nodes = []
        for q_id, nodes in sorted_quadrants:
            diverse_nodes.extend(nodes)
            if len(diverse_nodes) >= top_n:
                break

        return diverse_nodes[:top_n]

    def apply_sampling_perturbation(self, base_params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Dynamically alters sampling parameters to reward non-homogenized outputs.
        """
        # Example: Increase frequency_penalty to prevent repetitive/homogenized responses
        perturbed = base_params.copy()
        perturbed["frequency_penalty"] = perturbed.get("frequency_penalty", 0.0) + 0.2
        perturbed["presence_penalty"] = perturbed.get("presence_penalty", 0.0) + 0.2
        return perturbed
