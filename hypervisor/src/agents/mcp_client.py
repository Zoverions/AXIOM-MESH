"""
XMCP Client for AXIOM-MESH Hypervisor

Thin MCP connector using the official Python XDK to enable agents
to read/write X (Twitter) data with full provenance tagging.

Integration: Phase 1 - XMCP Server + xurl as Native Agent Tool Layer
Official docs: https://docs.x.com, https://developer.twitter.com

Features:
- MCP endpoint pattern: /mcp (streamable HTTP or stdio)
- xurl format for agents: Auto-resolves to full X API calls
- Tool discovery via JSON-RPC tools/list (standard MCP)
- Semantic caching (SHA256 on tool responses)
- Provenance tagging for Graphify build_graph() stage
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

# Try to import official X SDK (optional dependency)
try:
    import tweepy
    XDK_AVAILABLE = True
except ImportError:
    tweepy = None
    XDK_AVAILABLE = False

# Import graphify cache for semantic caching
import sys
GRAPHIFY_PATH = Path(__file__).parent.parent.parent.parent / "graphify_external"
if str(GRAPHIFY_PATH) not in sys.path:
    sys.path.insert(0, str(GRAPHIFY_PATH))

try:
    from graphify.cache import check_semantic_cache, save_semantic_cache
    CACHE_AVAILABLE = True
except ImportError:
    CACHE_AVAILABLE = False

# Import security helpers for routing XMCP calls through graph_safe
try:
    import sys
    SHARED_PATH = Path(__file__).parent.parent.parent.parent / "shared" / "src"
    if str(SHARED_PATH) not in sys.path:
        sys.path.insert(0, str(SHARED_PATH))
    from security.graph_safe import validate_url, sanitize_label
    SECURITY_AVAILABLE = True
except ImportError:
    SECURITY_AVAILABLE = False
    validate_url = lambda x: x  # passthrough
    sanitize_label = lambda x: x  # passthrough


@dataclass
class XMCPConfig:
    """Configuration for XMCP client."""
    api_key: str = field(default_factory=lambda: os.getenv("X_API_KEY", ""))
    api_secret: str = field(default_factory=lambda: os.getenv("X_API_SECRET", ""))
    bearer_token: str = field(default_factory=lambda: os.getenv("X_BEARER_TOKEN", ""))
    access_token: str = field(default_factory=lambda: os.getenv("X_ACCESS_TOKEN", ""))
    access_token_secret: str = field(default_factory=lambda: os.getenv("X_ACCESS_TOKEN_SECRET", ""))
    mcp_endpoint: str = "http://localhost:8000/mcp"
    cache_enabled: bool = True
    cache_ttl_hours: int = 24
    rate_limit_buffer: float = 0.8  # Use 80% of rate limit before backing off


@dataclass
class XToolDefinition:
    """Definition of an X MCP tool."""
    name: str
    description: str
    input_schema: Dict[str, Any]
    xurl_pattern: str
    rate_limit_per_15min: int = 300


@dataclass
class XMCPToolResponse:
    """Response from an XMCP tool call."""
    success: bool
    data: Any
    xurl: str
    cached: bool
    rate_limit_remaining: int
    provenance: Dict[str, Any]


class XMCPClient:
    """
    Model Context Protocol client for X (Twitter) API integration.
    
    Provides:
    - Tool discovery via MCP tools/list
    - Tool execution via call_tool with xurl routing
    - Semantic caching for repeated queries
    - Rate limit management
    - Provenance tagging for evidence bundles
    """
    
    # Official X MCP tools (as per docs.x.com)
    X_TOOLS: List[XToolDefinition] = [
        XToolDefinition(
            name="search_posts",
            description="Search for posts on X matching a query",
            input_schema={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query"},
                    "max_results": {"type": "integer", "default": 10},
                    "sort_order": {"type": "string", "enum": ["recency", "top"]},
                },
                "required": ["query"],
            },
            xurl_pattern="https://api.x.com/2/tweets/search/recent?query={query}&max_results={max_results}",
            rate_limit_per_15min=300,
        ),
        XToolDefinition(
            name="get_post_thread",
            description="Get a post thread by ID",
            input_schema={
                "type": "object",
                "properties": {
                    "post_id": {"type": "string", "description": "Post/Tweet ID"},
                },
                "required": ["post_id"],
            },
            xurl_pattern="https://api.x.com/2/tweets/{post_id}",
            rate_limit_per_15min=300,
        ),
        XToolDefinition(
            name="get_user_posts",
            description="Get posts by a specific user",
            input_schema={
                "type": "object",
                "properties": {
                    "username": {"type": "string", "description": "X username (without @)"},
                    "max_results": {"type": "integer", "default": 10},
                },
                "required": ["username"],
            },
            xurl_pattern="https://api.x.com/2/users/by/username/{username}/tweets?max_results={max_results}",
            rate_limit_per_15min=300,
        ),
        XToolDefinition(
            name="get_trends",
            description="Get current trending topics",
            input_schema={
                "type": "object",
                "properties": {
                    "woeid": {"type": "integer", "description": "Where On Earth ID (1 for global)", "default": 1},
                },
            },
            xurl_pattern="https://api.x.com/1.1/trends/place.json?id={woeid}",
            rate_limit_per_15min=75,
        ),
        XToolDefinition(
            name="publish_content",
            description="Publish a new post to X",
            input_schema={
                "type": "object",
                "properties": {
                    "text": {"type": "string", "description": "Post text (max 280 chars)"},
                    "media_urls": {"type": "array", "items": {"type": "string"}, "description": "Optional media URLs"},
                },
                "required": ["text"],
            },
            xurl_pattern="https://api.x.com/2/tweets",
            rate_limit_per_15min=200,
        ),
        XToolDefinition(
            name="get_user_info",
            description="Get user profile information",
            input_schema={
                "type": "object",
                "properties": {
                    "username": {"type": "string", "description": "X username (without @)"},
                },
                "required": ["username"],
            },
            xurl_pattern="https://api.x.com/2/users/by/username/{username}",
            rate_limit_per_15min=300,
        ),
    ]
    
    def __init__(self, config: Optional[XMCPConfig] = None):
        self.config = config or XMCPConfig()
        self._client: Optional[Any] = None
        self._rate_limits: Dict[str, Tuple[int, datetime]] = {}
        self._cache_dir = Path.home() / ".axiom-mesh" / "xmcp-cache"
        self._cache_dir.mkdir(parents=True, exist_ok=True)
        
        if not XDK_AVAILABLE:
            logger.warning("Official X SDK (tweepy) not installed. X API calls will be mocked.")
    
    def _init_client(self) -> None:
        """Initialize the X API client using official XDK."""
        if not XDK_AVAILABLE:
            logger.info("Using mock X client (tweepy not installed)")
            self._client = None
            return
        
        try:
            # OAuth 2.0 with Bearer Token (recommended for v2 API)
            if self.config.bearer_token:
                self._client = tweepy.Client(
                    bearer_token=self.config.bearer_token,
                    wait_on_rate_limit=True,
                )
            # OAuth 1.0a User Context (for write operations)
            elif all([
                self.config.api_key,
                self.config.api_secret,
                self.config.access_token,
                self.config.access_token_secret,
            ]):
                self._client = tweepy.Client(
                    consumer_key=self.config.api_key,
                    consumer_secret=self.config.api_secret,
                    access_token=self.config.access_token,
                    access_token_secret=self.config.access_token_secret,
                    wait_on_rate_limit=True,
                )
            else:
                logger.warning("No X API credentials configured. Using mock client.")
                self._client = None
        except Exception as e:
            logger.error(f"Failed to initialize X client: {e}")
            self._client = None
    
    @property
    def client(self) -> Optional[Any]:
        """Lazy initialization of X client."""
        if self._client is None:
            self._init_client()
        return self._client
    
    async def discover_tools(self) -> List[Dict[str, Any]]:
        """
        Discover available X tools via MCP tools/list pattern.
        
        Returns list of tool definitions compatible with MCP spec.
        Mirrors Cloudflare's Code Mode MCP pattern for context efficiency.
        """
        tools = []
        for tool_def in self.X_TOOLS:
            tools.append({
                "name": tool_def.name,
                "description": tool_def.description,
                "inputSchema": tool_def.input_schema,
                "_meta": {
                    "xurl_pattern": tool_def.xurl_pattern,
                    "rate_limit_per_15min": tool_def.rate_limit_per_15min,
                    "source": "xmcp",
                },
            })
        return tools
    
    def _compute_cache_key(self, tool_name: str, params: Dict[str, Any]) -> str:
        """Compute SHA256 cache key for tool response."""
        key_data = json.dumps({"tool": tool_name, "params": params}, sort_keys=True)
        return hashlib.sha256(key_data.encode()).hexdigest()
    
    def _get_cached_response(self, cache_key: str) -> Optional[Dict[str, Any]]:
        """Retrieve cached response if available and not expired."""
        if not self.config.cache_enabled or not CACHE_AVAILABLE:
            return None
        
        cache_file = self._cache_dir / f"{cache_key}.json"
        if not cache_file.exists():
            return None
        
        try:
            with open(cache_file, "r") as f:
                cached = json.load(f)
            
            # Check TTL
            cached_at = datetime.fromisoformat(cached.get("_cached_at", ""))
            if datetime.now() - cached_at > timedelta(hours=self.config.cache_ttl_hours):
                cache_file.unlink()  # Delete expired cache
                return None
            
            return cached.get("_response")
        except Exception as e:
            logger.warning(f"Cache read error: {e}")
            return None
    
    def _save_to_cache(self, cache_key: str, response: Any) -> None:
        """Save response to cache with timestamp."""
        if not self.config.cache_enabled or not CACHE_AVAILABLE:
            return
        
        cache_file = self._cache_dir / f"{cache_key}.json"
        try:
            with open(cache_file, "w") as f:
                json.dump({
                    "_cached_at": datetime.now().isoformat(),
                    "_response": response,
                }, f, indent=2)
        except Exception as e:
            logger.warning(f"Cache write error: {e}")
    
    def _check_rate_limit(self, tool_name: str) -> bool:
        """Check if tool call is within rate limits."""
        now = datetime.now()
        tool_def = next((t for t in self.X_TOOLS if t.name == tool_name), None)
        if not tool_def:
            return True
        
        if tool_name in self._rate_limits:
            count, window_start = self._rate_limits[tool_name]
            # Reset window if 15 minutes passed
            if now - window_start > timedelta(minutes=15):
                self._rate_limits[tool_name] = (1, now)
                return True
            
            # Check if within buffer threshold
            if count >= int(tool_def.rate_limit_per_15min * self.config.rate_limit_buffer):
                logger.warning(f"Rate limit buffer reached for {tool_name}")
                return False
            
            self._rate_limits[tool_name] = (count + 1, window_start)
        else:
            self._rate_limits[tool_name] = (1, now)
        
        return True
    
    def _sanitize_tool_params(self, tool_name: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """
        Sanitize tool parameters using graph_safe helpers (Phase 3 security hardening).
        
        Routes all string parameters through validate_url() and sanitize_label()
        to prevent SSRF, XSS, and path traversal attacks.
        
        Args:
            tool_name: Name of the tool being called
            params: Original parameters
            
        Returns:
            Sanitized parameter dict
        """
        if not SECURITY_AVAILABLE:
            return params
        
        sanitized = {}
        for key, value in params.items():
            if isinstance(value, str):
                # Check if it looks like a URL
                if value.startswith(('http://', 'https://', 'xurl://')):
                    try:
                        sanitized[key] = validate_url(value)
                    except ValueError as e:
                        logger.warning(f"Blocked unsafe URL in {tool_name}.{key}: {e}")
                        sanitized[key] = ""  # Safe default
                else:
                    # Sanitize as label (strip control chars, HTML escape, cap length)
                    sanitized[key] = sanitize_label(value)[:500]
            else:
                sanitized[key] = value
        
        return sanitized
    
    def _build_xurl(self, tool_name: str, params: Dict[str, Any]) -> str:
        """Build xurl from tool name and parameters."""
        tool_def = next((t for t in self.X_TOOLS if t.name == tool_name), None)
        if not tool_def:
            raise ValueError(f"Unknown tool: {tool_name}")
        
        xurl = tool_def.xurl_pattern
        for key, value in params.items():
            xurl = xurl.replace(f"{{{key}}}", str(value))
        
        return xurl
    
    def _execute_mock_call(self, tool_name: str, params: Dict[str, Any]) -> Any:
        """Execute mock tool call for testing/development."""
        logger.info(f"[MOCK] Executing XMCP call: {tool_name}({params})")
        
        # Return realistic mock data based on tool type
        if tool_name == "search_posts":
            return {
                "data": [
                    {
                        "id": "mock_123",
                        "text": f"Mock result for query: {params.get('query', '')}",
                        "created_at": datetime.now().isoformat(),
                        "author_id": "mock_user",
                    }
                ],
                "meta": {"result_count": 1, "newest_id": "mock_123"},
            }
        elif tool_name == "get_trends":
            return [
                {
                    "name": "Mock Trend",
                    "tweet_volume": 10000,
                    "url": "https://x.com/search?q=%23MockTrend",
                }
            ]
        elif tool_name == "get_user_info":
            return {
                "data": {
                    "id": "mock_user_id",
                    "name": "Mock User",
                    "username": params.get("username", "mock"),
                    "verified": False,
                }
            }
        elif tool_name == "publish_content":
            return {
                "data": {
                    "id": "mock_post_" + datetime.now().strftime("%Y%m%d%H%M%S"),
                    "text": params.get("text", ""),
                }
            }
        else:
            return {"data": [], "meta": {"mock": True}}
    
    def _execute_real_call(self, tool_name: str, params: Dict[str, Any]) -> Any:
        """Execute real X API call using official XDK."""
        if not self.client:
            return self._execute_mock_call(tool_name, params)
        
        try:
            if tool_name == "search_posts":
                return self.client.search_tweets(
                    query=params["query"],
                    max_results=min(params.get("max_results", 10), 100),
                    tweet_fields=["created_at", "author_id", "public_metrics"],
                ).data
            elif tool_name == "get_post_thread":
                return self.client.get_tweet(
                    id=params["post_id"],
                    expansions=["attachments.media_keys"],
                    tweet_fields=["created_at", "author_id", "public_metrics"],
                ).data
            elif tool_name == "get_user_posts":
                user = self.client.get_user(username=params["username"])
                if user.data:
                    return self.client.get_users_tweets(
                        id=user.data.id,
                        max_results=min(params.get("max_results", 10), 100),
                        tweet_fields=["created_at", "public_metrics"],
                    ).data
                return []
            elif tool_name == "get_trends":
                # Note: Trends API requires OAuth 1.0a
                logger.warning("Trends API requires separate OAuth 1.0a setup")
                return self._execute_mock_call(tool_name, params)
            elif tool_name == "publish_content":
                return self.client.create_tweet(text=params["text"])
            elif tool_name == "get_user_info":
                return self.client.get_user(
                    username=params["username"],
                    user_fields=["created_at", "verified", "public_metrics"],
                ).data
            else:
                logger.warning(f"Unknown tool: {tool_name}")
                return self._execute_mock_call(tool_name, params)
        except Exception as e:
            logger.error(f"X API call failed: {e}")
            raise
    
    async def call_tool(
        self,
        tool_name: str,
        params: Dict[str, Any],
        force_refresh: bool = False,
    ) -> XMCPToolResponse:
        """
        Call an X tool via MCP protocol with xurl routing.
        
        Args:
            tool_name: Name of the tool to call
            params: Tool parameters
            force_refresh: Skip cache and fetch fresh data
            
        Returns:
            XMCPToolResponse with data, provenance, and rate limit info
        """
        # Apply security sanitization to all string params (Phase 3 hardening)
        sanitized_params = self._sanitize_tool_params(tool_name, params)
        
        # Check rate limits first
        if not self._check_rate_limit(tool_name):
            return XMCPToolResponse(
                success=False,
                data=None,
                xurl="",
                cached=False,
                rate_limit_remaining=0,
                provenance={"error": "rate_limit_exceeded"},
            )
        
        # Build xurl for provenance
        xurl = self._build_xurl(tool_name, sanitized_params)
        
        # Check cache (unless forced refresh)
        cache_key = self._compute_cache_key(tool_name, sanitized_params)
        if not force_refresh:
            cached = self._get_cached_response(cache_key)
            if cached:
                logger.info(f"Cache hit for {tool_name}")
                return XMCPToolResponse(
                    success=True,
                    data=cached,
                    xurl=xurl,
                    cached=True,
                    rate_limit_remaining=-1,  # Unknown for cached
                    provenance={
                        "source": "xmcp",
                        "xurl": xurl,
                        "cached": True,
                        "cache_key": cache_key,
                    },
                )
        
        # Execute tool call
        try:
            if os.getenv("X_MOCK_MODE", "false").lower() == "true":
                result = self._execute_mock_call(tool_name, sanitized_params)
            else:
                result = self._execute_real_call(tool_name, sanitized_params)
            
            # Cache the response
            self._save_to_cache(cache_key, result)
            
            # Get rate limit info (mocked for now)
            rate_remaining = 299  # Would come from X API headers in production
            
            return XMCPToolResponse(
                success=True,
                data=result,
                xurl=xurl,
                cached=False,
                rate_limit_remaining=rate_remaining,
                provenance={
                    "source": "xmcp",
                    "xurl": xurl,
                    "cached": False,
                    "timestamp": datetime.now().isoformat(),
                    "tool_name": tool_name,
                },
            )
        except Exception as e:
            logger.error(f"Tool call failed: {e}")
            return XMCPToolResponse(
                success=False,
                data=None,
                xurl=xurl,
                cached=False,
                rate_limit_remaining=0,
                provenance={
                    "source": "xmcp",
                    "error": str(e),
                    "xurl": xurl,
                },
            )
    
    def get_relevant_tools_for_context(
        self,
        intent_keywords: List[str],
        max_tools: int = 3,
    ) -> List[Dict[str, Any]]:
        """
        Filter X tools to only those relevant for current planning context.
        
        Mirrors Cloudflare's Code Mode MCP pattern: inject only relevant
        tools to keep context under 1k tokens.
        
        Args:
            intent_keywords: Keywords from agent's current intent
            max_tools: Maximum number of tools to return
            
        Returns:
            Filtered list of tool definitions
        """
        # Simple keyword-based filtering (can be enhanced with embeddings)
        tool_scores = []
        
        for tool_def in self.X_TOOLS:
            score = 0
            keywords_lower = [k.lower() for k in intent_keywords]
            
            # Score based on keyword matches
            if any(kw in tool_def.name.lower() for kw in keywords_lower):
                score += 2
            if any(kw in tool_def.description.lower() for kw in keywords_lower):
                score += 1
            
            if score > 0:
                tool_scores.append((score, tool_def))
        
        # Sort by score and return top N
        tool_scores.sort(reverse=True, key=lambda x: x[0])
        selected = tool_scores[:max_tools]
        
        # If no matches, return default safe set
        if not selected:
            selected = [(1, t) for t in self.X_TOOLS[:max_tools]]
        
        return [
            {
                "name": t.name,
                "description": t.description,
                "inputSchema": t.input_schema,
            }
            for _, t in selected
        ]


# Convenience function for direct use
async def xmcp_discover(intent_keywords: Optional[List[str]] = None) -> List[Dict[str, Any]]:
    """
    Discover X tools via XMCP, optionally filtered by intent.
    
    Convenience wrapper for planner integration.
    
    Args:
        intent_keywords: Optional keywords to filter relevant tools
        
    Returns:
        List of tool definitions ready for LLM injection
    """
    client = XMCPClient()
    
    if intent_keywords:
        return client.get_relevant_tools_for_context(intent_keywords)
    else:
        return await client.discover_tools()


async def xmcp_call(tool_name: str, params: Dict[str, Any]) -> XMCPToolResponse:
    """
    Call an X tool via XMCP.
    
    Convenience wrapper for agent tool execution.
    
    Args:
        tool_name: Name of the tool to call
        params: Tool parameters
        
    Returns:
        XMCPToolResponse with data and provenance
    """
    client = XMCPClient()
    return await client.call_tool(tool_name, params)
