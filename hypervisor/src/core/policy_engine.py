import json
import os
import logging
from typing import Dict, Tuple

logger = logging.getLogger(__name__)

class PolicyEngine:
    """Formal structured policy engine for the reasoning auditor."""

    def __init__(self, policy_file_path: str = None):
        if policy_file_path is None:
            # Default to the schema file location for now if a specific policy document isn't provided
            policy_file_path = os.environ.get("POLICY_PATH", "schemas/policy.schema.json")

        self.rules = self._load_policies(policy_file_path)

    def _load_policies(self, path: str) -> Dict:
        try:
            with open(path, 'r') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Failed to load policy from {path}: {e}. Using default permissive policy.")
            return {}

    def evaluate(self, intent: object) -> Tuple[bool, Dict, str]:
        """
        Evaluates the Universal Consent Protocol (UCP) and structured policy constraints.
        Returns: (is_allowed, policy_decisions_dict, reason_string)
        """
        max_len = int(os.environ.get("HYPERVISOR_MAX_CONTENT_LENGTH", "4000"))

        content = getattr(intent, 'content', '') or ""
        metadata = getattr(intent, 'metadata', {}) or {}

        # Universal Consent Protocol (UCP): No implicit allowed default.
        consent_scope = metadata.get("consent_scope")

        decisions = {
            "content_length_ok": len(content) <= max_len,
            "consent_scope_provided": consent_scope is not None,
            "consent_scope_valid": consent_scope in {"allowed", "context_only", "revoked"},
            "exec_requires_allowed_consent": (not content.startswith("/exec")) or consent_scope == "allowed"
        }

        # Extend evaluation with formal rules if loaded (e.g. Sandbox privacy policy checks)
        sandbox_rules = self.rules.get("properties", {}).get("sandbox", {}).get("properties", {})
        if sandbox_rules:
            # Check if intent violates any loaded formal sandbox policies.
            # Example: restrict to local-only privacy.
            required_privacy = sandbox_rules.get("privacy", {}).get("properties", {}).get("level", {}).get("enum", [])
            intent_privacy = metadata.get("privacy_level")

            # If the policy specifies privacy enums and the user requests one, it must be valid
            if required_privacy and intent_privacy:
                decisions["privacy_level_valid"] = intent_privacy in required_privacy
                if not decisions["privacy_level_valid"]:
                    return False, decisions, f"Violation of policy: privacy level {intent_privacy} not in {required_privacy}"

        # Consolidate decisions
        if not decisions["content_length_ok"]:
            return False, decisions, f"Input too long (max {max_len} chars)"
        if not decisions["consent_scope_provided"]:
            return False, decisions, "Missing required consent_scope metadata for UCP compliance"
        if not decisions["consent_scope_valid"]:
            return False, decisions, "Invalid consent_scope value"
        if not decisions["exec_requires_allowed_consent"]:
            return False, decisions, "Code execution requires consent_scope=allowed"

        return True, decisions, "ok"
