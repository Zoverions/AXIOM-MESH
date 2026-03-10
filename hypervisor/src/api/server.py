from fastapi import FastAPI
import uuid
from pydantic import BaseModel
from typing import Dict, Any
import requests
import os

from src.models.intent import IntentObject, IntentResponse
from src.engine.context import ContextEngine
from src.pulse.pulse import EntropyMonitor
from src.pulse.arena import VerificationArena
from src.llm.provider import LLMProvider
from src.cortex.dialectic import DialecticOrchestrator
from src.evolution.skill_rl import EvolutionEngine
from src.evolution.network_sync import NetworkSync
from src.cortex.autoresearch import AutoResearchDaemon
from src.evolution.auto_training import AutoTrainingLoop
from src.api.audio import router as audio_router

app = FastAPI()
app.include_router(audio_router)
context_engine = ContextEngine()
autoresearch_daemon = AutoResearchDaemon(archive=context_engine.deep_archive)
auto_training_loop = AutoTrainingLoop()

@app.on_event("startup")
async def startup_event():
    # Phase 1 Initialization Acknowledged
    print("AxiomMesh Phase 1 Cognitive Hypervisor Started")
    autoresearch_daemon.start()
    auto_training_loop.start()

@app.on_event("shutdown")
async def shutdown_event():
    autoresearch_daemon.stop()
    auto_training_loop.stop()
pulse = EntropyMonitor()
arena = VerificationArena()
llm = LLMProvider()
dialectic = DialecticOrchestrator()
evolution = EvolutionEngine()
network_sync = NetworkSync()

SANDBOX_URL = os.environ.get("SANDBOX_URL", "http://localhost:4000/execute")

@app.post("/process", response_model=IntentResponse)
async def process_intent(intent: IntentObject):
    try:
        content = intent.content

        # Handle special Dialectic command
        if content.startswith("/dialectic"):
            synthesis = dialectic.synthesize(content[len("/dialectic"):].strip())
            return IntentResponse(id=str(uuid.uuid4()), intent_id=intent.id, response=synthesis, status="success")

        # Handle special Code Execution command
        if content.startswith("/exec"):
            code = content[len("/exec"):].strip()
            # The Arena validation
            if not arena.verify(action_intent="execute code", proposed_execution=code):
                return IntentResponse(id=str(uuid.uuid4()), intent_id=intent.id, response="Arena Security Halt: Action lacks absolute confidence or exhibits guessing.", status="error")
            try:
                sandbox_res = requests.post(SANDBOX_URL, json={"language": "python", "code": code})
                response_text = f"Execution result:\n{sandbox_res.json()}"
            except Exception as e:
                response_text = f"Sandbox execution failed: {e}"
            return IntentResponse(id=str(uuid.uuid4()), intent_id=intent.id, response=response_text, status="success")

        # Sync Skills command
        if content.startswith("/sync_skills"):
            skills = network_sync.sync_skills()
            return IntentResponse(id=str(uuid.uuid4()), intent_id=intent.id, response=f"Synced skills: {skills}", status="success")

        # Standard LLM handling with Tier 1 and Tier 3 memory
        context = context_engine.get_context(content)
        raw_response = llm.process(context)

        # The Pulse Check
        if pulse.measure(raw_response):
            return IntentResponse(id=str(uuid.uuid4()), intent_id=intent.id, response="System Halt: Thermodynamic anomaly detected. Suspected hallucination/guessing loop.", status="error")

        # The Arena Validation before returning text
        if not arena.verify(action_intent=content, proposed_execution=raw_response):
            return IntentResponse(id=str(uuid.uuid4()), intent_id=intent.id, response="Arena Security Halt: The LLM output failed verification (Autoregressive Hallucination Floor crossed).", status="error")

        # Automatically store new interactions in Deep Archive
        context_engine.deep_archive.add(content)

        return IntentResponse(id=str(uuid.uuid4()), intent_id=intent.id, response=raw_response, status="success")
    except Exception as e:
        return IntentResponse(id=str(uuid.uuid4()), intent_id=intent.id, response=f"Hypervisor error: {str(e)}", status="error")

@app.get("/health")
async def health_check():
    return {"status": "ok", "component": "hypervisor"}

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
