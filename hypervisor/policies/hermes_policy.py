# hypervisor/policies/hermes_policy.py

"""
Policy definition for Hermes Agent integration.
This module defines allowed models, tools, and risk thresholds for Hermes.
"""

HERMES_POLICY = {
    "allowed_models": ["nous-hermes-3", "llama-3.1-70b", "gpt-4o"],
    "max_daily_spend_usd": 50,
    "allowed_tools": ["web_search", "browser", "code_execution", "pulsechain_read"],
    "high_risk_tools": ["send_transaction", "stake_tokens"],
    "requires_grid_approval": ["send_transaction", "create_skill_high_impact"],
    "memory_commit_threshold": "important_facts_only",
    "max_sub_agents": 3,
    "sandbox_isolation_level": "strict",
}

def validate_hermes_action(action: dict, context: dict) -> bool:
    """
    Validates a proposed action by Hermes against the security policy.

    Returns:
        bool: True if allowed, False if it needs additional approval or is denied.
    """
    action_type = action.get("type")

    if action_type in HERMES_POLICY["high_risk_tools"]:
        # Logic to request a capability token from Grid would go here
        # return request_grid_capability_token(action, context)
        return False # Default to false until Grid integration is implemented

    return action_type in HERMES_POLICY["allowed_tools"]
