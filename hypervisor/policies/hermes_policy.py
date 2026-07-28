# hypervisor/policies/hermes_policy.py

"""
Policy definition for Hermes Agent integration.
This module defines allowed models, tools, and risk thresholds for Hermes.
"""

from typing import Dict, Any, List

HERMES_POLICY = {
    "allowed_models": ["nous-hermes-3", "llama-3.1-70b", "gpt-4o"],
    "max_daily_spend_usd": 50,
    "allowed_tools": ["web_search", "browser", "code_execution", "pulsechain_read", "task_initialization"],
    "high_risk_tools": ["send_transaction", "stake_tokens", "create_skill_high_impact"],
    "requires_grid_approval": ["send_transaction", "stake_tokens", "create_skill_high_impact"],
    "memory_commit_threshold": "important_facts_only",
    "max_sub_agents": 3,
    "sandbox_isolation_level": "strict",
}

def validate_hermes_action(action: Dict[str, Any], context: Dict[str, Any]) -> bool:
    """
    Validates a proposed action by Hermes against the security policy.

    Returns:
        bool: True if allowed, False if it needs additional approval or is denied.
    """
    action_type = action.get("type")

    # If it's a high risk tool, it must be in the allows list but will require Grid token later
    if action_type in HERMES_POLICY["requires_grid_approval"]:
        # The Hypervisor will intercept this and request a Grid token
        return True

    if action_type in HERMES_POLICY["allowed_tools"]:
        return True

    return False

def get_policy_constraints() -> Dict[str, Any]:
    """Returns the full policy configuration."""
    return HERMES_POLICY
