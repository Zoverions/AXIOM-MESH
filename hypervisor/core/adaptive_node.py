# hypervisor/core/adaptive_node.py
from typing import List, Dict, Any, Optional

class AdaptiveVariableNode:
    """
    Dynamically switches Capsule Plus modules or node types based on Pulse signals.
    Higher rewards for filling network gaps.
    
    Phase 2 Update: Added xmcp_tools field for X (Twitter) integration.
    """
    def __init__(
        self,
        hypervisor,
        pulse_system,
        grid_ledger,
        xmcp_tools: Optional[List[str]] = None,
        reasoning_map_ref: Optional[str] = None,
    ):
        self.hypervisor = hypervisor
        self.pulse = pulse_system
        self.ledger = grid_ledger
        self.current_role = "base"  # skill-pill, education-plus, governance-plus, financial, etc.
        self.xmcp_tools = xmcp_tools or []  # X MCP tools available to this node
        self.reasoning_map_ref = reasoning_map_ref  # Reference to a framework reasoning map
    
    def receive_network_signal(self, signal: dict):
        """Pulse System calls this when a shortage is detected."""
        needed_role = signal["required_role"]

        # Query relevant map -> inject navigation rules into context
        if self.reasoning_map_ref:
            print(f"[🧠] Injecting reasoning rules from: {self.reasoning_map_ref}")
            # Inject into the signal context for the planner
            if "context" not in signal:
                signal["context"] = {}
            signal["context"]["reasoning_map_ref"] = self.reasoning_map_ref
            signal["context"]["navigation_rules"] = f"Apply framework rules from {self.reasoning_map_ref}"

        if needed_role != self.current_role:
            print(f"[🔄] Adaptive Node switching from {self.current_role} → {needed_role}")
            self.hypervisor.load_capsule_module(needed_role)  # reconfigures SkillRL vectors
            self.current_role = needed_role

            # Record switch as neural commitment (new primitive)
            self.ledger.record_adaptive_switch(self.current_role, signal.get("shortage_score", 1.0))

            # Higher reward multiplier for filling gap
            reward_multiplier = 1.0 + (signal.get("shortage_score", 1.0) * 0.5)
            print(f"[💰] Reward multiplier applied: {reward_multiplier}x")
    
    def set_xmcp_tools(self, tools: List[str]) -> None:
        """
        Set available X MCP tools for this node.
        
        Called by planner after xmcp_discover() injects relevant tools.
        
        Args:
            tools: List of tool names (e.g., ["search_posts", "get_trends"])
        """
        self.xmcp_tools = tools
        print(f"[🔧] XMCP tools configured: {tools}")
    
    def get_xmcp_tools(self) -> List[str]:
        """Get currently configured X MCP tools."""
        return self.xmcp_tools
