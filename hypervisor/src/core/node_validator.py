import time
import json
import hmac
import hashlib
import base64
import httpx
import os
import asyncio
from typing import Dict, Any, Optional

class NodeValidator:
    def __init__(self, token_issuer_url: str = "http://localhost:8081", sync_interval_seconds: int = 30):
        self.token_issuer_url = token_issuer_url
        self.secret_key = os.environ.get("CAPABILITY_TOKEN_SECRET", "hypervisor_capability_token_secret").encode()
        self.revoked_tokens = set()
        self.seen_nonces = set()
        self.sync_interval = sync_interval_seconds
        self._sync_task = None
        self._is_running = False

    def start_background_sync(self):
        """Starts the background task to poll for revocations."""
        if not self._is_running:
            self._is_running = True
            self._sync_task = asyncio.create_task(self._sync_loop())

    def stop_background_sync(self):
        """Stops the background task."""
        self._is_running = False
        if self._sync_task:
            self._sync_task.cancel()

    async def _sync_loop(self):
        while self._is_running:
            await self.sync_revocations()
            await asyncio.sleep(self.sync_interval)

    def _verify_signature(self, payload_b64: str, sig: str) -> bool:
        try:
            expected_sig = hmac.new(self.secret_key, payload_b64.encode(), hashlib.sha256).digest()
            expected_sig_b64 = base64.urlsafe_b64encode(expected_sig).decode('utf-8')
            return hmac.compare_digest(expected_sig_b64, sig)
        except Exception:
            return False

    async def sync_revocations(self):
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(f"{self.token_issuer_url}/token/revocations", timeout=2.0)
                if response.status_code == 200:
                    data = response.json()
                    if "revoked_tokens" in data:
                        self.revoked_tokens.update(data["revoked_tokens"])
        except Exception as e:
            # Network partition simulation: fail silently to use offline cache
            pass

    def validate_token(self, token: str, expected_capsule_id: str, expected_data_scope: str, nonce: Optional[str] = None) -> Dict[str, Any]:
        """
        Validates the capability token.
        Raises ValueError if token is invalid, expired, revoked, or mismatches expected context.
        """
        if not token or "." not in token:
            raise ValueError("Invalid token format")

        if token in self.revoked_tokens:
            raise ValueError("Token has been revoked")

        if nonce:
            if nonce in self.seen_nonces:
                raise ValueError("Token replay detected: nonce already used")
            self.seen_nonces.add(nonce)

        try:
            payload_b64, sig = token.split(".", 1)
        except ValueError:
            raise ValueError("Invalid token structure")

        if not self._verify_signature(payload_b64, sig):
            raise ValueError("Invalid token signature")

        try:
            payload_bytes = base64.urlsafe_b64decode(payload_b64)
            payload = json.loads(payload_bytes.decode('utf-8'))
        except Exception:
            raise ValueError("Invalid token payload")

        # Validate Expiry
        if int(time.time()) > payload.get("exp", 0):
            raise ValueError("Token has expired")

        # Validate Capsule Match
        if payload.get("capsule_id") != expected_capsule_id:
            raise ValueError(f"Capsule ID mismatch: expected {expected_capsule_id}, got {payload.get('capsule_id')}")

        # Validate Data Scope
        if payload.get("data_scope") != expected_data_scope:
            raise ValueError(f"Data scope mismatch: expected {expected_data_scope}, got {payload.get('data_scope')}")

        return payload
