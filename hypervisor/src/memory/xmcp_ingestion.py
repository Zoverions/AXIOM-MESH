"""
XMCP Ingestion Layer for Graphify Pipeline

Extends the 7-stage Graphify pipeline to ingest live X (Twitter) data:
- detect() + extract() → Add XMCP fetch step for X posts/threads
- build_graph() → Tag X-sourced edges as EXTRACTED or INFERRED
- cluster() / analyze() → Surface X-specific god-nodes (viral threads, key accounts)

Integration: Phase 2 - Graphify Pipeline + XMCP Synergy
"""
from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

# Import graphify modules
import sys
GRAPHIFY_PATH = Path(__file__).parent.parent.parent.parent / "graphify_external"
if str(GRAPHIFY_PATH) not in sys.path:
    sys.path.insert(0, str(GRAPHIFY_PATH))

from graphify.detect import detect, classify_file, FileType
from graphify.extract import extract as extract_ast
from graphify.build import build, build_from_json
from graphify.cluster import cluster, cohesion_score
from graphify.analyze import god_nodes, surprising_connections, suggest_questions

# Import XMCP client
try:
    from ..agents.mcp_client import XMCPClient, XMCPConfig, xmcp_discover, xmcp_call
    XMCP_AVAILABLE = True
except ImportError:
    XMCP_AVAILABLE = False
    logger.warning("XMCP client not available - X ingestion disabled")

# Import security helpers
try:
    from ...shared.src.security.graph_safe import validate_url, sanitize_label, safe_fetch_text
    SECURITY_AVAILABLE = True
except ImportError:
    SECURITY_AVAILABLE = False
    logger.warning("Security helpers not available - using passthrough")


@dataclass
class XIngestionConfig:
    """Configuration for X data ingestion."""
    queries: List[str] = field(default_factory=list)
    usernames: List[str] = field(default_factory=list)
    hashtags: List[str] = field(default_factory=list)
    max_posts_per_query: int = 50
    include_replies: bool = False
    include_retweets: bool = False
    date_range: Optional[Tuple[str, str]] = None  # (start_date, end_date)
    enable_thread_detection: bool = True
    cache_enabled: bool = True
    mock_mode: bool = False


@dataclass
class XPostNode:
    """Represents an X post as a graph node."""
    id: str
    text: str
    author_id: str
    author_username: str
    created_at: str
    metrics: Dict[str, int]  # retweet_count, reply_count, like_count, quote_count
    thread_id: Optional[str] = None
    in_reply_to: Optional[str] = None
    entities: Dict[str, Any] = field(default_factory=dict)
    source: str = "xmcp"
    xurl: str = ""
    edge_type: str = "EXTRACTED"  # EXTRACTED or INFERRED


@dataclass
class XUserNode:
    """Represents an X user as a graph node."""
    id: str
    username: str
    name: str
    verified: bool
    followers_count: int
    following_count: int
    tweet_count: int
    created_at: str
    description: str = ""
    source: str = "xmcp"
    xurl: str = ""


class XMCPIngester:
    """
    Ingests live X data into Graphify knowledge graph pipeline.
    
    Workflow:
    1. Fetch posts/users via XMCP client
    2. Extract entities, relationships, and semantic content
    3. Build graph nodes/edges with provenance tagging
    4. Inject into Graphify pipeline at extract() stage
    """
    
    def __init__(self, config: Optional[XIngestionConfig] = None, mcp_client: Optional[XMCPClient] = None):
        self.config = config or XIngestionConfig()
        self.mcp_client = mcp_client
        if not self.mcp_client and XMCP_AVAILABLE:
            self.mcp_client = XMCPClient(XMCPConfig(mock_mode=self.config.mock_mode))
        
        self._posts: List[XPostNode] = []
        self._users: Dict[str, XUserNode] = {}
        self._extractions: List[Dict] = []
    
    def ingest(self) -> List[Dict]:
        """
        Execute full X ingestion pipeline.
        
        Returns:
            List of extraction dicts ready for build_graph()
        """
        logger.info(f"Starting X ingestion: {len(self.config.queries)} queries, {len(self.config.usernames)} users")
        
        # Stage 1: Fetch data from X
        self._fetch_posts()
        self._fetch_users()
        
        # Stage 2: Extract nodes and edges
        self._extract_nodes()
        self._extract_edges()
        
        # Stage 3: Build extraction dict for Graphify
        return self._build_extraction_dict()
    
    def _fetch_posts(self) -> None:
        """Fetch posts from X using XMCP client."""
        if not self.mcp_client:
            logger.warning("No MCP client available - skipping post fetch")
            return
        
        # Fetch by queries
        for query in self.config.queries:
            try:
                # Apply security validation if available
                if SECURITY_AVAILABLE:
                    safe_query = sanitize_label(query)[:500]
                else:
                    safe_query = query[:500]
                
                result = self.mcp_client.call_tool(
                    "search_posts",
                    {"query": safe_query, "max_results": self.config.max_posts_per_query}
                )
                
                if result.success:
                    posts = result.data.get("data", [])
                    for post_data in posts:
                        self._parse_post(post_data, result.xurl)
                    
                    logger.info(f"Fetched {len(posts)} posts for query: {query}")
                else:
                    logger.warning(f"Failed to fetch posts for '{query}': {result.data}")
                    
            except Exception as e:
                logger.error(f"Error fetching posts for '{query}': {e}")
        
        # Fetch by hashtags
        for hashtag in self.config.hashtags:
            query = f"#{hashtag}"
            try:
                if SECURITY_AVAILABLE:
                    safe_query = sanitize_label(query)[:500]
                else:
                    safe_query = query[:500]
                
                result = self.mcp_client.call_tool(
                    "search_posts",
                    {"query": safe_query, "max_results": self.config.max_posts_per_query}
                )
                
                if result.success:
                    posts = result.data.get("data", [])
                    for post_data in posts:
                        self._parse_post(post_data, result.xurl)
                    
                    logger.info(f"Fetched {len(posts)} posts for hashtag: {hashtag}")
                    
            except Exception as e:
                logger.error(f"Error fetching posts for '#{hashtag}': {e}")
    
    def _fetch_users(self) -> None:
        """Fetch user info from X using XMCP client."""
        if not self.mcp_client:
            logger.warning("No MCP client available - skipping user fetch")
            return
        
        for username in self.config.usernames:
            try:
                # Apply security validation
                if SECURITY_AVAILABLE:
                    safe_username = sanitize_label(username)[:50]
                else:
                    safe_username = username[:50]
                
                result = self.mcp_client.call_tool(
                    "get_user_info",
                    {"username": safe_username}
                )
                
                if result.success:
                    user_data = result.data.get("data", {})
                    self._parse_user(user_data, result.xurl)
                    logger.info(f"Fetched user info for: {username}")
                else:
                    logger.warning(f"Failed to fetch user '{username}': {result.data}")
                    
            except Exception as e:
                logger.error(f"Error fetching user '{username}': {e}")
    
    def _parse_post(self, data: Dict, xurl: str) -> None:
        """Parse raw X API post data into XPostNode."""
        post = XPostNode(
            id=data.get("id", ""),
            text=data.get("text", ""),
            author_id=data.get("author_id", ""),
            author_username=data.get("author_username", ""),
            created_at=data.get("created_at", ""),
            metrics=data.get("public_metrics", {}),
            thread_id=data.get("conversation_id"),
            in_reply_to=data.get("in_reply_to_user_id"),
            entities=data.get("entities", {}),
            xurl=xurl,
        )
        self._posts.append(post)
    
    def _parse_user(self, data: Dict, xurl: str) -> None:
        """Parse raw X API user data into XUserNode."""
        user = XUserNode(
            id=data.get("id", ""),
            username=data.get("username", ""),
            name=data.get("name", ""),
            verified=data.get("verified", False),
            followers_count=data.get("public_metrics", {}).get("followers_count", 0),
            following_count=data.get("public_metrics", {}).get("following_count", 0),
            tweet_count=data.get("public_metrics", {}).get("tweet_count", 0),
            created_at=data.get("created_at", ""),
            description=data.get("description", ""),
            xurl=xurl,
        )
        self._users[user.id] = user
    
    def _extract_nodes(self) -> None:
        """Extract graph nodes from fetched X data."""
        # Nodes are already extracted in _parse_post and _parse_user
        pass
    
    def _extract_edges(self) -> None:
        """Extract graph edges from X data (relationships between posts/users)."""
        # Edges will be built in _build_extraction_dict
        pass
    
    def _build_extraction_dict(self) -> List[Dict]:
        """Build extraction dict compatible with Graphify build_graph()."""
        nodes = []
        edges = []
        
        # Add user nodes
        for user in self._users.values():
            nodes.append({
                "id": f"user:{user.id}",
                "label": f"@{user.username}",
                "type": "X_USER",
                "data": {
                    "name": user.name,
                    "username": user.username,
                    "verified": user.verified,
                    "followers": user.followers_count,
                    "description": user.description,
                    "source": user.source,
                    "xurl": user.xurl,
                },
            })
        
        # Add post nodes
        for post in self._posts:
            nodes.append({
                "id": f"post:{post.id}",
                "label": post.text[:100] + ("..." if len(post.text) > 100 else ""),
                "type": "X_POST",
                "data": {
                    "text": post.text,
                    "author": post.author_username,
                    "created_at": post.created_at,
                    "metrics": post.metrics,
                    "source": post.source,
                    "xurl": post.xurl,
                    "edge_type": post.edge_type,
                },
            })
        
        # Add edges: user -> post (authored)
        for post in self._posts:
            if post.author_id in self._users:
                edges.append({
                    "source": f"user:{post.author_id}",
                    "target": f"post:{post.id}",
                    "relation": "AUTHORED",
                    "confidence": "EXTRACTED",
                    "confidence_score": 1.0,
                    "provenance": {
                        "source": "xmcp",
                        "xurl": post.xurl,
                        "timestamp": post.created_at,
                    },
                })
        
        # Add edges: post -> post (reply)
        for post in self._posts:
            if post.in_reply_to:
                edges.append({
                    "source": f"post:{post.in_reply_to}",
                    "target": f"post:{post.id}",
                    "relation": "REPLY_TO",
                    "confidence": "EXTRACTED",
                    "confidence_score": 1.0,
                    "provenance": {
                        "source": "xmcp",
                        "xurl": post.xurl,
                        "timestamp": post.created_at,
                    },
                })
        
        # Add edges: post -> post (retweet/quote)
        # This would require additional data from X API
        
        # Add edges: user -> user (follow) - inferred from interactions
        # This is INFERRED, not EXTRACTED
        user_interactions: Dict[str, Dict[str, int]] = {}
        for post in self._posts:
            if post.author_id not in user_interactions:
                user_interactions[post.author_id] = {}
            
            # Count interactions (simplified - would need more data in production)
            if post.metrics.get("like_count", 0) > 100:
                # Infer that users who create viral content have influence
                pass
        
        extraction = {
            "nodes": nodes,
            "edges": edges,
            "hyperedges": [],
            "metadata": {
                "source": "xmcp_ingestion",
                "queries": self.config.queries,
                "usernames": self.config.usernames,
                "hashtags": self.config.hashtags,
                "total_posts": len(self._posts),
                "total_users": len(self._users),
            },
        }
        
        logger.info(f"Built extraction: {len(nodes)} nodes, {len(edges)} edges")
        return [extraction]
    
    def get_viral_posts(self, threshold: int = 1000) -> List[XPostNode]:
        """Get posts with high engagement (potential god-nodes)."""
        return [
            post for post in self._posts
            if sum(post.metrics.values()) >= threshold
        ]
    
    def get_key_accounts(self, min_followers: int = 10000) -> List[XUserNode]:
        """Get influential user accounts."""
        return [
            user for user in self._users.values()
            if user.followers_count >= min_followers
        ]


def ingest_x_data(
    queries: Optional[List[str]] = None,
    usernames: Optional[List[str]] = None,
    hashtags: Optional[List[str]] = None,
    max_posts: int = 50,
    mock_mode: bool = False,
) -> List[Dict]:
    """
    Convenience function to ingest X data into Graphify pipeline.
    
    Args:
        queries: Search queries to fetch posts
        usernames: Usernames to fetch posts from
        hashtags: Hashtags to search
        max_posts: Maximum posts per query
        mock_mode: Use mock data instead of real API calls
        
    Returns:
        Extraction dict list for build_graph()
    """
    config = XIngestionConfig(
        queries=queries or [],
        usernames=usernames or [],
        hashtags=hashtags or [],
        max_posts_per_query=max_posts,
        mock_mode=mock_mode,
    )
    
    ingester = XMCPIngester(config)
    return ingester.ingest()


def extend_graphify_with_x(
    root_dir: Path,
    queries: Optional[List[str]] = None,
    usernames: Optional[List[str]] = None,
    hashtags: Optional[List[str]] = None,
    incremental: bool = True,
) -> Any:
    """
    Extend Graphify pipeline to include X data ingestion.
    
    This wraps the standard Graphify build_persistent_graph() to first
    ingest live X data, then scan local files.
    
    Args:
        root_dir: Root directory for file scanning
        queries: X search queries
        usernames: X usernames to monitor
        hashtags: X hashtags to track
        incremental: Use semantic caching
        
    Returns:
        NetworkX graph with both file-based and X-sourced nodes
    """
    from .graph_memory import GraphMemory, GraphMemoryConfig
    
    # Step 1: Ingest X data
    x_extractions = []
    if queries or usernames or hashtags:
        logger.info("Ingesting X data before building graph...")
        x_extractions = ingest_x_data(
            queries=queries,
            usernames=usernames,
            hashtags=hashtags,
            mock_mode=False,
        )
    
    # Step 2: Build graph memory
    config = GraphMemoryConfig(root_dir=root_dir)
    memory = GraphMemory(config)
    
    # Step 3: Build from X extractions + local files
    if x_extractions:
        # First build from X data
        memory._build_from_artifacts(x_extractions)
        logger.info(f"Added {len(x_extractions[0].get('nodes', []))} X nodes")
    
    # Then scan local files (standard Graphify pipeline)
    memory._build_from_directory(root_dir, incremental=incremental)
    
    return memory.graph
