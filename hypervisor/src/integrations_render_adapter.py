import hashlib
import hmac
import json
import os
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import httpx


class RenderAdapterError(RuntimeError):
    """Raised when Render adapter operations fail fail-closed checks."""


@dataclass
class RenderJobRequest:
    model: str
    input_uri: str
    callback_url: str
    params: Dict[str, Any] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)


class RenderAdapter:
    """Spike adapter for external Render GPU job flow + callback evidence hooks."""

    def __init__(
        self,
        api_base: Optional[str] = None,
        api_key: Optional[str] = None,
        signing_key: Optional[str] = None,
        timeout_seconds: float = 15.0,
        client: Optional[httpx.AsyncClient] = None,
    ) -> None:
        self.api_base = (api_base or os.getenv("RENDER_API_BASE", "https://api.render.network")).rstrip("/")
        self.api_key = api_key or os.getenv("RENDER_API_KEY", "")
        self.signing_key = signing_key or os.getenv("RENDER_CALLBACK_SIGNING_KEY", "")
        self.timeout_seconds = timeout_seconds
        self._client = client

    async def submit_job(self, request: RenderJobRequest) -> Dict[str, Any]:
        if not self.api_key:
            raise RenderAdapterError("RENDER_API_KEY is required for external job submission")

        payload = {
            "model": request.model,
            "input_uri": request.input_uri,
            "callback_url": request.callback_url,
            "params": request.params,
            "metadata": request.metadata,
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "X-Axiom-Submission-Id": str(uuid.uuid4()),
        }

        async with self._client_or_default() as client:
            resp = await client.post(
                f"{self.api_base}/v1/jobs",
                json=payload,
                headers=headers,
            )
        if resp.status_code >= 400:
            raise RenderAdapterError(f"Render submit failed ({resp.status_code}): {resp.text}")

        body = resp.json()
        job_id = body.get("job_id") or body.get("id")
        if not job_id:
            raise RenderAdapterError("Render submit response missing job identifier")

        return {
            "provider": "render",
            "job_id": job_id,
            "status": body.get("status", "submitted"),
            "submitted_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "raw": body,
        }

    def ingest_callback(self, callback_payload: Dict[str, Any], signature: str) -> Dict[str, Any]:
        if not self.signing_key:
            raise RenderAdapterError("RENDER_CALLBACK_SIGNING_KEY is required for callback verification")

        expected = self._sign_payload(callback_payload)
        if not hmac.compare_digest(expected, signature):
            raise RenderAdapterError("Render callback signature validation failed")

        if "job_id" not in callback_payload:
            raise RenderAdapterError("Render callback payload missing job_id")

        return {
            "provider": "render",
            "job_id": callback_payload["job_id"],
            "status": callback_payload.get("status", "unknown"),
            "result_uri": callback_payload.get("result_uri"),
            "received_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "callback": callback_payload,
        }

    def build_signed_evidence(self, callback_record: Dict[str, Any]) -> Dict[str, Any]:
        if not self.signing_key:
            raise RenderAdapterError("RENDER_CALLBACK_SIGNING_KEY is required for evidence signing")

        canonical = self._canonical_json(callback_record)
        evidence_hash = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
        evidence = {
            "provider": "render",
            "job_id": callback_record.get("job_id"),
            "status": callback_record.get("status"),
            "result_uri": callback_record.get("result_uri"),
            "evidence_hash": evidence_hash,
            "signed_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        }
        evidence["signature"] = self._sign_payload(evidence)
        return evidence

    def _sign_payload(self, payload: Dict[str, Any]) -> str:
        canonical = self._canonical_json(payload)
        return hmac.new(self.signing_key.encode("utf-8"), canonical.encode("utf-8"), hashlib.sha256).hexdigest()

    @staticmethod
    def _canonical_json(payload: Dict[str, Any]) -> str:
        return json.dumps(payload, sort_keys=True, separators=(",", ":"))

    def _client_or_default(self):
        if self._client is not None:
            return _PassthroughClient(self._client)
        return httpx.AsyncClient(timeout=self.timeout_seconds)


class _PassthroughClient:
    """Context manager wrapper so injected clients are not auto-closed."""

    def __init__(self, client: httpx.AsyncClient):
        self.client = client

    async def __aenter__(self) -> httpx.AsyncClient:
        return self.client

    async def __aexit__(self, exc_type, exc, tb):
        return False
