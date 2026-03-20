import json
import time
from typing import Dict, Optional
from src.core.secrets import SecretManager

# Use the actual Privacy Router for encryption
from src.memory.memory import PrivacyRouter

class PrivateVault:
    def __init__(self, context_engine):
        # We hook directly into the context_engine's DeepArchive
        self.context_engine = context_engine
        self.privacy_router = PrivacyRouter()

    def get_encryption_key(self, owner_did: str) -> str:
        system_secret = SecretManager.get_secret("VAULT_MASTER_KEY") or "default_master_secret"
        return f"{owner_did}:{system_secret}"

    def get_node(self, node_id: str, requester_did: str, is_sub_agent: bool) -> Optional[Dict]:
        node = self.context_engine.deep_archive.store.get(node_id)
        if not node:
            return None

        policy = node.get("metadata", {}).get("vault_policy", {})
        owner_did = policy.get("ownerDID")

        # Primary personality or human user (matching ownerDID)
        if requester_did == owner_did:
            return self._decrypt_node(node, owner_did)

        # Sub-agents
        if is_sub_agent:
            allowed_sub_agents = policy.get("allowedSubAgents", [])
            if requester_did in allowed_sub_agents:
                expiry = policy.get("expiry", 0)
                if expiry > 0 and time.time() > expiry:
                    return None # Token expired

                decrypted = self._decrypt_node(node, owner_did)
                if policy.get("readOnlySummaryOnly", True):
                    # Mock summary logic
                    decrypted["content"] = f"SUMMARY: {decrypted.get('content', '')[:100]}..."
                return decrypted

        return None

    def put_node(self, node_id: str, content: str, policy: Dict, requester_did: str) -> bool:
        owner_did = policy.get("ownerDID")
        if not owner_did:
            owner_did = requester_did
            policy["ownerDID"] = owner_did

        # Only the owner can write
        if requester_did != owner_did:
            return False

        key = self.get_encryption_key(owner_did)
        # Use privacy router to encrypt the data
        encrypted_content = self.privacy_router.encrypt_sensitive_data(content)

        metadata = {
            "vault_policy": policy,
            "is_encrypted_vault": True,
            "encrypted_with_did": owner_did
        }

        # Store using DeepArchive to hook into Grid persistent ledger
        self.context_engine.deep_archive.add(encrypted_content, metadata)
        return True

    def delete_node(self, node_id: str, requester_did: str) -> bool:
        node = self.context_engine.deep_archive.store.get(node_id)
        if not node:
            return False

        policy = node.get("metadata", {}).get("vault_policy", {})
        owner_did = policy.get("ownerDID")

        if requester_did == owner_did:
            return self.context_engine.deep_archive.delete(node_id)
        return False

    def _decrypt_node(self, node: Dict, owner_did: str) -> Dict:
        key = self.get_encryption_key(owner_did)
        encrypted_content = node.get("content", "")
        # Use privacy router to decrypt
        content = self.privacy_router.decrypt_sensitive_data(encrypted_content)
        return {
            "id": node.get("id"),
            "content": content,
            "policy": node.get("metadata", {}).get("vault_policy", {}),
            "timestamp": node.get("timestamp")
        }
