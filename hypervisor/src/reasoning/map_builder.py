"""
Reasoning Map Builder for AXIOM-MESH.

Converts framework descriptions (like Wiki-links or JSON from InfraNodus)
into nodes and edges with explicit "rule" or "navigation" metadata.
"""
from typing import Dict, List, Any, Optional
import json
import uuid
import hashlib
from pathlib import Path

# Try importing security helpers
try:
    from shared.src.security.graph_safe import validate_url, sanitize_label
    SECURITY_AVAILABLE = True
except ImportError:
    SECURITY_AVAILABLE = False


class ReasoningMapBuilder:
    """Builds Reasoning Maps from structured or unstructured data."""

    def __init__(self):
        self.nodes = []
        self.edges = []

    def add_node(self, node_id: str, label: str, metadata: Dict[str, Any] = None):
        """Add a node to the reasoning map."""
        if SECURITY_AVAILABLE:
            label = sanitize_label(label)
        node = {
            "id": node_id,
            "label": label,
            "metadata": metadata or {}
        }
        self.nodes.append(node)

    def add_edge(self, source: str, target: str, relation: str, metadata: Dict[str, Any] = None):
        """Add an edge to the reasoning map."""
        if SECURITY_AVAILABLE:
            relation = sanitize_label(relation)
        edge = {
            "source": source,
            "target": target,
            "relation": relation,
            "metadata": metadata or {}
        }
        self.edges.append(edge)

    def build_from_json(self, json_data: Dict[str, Any]) -> Dict[str, Any]:
        """Convert a JSON reasoning framework into map format."""
        if "nodes" in json_data:
            for node in json_data["nodes"]:
                self.add_node(
                    node.get("id", str(uuid.uuid4())),
                    node.get("label", ""),
                    node.get("metadata", {})
                )

        if "edges" in json_data:
            for edge in json_data["edges"]:
                self.add_edge(
                    edge.get("source", ""),
                    edge.get("target", ""),
                    edge.get("relation", ""),
                    edge.get("metadata", {})
                )

        return self.get_map()

    def get_map(self) -> Dict[str, Any]:
        """Return the constructed reasoning map."""
        return {
            "nodes": self.nodes,
            "edges": self.edges,
            "diversity_score": self.calculate_diversity_score()
        }

    def calculate_diversity_score(self) -> float:
        """Calculate graph diversity score."""
        # Simple stub for diversity calculation
        # In a real implementation this would analyze the variety of nodes/edges
        if not self.nodes:
            return 0.0
        return min(1.0, len(self.nodes) * 0.1 + len(self.edges) * 0.05)

    @staticmethod
    def check_risky_logic(map_data: Dict[str, Any]) -> bool:
        """
        Pre-execution analysis in Sandbox to check for risky logic patterns.
        Route any external map import through this before allowing execution.
        """
        edges = map_data.get("edges", [])
        nodes = map_data.get("nodes", [])

        # Check for executable code in relations or labels
        risky_keywords = ["eval", "exec", "system", "os.system", "subprocess", "import os", "import subprocess"]

        for edge in edges:
            relation = str(edge.get("relation", "")).lower()
            metadata_str = str(edge.get("metadata", {})).lower()
            if any(keyword in relation for keyword in risky_keywords):
                return True
            if any(keyword in metadata_str for keyword in risky_keywords):
                return True

        for node in nodes:
            label = str(node.get("label", "")).lower()
            metadata_str = str(node.get("metadata", {})).lower()
            if any(keyword in label for keyword in risky_keywords):
                return True
            if any(keyword in metadata_str for keyword in risky_keywords):
                return True

        return False
