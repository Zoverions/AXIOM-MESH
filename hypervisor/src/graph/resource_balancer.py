import os
import time
from typing import TypedDict, Dict, Any
from langgraph.graph import StateGraph, START, END

# Simulated resource metrics
class SystemMetrics:
    @staticmethod
    def get_local_load():
        return 0.7  # 70% CPU/RAM

    @staticmethod
    def get_p2p_latency():
        return 0.1  # 100ms

    @staticmethod
    def get_grid_gas_fee():
        return 15   # Gwei

# Assuming graph_state includes what we need for ResourceBalancer
class BalancerState(TypedDict):
    intent: str
    priority_tag: str
    selected_route: str
    metrics: Dict[str, Any]

def analyze_metrics(state: BalancerState):
    """Gathers current local, P2P, and Grid metrics."""
    # We allow metrics to be overridden for testing purposes
    metrics = state.get("metrics", {})
    if not metrics:
        metrics = {
            "local_load": SystemMetrics.get_local_load(),
            "p2p_latency": SystemMetrics.get_p2p_latency(),
            "grid_gas": SystemMetrics.get_grid_gas_fee()
        }
    return {"metrics": metrics}

def evaluate_route(state: BalancerState):
    """
    Evaluates the optimal routing (local -> P2P -> Grid) based on priority tags
    from CRDT and current metrics.
    """
    # High priority tags go Grid (most reliable/verified) or Local if extremely urgent
    # Low priority go P2P if local is busy
    tag = state.get("priority_tag", "default")
    metrics = state.get("metrics", {})

    from src.engine.alignment import AlignmentProfile
    profile = AlignmentProfile()
    weight = profile.get_priority_weight(tag)

    # Critical tasks or high weight tags go to Grid
    if weight >= 5.0 or tag == "critical":
        route = "grid"  # Most secure/verified execution
    elif weight <= 0.1 and metrics.get("local_load", 0) > 0.5:
        route = "p2p"   # Offload low priority if local is busy
    else:
        # Default behavior: Try local, if too busy -> P2P, if P2P slow -> Grid
        if metrics.get("local_load", 0) < 0.8:
            route = "local"
        elif metrics.get("p2p_latency", 1.0) < 0.5:
            route = "p2p"
        else:
            route = "grid"

    return {"selected_route": route}

# Compile Graph
balancer_workflow = StateGraph(BalancerState)
balancer_workflow.add_node("analyze_metrics", analyze_metrics)
balancer_workflow.add_node("evaluate_route", evaluate_route)
balancer_workflow.add_edge(START, "analyze_metrics")
balancer_workflow.add_edge("analyze_metrics", "evaluate_route")
balancer_workflow.add_edge("evaluate_route", END)

resource_balancer_app = balancer_workflow.compile()
