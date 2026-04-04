from mcp.server.fastmcp import FastMCP
import os
import httpx
import ast
import uuid
import re
from src.core.secrets import SecretManager

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

import hashlib
import hmac

def verify_signature(payload: str, signature: str) -> bool:
    """Verify the HMAC signature of the payload."""
    secret_str = SecretManager.get_secret("MCP_CODE_SIGNING_SECRET")
    if not secret_str:
        raise RuntimeError("MCP_CODE_SIGNING_SECRET is not configured. Code execution is disabled for security.")
    secret = secret_str.encode()
    expected_sig = hmac.new(secret, payload.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected_sig, signature)

@mcp_server.tool()
async def sandbox_execute(code: str, signature: str, language: str = "python", auth_token: str = "") -> str:
    """
    Executes constrained code in the secure Sandbox environment.
    Uses gVisor or Kata Containers isolation at the infrastructure level.
    Mandates code signing to prevent prompt injection and confused deputy attacks.
    """
    expected_key = os.environ.get('HYPERVISOR_API_KEY')
    if expected_key and auth_token != f"Bearer {expected_key}":
        return "Security Halt: Server identity unverified. Missing or invalid API Key/Signature in identity chain."

    if not verify_signature(code, signature):
        return "Security Halt: Invalid code signature. Confused Deputy/Prompt Injection protection triggered."

    if len(code) > int(os.environ.get("HYPERVISOR_MAX_CONTENT_LENGTH", "4000")):
         return "Error: Code exceeds maximum content length."

    risk_score = 0.1
    try:
        tree = ast.parse(code)
        forbidden_modules = {"os", "sys", "subprocess", "shlex", "pty", "socket"}
        forbidden_funcs = {"__import__", "eval", "exec", "open"}
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name.split(".")[0] in forbidden_modules:
                        risk_score += 0.8
            elif isinstance(node, ast.ImportFrom):
                if node.module and node.module.split(".")[0] in forbidden_modules:
                    risk_score += 0.8
            elif isinstance(node, ast.Call):
                if isinstance(node.func, ast.Name) and node.func.id in forbidden_funcs:
                    risk_score += 0.8
    except SyntaxError:
        risk_score += 0.9

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
async def register_tee_skill(skill_name: str, public_fragment: dict, proof_attestation: str, auth_token: str = "") -> str:
    """
    Registers a TEE-backed skill capsule. Logs only the proof attestation to WORM audit trail.
    """
    expected_key = os.environ.get('HYPERVISOR_API_KEY')
    if expected_key and auth_token != f"Bearer {expected_key}":
        return "Security Halt: Server identity unverified. Missing or invalid API Key/Signature in identity chain."

    sec_err = apply_mcp_security_requirements(f"{skill_name} {str(public_fragment)}", risk_score=0.2)
    if sec_err:
        return sec_err

    # Create WORM audit log (simulated)
    audit_log = {
        "event": "register_tee_skill",
        "skill_name": skill_name,
        "attestation": proof_attestation,
        # Intentionally omitting any encrypted logic or private fragments
    }
    print(f"WORM Audit Log: {audit_log}")

    return f"Successfully registered TEE skill '{skill_name}' with attestation {proof_attestation[:10]}..."

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

@mcp_server.tool()
async def spin_advisory_panel(proposal: str, agents: list[str] = ["Strategist", "Empath", "Skeptic"], auth_token: str = "") -> dict:
    """
    Instantiates an Advisory Panel inside a TEE to deliberate on a policy proposal via the ARENA protocol.
    Enforces Agentic Steel-manning.
    """
    expected_key = os.environ.get('HYPERVISOR_API_KEY')
    if expected_key and auth_token != f"Bearer {expected_key}":
        return {"error": "Security Halt: Server identity unverified. Missing or invalid API Key/Signature in identity chain."}

    sec_err = apply_mcp_security_requirements(f"{proposal} {agents}", risk_score=0.2)
    if sec_err:
        return {"error": sec_err}

    # Simulate spinning up isolated TEE environments for the agents
    panel_results = {
        "proposal": proposal,
        "agents": agents,
        "deliberation": [],
        "consensus": None
    }

    # Simple simulation of ARENA protocol with steel-manning
    for agent in agents:
        agent_stance = f"Stance from {agent} on '{proposal}'."
        panel_results["deliberation"].append({
            "agent": agent,
            "stance": agent_stance,
            "steelman_required": True
        })

    return panel_results

@mcp_server.tool()
async def submit_counter_argument(agent: str, counter_argument: str, opponent: str, opponent_stance: str, steelman_attempt: str, auth_token: str = "") -> dict:
    """
    Submits a counter-argument within the ARENA Protocol.
    Strictly enforces "Agentic Steel-manning": The agent MUST regenerate the opposing agent's argument to a high degree of semantic fidelity before the counter-argument is accepted.
    """
    expected_key = os.environ.get('HYPERVISOR_API_KEY')
    if expected_key and auth_token != f"Bearer {expected_key}":
        return {"error": "Security Halt: Server identity unverified."}

    # Simplified Semantic Fidelity Check
    # In a real implementation, this would use embeddings to check cosine similarity
    similarity_score = 0.0
    words_stance = set(opponent_stance.lower().split())
    words_steelman = set(steelman_attempt.lower().split())

    if len(words_stance) > 0:
        intersection = words_stance.intersection(words_steelman)
        similarity_score = len(intersection) / len(words_stance)

    if similarity_score < 0.7:
        return {
            "error": "Agentic Steel-manning Failed.",
            "message": f"Semantic fidelity score {similarity_score:.2f} is below the 0.7 threshold. You must accurately represent {opponent}'s argument before countering.",
            "accepted": False
        }

    return {
        "message": f"Counter-argument accepted. Steel-man fidelity: {similarity_score:.2f}",
        "accepted": True,
        "counter_argument": counter_argument
    }

@mcp_server.tool()
async def trigger_production_mint(automated_workforce_output: int, amount_to_mint: int, auth_token: str = "") -> dict:
    """
    Acts as the Web3 Bridge / Oracle. Tracks real-world production metrics
    and triggers the `mintFromProduction` function on the GlobalDefenseToken (GDT) smart contract.
    """
    expected_key = os.environ.get('HYPERVISOR_API_KEY')
    if expected_key and auth_token != f"Bearer {expected_key}":
        return {"error": "Security Halt: Server identity unverified."}

    # In a real implementation, this would use Web3.py to interact with the GDT contract
    # on the Grid/Pulsechain network, signing the transaction as an authorized Oracle.

    # Simulated Web3 Interaction
    contract_address = os.environ.get("GDT_CONTRACT_ADDRESS", "0x0000000000000000000000000000000000000000")
    oracle_address = os.environ.get("ORACLE_WALLET_ADDRESS", "0x0000000000000000000000000000000000000001")

    # Simulated WORM Audit Log
    audit_log = {
        "event": "mintFromProduction",
        "contract": contract_address,
        "oracle": oracle_address,
        "automated_workforce_output": automated_workforce_output,
        "amount_minted": amount_to_mint,
        "status": "Submitted to Mempool",
        "tx_hash": f"0x{uuid.uuid4().hex}{uuid.uuid4().hex}"
    }
    print(f"Web3 Bridge Event: {audit_log}")

    return {
        "message": f"Successfully bridged production metrics to GDT contract. Minted {amount_to_mint} GDT.",
        "transaction_receipt": audit_log
    }

@mcp_server.tool()
async def bridge_qdao_proposal(proposal_description: str, is_strategic: bool, auth_token: str = "") -> dict:
    """
    Bridges a policy proposal from the Python mesh (e.g., after PVP simulation)
    to the ZoverionsDAO smart contract for quadratic voting or multi-sig veto.
    """
    expected_key = os.environ.get('HYPERVISOR_API_KEY')
    if expected_key and auth_token != f"Bearer {expected_key}":
        return {"error": "Security Halt: Server identity unverified."}

    # Simulated Web3 Interaction to createProposal on ZoverionsDAO
    dao_address = os.environ.get("QDAO_CONTRACT_ADDRESS", "0x0000000000000000000000000000000000000002")

    proposal_id = int(uuid.uuid4().int % 10000) # Simulated ID

    audit_log = {
        "event": "createProposal",
        "contract": dao_address,
        "proposal_id": proposal_id,
        "description": proposal_description,
        "is_strategic": is_strategic,
        "tx_hash": f"0x{uuid.uuid4().hex}{uuid.uuid4().hex}"
    }
    print(f"Web3 Bridge Event: {audit_log}")

    return {
        "message": f"Successfully submitted proposal to ZoverionsDAO.",
        "proposal_id": proposal_id,
        "transaction_receipt": audit_log
    }

if __name__ == "__main__":
    # SUB-H.2 Hypervisor: MCP server implementation (planned for 8081)
    # Standalone FastMCP server exposed on port 8081 for dedicated MCP traffic
    mcp_server.run(transport="http", host="0.0.0.0", port=8081)
