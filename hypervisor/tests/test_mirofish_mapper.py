import os
import sys
import pytest

# Ensure hypervisor/src is in sys.path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'src'))

from cortex.mirofish_mapper import MiroFishMapper

def test_mirofish_mapper_initialization():
    mapper = MiroFishMapper(node_limit=5000)
    assert mapper.node_limit == 5000
    assert mapper.coordinate_plane == {}

def test_map_to_spatial_grid():
    mapper = MiroFishMapper()
    nodes = [
        {"id": "node1", "label": "Axiom 1", "tier": 1, "references": ["node2"]},
        {"id": "node2", "label": "Axiom 2", "tier": 2, "references": []},
        {"id": "node3", "label": "Axiom 3", "tier": 3, "references": ["node1"]}
    ]

    miro_map = mapper.map_to_spatial_grid(nodes)

    assert "metadata" in miro_map
    assert "elements" in miro_map
    assert len(miro_map["elements"]) == 3

    # Check elements structure
    for element in miro_map["elements"]:
        assert "id" in element
        assert "label" in element
        assert "coordinates" in element
        assert "tier" in element
        assert "connections" in element

    # Check coordinate plane population
    assert len(mapper.coordinate_plane) == 3
    assert "node1" in mapper.coordinate_plane
    assert "node2" in mapper.coordinate_plane
    assert "node3" in mapper.coordinate_plane

def test_calculate_coordinates():
    mapper = MiroFishMapper()

    node = {"id": "test_node", "tier": 2}
    x, y = mapper._calculate_coordinates(node, 0)

    # tier 2 -> radius = 200
    # index 0 -> angle = 0
    # x = 200 * cos(0) = 200
    # y = 200 * sin(0) = 0
    assert x == 200.0
    assert y == 0.0

def test_get_context_cluster():
    mapper = MiroFishMapper()
    mapper.coordinate_plane = {
        "node1": (0.0, 0.0),
        "node2": (30.0, 40.0), # distance to node1 = 50
        "node3": (100.0, 0.0), # distance to node1 = 100
        "node4": (-10.0, 0.0)  # distance to node1 = 10
    }

    cluster = mapper.get_context_cluster("node1", radius=50.0)

    assert "node1" in cluster
    assert "node2" in cluster
    assert "node4" in cluster
    assert "node3" not in cluster
    assert len(cluster) == 3

def test_get_context_cluster_not_found():
    mapper = MiroFishMapper()
    mapper.coordinate_plane = {
        "node1": (0.0, 0.0)
    }

    cluster = mapper.get_context_cluster("missing_node", radius=50.0)
    assert cluster == []

def test_euclidean_distance():
    mapper = MiroFishMapper()

    dist = mapper._euclidean_distance((0, 0), (3, 4))
    assert dist == 5.0
