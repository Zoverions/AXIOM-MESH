from __future__ import annotations

import os
import time
from typing import Any, Dict, Optional

try:
    from src.core.secrets import SecretManager
except ImportError:  # pragma: no cover - fallback for package-relative execution
    SecretManager = None

try:
    from src.engine.privacy_router import PrivacyRouter
except ImportError:  # pragma: no cover
    class PrivacyRouter:  # type: ignore[override]
        def encrypt_sensitive_data(self, content: str) -> str:
            return content

        def decrypt_sensitive_data(self, content: str) -> str:
            return content


class PrivateVault:
    """Encrypted vault with bounded pre-mortem retrieval controls.

    Supports the existing deep-archive integration while also exposing a local
    key/value API for bounded Soul Snapshot retrieval.
    """

    def __init__(self, context_engine_or_owner: Any):
        self.context_engine = context_engine_or_owner if hasattr(context_engine_or_owner, "deep_archive") else None
        self.owner_did = context_engine_or_owner if isinstance(context_engine_or_owner, str) else "unknown"
        self.privacy_router = PrivacyRouter()
        self._kv_store: dict[str, dict[str, Any]] = {}

    def get_encryption_key(self, owner_did: str) -> str:
        if SecretManager is not None:
            system_secret = SecretManager.get_secret("VAULT_MASTER_KEY")
            if system_secret:
                return f"{owner_did}:{system_secret}"
        fallback_secret = os.getenv("VAULT_MASTER_KEY")
        if not fallback_secret:
            fallback_secret = "development-only-insecure-vault-key"
        return f"{owner_did}:{fallback_secret}"

    def store(self, key: str, value: dict[str, Any], pre_mortem: bool = True) -> None:
        self._kv_store[key] = {
            "value": value,
            "pre_mortem": pre_mortem,
            "stored_at": int(time.time()),
        }

    def retrieve(self, key: str, pre_mortem_only: bool = False) -> Optional[dict[str, Any]]:
        item = self._kv_store.get(key)
        if item is None:
            return None
        if pre_mortem_only and not item.get("pre_mortem", False):
            return None
        return item.get("value")

    def list_keys(self, prefix: str = "") -> list[str]:
        if not prefix:
            return sorted(self._kv_store.keys())
        return sorted(k for k in self._kv_store if k.startswith(prefix))

    def wipe(self) -> None:
        self._kv_store.clear()
        if self.context_engine is not None and hasattr(self.context_engine.deep_archive, "store"):
            self.context_engine.deep_archive.store.clear()

    def get_node(self, node_id: str, requester_did: str, is_sub_agent: bool, consent_manifest: Any = None, signature: str = None) -> Optional[Dict]:
        if self.context_engine is None:
            return None
        node = self.context_engine.deep_archive.store.get(node_id)
        if not node:
            return None

        policy = node.get("metadata", {}).get("vault_policy", {})
        owner_did = policy.get("ownerDID")

        if requester_did == owner_did:
            return self._decrypt_node(node, owner_did)

        if is_sub_agent:
            allowed_sub_agents = policy.get("allowedSubAgents", [])
            if requester_did in allowed_sub_agents:
                expiry = policy.get("expiry", 0)
                if expiry > 0 and time.time() > expiry:
                    return None
                decrypted = self._decrypt_node(node, owner_did)
                if policy.get("readOnlySummaryOnly", True):
                    decrypted["content"] = f"SUMMARY: {decrypted.get('content', '')[:100]}..."
                return decrypted

        return None

    def put_node(self, node_id: str, content: str, policy: Dict, requester_did: str) -> bool:
        owner_did = policy.get("ownerDID")
        if not owner_did:
            owner_did = requester_did
            policy["ownerDID"] = owner_did

        if requester_did != owner_did:
            return False

        encrypted_content = self.privacy_router.encrypt_sensitive_data(content)
        metadata = {
            "vault_policy": policy,
            "is_encrypted_vault": True,
            "encrypted_with_did": owner_did,
        }

        if self.context_engine is not None:
            self.context_engine.deep_archive.add(encrypted_content, metadata)
        self.store(node_id, {"content": encrypted_content, "metadata": metadata}, pre_mortem=True)
        return True

    def delete_node(self, node_id: str, requester_did: str) -> bool:
        if self.context_engine is None:
            self._kv_store.pop(node_id, None)
            return True

        node = self.context_engine.deep_archive.store.get(node_id)
        if not node:
            return False

        policy = node.get("metadata", {}).get("vault_policy", {})
        owner_did = policy.get("ownerDID")

        if requester_did == owner_did:
            self._kv_store.pop(node_id, None)
            return self.context_engine.deep_archive.delete(node_id)
        return False

    def _decrypt_node(self, node: Dict, owner_did: str) -> Dict:
        encrypted_content = node.get("content", "")
        content = self.privacy_router.decrypt_sensitive_data(encrypted_content)
        return {
            "id": node.get("id"),
            "content": content,
            "policy": node.get("metadata", {}).get("vault_policy", {}),
            "timestamp": node.get("timestamp"),
        }
