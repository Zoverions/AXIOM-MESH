"""
Knowledge Graph Memory Layer for AXIOM-MESH Hypervisor

This module wraps the graphify knowledge-graph pipeline to provide
persistent, queryable graph memory for the hypervisor's AdaptiveVariableNode
and evidence bundle systems.

Integration: Phase 1 - GraphMemory wrapper
External tool: https://github.com/safishamsi/graphify (v0.3.1)
"""
from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass, field

import networkx as nx

# Import graphify modules (vendored in /workspace/graphify_external/graphify/)
import sys
GRAPHIFY_PATH = Path(__file__).resolve().parents[3] / "graphify_external"
if str(GRAPHIFY_PATH) not in sys.path:
    sys.path.insert(0, str(GRAPHIFY_PATH))

from graphify.detect import detect, classify_file, FileType
from graphify.extract import extract as extract_ast
from graphify.build import build, build_from_json
from graphify.cluster import cluster, cohesion_score
from graphify.analyze import god_nodes, surprising_connections, suggest_questions
from graphify.report import generate as generate_report
from graphify.export import to_json, to_html, to_cypher
from graphify.cache import load_cached, save_cached, check_semantic_cache, save_semantic_cache
from graphify.security import sanitize_label, validate_graph_path

logger = logging.getLogger(__name__)


# Semantic extraction stub - in full integration this calls LLM
def extract_semantic(path: Path) -> Optional[Dict]:
    """
    Extract semantic relationships from non-code files (docs, papers, images).
    
    In the full graphify pipeline, this uses Claude/GPT-4 vision models.
    For AXIOM-MESH integration, this is a stub that returns empty results.
    Replace with actual LLM calls when PersonaPlex/BitNet integration is enabled.
    
    Args:
        path: Path to file (PDF, image, markdown, etc.)
        
    Returns:
        Extraction dict with nodes/edges, or None if not extractable
    """
    # TODO: Integrate with PersonaPlex or BitNet for semantic extraction
    # For now, return empty result - AST extraction handles code files
    return None


@dataclass
class GraphMemoryConfig:
    """Configuration for graph memory instance."""
    root_dir: Path = field(default_factory=lambda: Path("."))
    output_dir: Path = field(default_factory=lambda: Path("graphify-out"))
    enable_semantic: bool = True
    enable_clustering: bool = True
    max_nodes_for_viz: int = 5000
    cache_enabled: bool = True
    xmcp_queries: List[str] = field(default_factory=list)
    xmcp_usernames: List[str] = field(default_factory=list)
    xmcp_hashtags: List[str] = field(default_factory=list)
    xmcp_mock_mode: bool = True


@dataclass
class GraphQueryResult:
    """Result of a graph query operation."""
    nodes: List[Dict[str, Any]]
    edges: List[Dict[str, Any]]
    communities: Dict[int, List[str]]
    god_nodes: List[Dict]
    surprising_connections: List[Dict]
    suggested_questions: List[Dict]
    token_cost: Dict[str, int]


class GraphMemory:
    """
    Persistent knowledge graph memory for AXIOM-MESH hypervisor.
    
    Wraps the graphify seven-stage pipeline:
    detect() → extract() → build_graph() → cluster() → analyze() → report() → export()
    
    Provides:
    - Incremental updates with SHA256 semantic caching
    - Edge tagging (EXTRACTED/INFERRED/AMBIGUOUS) for evidence bundles
    - Community detection for AdaptiveVariableNode hierarchy
    - Token-efficient context injection (50-70x reduction on repeated runs)
    """
    
    def __init__(self, config: Optional[GraphMemoryConfig] = None):
        self.config = config or GraphMemoryConfig()
        self.root = self.config.root_dir.resolve()
        self.output_dir = self.root / self.config.output_dir
        self.graph: Optional[nx.Graph] = None
        self.communities: Dict[int, List[str]] = {}
        self.community_labels: Dict[int, str] = {}
        self._last_analysis: Dict[str, Any] = {}
        
    def build_persistent_graph(
        self,
        directory_or_artifacts: str | Path | List[Dict],
        incremental: bool = True,
    ) -> nx.Graph:
        """
        Build or update the persistent knowledge graph.
        
        Args:
            directory_or_artifacts: Path to directory to scan, or list of artifact dicts
            incremental: If True, only re-extract changed files (uses semantic cache)
            
        Returns:
            NetworkX graph with nodes, edges, and community attributes
        """
        if isinstance(directory_or_artifacts, (str, Path)):
            return self._build_from_directory(Path(directory_or_artifacts), incremental)
        else:
            return self._build_from_artifacts(directory_or_artifacts)
    
    def _build_from_directory(self, root: Path, incremental: bool) -> nx.Graph:
        """Build graph from directory scan using full graphify pipeline."""
        root = root.resolve()
        
        # Stage 1: Detect
        if incremental:
            from graphify.detect import detect_incremental
            detection = detect_incremental(root)
        else:
            detection = detect(root)
        
        all_files = []
        for ftype, files in detection["files"].items():
            all_files.extend(files)
        
        # Stage 2: Extract (two-pass: AST + semantic)
        extractions = []
        uncached_files = []
        
        if self.config.cache_enabled and self.config.enable_semantic:
            # Check cache first
            cached_nodes, cached_edges, cached_hyperedges, uncached = \
                check_semantic_cache(all_files, root)
            uncached_files = uncached
            
            # Add cached results
            if cached_nodes or cached_edges:
                extractions.append({
                    "nodes": cached_nodes,
                    "edges": cached_edges,
                    "hyperedges": cached_hyperedges or [],
                })
        else:
            uncached_files = all_files
        
        # Extract uncached files (group by language for batch extraction)
        from collections import defaultdict
        files_by_suffix = defaultdict(list)
        
        for file_path in uncached_files:
            p = Path(file_path)
            if not p.exists():
                continue
            ftype = classify_file(p)
            
            # Pass 1: AST extraction (deterministic, no LLM) - batch by language
            if ftype == FileType.CODE:
                files_by_suffix[p.suffix].append(p)
            
            # Pass 2: Semantic extraction (LLM-based, for non-code + enrichment)
            if self.config.enable_semantic and ftype in (FileType.DOCUMENT, FileType.PAPER, FileType.IMAGE):
                semantic_result = extract_semantic(p)
                if semantic_result:
                    extractions.append(semantic_result)
                    if self.config.cache_enabled:
                        save_semantic_cache(
                            semantic_result.get("nodes", []),
                            semantic_result.get("edges", []),
                            semantic_result.get("hyperedges"),
                            root
                        )
        
        # Batch extract code files by language
        for suffix, paths in files_by_suffix.items():
            if paths:
                ast_result = extract_ast(paths)
                if ast_result and "error" not in ast_result:
                    extractions.append(ast_result)
                    # Cache each file individually
                    for p in paths:
                        save_cached(p, ast_result, root)
        
        # Stage 2b: Ingest XMCP X data into the same extraction stream
        if self.config.xmcp_queries or self.config.xmcp_usernames or self.config.xmcp_hashtags:
            try:
                from .xmcp_ingestion import ingest_x_data
                x_extractions = ingest_x_data(
                    queries=self.config.xmcp_queries,
                    usernames=self.config.xmcp_usernames,
                    hashtags=self.config.xmcp_hashtags,
                    mock_mode=self.config.xmcp_mock_mode,
                )
                if x_extractions:
                    extractions.extend(x_extractions)
            except Exception as exc:
                # Fail-open: local graphify extraction still proceeds
                logger.warning(f"XMCP ingestion skipped due to error: {exc}")

        # Stage 3: Build graph
        if not extractions:
            # Return empty graph if nothing to process
            self.graph = nx.Graph()
        else:
            self.graph = build(extractions)
        
        # Stage 4: Cluster (community detection)
        if self.config.enable_clustering and self.graph.number_of_nodes() > 0:
            self.communities = cluster(self.graph)
            self.community_labels = self._generate_community_labels()
            
            # Add community attribute to nodes
            node_community = {n: cid for cid, nodes in self.communities.items() for n in nodes}
            for node_id, cid in node_community.items():
                if self.graph.has_node(node_id):
                    self.graph.nodes[node_id]["community"] = cid
        
        # Stage 5: Analyze
        self._last_analysis = self._run_analysis()
        
        # Stage 6 & 7: Export (optional, for persistence)
        self._export_graph()
        
        return self.graph
    
    def _build_from_artifacts(self, artifacts: List[Dict]) -> nx.Graph:
        """Build graph from pre-extracted artifact dicts."""
        self.graph = build(artifacts)
        
        if self.config.enable_clustering and self.graph.number_of_nodes() > 0:
            self.communities = cluster(self.graph)
            self.community_labels = self._generate_community_labels()
            
            node_community = {n: cid for cid, nodes in self.communities.items() for n in nodes}
            for node_id, cid in node_community.items():
                if self.graph.has_node(node_id):
                    self.graph.nodes[node_id]["community"] = cid
        
        self._last_analysis = self._run_analysis()
        return self.graph
    
    def _generate_community_labels(self) -> Dict[int, str]:
        """Generate human-readable labels for communities."""
        if not self.communities or not self.graph:
            return {}
        
        labels = {}
        for cid, nodes in self.communities.items():
            # Use top-connected node's label as community name
            degrees = [(n, self.graph.degree(n)) for n in nodes]
            degrees.sort(key=lambda x: x[1], reverse=True)
            if degrees:
                top_node = degrees[0][0]
                label = self.graph.nodes[top_node].get("label", f"Community {cid}")
                labels[cid] = sanitize_label(label)[:50]
            else:
                labels[cid] = f"Community {cid}"
        return labels
    
    def _run_analysis(self) -> Dict[str, Any]:
        """Run graph analysis (god nodes, surprises, questions)."""
        if not self.graph or self.graph.number_of_nodes() == 0:
            return {}
        
        result = {
            "god_nodes": god_nodes(self.graph),
            "surprising_connections": surprising_connections(self.graph, self.communities),
            "suggested_questions": suggest_questions(
                self.graph, self.communities, self.community_labels
            ),
        }
        return result
    
    def _export_graph(self) -> None:
        """Export graph to JSON, HTML, and Cypher formats."""
        if not self.graph or not self.output_dir:
            return
        
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        # JSON export (queryable)
        to_json(self.graph, self.communities, str(self.output_dir / "graph.json"))
        
        # HTML visualization (if small enough)
        if self.graph.number_of_nodes() <= self.config.max_nodes_for_viz:
            try:
                to_html(
                    self.graph,
                    self.communities,
                    str(self.output_dir / "graph.html"),
                    self.community_labels
                )
            except ValueError:
                pass  # Graph too large for viz
        
        # Cypher export (Neo4j)
        to_cypher(self.graph, str(self.output_dir / "graph.cypher"))
    
    def query_graph(
        self,
        node_ids: Optional[List[str]] = None,
        community_ids: Optional[List[int]] = None,
        relation_types: Optional[List[str]] = None,
        confidence_filter: Optional[List[str]] = None,
    ) -> GraphQueryResult:
        """
        Query the graph with filters.
        
        Args:
            node_ids: Filter to specific node IDs
            community_ids: Filter to specific communities
            relation_types: Filter edge types (e.g., ["imports", "calls"])
            confidence_filter: Filter edge confidence (e.g., ["EXTRACTED", "INFERRED"])
            
        Returns:
            GraphQueryResult with filtered nodes, edges, and analysis
        """
        if not self.graph:
            raise RuntimeError("Graph not built yet. Call build_persistent_graph() first.")
        
        # Filter nodes
        if node_ids:
            nodes = [
                {"id": nid, **self.graph.nodes[nid]}
                for nid in node_ids
                if self.graph.has_node(nid)
            ]
        elif community_ids:
            node_set = set()
            for cid in community_ids:
                node_set.update(self.communities.get(cid, []))
            nodes = [
                {"id": nid, **self.graph.nodes[nid]}
                for nid in node_set
                if self.graph.has_node(nid)
            ]
        else:
            nodes = [
                {"id": nid, **data}
                for nid, data in self.graph.nodes(data=True)
            ]
        
        # Filter edges
        edges = []
        for u, v, data in self.graph.edges(data=True):
            if relation_types and data.get("relation") not in relation_types:
                continue
            if confidence_filter and data.get("confidence") not in confidence_filter:
                continue
            edges.append({
                "source": u,
                "target": v,
                **data
            })
        
        return GraphQueryResult(
            nodes=nodes,
            edges=edges,
            communities=self.communities,
            god_nodes=self._last_analysis.get("god_nodes", []),
            surprising_connections=self._last_analysis.get("surprising_connections", []),
            suggested_questions=self._last_analysis.get("suggested_questions", []),
            token_cost={"input": 0, "output": 0},  # TODO: track from extraction
        )
    
    def get_context_for_planning(
        self,
        current_state: Dict[str, Any],
        top_k: int = 10,
    ) -> Dict[str, Any]:
        """
        Get enriched context for LLM planning step.
        
        Injects top-k god nodes and surprising connections as structured context.
        Achieves 50-70x token reduction on repeated planning cycles.
        
        Args:
            current_state: Current execution state from planner
            top_k: Number of god nodes / surprises to include
            
        Returns:
            Context dict ready for LLM injection
        """
        if not self.graph:
            return {"error": "Graph not available"}
        
        god_list = self._last_analysis.get("god_nodes", [])[:top_k]
        surprise_list = self._last_analysis.get("surprising_connections", [])[:top_k]
        questions = self._last_analysis.get("suggested_questions", [])[:5]
        
        return {
            "graph_context": {
                "core_abstractions": [
                    {"id": g["id"], "label": g["label"], "connections": g["edges"]}
                    for g in god_list
                ],
                "non_obvious_connections": [
                    {
                        "source": s["source"],
                        "target": s["target"],
                        "relation": s.get("relation", ""),
                        "confidence": s.get("confidence", "EXTRACTED"),
                        "why": s.get("why", s.get("note", "")),
                    }
                    for s in surprise_list
                ],
                "suggested_questions": [
                    {"question": q["question"], "type": q["type"]}
                    for q in questions
                    if q.get("question")
                ],
            },
            "stats": {
                "total_nodes": self.graph.number_of_nodes(),
                "total_edges": self.graph.number_of_edges(),
                "communities": len(self.communities),
            },
        }
    
    def get_edge_tags_for_evidence(self) -> List[Dict[str, Any]]:
        """
        Extract tagged edges for evidence bundles.
        
        Returns edges with EXTRACTED/INFERRED/AMBIGUOUS tags
        and confidence scores for zkML attestation.
        
        Returns:
            List of edge dicts with edge_type and confidence fields
        """
        if not self.graph:
            return []
        
        tagged_edges = []
        for u, v, data in self.graph.edges(data=True):
            confidence = data.get("confidence", "EXTRACTED")
            
            # Map confidence to edge_type enum
            if confidence == "EXTRACTED":
                edge_type = "EXTRACTED"
                confidence_score = 1.0
            elif confidence == "INFERRED":
                edge_type = "INFERRED"
                confidence_score = data.get("confidence_score", 0.5)
            else:  # AMBIGUOUS
                edge_type = "AMBIGUOUS"
                confidence_score = data.get("confidence_score", 0.2)
            
            tagged_edges.append({
                "source": u,
                "target": v,
                "relation": data.get("relation", ""),
                "edge_type": edge_type,
                "confidence": confidence_score,
                "source_file": data.get("source_file", ""),
                "source_location": data.get("source_location", ""),
                "provenance": {
                    "graph_version": "0.3.1",
                    "extraction_method": "graphify_pipeline",
                }
            })
        
        return tagged_edges
    
    def compute_graph_hash(self) -> str:
        """Compute SHA256 hash of current graph state for versioning."""
        if not self.graph:
            return hashlib.sha256(b"empty_graph").hexdigest()
        
        # Serialize deterministically
        data = {
            "nodes": sorted([
                {"id": nid, **data}
                for nid, data in self.graph.nodes(data=True)
            ], key=lambda x: x["id"]),
            "edges": sorted([
                {"source": u, "target": v, **data}
                for u, v, data in self.graph.edges(data=True)
            ], key=lambda x: (x["source"], x["target"])),
        }
        
        serialized = json.dumps(data, sort_keys=True).encode()
        return hashlib.sha256(serialized).hexdigest()
    
    def clear_cache(self) -> None:
        """Clear the semantic cache."""
        from graphify.cache import clear_cache
        clear_cache(self.root)


# Convenience function for direct use
def build_persistent_graph(
    directory: str | Path,
    output_dir: Optional[str | Path] = None,
    incremental: bool = True,
    enable_semantic: bool = True,
) -> nx.Graph:
    """
    Build a persistent knowledge graph from a directory.
    
    Convenience wrapper for quick integration.
    
    Args:
        directory: Root directory to scan
        output_dir: Output directory for graph artifacts (default: ./graphify-out)
        incremental: Use semantic caching for incremental updates
        enable_semantic: Enable LLM-based semantic extraction
        
    Returns:
        NetworkX graph
    """
    config = GraphMemoryConfig(
        root_dir=Path(directory).resolve().parent if isinstance(directory, (str, Path)) else Path("."),
        output_dir=Path(output_dir) if output_dir else Path("graphify-out"),
        enable_semantic=enable_semantic,
    )
    
    memory = GraphMemory(config)
    return memory.build_persistent_graph(directory, incremental=incremental)
