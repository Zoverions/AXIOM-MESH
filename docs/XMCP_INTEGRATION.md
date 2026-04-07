# XMCP Integration - X (Twitter) Native Agent Layer

**Integration Date:** April 7, 2026  
**Status:** Phase 1 Complete - XMCP Client + Gateway Adapter implemented  
**Official Docs:** https://docs.x.com, https://developer.twitter.com

## Overview

This integration adds native X (Twitter) capabilities to AXIOM-MESH agents through:

1. **XMCP Server** - Model Context Protocol endpoint for X API tools
2. **xurl Pattern** - Agent-optimized short-form URLs that auto-resolve to full X API calls
3. **Official XDKs** - Python (tweepy) for Hypervisor, TypeScript (twitter-api-v2) for Gateway
4. **Semantic Caching** - SHA256 caching of tool responses via Graphify cache layer
5. **Provenance Tagging** - Full xurl provenance in evidence bundles for zkML attestation

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    AXIOM-MESH Agent Mesh                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │  Hypervisor  │    │   Gateway    │    │    Grid      │      │
│  │   (Python)   │    │ (TypeScript) │    │  (Evidence)  │      │
│  │              │    │              │    │              │      │
│  │ ┌──────────┐ │    │ ┌──────────┐ │    │ ┌──────────┐ │      │
│  │ │ XMCP     │ │    │ │ X        │ │    │ │ Security │ │      │
│  │ │ Client   │ │◄──►│ │ Adapter  │ │◄──►│ │ graph_   │ │      │
│  │ │          │ │    │ │          │ │    │ │ safe.py  │ │      │
│  │ └──────────┘ │    │ └──────────┘ │    │ └──────────┘ │      │
│  │      │       │    │              │    │              │      │
│  │ ┌────▼──────┐│    │ ┌──────────┐ │    │ ┌──────────┐ │      │
│  │ │ Adaptive  ││    │ │ twitter- │ │    │ │ Evidence │ │      │
│  │ │ Variable  ││    │ │ api-v2   │ │    │ │ Bundles  │ │      │
│  │ │ Node      ││    │ └──────────┘ │    │ └──────────┘ │      │
│  │ └───────────┘│    │              │    │              │      │
│  └──────────────┘    └──────────────┘    └──────────────┘      │
│         │                   │                   │               │
│         └───────────────────┼───────────────────┘               │
│                             │                                   │
│                    ┌────────▼────────┐                          │
│                    │   X API (MCP)   │                          │
│                    │   /mcp endpoint │                          │
│                    └─────────────────┘                          │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation Status

### Phase 1 (Complete) ✅

#### 1. XMCP Client (Hypervisor - Python)
**File:** `hypervisor/src/agents/mcp_client.py`

```python
from hypervisor.src.agents.mcp_client import XMCPClient, xmcp_discover, xmcp_call

# Discover available X tools
tools = await xmcp_discover(intent_keywords=["search", "trends"])

# Call a tool with automatic caching and provenance
response = await xmcp_call("search_posts", {"query": "#AXIOMMesh", "max_results": 10})

print(f"Found {len(response.data)} posts")
print(f"Provenance: {response.provenance}")  # Includes xurl, cached status, timestamp
```

**Features:**
- Tool discovery via MCP `tools/list` pattern
- 6 built-in X tools: `search_posts`, `get_post_thread`, `get_user_posts`, `get_trends`, `publish_content`, `get_user_info`
- Semantic caching with SHA256 keys (reuses Graphify cache logic)
- Rate limit management (80% buffer before backing off)
- Mock mode for development without API credentials

#### 2. Planning Orchestrator with XMCP Injection
**File:** `hypervisor/src/orchestrator/planner.py`

```python
from hypervisor.src.orchestrator.planner import PlanningOrchestrator, xmcp_enriched_plan

orchestrator = PlanningOrchestrator(enable_xmcp=True)

# Prepare planning context with filtered X tools
context = await orchestrator.prepare_planning_context(
    intent_keywords=["social", "marketing", "trends"],
    max_tools=3,  # Keep context under 1k tokens
)

# Execute full planning step with XMCP + Graphify integration
planning_result = await orchestrator.execute_planning_step(
    intent={"description": "Post about our launch", "goals": ["reach", "engagement"]},
    graph_context=graph_memory.get_context_for_planning(current_state),
)
```

**Features:**
- Filters X tools to only those relevant for current intent
- Mirrors Cloudflare's Code Mode MCP pattern (token-efficient context injection)
- Merges XMCP tools with Graphify graph context
- Automatic keyword extraction from intent text

#### 3. AdaptiveVariableNode Extension
**File:** `hypervisor/core/adaptive_node.py`

```python
from hypervisor.core.adaptive_node import AdaptiveVariableNode

node = AdaptiveVariableNode(
    hypervisor=hypervisor,
    pulse_system=pulse,
    grid_ledger=ledger,
    xmcp_tools=["search_posts", "get_trends"],  # X tools available to this node
)

# Configure tools dynamically after planner discovery
node.set_xmcp_tools(["search_posts", "publish_content"])
```

**Features:**
- Added `xmcp_tools: list[str]` field
- Methods: `set_xmcp_tools()`, `get_xmcp_tools()`
- Tools configured by planner after `xmcp_discover()` call

#### 4. X Channel Adapter (Gateway - TypeScript)
**File:** `gateway/src/channels/x_adapter.ts`

```typescript
import { XAdapter } from './channels/x_adapter';

const adapter = new XAdapter({
    bearerToken: process.env.X_BEARER_TOKEN,
});

await adapter.connect();

// Search posts
const results = await adapter.searchPosts('#AXIOMMesh', 10);

// Get user info
const user = await adapter.getUserInfo('elonmusk');

// Publish content
const tweetId = await adapter.sendMessage('', 'Hello from AXIOM-MESH!');
```

**Features:**
- Extends `BaseChannel` for consistency with Discord/Slack/Telegram adapters
- xurl patterns for all common X operations
- Rate limit tracking per endpoint
- Mock mode for development/testing
- Official `twitter-api-v2` package dependency

#### 5. Dependencies Updated
**Files:** 
- `hypervisor/requirements.txt` - Added `tweepy>=4.14.0`
- `gateway/package.json` - Added `twitter-api-v2@^1.22.0`

### Phase 2 (In Progress) 🔄

#### 6. Graphify Pipeline + XMCP Synergy
**TODO:** Extend Graphify pipeline to ingest live X data

Update `hypervisor/src/memory/graph_memory.py`:
```python
from hypervisor.src.agents.mcp_client import xmcp_call

async def fetch_x_corpus(query: str, max_posts: int = 100) -> List[Dict]:
    """Fetch X posts for Graphify ingestion."""
    response = await xmcp_call("search_posts", {
        "query": query,
        "max_results": min(max_posts, 100),
    })
    return response.data if response.success else []

# Wire into build_persistent_graph()
# Tag X-sourced edges as EXTRACTED (direct API) or INFERRED (agent analysis)
```

**Expected behavior:**
- `detect()` + `extract()` → Add XMCP fetch step for X posts/threads
- `build_graph()` → Auto-tag X-sourced edges with `source: "xmcp"` + xurl provenance
- `cluster()` / `analyze()` → Surface X-specific god-nodes (viral threads, key accounts)
- Output in `GRAPH_REPORT.md` includes X corpus analysis

#### 7. Evidence Schema Extension
**TODO:** Update evidence schemas with XMCP provenance fields

Add to evidence bundle schemas (`schemas/*.json`):
```json
{
  "provenance": {
    "source": "xmcp",
    "xurl": "https://api.x.com/2/tweets/search/recent?query={query}",
    "cached": false,
    "timestamp": "2026-04-07T00:00:00Z",
    "tool_name": "search_posts"
  },
  "edge_type": "EXTRACTED | INFERRED | AMBIGUOUS",
  "confidence": 0.0-1.0
}
```

### Phase 3 (Pending) 🔄

#### 8. Security Hardening (Grid)
**TODO:** Route XMCP calls through `shared/src/security/graph_safe.py`

All XMCP tool responses should pass through existing security functions:
- `validate_url()` - SSRF protection for any URLs in X responses
- `sanitize_label()` - XSS protection for post text/user names
- `validate_graph_path()` - Path traversal protection for cached files

#### 9. API Playground (Local Dev)
**TODO:** Add mock X server to Docker Compose

```yaml
# docker-compose.yml
services:
  xmcp-mock:
    image: axiom-mesh/xmcp-mock:latest
    ports:
      - "8001:8000"
    environment:
      - MOCK_POSTS=100
      - MOCK_TRENDS=10
```

Agents test against realistic X data with zero credit cost.

#### 10. Gateway Registration
**TODO:** Register X adapter in channel registry

Update `gateway/src/channels/index.ts`:
```typescript
import { registerChannel } from './registry';
import { createXAdapter } from './x_adapter';

registerChannel('x-twitter', createXAdapter);
```

## Configuration

### Environment Variables

**Hypervisor (Python):**
```bash
# X API Credentials (optional - mock mode if not set)
export X_API_KEY="your_api_key"
export X_API_SECRET="your_api_secret"
export X_BEARER_TOKEN="your_bearer_token"
export X_ACCESS_TOKEN="your_access_token"
export X_ACCESS_TOKEN_SECRET="your_access_token_secret"

# Force mock mode for development
export X_MOCK_MODE=true

# XMCP endpoint
export MCP_SERVERS="http://localhost:8000/mcp"
```

**Gateway (TypeScript):**
```bash
# X API Credentials
export X_BEARER_TOKEN="your_bearer_token"
export X_API_KEY="your_api_key"
export X_API_SECRET="your_api_secret"
export X_ACCESS_TOKEN="your_access_token"
export X_ACCESS_TOKEN_SECRET="your_access_token_secret"

# Mock mode
export X_MOCK_MODE=true
```

### Cache Configuration

XMCP uses Graphify's semantic cache by default:
- **Location:** `~/.axiom-mesh/xmcp-cache/`
- **TTL:** 24 hours (configurable via `XMCPConfig.cache_ttl_hours`)
- **Key:** SHA256 hash of `{tool_name, params}`
- **Format:** JSON with `_cached_at` timestamp and `_response` data

## Available X Tools

| Tool Name | Description | Rate Limit (15min) | xurl Pattern |
|-----------|-------------|-------------------|--------------|
| `search_posts` | Search for posts matching query | 300 | `/2/tweets/search/recent` |
| `get_post_thread` | Get post thread by ID | 300 | `/2/tweets/{id}` |
| `get_user_posts` | Get posts by username | 300 | `/2/users/by/username/{username}/tweets` |
| `get_trends` | Get trending topics | 75 | `/1.1/trends/place.json` |
| `publish_content` | Publish a new post | 200 | `/2/tweets` |
| `get_user_info` | Get user profile | 300 | `/2/users/by/username/{username}` |

## Testing

### Unit Tests (Python)
```bash
cd /workspace/hypervisor
pytest tests/test_mcp_client.py -v
```

### Unit Tests (TypeScript)
```bash
cd /workspace/gateway
npm test -- x_adapter.test.ts
```

### Manual Test (Mock Mode)
```python
import asyncio
from hypervisor.src.agents.mcp_client import XMCPClient

async def test():
    client = XMCPClient()
    
    # Test tool discovery
    tools = await client.discover_tools()
    print(f"Available tools: {[t['name'] for t in tools]}")
    
    # Test search (mock)
    response = await client.call_tool("search_posts", {"query": "#AI"})
    print(f"Search results: {response.data}")
    print(f"Provenance: {response.provenance}")
    
    # Test caching
    response2 = await client.call_tool("search_posts", {"query": "#AI"})
    print(f"Cached: {response2.cached}")

asyncio.run(test())
```

## Security Considerations

1. **API Credential Management**: Store X API credentials in secure vault (HashiCorp Vault, AWS Secrets Manager)
2. **Rate Limiting**: Built-in 80% buffer prevents hitting hard limits
3. **SSRF Protection**: All URLs in X responses validated via `graph_safe.validate_url()`
4. **XSS Protection**: Post text sanitized via `graph_safe.sanitize_label()` before rendering
5. **Evidence Integrity**: Full xurl provenance enables zkML attestation of data sources

## Rollout Phases

| Phase | Timeline | Deliverables |
|-------|----------|--------------|
| Phase 1 | Day 1-2 | XMCP Client, Planner integration, Gateway adapter, dependencies |
| Phase 2 | Day 2-3 | Graphify pipeline ingestion, evidence schema updates |
| Phase 3 | Day 3+ | Security hardening, API playground, CI/CD integration |

## Expected Wins

- **Real-time Social Intelligence**: Agents can read/write X data with full provenance
- **Token Efficiency**: Context-aware tool injection keeps LLM context <1k tokens
- **Cache Hits**: Repeated X queries hit local cache (SHA256 keyed)
- **Evidence Bundles**: Every X API call tagged with xurl provenance for zkML
- **Developer Experience**: Mock mode enables testing without API credentials

## References

- [X API v2 Documentation](https://developer.twitter.com/en/docs/twitter-api)
- [Model Context Protocol Spec](https://modelcontextprotocol.io/)
- [Cloudflare Code Mode MCP Pattern](https://developers.cloudflare.com/workers-ai/)
- [Graphify Knowledge Graph](https://github.com/safishamsi/graphify)
