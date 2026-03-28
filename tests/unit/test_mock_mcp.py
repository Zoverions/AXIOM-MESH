import sys
from unittest.mock import patch, MagicMock

# Mock the MCP library to run the file
sys.modules['mcp'] = MagicMock()
sys.modules['mcp.server'] = MagicMock()
sys.modules['mcp.server.fastmcp'] = MagicMock()

import hypervisor.src.api.mcp_server
print("Successfully loaded mcp_server.py")
