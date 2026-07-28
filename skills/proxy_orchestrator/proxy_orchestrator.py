import uuid
import time
from typing import Dict, Any

class ProxyOrchestratorSkill:
    """
    Skill for agents to dynamically manage governed proxy capabilities.
    Exercises Gateway capabilities and Grid reputation systems.
    """

    def __init__(self, agent_context: Dict[str, Any]):
        self.context = agent_context
        self.active_capabilities = {}

    def request_proxy_capability(self, target_network: str, bandwidth_req: int) -> Dict[str, Any]:
        """
        Dynamically requests a proxy capability.
        """
        if target_network not in ["residential", "mobile"]:
            raise ValueError("Target network must be 'residential' or 'mobile'")

        capability_id = f"proxy_cap_{uuid.uuid4().hex}"

        # Simulate gateway interaction / capability issuance
        capability = {
            "id": capability_id,
            "targetNetworkType": target_network,
            "bandwidthQuotaBytes": bandwidth_req,
            "sessionSticky": True,
            "issued_at": time.time()
        }

        self.active_capabilities[capability_id] = capability
        return capability

    def rotate_session(self, capability_id: str) -> bool:
        """
        Monitors session health and requests IP rotation if blocked.
        """
        if capability_id not in self.active_capabilities:
            return False

        # Simulate issuing a new session request to the Gateway connector
        self.active_capabilities[capability_id]["sessionSticky"] = False
        self.active_capabilities[capability_id]["last_rotation"] = time.time()

        return True

    def score_proxy_quality(self, capability_id: str, success_rate: float, latency_ms: int) -> int:
        """
        Scores proxy quality to feed back into the Grid Node's on-chain reputation.
        Returns the reputation adjustment delta.
        """
        if capability_id not in self.active_capabilities:
            raise ValueError("Capability not found")

        reputation_delta = 0
        if success_rate < 0.8:
            reputation_delta -= 10
        elif latency_ms > 2000:
            reputation_delta -= 5
        else:
            reputation_delta += 2

        # In a full implementation, this triggers a Grid event to update reputation

        return reputation_delta
