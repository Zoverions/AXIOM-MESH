from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import uuid
import random
import requests
import os
import httpx
import ast
import json
from datetime import datetime

def log_event(level: str, msg: str, trace_id: str = None):
    log_data = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "level": level,
        "message": msg
    }
    if trace_id:
        log_data["trace_id"] = trace_id
    print(json.dumps(log_data))

import asyncio

from src.models.intent import IntentObject, IntentResponse
from src.engine.context import ContextEngine
from src.pulse.pulse import EntropyMonitor
from src.pulse.arena import VerificationArena
from src.llm.provider import LLMProvider
from src.cortex.dialectic import DialecticOrchestrator
from src.evolution.skill_rl import EvolutionEngine, ActionEngine
from src.evolution.openclaw import SignalExtractor, OnPolicyDistillation
from src.evolution.network_sync import NetworkSync
from src.cortex.autoresearch import AutoResearchDaemon
from src.evolution.auto_training import AutoTrainingLoop
from src.api.audio import router as audio_router
from src.zkml.prover import EdgeZKMLProver
from contextlib import asynccontextmanager

context_engine = ContextEngine()
pulse = EntropyMonitor()
arena = VerificationArena()
llm = LLMProvider()
dialectic = DialecticOrchestrator(llm=llm)
evolution = EvolutionEngine()
network_sync = NetworkSync()
action_engine = ActionEngine(network_sync=network_sync)
signal_extractor = SignalExtractor()
opd = OnPolicyDistillation()

autoresearch_daemon = AutoResearchDaemon(
    archive=context_engine.deep_archive,
    llm=llm,
    action_engine=action_engine,
    ncp_client=context_engine.ncp_client
)
auto_training_loop = AutoTrainingLoop()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Phase 1 Initialization Acknowledged
    print("AxiomMesh Phase 1 Cognitive Hypervisor Started")
    autoresearch_daemon.start()
    auto_training_loop.start()
    yield
    autoresearch_daemon.stop()
    auto_training_loop.stop()

app = FastAPI(lifespan=lifespan)
app.include_router(audio_router)

hypervisor_metrics = {"requests": 0, "errors": 0}

SANDBOX_URL = os.environ.get("SANDBOX_URL", "http://localhost:4000/execute")

# Security: Basic AST-based sanitization
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
security = HTTPBearer()

def verify_api_key(credentials: HTTPAuthorizationCredentials = Depends(security)):
    expected_api_key = os.environ.get("HYPERVISOR_API_KEY")
    if not expected_api_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server configuration error: HYPERVISOR_API_KEY is not set",
        )
    if credentials.credentials != expected_api_key:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid API Key",
        )
    return credentials.credentials

@app.post("/process", response_model=IntentResponse)
async def process_intent(intent: IntentObject, api_key: str = Depends(verify_api_key)):
    hypervisor_metrics["requests"] += 1
    audit_trail = {
        "intent_replay": {
            "content": intent.content,
            "channel": intent.channel,
            "sender": intent.metadata.get("sender", "unknown")
        },
        "safety_decisions": {
            "ast_sanitization": "N/A",
            "mirofish_spatial_block": "N/A",
            "riker_probe_injected": False,
            "pulse_anomaly": False,
            "arena_verification": "N/A"
        },
        "why_this_answer": {
            "context_tier_1_temporal": bool(context_engine.temporal_state.get_collapsed_state()),
            "context_tier_3_archive": True,
            "sampling_perturbation": False
        }
    }

    try:
        log_event("info", f"Processing intent from sender: {intent.metadata.get('sender', 'unknown')}", getattr(intent, 'trace_id', None))
        content = intent.content
        sender = intent.metadata.get("sender", "unknown")

        # OpenClaw-RL: Next-State Signal Recovery
        if context_engine.interaction_history:
            last_interaction = context_engine.interaction_history[-1]
            last_response = last_interaction.get("response", "")

            # Extract signals from current intent based on last response
            signals = signal_extractor.extract_signals(content, last_response)

            if signals["reward"] != 0 or signals["is_directive"]:
                # Judge rollout via MiroFish PRM
                miro_score = context_engine.deep_archive.miro_mapper.judge_rollout(
                    action=last_interaction.get("intent_content", ""),
                    feedback_signal=signals
                )
                # Update reward with PRM Judge's score
                signals["reward"] = miro_score

                # Store rollout in Evolution Engine
                evolution.store_rollout(last_interaction.get("intent_content", ""), signals, sender)

                # If it's a directive signal, attempt On-Policy Distillation
                if signals["is_directive"]:
                    opd.distill(last_interaction.get("intent_content", ""), signals, sender)

        # Handle special Mode command
        if content.startswith("/mode"):
            parts = content.split(" ", 1)
            if len(parts) > 1:
                mode = parts[1].strip().lower()
                allowed_modes = ["concise", "analytical", "socratic", "executive"]
                if mode in allowed_modes:
                    context_engine.set_user_mode(sender, mode)
                    return IntentResponse(id=str(uuid.uuid4()), intent_id=intent.id, response=f"Mode set to {mode} successfully.", status="success")
                else:
                    return IntentResponse(id=str(uuid.uuid4()), intent_id=intent.id, response=f"Invalid mode. Allowed modes are: {', '.join(allowed_modes)}.", status="error")
            else:
                return IntentResponse(id=str(uuid.uuid4()), intent_id=intent.id, response="Please specify a mode. Allowed modes are: concise, analytical, socratic, executive.", status="error")

        # Handle special Dialectic command
        if content.startswith("/dialectic"):
            synthesis = await dialectic.synthesize(content[len("/dialectic"):].strip())
            return IntentResponse(id=str(uuid.uuid4()), intent_id=intent.id, response=synthesis, status="success", audit_trail=audit_trail)

        # Handle special Code Execution command
        if content.startswith("/exec"):
            code = content[len("/exec"):].strip()

            if not is_safe_code(code):
                audit_trail["safety_decisions"]["ast_sanitization"] = "Failed"
                return IntentResponse(id=str(uuid.uuid4()), intent_id=intent.id, response="Security Halt: Code execution contains forbidden operations (e.g., os, sys, eval, open).", status="error", audit_trail=audit_trail)
            audit_trail["safety_decisions"]["ast_sanitization"] = "Passed"

            # MiroFish Spatial Security Check
            # Assuming 'user_node' is the origin for standard /exec commands
            if not context_engine.miro_mapper.is_operation_allowed("user_node", "shell_execution"):
                audit_trail["safety_decisions"]["mirofish_spatial_block"] = "Blocked"
                return IntentResponse(id=str(uuid.uuid4()), intent_id=intent.id, response="MiroFish Spatial Block: Unauthorized compliance attempt detected.", status="error", audit_trail=audit_trail)
            audit_trail["safety_decisions"]["mirofish_spatial_block"] = "Allowed"

            try:
                async with httpx.AsyncClient() as client:
                    sandbox_res = await client.post(SANDBOX_URL, json={"language": "python", "code": code})
                    response_text = f"Execution result:\n{sandbox_res.json()}"
            except Exception as e:
                response_text = f"Sandbox execution failed: {e}"
            return IntentResponse(id=str(uuid.uuid4()), intent_id=intent.id, response=response_text, status="success", audit_trail=audit_trail)

        # Sync Skills command
        if content.startswith("/sync_skills"):
            skills = network_sync.sync_skills()
            return IntentResponse(id=str(uuid.uuid4()), intent_id=intent.id, response=f"Synced skills: {skills}", status="success", audit_trail=audit_trail)

        # Standard LLM handling with Tier 1 and Tier 3 memory
        context = await context_engine.get_context(intent)

        # Divergence Engine sampling perturbations
        sampling_params = context_engine.divergence_engine.apply_sampling_perturbation({})
        freq_penalty = sampling_params.get("frequency_penalty", 0.0)
        pres_penalty = sampling_params.get("presence_penalty", 0.0)

        if freq_penalty > 0.0 or pres_penalty > 0.0:
            audit_trail["why_this_answer"]["sampling_perturbation"] = True

        # Periodic RIKER Hallucination Probe
        if random.random() < 0.1: # 10% chance to inject probe
            probes = arena.riker.get_hallucination_probes()
            if probes:
                audit_trail["safety_decisions"]["riker_probe_injected"] = True
                probe = random.choice(probes)
                probe_q = f"What is the {probe['attribute']} of {probe['entity']}?"
                # Hallucination probe always uses base params to avoid confounding factors
                probe_res = await llm.process(f"Axiom: {context_engine.axioms}\n\nQuestion: {probe_q}")
                if not arena.check_hallucination_response(probe_res):
                    audit_trail["safety_decisions"]["riker_probe_result"] = "Failed"
                    return IntentResponse(id=str(uuid.uuid4()), intent_id=intent.id, response="System Halt: RIKER Hallucination Probe failure. LLM fabricated data for non-existent CSU entity.", status="error", audit_trail=audit_trail)
                audit_trail["safety_decisions"]["riker_probe_result"] = "Passed"

        raw_response = await llm.process(context, frequency_penalty=freq_penalty, presence_penalty=pres_penalty)

        # The Pulse Check
        if pulse.measure(raw_response):
            audit_trail["safety_decisions"]["pulse_anomaly"] = True
            return IntentResponse(id=str(uuid.uuid4()), intent_id=intent.id, response="System Halt: Thermodynamic anomaly detected. Suspected hallucination/guessing loop.", status="error", audit_trail=audit_trail)
        audit_trail["safety_decisions"]["pulse_anomaly"] = False

        # The Arena Validation before returning text
        if not arena.verify(action_intent=content, proposed_execution=raw_response):
            audit_trail["safety_decisions"]["arena_verification"] = "Failed"
            return IntentResponse(id=str(uuid.uuid4()), intent_id=intent.id, response="Arena Security Halt: The LLM output failed verification (Autoregressive Hallucination Floor crossed).", status="error", audit_trail=audit_trail)
        audit_trail["safety_decisions"]["arena_verification"] = "Passed"

        # Automatically store new interactions in Deep Archive
        metadata_to_store = {"session_id": intent.session_id}
        if hasattr(context_engine.deep_archive, "sync_to_grid") and asyncio.iscoroutinefunction(context_engine.deep_archive.sync_to_grid):
            await context_engine.deep_archive.sync_to_grid(content, metadata_to_store)
        else:
            context_engine.deep_archive.add(content=content, metadata=metadata_to_store)

        # Update interaction history for next-state signal recovery
        context_engine.interaction_history.append({
            "intent_id": intent.id,
            "intent_content": content,
            "response": raw_response,
            "sender": sender
        })

        # Mock confidence and provenance based on context presence
        confidence = 0.95 if "DEEP ARCHIVE CONTEXT" in context and len(context) > 2000 else 0.75
        provenance = []
        if "EXTERNAL NCP CONTEXT" in context:
            provenance.append("NCP")
        if "EXTERNAL MCP CONTEXT" in context:
            provenance.append("MCP")
        if "TRUTH CONTEXT" in context:
            provenance.append("Chainlink Oracle")
        if not provenance:
            provenance.append("Base Model")

        return IntentResponse(
            id=str(uuid.uuid4()),
            intent_id=intent.id,
            response=raw_response,
            status="success",
            confidence=confidence,
            provenance=provenance
        )
        return IntentResponse(id=str(uuid.uuid4()), intent_id=intent.id, response=raw_response, status="success", audit_trail=audit_trail)
    except Exception as e:
        hypervisor_metrics["errors"] += 1
        log_event("error", f"Hypervisor error: {str(e)}", getattr(intent, 'trace_id', None))
        return IntentResponse(id=str(uuid.uuid4()), intent_id=intent.id, response=f"Hypervisor error: {str(e)}", status="error")

@app.get("/metrics")
async def get_metrics():
    return hypervisor_metrics

@app.get("/health")
async def health_check():
    log_event("info", "Health check requested")
    return {
        "status": "ok",
        "component": "hypervisor",
        "dependencies": {
            "grid": "ok",
            "sandbox": "ok"
        }
    }

@app.get("/memory")
async def get_memory(session_id: str = None):
    memories = context_engine.deep_archive.get_all(session_id)
    return {"status": "success", "memories": memories}

@app.delete("/memory/{node_id}")
async def delete_memory(node_id: str):
    success = context_engine.deep_archive.delete(node_id)
    if success:
        return {"status": "success"}
    return {"status": "error", "message": "Memory node not found"}

@app.put("/memory/{node_id}")
async def edit_memory(node_id: str, update_data: dict):
    new_content = update_data.get("content")
    metadata_updates = update_data.get("metadata", {})
    success = context_engine.deep_archive.edit(node_id, new_content, metadata_updates)
    if success:
        return {"status": "success"}
    return {"status": "error", "message": "Memory node not found"}

@app.post("/zkml/infer")
async def zkml_infer(input_data: dict):
    """
    Executes an inference pass on the edge node and submits the zkML proof
    to the Grid network for consensus verification.
    """
    input_vector = input_data.get("input", [])
    if not input_vector:
        return {"status": "error", "message": "Input vector required"}

    # Initialize the Prover (could be a pre-trained Skill Vector in the future)
    prover = EdgeZKMLProver(weights=[0.5, -0.2, 0.8, 1.2])

    # 1. Edge Compute + Proof Generation
    result = prover.infer_and_prove(input_vector)

    # 2. Submit to Grid Consensus
    try:
        grid_url = "http://localhost:5000/zkml/verify"
        async with httpx.AsyncClient() as client:
            response = await client.post(grid_url, json=result, timeout=10.0)
            if response.status_code == 200:
                result["consensus"] = "verified"
            else:
                result["consensus"] = "failed"
                result["grid_error"] = response.text
    except Exception as e:
        result["consensus"] = "network_error"
        result["grid_error"] = str(e)

    return result

@app.get("/agents")
async def agents_status():
    """Returns the current state and plans of all active background daemons and agents."""
    return {
        "agents": [
            {
                "name": "AutoResearch Daemon",
                "status": "Active (Idle/Foraging)" if autoresearch_daemon.running else "Stopped",
                "current_task": "Epistemic foraging from unstructured data",
                "next_plan": "Compile new findings into the Tier 3 Knowledge Graph when node is idle."
            },
            {
                "name": "AutoTraining Loop",
                "status": "Active (Mutating)" if auto_training_loop.running else "Stopped",
                "current_task": "Autonomously mutating code in the Execution Sandbox",
                "next_plan": "Evaluate metrics against validation set and retain code with lower loss."
            },
            {
                "name": "Dialectic Orchestrator",
                "status": "Standby",
                "current_task": "Awaiting dialectic topics",
                "next_plan": "Synthesize thesis and antithesis upon command."
            }
        ]
    }
