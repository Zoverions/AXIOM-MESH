from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional
import time
import hmac
import hashlib
import json
import base64
import os
from src.core.secrets import SecretManager

router = APIRouter(prefix="/token", tags=["token"])

# Load secret key securely, fallback to a default only for local testing (not recommended in prod)
raw_secret = SecretManager.get_secret("CAPABILITY_TOKEN_SECRET")
if not raw_secret:
    raise RuntimeError("CAPABILITY_TOKEN_SECRET is missing or empty. A secure secret must be configured.")
SECRET_KEY = raw_secret.encode()

ISSUER_ID = "hypervisor-token-issuer"

# In-memory storage for MVP
_revoked_tokens = set()

class ComputeBudget(BaseModel):
    cpu_ms: int = Field(1000, ge=0)
    gpu_ms: int = Field(0, ge=0)
    memory_mb: int = Field(256, ge=0)

class TokenIssueRequest(BaseModel):
    requester_id: str
    capsule_id: str
    consent_proof: str
    target_node: str = "*"
    ttl_seconds: int = Field(3600, gt=0)
    data_scope: str = "default_scope"
    compute_budget: Optional[ComputeBudget] = None

class TokenRevokeRequest(BaseModel):
    token: str
    requester_id: str

def _sign_payload(payload_b64: str) -> str:
    """Sign the base64 encoded payload directly to avoid JSON serialization mismatches."""
    signature = hmac.new(SECRET_KEY, payload_b64.encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(signature).decode('utf-8')

@router.post("/issue")
async def issue_token(request: TokenIssueRequest):
    if not request.consent_proof:
        raise HTTPException(status_code=400, detail="Invalid consent proof")

    # In a real system, we would validate consent_proof and check capsule compatibility.

    budget = request.compute_budget.dict() if request.compute_budget else ComputeBudget().dict()

    payload = {
        "iss": ISSUER_ID,
        "sub": request.requester_id,
        "capsule_id": request.capsule_id,
        "data_scope": request.data_scope,
        "compute_budget": budget,
        "attestation_required": True,
        "exp": int(time.time()) + request.ttl_seconds,
        "aud": request.target_node
    }

    # Encode payload to base64 string FIRST
    payload_json = json.dumps(payload, separators=(',', ':'))
    payload_b64 = base64.urlsafe_b64encode(payload_json.encode()).decode('utf-8')

    # Sign the base64 string
    sig = _sign_payload(payload_b64)

    # Construct final token string
    token = f"{payload_b64}.{sig}"

    return {"status": "issued", "token": token}

@router.post("/revoke")
async def revoke_token(request: TokenRevokeRequest):
    # Simply add the token string to the revocation list
    _revoked_tokens.add(request.token)
    return {"status": "revoked"}

@router.get("/revocations")
async def get_revocations():
    return {"revoked_tokens": list(_revoked_tokens)}
