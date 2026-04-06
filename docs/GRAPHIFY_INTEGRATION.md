# AXIOM-MESH Knowledge Graph Integration

**External Tool:** [graphify v0.3.1](https://github.com/safishamsi/graphify)  
**Integration Date:** April 6, 2026  
**Status:** Phase 1 Complete - GraphMemory wrapper implemented

## Overview

This integration adds production-grade knowledge graph capabilities to AXIOM-MESH using the audited external graphify tool. The integration provides:

- **Persistent graph memory** for the hypervisor (50-70x token reduction on repeated planning)
- **Edge tagging system** (EXTRACTED/INFERRED/AMBIGUOUS) for evidence bundles
- **Two-pass extraction** (AST + semantic) for sandbox pre-execution analysis
- **Semantic caching** with SHA256 hashing
- **Security hardening** (SSRF/XSS/path traversal protection)

## Vendored External Tool

The graphify repository is vendored at `/workspace/graphify_external/`

**Core modules used:**
- `graphify/detect.py` - File type detection
- `graphify/extract.py` - AST extraction (tree-sitter for 17 languages)
- `graphify/build.py` - NetworkX graph construction
- `graphify/cluster.py` - Leiden community detection
- `graphify/analyze.py` - God nodes, surprising connections, suggested questions
- `graphify/report.py` - Human-readable audit reports
- `graphify/export.py` - JSON/HTML/Cypher exports
- `graphify/cache.py` - Semantic caching layer
- `graphify/security.py` - Security helpers (copied to shared/src/security/)

## Implementation Status

### Phase 1 (Complete) ✅

#### 1. GraphMemory Wrapper
**File:** `hypervisor/src/memory/graph_memory.py`

```python
from hypervisor.src.memory.graph_memory import GraphMemory, build_persistent_graph

# Quick start
graph = build_persistent_graph("/path/to/codebase")

# Full control
from hypervisor.src.memory.graph_memory import GraphMemory, GraphMemoryConfig

config = GraphMemoryConfig(
    root_dir=Path("/path/to/project"),
    enable_semantic=True,
    enable_clustering=True,
    cache_enabled=True,
)
memory = GraphMemory(config)
graph = memory.build_persistent_graph("/path/to/codebase", incremental=True)

# Query for planning context
context = memory.get_context_for_planning(current_state, top_k=10)

# Get tagged edges for evidence bundles
tagged_edges = memory.get_edge_tags_for_evidence()
```

**Features:**
- Seven-stage pipeline: detect → extract → build → cluster → analyze → report → export
- Incremental updates with semantic caching
- Community detection for AdaptiveVariableNode hierarchy
- Edge tagging for zkML attestation

#### 2. Security Module
**File:** `shared/src/security/graph_safe.py`

Copied verbatim from graphify/security.py:
- `validate_url()` - SSRF protection
- `sanitize_label()` - XSS protection  
- `validate_graph_path()` - Path traversal protection
- `safe_fetch()` / `safe_fetch_text()` - Size-limited fetching

### Phase 2 (Pending) 🔄

#### 3. Evidence Bundle Schema Extension
**TODO:** Update evidence schemas with edge tagging fields

Add to evidence bundle schemas:
```json
{
  "edge_type": "EXTRACTED | INFERRED | AMBIGUOUS",
  "confidence": 0.0-1.0,
  "provenance": {
    "graph_version": "0.3.1",
    "extraction_method": "graphify_pipeline"
  }
}
```

#### 4. Sandbox Pre-Execution Analysis
**TODO:** Create `sandbox/src/analysis/pre_execution.py`

```python
from hypervisor.src.memory.graph_memory import GraphMemory

def pre_execution_analyze(capability_dir: Path) -> dict:
    """Analyze capability before Docker execution."""
    memory = GraphMemory()
    graph = memory.build_persistent_graph(capability_dir, incremental=False)
    
    # Extract risk indicators from AST
    risk_score = compute_risk_score(graph)
    return {
        "risk_score": risk_score,
        "graph_hash": memory.compute_graph_hash(),
        "tagged_edges": memory.get_edge_tags_for_evidence(),
    }
```

#### 5. Semantic Cache Service
**TODO:** Create `hypervisor/src/cache/semantic_cache.py`

Global cache service mirroring graphify's SHA256 + graph-diff logic.

### Phase 3 (Pending) 🔄

#### 6. Gateway Visualization
**TODO:** Add `/graph/viz` endpoint to Gateway

Pipe graphify's HTML export into existing dashboard stack.

#### 7. Git Hooks
**TODO:** Copy pattern from `graphify_external/graphify/hooks.py`

Auto-rebuild graph on capability repo commits.

## Dependencies

Add to `hypervisor/requirements.txt`:

```txt
# Knowledge graph integration (graphify v0.3.1)
networkx
graspologic
tree-sitter
tree-sitter-python
tree-sitter-javascript
tree-sitter-typescript
tree-sitter-go
tree-sitter-rust
tree-sitter-java
tree-sitter-c
tree-sitter-cpp
tree-sitter-ruby
tree-sitter-c-sharp
tree-sitter-kotlin
tree-sitter-scala
tree-sitter-php
tree-sitter-swift
tree-sitter-lua

# Optional
watchdog  # watch mode
pypdf     # PDF support
html2text # HTML ingestion
```

## Testing

Use graphify's worked examples as test fixtures:

```bash
# Test with Karpathy repos
pytest hypervisor/tests/test_graph_memory.py \
  --test-data=/workspace/graphify_external/worked/karpathy-repos

# Test with mixed corpus
pytest hypervisor/tests/test_graph_memory.py \
  --test-data=/workspace/graphify_external/worked/mixed-corpus
```

## Pipeline Flow

```
┌─────────────┐
│   detect()  │  File discovery & type classification
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  extract()  │  Two-pass: AST (deterministic) + Semantic (LLM)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ build_graph()│  NetworkX construction + edge merging
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  cluster()  │  Leiden community detection
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  analyze()  │  God nodes, surprises, questions
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  report()   │  GRAPH_REPORT.md generation
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  export()   │  JSON/HTML/Cypher output
└─────────────┘
```

## Edge Tagging System

| Label      | Meaning                          | Confidence Score | Use in Mesh              |
|------------|----------------------------------|------------------|--------------------------|
| EXTRACTED  | Explicit in source (AST)         | 1.0              | Deterministic proof      |
| INFERRED   | LLM deduction                    | 0.5 (default)    | zkML-audited inference   |
| AMBIGUOUS  | Uncertain relationship           | 0.2              | Human review escalation  |

## Token Efficiency

Expected savings from semantic caching:
- **First run:** Full extraction cost
- **Subsequent runs:** 50-70x token reduction (only changed files re-extracted)
- **Incremental mode:** Re-extract only modified files since last run

## Security Considerations

All external inputs must route through `shared/src/security/graph_safe.py`:

```python
from shared.src.security.graph_safe import validate_url, sanitize_label, validate_graph_path

# URL ingestion (Gateway/Sandbox)
url = validate_url(user_provided_url)

# Node labels (visualization)
safe_label = sanitize_label(raw_label)

# Path access (query API)
safe_path = validate_graph_path(requested_path, base=GRAPH_OUTPUT_DIR)
```

## Next Steps

1. **Add dependencies** to hypervisor/requirements.txt
2. **Create unit tests** in hypervisor/tests/test_graph_memory.py
3. **Wire into planner** - call `get_context_for_planning()` before LLM steps
4. **Update evidence schemas** with edge tagging fields
5. **Implement Sandbox pre-analysis** hook in Docker broker
6. **Add Gateway viz endpoint** for interactive exploration

## References

- [Graphify Repository](https://github.com/safishamsi/graphify)
- [Graphify Architecture](/workspace/graphify_external/ARCHITECTURE.md)
- [Graphify README](/workspace/graphify_external/README.md)
- [AXIOM-MESH Integration Guide](internal://knowledge-graph-integration-guide)
