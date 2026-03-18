import logging
from typing import Dict, List, Any, Tuple

logger = logging.getLogger("Axiom-MiroFish")

class MiroFishMapper:
    """
    Integrates MiroFish logic into the AxiomMesh HGR.
    Transforms hierarchical nodes into a 'Spatial Knowledge Map'
    to mitigate Semantic Collapse and prevent 'Hivemind' clustering.
    """
    def __init__(self, node_limit: int = 10000):
        self.node_limit = node_limit
        self.coordinate_plane: Dict[str, Tuple[float, float]] = {}
        # Pre-initialize user_node as owner to prevent blocking authorized operations
        self.authority_nodes: Dict[str, str] = {"user_node": "owner"}

    def map_to_spatial_grid(self, hgr_nodes: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Takes HGR nodes and assigns them spatial coordinates (X, Y)
        based on their semantic distance and hierarchical tier.
        """
        logger.info(f"[🐠] Mapping {len(hgr_nodes)} nodes to Spatial Grid...")

        miro_map = {
            "metadata": {"source": "MiroFish-Integration", "version": "1.1.0"},
            "elements": []
        }

        for i, node in enumerate(hgr_nodes):
            x, y = self._calculate_coordinates(node, i)

            node_id = node.get("id")
            # Authority Mapping: Owner nodes at center (Tier 1), External at edge (Tier 3+)
            authority = "owner" if node.get("tier", 3) == 1 else "external"

            element = {
                "id": node_id,
                "label": node.get("label"),
                "coordinates": {"x": x, "y": y},
                "tier": node.get("tier", 3),
                "authority": authority,
                "connections": node.get("references", [])
            }

            miro_map["elements"].append(element)
            if node_id is not None:
                self.coordinate_plane[node_id] = (x, y)
                self.authority_nodes[node_id] = authority

        return miro_map

    def _calculate_coordinates(self, node: Dict, index: int) -> Tuple[float, float]:
        import math

        tier = node.get("tier", 3)
        # Owner Nodes (Tier 1) are at the center (radius 0-100)
        # External Nodes (Tier 3) are at the periphery (radius 300+)
        radius = tier * 100.0
        angle = (index * 137.5) % 360

        x = radius * math.cos(math.radians(angle))
        y = radius * math.sin(math.radians(angle))

        return round(x, 2), round(y, 2)

    def is_operation_allowed(self, node_id: str, operation: str) -> bool:
        """
        Spatially-aware authority check. Blocks sensitive operations from 'External' nodes.
        """
        authority = self.authority_nodes.get(node_id, "external")
        risky_ops = ["shell_execution", "file_system_write"]

        if authority == "external" and operation in risky_ops:
            logger.warning(f"[🚨] Spatial Block: External node {node_id} attempted {operation}")
            return False

        return True

    def get_context_cluster(self, target_node_id: str, radius: float = 50.0) -> List[str]:
        if target_node_id not in self.coordinate_plane:
            return []

        target_coords = self.coordinate_plane[target_node_id]
        cluster = []

        for node_id, coords in self.coordinate_plane.items():
            dist = self._euclidean_distance(target_coords, coords)
            if dist <= radius:
                cluster.append(node_id)

        return cluster

    def _euclidean_distance(self, p1: Tuple[float, float], p2: Tuple[float, float]) -> float:
        import math
        return math.sqrt((p1[0] - p2[0])**2 + (p1[1] - p2[1])**2)

    def judge_rollout(self, action: str, feedback_signal: Dict[str, Any]) -> float:
        """
        OpenClaw-RL PRM Judge.
        Scores a 'rollout' (action-feedback pair) using spatial density.
        Lower density quadrants (novel exploration) are rewarded if feedback is positive.
        """
        reward = feedback_signal.get("reward", 0.0)

        # Calculate 'Spatial Novelty' - if we are in a low density area, we boost learning
        density = len(self.coordinate_plane) / 1000.0 # Simple heuristic
        novelty_boost = 1.0 / (density + 1.0)

        final_score = reward * (1.0 + novelty_boost)
        logger.info(f"[🐠] MiroFish PRM Judge scored rollout: {final_score:.4f} (Novelty Boost: {novelty_boost:.2f})")

        return final_score

# Implementation Note:
# This module will be used by the Context 2.0 Engine to select 'Spatial Clusters'
# for the prompt, rather than relying on raw cosine similarity.
