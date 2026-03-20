import os
import sys
import pytest

# Ensure hypervisor/src is in sys.path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'src'))

from cortex.divergence import DivergenceEngine
from cortex.mirofish_mapper import MiroFishMapper

def test_get_diverse_nodes_empty():
    mapper = MiroFishMapper()
    engine = DivergenceEngine(mapper)
    assert engine.get_diverse_nodes() == []

def test_get_diverse_nodes_ordering():
    mapper = MiroFishMapper()

    mapper.coordinate_plane = {
        "n0_1": (1.0, 1.0), "n0_2": (2.0, 2.0), "n0_3": (3.0, 3.0), "n0_4": (4.0, 4.0), # Q0
        "n1_1": (-1.0, 1.0), "n1_2": (-2.0, 2.0), "n1_3": (-3.0, 3.0),                  # Q1
        "n2_1": (-1.0, -1.0),                                                           # Q2
        "n3_1": (1.0, -1.0), "n3_2": (2.0, -2.0)                                        # Q3
    }

    engine = DivergenceEngine(mapper)

    nodes = engine.get_diverse_nodes(top_n=6)

    expected_nodes = ["n2_1", "n3_1", "n3_2", "n1_1", "n1_2", "n1_3"]
    assert nodes == expected_nodes
    assert len(nodes) == 6

def test_get_diverse_nodes_top_n():
    mapper = MiroFishMapper()

    mapper.coordinate_plane = {
        "n0_1": (1.0, 1.0), "n0_2": (2.0, 2.0),
        "n1_1": (-1.0, 1.0), "n1_2": (-2.0, 2.0),
        "n2_1": (-1.0, -1.0), "n2_2": (-2.0, -2.0),
        "n3_1": (1.0, -1.0), "n3_2": (2.0, -2.0)
    }

    engine = DivergenceEngine(mapper)

    nodes = engine.get_diverse_nodes(top_n=3)
    assert len(nodes) == 3

def test_apply_sampling_perturbation():
    mapper = MiroFishMapper()
    engine = DivergenceEngine(mapper)

    base_params = {"temperature": 0.7, "frequency_penalty": 0.1}
    perturbed = engine.apply_sampling_perturbation(base_params)

    assert perturbed["temperature"] == 0.7
    assert perturbed["frequency_penalty"] == pytest.approx(0.3)
    assert perturbed["presence_penalty"] == pytest.approx(0.2)

import unittest.mock as mock

def test_get_diverse_nodes_with_actual_mapping():
    mapper = MiroFishMapper()
    engine = DivergenceEngine(mapper)

    # Mock HGR nodes that would typically come from semantic clustering / PCA
    # We use different tiers and ids to ensure they get mapped to different coordinates
    mock_nodes = [
        {"id": f"node_{i}", "label": f"Concept {i}", "tier": (i % 3) + 1, "references": []}
        for i in range(20)
    ]

    # Map the nodes to populate the coordinate_plane
    # Mock the _calculate_coordinates method to simulate PCA/clustering output
    # Ensure they map to distinct quadrants:
    def mock_coordinates(node, idx):
        # We want to distribute points among the four quadrants manually
        if idx % 4 == 0:
            return (1.0 + float(idx), 1.0 + float(idx))   # Q0
        elif idx % 4 == 1:
            return (-1.0 - float(idx), 1.0 + float(idx))  # Q1
        elif idx % 4 == 2:
            return (-1.0 - float(idx), -1.0 - float(idx)) # Q2
        else:
            return (1.0 + float(idx), -1.0 - float(idx))  # Q3

    with mock.patch.object(mapper, '_calculate_coordinates', side_effect=mock_coordinates):
        mapper.map_to_spatial_grid(mock_nodes)

    # Ensure coordinate plane is populated
    assert len(mapper.coordinate_plane) == 20

    # Retrieve diverse nodes
    diverse_nodes = engine.get_diverse_nodes(top_n=5)

    # Ensure we get exactly top_n distinct nodes
    assert len(diverse_nodes) == 5
    assert len(set(diverse_nodes)) == 5
