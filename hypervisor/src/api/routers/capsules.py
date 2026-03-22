from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import uuid
from typing import Dict, Any, List

router = APIRouter(prefix="/capsules", tags=["capsules"])

class IntakeRequest(BaseModel):
    source: str
    name: str
    capabilities: List[str] = []
    constraints: Dict[str, Any] = {}
    runtime: Dict[str, Any] = {}

class CompileRequest(BaseModel):
    capsule_id: str

class VerifyRequest(BaseModel):
    capsule_id: str
    signature: str

from src.capsules.compiler import intake_payload, compile_manifest, verify_signature

@router.post("/intake")
async def intake_capsule(request: IntakeRequest):
    try:
        manifest = intake_payload(
            request.source,
            request.name,
            request.capabilities,
            request.constraints,
            request.runtime
        )
        return {"capsule_id": manifest["capsule_id"], "status": "intake_successful", "manifest": manifest}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/compile")
async def compile_capsule(request: CompileRequest):
    try:
        signature = compile_manifest(request.capsule_id)
        return {"capsule_id": request.capsule_id, "status": "compiled", "signature": signature}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/verify")
async def verify_capsule(request: VerifyRequest):
    try:
        is_valid = verify_signature(request.capsule_id, request.signature)
        if not is_valid:
            raise HTTPException(status_code=400, detail="Invalid signature")
        return {"capsule_id": request.capsule_id, "status": "verified"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
