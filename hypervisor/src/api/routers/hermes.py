from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
import time
import hashlib
import uuid

router = APIRouter(prefix="/hermes", tags=["hermes"])

class SpendRecord(BaseModel):
    agent_id: str
    amount: float

class CapabilityRequest(BaseModel):
    agent_id: str
    action_hash: str
    requester: str

# Mock storage
_hermes_spend = {} # agent_id -> total_spent
_hermes_tokens = {} # token -> action_hash

@router.post("/record_spend")
async def record_spend(request: SpendRecord):
    agent_id = request.agent_id
    amount = request.amount

    if agent_id not in _hermes_spend:
        _hermes_spend[agent_id] = 0.0

    _hermes_spend[agent_id] += amount
    return {"status": "success", "total_spent": _hermes_spend[agent_id]}

@router.post("/request_capability")
async def request_capability(request: CapabilityRequest):
    # In a real system, this would call the HermesAgentRegistry smart contract
    token = f"hermes_cap_{uuid.uuid4().hex}"
    _hermes_tokens[token] = request.action_hash

    return {
        "status": "success",
        "token": token,
        "agent_id": request.agent_id,
        "action_hash": request.action_hash
    }

@router.get("/verify_token/{token}")
async def verify_token(token: str, action_hash: str):
    if token in _hermes_tokens and _hermes_tokens[token] == action_hash:
        return {"valid": True}
    return {"valid": False}
