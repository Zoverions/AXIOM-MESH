from typing import Dict, Any

PROXY_POLICY = {
    "allowed_endpoints": [
        "anyip.io",
        "proxy.anyip.io"
    ],
    "max_bandwidth_bytes": 1024 * 1024 * 100, # 100 MB per capability request limit
    "allowed_network_types": ["residential", "mobile"],
    "requires_onchain_stake": True
}

def validate_proxy_action(action: Dict[str, Any]) -> bool:
    """
    Validates a requested proxy capability action against the strict proxy network policy.
    Ensures fail-closed behavior for endpoints.
    """
    if "target_network_type" in action:
        if action["target_network_type"] not in PROXY_POLICY["allowed_network_types"]:
            return False

    if "bandwidth_requested" in action:
        if action["bandwidth_requested"] > PROXY_POLICY["max_bandwidth_bytes"]:
            return False

    # For fail-closed behavior, missing endpoint or endpoint not in allowlist is rejected
    if "endpoint" not in action or action["endpoint"] not in PROXY_POLICY["allowed_endpoints"]:
        return False

    return True
