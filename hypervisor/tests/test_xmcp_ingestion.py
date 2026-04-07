from pathlib import Path
import sys
import types


# Provide lightweight graphify stubs for test environment.
graphify_pkg = types.ModuleType("graphify")


detect_mod = types.ModuleType("graphify.detect")
class _FileType:
    CODE = "CODE"
    DOCUMENT = "DOCUMENT"
    PAPER = "PAPER"
    IMAGE = "IMAGE"


def _detect(root):
    root = Path(root)
    files = [str(p) for p in root.rglob("*") if p.is_file()]
    return {"files": {"code": files}}


def _detect_incremental(root):
    return _detect(root)


def _classify_file(_p):
    return _FileType.CODE


detect_mod.detect = _detect
detect_mod.detect_incremental = _detect_incremental
detect_mod.classify_file = _classify_file
detect_mod.FileType = _FileType

extract_mod = types.ModuleType("graphify.extract")
def _extract(paths):
    nodes = [{"id": f"file:{Path(p).name}", "label": Path(p).name, "type": "FILE", "data": {}} for p in paths]
    return {"nodes": nodes, "edges": [], "hyperedges": []}
extract_mod.extract = _extract

build_mod = types.ModuleType("graphify.build")
def _build(artifacts):
    import networkx as nx
    g = nx.Graph()
    for a in artifacts:
        for n in a.get("nodes", []):
            nid = n["id"]
            g.add_node(nid, **{k: v for k, v in n.items() if k != "id"})
        for e in a.get("edges", []):
            g.add_edge(e["source"], e["target"], **{k: v for k, v in e.items() if k not in ("source", "target")})
    return g
build_mod.build = _build
build_mod.build_from_json = lambda *_args, **_kwargs: _build([])

cluster_mod = types.ModuleType("graphify.cluster")
cluster_mod.cluster = lambda g: {0: list(g.nodes())} if g.number_of_nodes() else {}
cluster_mod.cohesion_score = lambda *_args, **_kwargs: 1.0

analyze_mod = types.ModuleType("graphify.analyze")
analyze_mod.god_nodes = lambda *_args, **_kwargs: []
analyze_mod.surprising_connections = lambda *_args, **_kwargs: []
analyze_mod.suggest_questions = lambda *_args, **_kwargs: []

report_mod = types.ModuleType("graphify.report")
report_mod.generate = lambda *_args, **_kwargs: ""

export_mod = types.ModuleType("graphify.export")
export_mod.to_json = lambda *_args, **_kwargs: None
export_mod.to_html = lambda *_args, **_kwargs: ""
export_mod.to_cypher = lambda *_args, **_kwargs: ""

cache_mod = types.ModuleType("graphify.cache")
cache_mod.load_cached = lambda *_args, **_kwargs: None
cache_mod.save_cached = lambda *_args, **_kwargs: None
cache_mod.check_semantic_cache = lambda files, _root: ([], [], [], files)
cache_mod.save_semantic_cache = lambda *_args, **_kwargs: None
cache_mod.clear_cache = lambda *_args, **_kwargs: None

security_mod = types.ModuleType("graphify.security")
security_mod.sanitize_label = lambda s: str(s)
security_mod.validate_graph_path = lambda p, *_args, **_kwargs: p

sys.modules["graphify"] = graphify_pkg
sys.modules["graphify.detect"] = detect_mod
sys.modules["graphify.extract"] = extract_mod
sys.modules["graphify.build"] = build_mod
sys.modules["graphify.cluster"] = cluster_mod
sys.modules["graphify.analyze"] = analyze_mod
sys.modules["graphify.report"] = report_mod
sys.modules["graphify.export"] = export_mod
sys.modules["graphify.cache"] = cache_mod
sys.modules["graphify.security"] = security_mod

from hypervisor.src.memory.xmcp_ingestion import XMCPIngester, XIngestionConfig
from hypervisor.src.memory.graph_memory import GraphMemory, GraphMemoryConfig


class _FakeToolResult:
    def __init__(self, data, *, xurl: str, cached: bool, tool_name: str):
        self.success = True
        self.data = data
        self.xurl = xurl
        self.cached = cached
        self.provenance = {"tool_name": tool_name}


class _FakeMCPClient:
    def call_tool(self, tool_name, params):
        if tool_name == "search_posts":
            return _FakeToolResult(
                {
                    "data": [
                        {
                            "id": "p1",
                            "text": "hello x world",
                            "author_id": "u1",
                            "author_username": "alice",
                            "created_at": "2026-04-07T00:00:00Z",
                            "public_metrics": {"like_count": 2, "reply_count": 1},
                        }
                    ]
                },
                xurl="https://api.x.com/2/tweets/search/recent?query=hello",
                cached=True,
                tool_name="search_posts",
            )

        if tool_name == "get_user_info":
            return _FakeToolResult(
                {
                    "data": {
                        "id": "u1",
                        "username": "alice",
                        "name": "Alice",
                        "verified": False,
                        "public_metrics": {"followers_count": 10, "following_count": 5, "tweet_count": 99},
                        "created_at": "2021-01-01T00:00:00Z",
                    }
                },
                xurl="https://api.x.com/2/users/by/username/alice",
                cached=False,
                tool_name="get_user_info",
            )

        raise AssertionError(f"Unexpected tool call: {tool_name}")


def test_xmcp_ingester_includes_provenance_fields():
    ingester = XMCPIngester(
        config=XIngestionConfig(queries=["hello"], usernames=["alice"]),
        mcp_client=_FakeMCPClient(),
    )

    extraction = ingester.ingest()[0]
    first_post = next(n for n in extraction["nodes"] if n["type"] == "X_POST")
    assert "cached" in first_post["data"]
    assert "tool_name" in first_post["data"]

    first_edge = extraction["edges"][0]
    assert "cached" in first_edge["provenance"]
    assert "tool_name" in first_edge["provenance"]


def test_graph_memory_merges_xmcp_extractions(tmp_path: Path):
    project_dir = tmp_path / "repo"
    project_dir.mkdir()
    (project_dir / "main.py").write_text("def hello():\n    return 'world'\n")

    cfg = GraphMemoryConfig(
        root_dir=tmp_path,
        output_dir=tmp_path / "graphify-out",
        enable_semantic=False,
        xmcp_queries=["hello"],
        xmcp_mock_mode=True,
    )
    memory = GraphMemory(cfg)

    graph = memory.build_persistent_graph(project_dir, incremental=False)

    assert graph.number_of_nodes() > 0
    assert any(str(node).startswith("post:") for node in graph.nodes())
