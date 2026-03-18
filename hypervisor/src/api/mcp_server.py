from mcp.server.fastmcp import FastMCP
from mcp.server.fastmcp import Context
from pydantic import BaseModel, Field
import os
import httpx
import ast
import uuid
import re

# Initialize the FastMCP server
mcp_server = FastMCP(
    name="AxiomMesh-Hypervisor-MCP",
    dependencies=["httpx", "ast", "uuid", "re"]
)

# Shared security functions
def is_safe_code(code_str: str) -> bool:
    try:
        tree = ast.parse(code_str)
    except SyntaxError:
        return False

    forbidden_modules = {"os", "sys", "subprocess", "shlex", "pty", "socket"}
    forbidden_funcs = {"__import__", "eval", "exec", "open"}

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name.split(".")[0] in forbidden_modules:
                    return False
        elif isinstance(node, ast.ImportFrom):
            if node.module and node.module.split(".")[0] in forbidden_modules:
                return False
        elif isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name) and node.func.id in forbidden_funcs:
                return False
    return True

def apply_mcp_security_requirements(payload_content: str, risk_score: float = 0.0) -> str | None:
    """
    Applies the mandatory security checks defined in AGENT-ENHANCEMENTS.md.
    Returns an error message if failed, or None if passed.
    """
    if "<|" in payload_content or "|>" in payload_content:
         return "Security Halt: Prompt injection delimiters detected in payload."

    if risk_score > 0.9:
        return "Security Halt: Risk > 0.9. 2FA required (not implemented in this environment)."
    elif risk_score > 0.7:
        return "Security Halt: Risk > 0.7. Explicit human-in-the-loop confirmation required."

    return None

@mcp_server.tool()
async def sandbox_execute(code: str, language: str = "python", auth_token: str = "") -> str:
    """
    Executes constrained code in the secure Sandbox environment.
    Uses gVisor or Kata Containers isolation at the infrastructure level.
    """
    expected_key = os.environ.get('HYPERVISOR_API_KEY')
    if expected_key and auth_token != f"Bearer {expected_key}":
        return "Security Halt: Server identity unverified. Missing or invalid API Key/Signature in identity chain."

    if len(code) > int(os.environ.get("HYPERVISOR_MAX_CONTENT_LENGTH", "4000")):
         return "Error: Code exceeds maximum content length."

    # Mock risk calculation based on code length and sensitive keywords
    risk_score = 0.1
    if "network" in code.lower() or "eval" in code.lower():
        risk_score += 0.5
    if len(code) > 1000:
        risk_score += 0.2

    sec_err = apply_mcp_security_requirements(code, risk_score)
    if sec_err:
        return sec_err

    if language == "python" and not is_safe_code(code):
         return "Security Halt: Code execution contains forbidden operations (e.g., os, sys, eval, open)."

    SANDBOX_URL = os.environ.get("SANDBOX_URL", "http://localhost:4000/execute")
    try:
        async with httpx.AsyncClient() as client:
            sandbox_res = await client.post(SANDBOX_URL, json={"language": language, "code": code})
            if sandbox_res.status_code == 200:
                result = sandbox_res.json()
                return f"Execution result:\n{result}"
            else:
                 return f"Sandbox HTTP Error: {sandbox_res.status_code} - {sandbox_res.text}"
    except Exception as e:
        return f"Sandbox execution failed: {str(e)}"

@mcp_server.tool()
async def register_grid_skill(skill_name: str, description: str, endpoint: str, auth_token: str = "") -> str:
    """
    Registers a new capability/skill dynamically to the Grid ledger.
    """
    expected_key = os.environ.get('HYPERVISOR_API_KEY')
    if expected_key and auth_token != f"Bearer {expected_key}":
        return "Security Halt: Server identity unverified. Missing or invalid API Key/Signature in identity chain."

    sec_err = apply_mcp_security_requirements(f"{skill_name} {description} {endpoint}", risk_score=0.3)
    if sec_err:
        return sec_err

    GRID_URL = os.environ.get("GRID_URL", "http://localhost:5000")
    try:
        async with httpx.AsyncClient() as client:
            payload = {
                "name": skill_name,
                "description": description,
                "endpoint": endpoint,
                "node_id": f"node_{uuid.uuid4()}"
            }
            res = await client.post(f"{GRID_URL}/skills", json=payload)
            if res.status_code in [200, 201]:
                return f"Successfully registered skill '{skill_name}' on Grid."
            else:
                return f"Grid Registration Error: {res.status_code} - {res.text}"
    except Exception as e:
        return f"Failed to register skill on Grid: {str(e)}"
