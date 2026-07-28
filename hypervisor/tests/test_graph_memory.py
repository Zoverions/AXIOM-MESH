"""
Unit tests for GraphMemory integration with graphify pipeline.

Uses graphify_external/worked/ example corpora as test fixtures.
Tests cover:
- Basic graph construction
- Incremental updates with caching
- Edge tagging for evidence bundles
- Community detection
- Query filtering
"""
import pytest
from pathlib import Path
import sys

# Add graphify_external to path for testing
GRAPHIFY_PATH = Path(__file__).parent.parent.parent.parent / "graphify_external"
if str(GRAPHIFY_PATH) not in sys.path:
    sys.path.insert(0, str(GRAPHIFY_PATH))

from hypervisor.src.memory.graph_memory import (
    GraphMemory,
    GraphMemoryConfig,
    build_persistent_graph,
)


class TestGraphMemoryBasic:
    """Test basic graph construction and querying."""
    
    @pytest.fixture
    def test_data_dir(self):
        """Use graphify's worked example as test fixture."""
        return GRAPHIFY_PATH / "worked" / "example"
    
    @pytest.fixture
    def memory_instance(self, tmp_path):
        """Create a GraphMemory instance with temp output dir."""
        config = GraphMemoryConfig(
            root_dir=tmp_path,
            output_dir=tmp_path / "graphify-out",
            enable_semantic=False,  # Disable LLM for speed
            enable_clustering=True,
            cache_enabled=True,
        )
        return GraphMemory(config)
    
    def test_build_from_directory(self, memory_instance, test_data_dir):
        """Test building graph from directory scan."""
        if not test_data_dir.exists():
            pytest.skip(f"Test data dir not found: {test_data_dir}")
        
        graph = memory_instance.build_persistent_graph(test_data_dir, incremental=False)
        
        assert graph is not None
        assert graph.number_of_nodes() > 0
        assert graph.number_of_edges() > 0
        assert len(memory_instance.communities) > 0
    
    def test_incremental_build(self, memory_instance, test_data_dir):
        """Test incremental build with caching."""
        if not test_data_dir.exists():
            pytest.skip(f"Test data dir not found: {test_data_dir}")
        
        # First build
        graph1 = memory_instance.build_persistent_graph(test_data_dir, incremental=True)
        nodes1 = graph1.number_of_nodes()
        
        # Second build (should use cache)
        graph2 = memory_instance.build_persistent_graph(test_data_dir, incremental=True)
        nodes2 = graph2.number_of_nodes()
        
        # Node count should be identical
        assert nodes1 == nodes2
    
    def test_query_graph(self, memory_instance, test_data_dir):
        """Test graph querying with filters."""
        if not test_data_dir.exists():
            pytest.skip(f"Test data dir not found: {test_data_dir}")
        
        memory_instance.build_persistent_graph(test_data_dir, incremental=False)
        
        # Query all
        result = memory_instance.query_graph()
        assert len(result.nodes) > 0
        assert len(result.edges) > 0
        
        # Query by confidence filter
        extracted_only = memory_instance.query_graph(
            confidence_filter=["EXTRACTED"]
        )
        for edge in extracted_only.edges:
            assert edge.get("confidence") == "EXTRACTED"
    
    def test_get_context_for_planning(self, memory_instance, test_data_dir):
        """Test context extraction for LLM planning."""
        if not test_data_dir.exists():
            pytest.skip(f"Test data dir not found: {test_data_dir}")
        
        memory_instance.build_persistent_graph(test_data_dir, incremental=False)
        
        context = memory_instance.get_context_for_planning(
            current_state={"step": "test"},
            top_k=5
        )
        
        assert "graph_context" in context
        assert "core_abstractions" in context["graph_context"]
        assert "non_obvious_connections" in context["graph_context"]
        assert "stats" in context
        assert context["stats"]["total_nodes"] > 0
    
    def test_edge_tags_for_evidence(self, memory_instance, test_data_dir):
        """Test edge tagging for evidence bundles."""
        if not test_data_dir.exists():
            pytest.skip(f"Test data dir not found: {test_data_dir}")
        
        memory_instance.build_persistent_graph(test_data_dir, incremental=False)
        
        tagged_edges = memory_instance.get_edge_tags_for_evidence()
        
        assert len(tagged_edges) > 0
        for edge in tagged_edges:
            assert "edge_type" in edge
            assert edge["edge_type"] in ["EXTRACTED", "INFERRED", "AMBIGUOUS"]
            assert "confidence" in edge
            assert 0.0 <= edge["confidence"] <= 1.0
            assert "provenance" in edge
    
    def test_compute_graph_hash(self, memory_instance, test_data_dir):
        """Test deterministic graph hashing for versioning."""
        if not test_data_dir.exists():
            pytest.skip(f"Test data dir not found: {test_data_dir}")
        
        memory_instance.build_persistent_graph(test_data_dir, incremental=False)
        
        hash1 = memory_instance.compute_graph_hash()
        hash2 = memory_instance.compute_graph_hash()
        
        # Hash should be deterministic
        assert hash1 == hash2
        assert len(hash1) == 64  # SHA256 hex length


class TestBuildPersistentGraphFunction:
    """Test the convenience wrapper function."""
    
    def test_convenience_function(self, tmp_path, test_data_dir):
        """Test build_persistent_graph() wrapper."""
        if not test_data_dir.exists():
            pytest.skip(f"Test data dir not found: {test_data_dir}")
        
        output_dir = tmp_path / "graph-output"
        graph = build_persistent_graph(
            directory=test_data_dir,
            output_dir=output_dir,
            incremental=False,
            enable_semantic=False,
        )
        
        assert graph is not None
        assert graph.number_of_nodes() > 0
        assert (output_dir / "graph.json").exists()


class TestEdgeCases:
    """Test edge cases and error handling."""
    
    def test_empty_directory(self, memory_instance, tmp_path):
        """Test handling of empty directory."""
        empty_dir = tmp_path / "empty"
        empty_dir.mkdir()
        
        graph = memory_instance.build_persistent_graph(empty_dir, incremental=False)
        
        assert graph is not None
        assert graph.number_of_nodes() == 0
    
    def test_query_before_build(self, memory_instance):
        """Test querying before graph is built."""
        with pytest.raises(RuntimeError, match="Graph not built yet"):
            memory_instance.query_graph()
    
    def test_context_before_build(self, memory_instance):
        """Test getting context before graph is built."""
        context = memory_instance.get_context_for_planning({})
        assert "error" in context


@pytest.fixture
def test_data_dir():
    return GRAPHIFY_PATH / "worked" / "example"
