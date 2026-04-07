"""
XMCP Mock Server for Development and Testing

Provides a mock MCP endpoint for X API calls during development.
This allows agents to test X integration without API credentials.

Usage:
    docker-compose up xmcp-mock
    # or
    python xmcp_mock_server.py

Endpoints:
    POST /mcp - MCP JSON-RPC endpoint
    GET  /health - Health check
    GET  /tools - List available tools
"""
import json
import logging
from datetime import datetime
from flask import Flask, request, jsonify

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Mock data store
MOCK_DATA = {
    "users": {
        "elonmusk": {
            "id": "44196397",
            "name": "Elon Musk",
            "username": "elonmusk",
            "verified": True,
            "created_at": "2009-06-02T20:12:29.000Z",
            "description": "Tesla, SpaceX, Neuralink, xAI, Boring Company",
            "public_metrics": {
                "followers_count": 150000000,
                "following_count": 500,
                "tweet_count": 30000,
            },
        },
        "axiommesh": {
            "id": "1234567890",
            "name": "AXIOM-MESH",
            "username": "axiommesh",
            "verified": False,
            "created_at": "2024-01-01T00:00:00.000Z",
            "description": "Decentralized AI agent mesh with zkML provenance",
            "public_metrics": {
                "followers_count": 10000,
                "following_count": 100,
                "tweet_count": 500,
            },
        },
    },
    "posts": [
        {
            "id": "1234567890123456789",
            "text": "Just launched AXIOM-MESH Phase 2! Real-time social intelligence with full zkML provenance. #AI #Web3",
            "author_id": "1234567890",
            "author_username": "axiommesh",
            "created_at": datetime.utcnow().isoformat() + "Z",
            "conversation_id": "1234567890123456789",
            "public_metrics": {
                "retweet_count": 150,
                "reply_count": 25,
                "like_count": 500,
                "quote_count": 30,
            },
            "entities": {
                "hashtags": [{"start": 95, "end": 98, "tag": "AI"}, {"start": 99, "end": 104, "tag": "Web3"}],
            },
        },
        {
            "id": "9876543210987654321",
            "text": "The future of AI is decentralized. Agents need provenance, not just performance.",
            "author_id": "44196397",
            "author_username": "elonmusk",
            "created_at": datetime.utcnow().isoformat() + "Z",
            "conversation_id": "9876543210987654321",
            "public_metrics": {
                "retweet_count": 5000,
                "reply_count": 1000,
                "like_count": 50000,
                "quote_count": 500,
            },
        },
    ],
    "trends": [
        {"name": "#AI", "tweet_volume": 500000, "url": "https://x.com/search?q=%23AI"},
        {"name": "#Web3", "tweet_volume": 300000, "url": "https://x.com/search?q=%23Web3"},
        {"name": "#AXIOMMesh", "tweet_volume": 10000, "url": "https://x.com/search?q=%23AXIOMMesh"},
        {"name": "zkML", "tweet_volume": 5000, "url": "https://x.com/search?q=zkML"},
    ],
}


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({
        "status": "healthy",
        "service": "xmcp-mock",
        "timestamp": datetime.utcnow().isoformat() + "Z",
    })


@app.route('/tools', methods=['GET'])
def list_tools():
    """List available MCP tools."""
    tools = [
        {
            "name": "search_posts",
            "description": "Search for posts on X by query",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query"},
                    "max_results": {"type": "integer", "default": 10},
                },
                "required": ["query"],
            },
        },
        {
            "name": "get_user_info",
            "description": "Get user information by username",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "username": {"type": "string", "description": "X username"},
                },
                "required": ["username"],
            },
        },
        {
            "name": "get_user_posts",
            "description": "Get posts from a specific user",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "username": {"type": "string", "description": "X username"},
                    "max_results": {"type": "integer", "default": 10},
                },
                "required": ["username"],
            },
        },
        {
            "name": "get_trends",
            "description": "Get trending topics",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "woeid": {"type": "integer", "default": 1, "description": "Where On Earth ID"},
                },
            },
        },
        {
            "name": "publish_content",
            "description": "Publish a post to X",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "text": {"type": "string", "description": "Post content"},
                },
                "required": ["text"],
            },
        },
    ]
    return jsonify({"tools": tools})


@app.route('/mcp', methods=['POST'])
def mcp_endpoint():
    """
    MCP JSON-RPC endpoint.
    
    Supports:
    - tools/list: Discover available tools
    - tools/call: Execute a tool
    """
    try:
        body = request.get_json()
        if not body:
            return jsonify({"error": "Invalid JSON"}), 400
        
        method = body.get("method")
        params = body.get("params", {})
        request_id = body.get("id", 1)
        
        logger.info(f"MCP request: {method}")
        
        if method == "tools/list":
            return jsonify({
                "jsonrpc": "2.0",
                "id": request_id,
                "result": {
                    "tools": [
                        {
                            "name": "search_posts",
                            "description": "Search for posts on X",
                            "inputSchema": {
                                "type": "object",
                                "properties": {
                                    "query": {"type": "string"},
                                    "max_results": {"type": "integer"},
                                },
                                "required": ["query"],
                            },
                        },
                        {
                            "name": "get_user_info",
                            "description": "Get user info",
                            "inputSchema": {
                                "type": "object",
                                "properties": {
                                    "username": {"type": "string"},
                                },
                                "required": ["username"],
                            },
                        },
                        {
                            "name": "get_trends",
                            "description": "Get trends",
                            "inputSchema": {"type": "object"},
                        },
                    ]
                },
            })
        
        elif method == "tools/call":
            tool_name = params.get("name")
            tool_args = params.get("arguments", {})
            
            result = call_mock_tool(tool_name, tool_args)
            
            return jsonify({
                "jsonrpc": "2.0",
                "id": request_id,
                "result": {
                    "content": [
                        {
                            "type": "text",
                            "text": json.dumps(result),
                        }
                    ],
                },
            })
        
        else:
            return jsonify({
                "jsonrpc": "2.0",
                "id": request_id,
                "error": {"code": -32601, "message": f"Method not found: {method}"},
            }), 404
    
    except Exception as e:
        logger.error(f"MCP error: {e}")
        return jsonify({
            "jsonrpc": "2.0",
            "id": body.get("id", 1) if 'body' in dir() else 1,
            "error": {"code": -32603, "message": str(e)},
        }), 500


def call_mock_tool(tool_name: str, args: dict) -> dict:
    """Execute a mock tool call."""
    logger.info(f"Calling mock tool: {tool_name} with args: {args}")
    
    if tool_name == "search_posts":
        query = args.get("query", "").lower()
        max_results = args.get("max_results", 10)
        
        # Filter mock posts by query
        matching_posts = [
            post for post in MOCK_DATA["posts"]
            if query in post["text"].lower() or query == ""
        ][:max_results]
        
        return {
            "data": matching_posts,
            "meta": {
                "result_count": len(matching_posts),
                "query": query,
            },
            "xurl": f"xurl://search_posts?query={query}",
            "cached": False,
        }
    
    elif tool_name == "get_user_info":
        username = args.get("username", "").lstrip("@")
        
        if username in MOCK_DATA["users"]:
            user_data = MOCK_DATA["users"][username]
            return {
                "data": user_data,
                "xurl": f"xurl://get_user_info?username={username}",
                "cached": False,
            }
        else:
            return {
                "error": f"User @{username} not found",
                "xurl": f"xurl://get_user_info?username={username}",
            }
    
    elif tool_name == "get_user_posts":
        username = args.get("username", "").lstrip("@")
        max_results = args.get("max_results", 10)
        
        user_id = MOCK_DATA["users"].get(username, {}).get("id")
        if not user_id:
            return {"error": f"User @{username} not found"}
        
        user_posts = [
            post for post in MOCK_DATA["posts"]
            if post["author_id"] == user_id
        ][:max_results]
        
        return {
            "data": user_posts,
            "meta": {"result_count": len(user_posts)},
            "xurl": f"xurl://get_user_posts?username={username}",
            "cached": False,
        }
    
    elif tool_name == "get_trends":
        return {
            "data": MOCK_DATA["trends"],
            "xurl": "xurl://get_trends",
            "cached": False,
        }
    
    elif tool_name == "publish_content":
        text = args.get("text", "")
        mock_id = f"mock_{datetime.utcnow().timestamp()}"
        
        return {
            "data": {"id": mock_id, "text": text},
            "xurl": f"xurl://publish_content?id={mock_id}",
            "cached": False,
        }
    
    else:
        return {"error": f"Unknown tool: {tool_name}"}


if __name__ == '__main__':
    logger.info("Starting XMCP Mock Server on port 8001...")
    app.run(host='0.0.0.0', port=8001, debug=True)
