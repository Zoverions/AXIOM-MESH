from typing import TypedDict, Annotated, Optional
from langgraph.graph import StateGraph, START, END
import httpx
import os
import json
import uuid
from kernel.pulse_monitor import CoTAuditor, CognitiveSubversionError

async def _audit_text(text: str) -> str:
    async def _stream():
        # Chunk text to simulate token streaming for the auditor
        for i in range(0, len(text), 4):
            yield text[i:i+4]

    auditor = CoTAuditor(_stream())
    out = []
    async for token in auditor.stream():
        out.append(token)
    return "".join(out)

# Define State for the LangGraph
class GraphState(TypedDict):
    intent: str
    context: str
    sandbox_output: str
    zkml_verified: bool
    stake_status: str

# Node Functions

async def context_assembly(state: GraphState):
    """Gathers context for the current intent."""
    intent = state.get("intent", "")

    # CoT auditor kill-switch enforcement
    try:
        await _audit_text(intent)
    except CognitiveSubversionError as e:
        return {"context": f"Blocked: {e}"}

    # Placeholder for actual context engine logic.
    context = f"Context derived for: {intent}"
    return {"context": context}

async def sandbox_exec(state: GraphState):
    """Executes code via the external sandbox service."""
    intent = state.get("intent", "")
    context = state.get("context", "")

    # CoT auditor kill-switch enforcement
    try:
        await _audit_text(intent + " " + context)
    except CognitiveSubversionError as e:
        return {"sandbox_output": f"Blocked: {e}"}

    # Normally we would formulate the exact Python or Node code based on intent and context.
    # We will simulate the execution logic.
    code_to_execute = f'print("Executed code based on: {intent[:20]}...")'

    SANDBOX_URL = os.environ.get("SANDBOX_URL", "http://localhost:4000/execute")
    sandbox_output = ""
    try:
        async with httpx.AsyncClient() as client:
            res = await client.post(SANDBOX_URL, json={"language": "python", "code": code_to_execute})
            if res.status_code == 200:
                result_data = res.json()
                sandbox_output = result_data.get("result", {}).get("stdout", "Success")
            else:
                sandbox_output = f"Sandbox Error: {res.status_code}"
    except Exception as e:
        sandbox_output = f"Sandbox Exception: {e}"

    return {"sandbox_output": sandbox_output}

async def zkml_verify(state: GraphState):
    """Verifies output via zkML process."""
    sandbox_output = state.get("sandbox_output", "")

    # We simulate a zkML inference and verification step.
    # Using the local Grid endpoint or internal Prover logic.
    GRID_ZKML_URL = os.environ.get("GRID_ZKML_URL", "http://localhost:5000/zkml/verify")

    # Create dummy proof payload for illustration
    payload = {
        "model_commitment": "a" * 64,
        "input": [1, 2, 3],
        "output": [4, 5, 6],
        "proof": "dummy_proof_data",
        "vk": "dummy_vk",
        "settings": "dummy_settings"
    }

    verified = False
    try:
        async with httpx.AsyncClient() as client:
            res = await client.post(GRID_ZKML_URL, json=payload, timeout=5.0)
            if res.status_code == 200:
                verified = True
    except Exception as e:
        # We might default to False or True during testing depending on environment setup.
        pass

    return {"zkml_verified": verified}

async def grid_stake(state: GraphState):
    """Stakes via Grid ledger based on verified results."""
    verified = state.get("zkml_verified", False)
    stake_status = "Skipped (Not Verified)"

    if verified:
        # Perform staking or skill submission
        GRID_STAKE_URL = os.environ.get("GRID_STAKE_URL", "http://localhost:5000/stake")
        payload = {
            "nodeId": f"node_{uuid.uuid4()}",
            "amount": 100,
            "status": "active"
        }
        try:
            async with httpx.AsyncClient() as client:
                res = await client.post(GRID_STAKE_URL, json=payload, timeout=5.0)
                if res.status_code == 200:
                    stake_status = "Staked Successfully"
                else:
                    stake_status = f"Staking Error: {res.status_code}"
        except Exception as e:
             stake_status = f"Staking Exception: {e}"

    return {"stake_status": stake_status}

# Compile Graph

workflow = StateGraph(GraphState)

workflow.add_node("context_assembly", context_assembly)
workflow.add_node("sandbox_exec", sandbox_exec)
workflow.add_node("zkml_verify", zkml_verify)
workflow.add_node("grid_stake", grid_stake)

workflow.add_edge(START, "context_assembly")
workflow.add_edge("context_assembly", "sandbox_exec")
workflow.add_edge("sandbox_exec", "zkml_verify")
workflow.add_edge("zkml_verify", "grid_stake")
workflow.add_edge("grid_stake", END)

# Export the compiled app
autoresearch_app = workflow.compile()
