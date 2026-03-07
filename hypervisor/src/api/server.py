from fastapi import FastAPI
import uuid
from pydantic import BaseModel
from typing import Dict, Any
import requests

# Assuming paths are properly resolved
from src.models.intent import IntentObject, IntentResponse
from src.engine.context import ContextEngine
from src.pulse.pulse import EntropyMonitor
from src.llm.provider import LLMProvider
from src.cortex.dialectic import DialecticOrchestrator
from src.evolution.skill_rl import EvolutionEngine
from src.evolution.network_sync import NetworkSync

app = FastAPI()
context_engine = ContextEngine()
pulse = EntropyMonitor()
llm = LLMProvider()
dialectic = DialecticOrchestrator()
evolution = EvolutionEngine()
network_sync = NetworkSync()

SANDBOX_URL = "http://localhost:4000/execute"

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

        # Standard LLM handling
        context = context_engine.get_context(content)
        raw_response = llm.process(context)

        if pulse.measure(raw_response):
            return IntentResponse(id=str(uuid.uuid4()), intent_id=intent.id, response="System Halt: Thermodynamic anomaly detected.", status="error")

        return IntentResponse(id=str(uuid.uuid4()), intent_id=intent.id, response=raw_response, status="success")
    except Exception as e:
        return IntentResponse(id=str(uuid.uuid4()), intent_id=intent.id, response=f"Hypervisor error: {str(e)}", status="error")

@app.get("/health")
async def health_check():
    return {"status": "ok", "component": "hypervisor"}
