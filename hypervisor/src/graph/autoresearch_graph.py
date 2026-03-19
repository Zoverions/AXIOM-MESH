from typing import TypedDict, Annotated, Optional
from langgraph.graph import StateGraph, START, END
import httpx
import os
import json
import hashlib

import uuid
from kernel.pulse_monitor import CoTAuditor, CognitiveSubversionError

# Optional LangSmith Tracing
if os.environ.get("LANGSMITH_TRACING_ENABLED", "").lower() in ["true", "1", "yes"]:
    os.environ["LANGCHAIN_TRACING_V2"] = "true"
    os.environ["LANGCHAIN_PROJECT"] = os.environ.get("LANGCHAIN_PROJECT", "axiom-mesh")

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

# Cache for context assembly
_CONTEXT_CACHE = {}

# Define State for the LangGraph
class GraphState(TypedDict):
    intent: str
    context: str
    routing_decision: str
    priority_tag: str
    treasury_split: dict
    sandbox_output: str
    zkml_verified: bool
    stake_status: str

# Node Functions

async def intent_node(state: GraphState):
    """Initializes the intent state."""
    intent = state.get("intent", "Research general consensus mechanisms")
    return {"intent": intent}

async def context_assembly(state: GraphState):
    """Gathers context for the current intent."""
    intent = state.get("intent", "")

    # Check cache first
    intent_hash = hashlib.sha256(intent.encode('utf-8')).hexdigest()
    if intent_hash in _CONTEXT_CACHE:
        return {"context": _CONTEXT_CACHE[intent_hash]}

    # CoT auditor kill-switch enforcement
    try:
        await _audit_text(intent)
    except CognitiveSubversionError as e:
        return {"context": f"Blocked: {e}"}

    # Placeholder for actual context engine logic.
    context = f"Context derived for: {intent}"

    # Cache result
    _CONTEXT_CACHE[intent_hash] = context

    # Implement rudimentary LRU/Bounded behavior by cleaning up if it gets too large
    if len(_CONTEXT_CACHE) > 1000:
        # Remove arbitrary element to keep bounded (or popitem in python 3.7+ keeps insertion order)
        _CONTEXT_CACHE.pop(next(iter(_CONTEXT_CACHE)))

    return {"context": context}

async def resource_balancer(state: GraphState):
    """
    Evaluates the intent and context to determine the best routing path
    (local, peer, Grid, or L1) and computes treasury splits for rewards.
    Also tags priorities based on task complexity.
    """
    intent = state.get("intent", "")

    # Simple heuristics to simulate ResourceBalancer decisions
    routing_decision = "local"
    priority_tag = "normal"
    if "consensus" in intent.lower() or "grid" in intent.lower():
        routing_decision = "grid"
        priority_tag = "high"
    elif "settle" in intent.lower() or "l1" in intent.lower():
        routing_decision = "l1"
        priority_tag = "critical"
    elif "peer" in intent.lower() or "offload" in intent.lower():
        routing_decision = "peer"
        priority_tag = "low"

    # Treasury Split Calculation (Network Security Fund vs Wealth Generation Pool)
    treasury_split = {
        "network_security_fund": 0.60,
        "wealth_generation_pool": 0.40,
        "security_upgrades_applied": ["firewalls", "rate_limits", "audits"] if routing_decision in ["grid", "l1"] else []
    }

    return {
        "routing_decision": routing_decision,
        "priority_tag": priority_tag,
        "treasury_split": treasury_split
    }

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

    GRID_ZKML_URL = os.environ.get("GRID_ZKML_URL", "http://localhost:5000/zkml/verify")

    from hypervisor.src.zkml.prover import EdgeZKMLProver
    prover = EdgeZKMLProver(weights=[0.5, -0.2, 0.8, 1.2])

    input_vector = [1.0, float(len(sandbox_output) % 100), 0.5]
    result = prover.infer_and_prove(input_vector)

    payload = {
        "model_commitment": result.get("model_commitment", "a" * 64),
        "input": input_vector,
        "output": result.get("output", [0.0]),
        "proof": result.get("proof", "groth16-placeholder"),
        "vk": result.get("vk", "dummy_vk"),
        "settings": result.get("settings", "dummy_settings")
    }

    verified = False
    try:
        async with httpx.AsyncClient() as client:
            res = await client.post(GRID_ZKML_URL, json=payload, timeout=5.0)
            if res.status_code == 200:
                verified = True
    except Exception as e:
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

workflow.add_node("intent", intent_node)
workflow.add_node("context_assembly", context_assembly)
workflow.add_node("resource_balancer", resource_balancer)
workflow.add_node("sandbox_exec", sandbox_exec)
workflow.add_node("zkml_verify", zkml_verify)
workflow.add_node("grid_stake", grid_stake)

workflow.add_edge(START, "intent")
workflow.add_edge("intent", "context_assembly")
workflow.add_edge("context_assembly", "resource_balancer")
workflow.add_edge("resource_balancer", "sandbox_exec")
workflow.add_edge("sandbox_exec", "zkml_verify")
workflow.add_edge("zkml_verify", "grid_stake")
workflow.add_edge("grid_stake", END)

# Export the compiled app
autoresearch_app = workflow.compile()
