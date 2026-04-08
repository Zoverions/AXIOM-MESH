from typing import Any, Dict, Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from src.integrations_render_adapter import RenderAdapter, RenderAdapterError, RenderJobRequest

router = APIRouter(prefix="/api/v1/render", tags=["render"])
_adapter = RenderAdapter()


class RenderSubmitBody(BaseModel):
    model: str = Field(..., min_length=1)
    input_uri: str = Field(..., min_length=1)
    callback_url: str = Field(..., min_length=1)
    params: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class RenderCallbackBody(BaseModel):
    job_id: str
    status: str
    result_uri: Optional[str] = None
    output: Dict[str, Any] = Field(default_factory=dict)


@router.post("/jobs")
async def submit_render_job(body: RenderSubmitBody):
    try:
        submitted = await _adapter.submit_job(
            RenderJobRequest(
                model=body.model,
                input_uri=body.input_uri,
                callback_url=body.callback_url,
                params=body.params,
                metadata=body.metadata,
            )
        )
        return submitted
    except RenderAdapterError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/callbacks")
async def ingest_render_callback(body: RenderCallbackBody, x_render_signature: Optional[str] = Header(default=None)):
    if not x_render_signature:
        raise HTTPException(status_code=401, detail="Missing X-Render-Signature header")

    try:
        callback_record = _adapter.ingest_callback(body.model_dump(), x_render_signature)
        evidence = _adapter.build_signed_evidence(callback_record)
        return {"callback": callback_record, "evidence": evidence}
    except RenderAdapterError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
