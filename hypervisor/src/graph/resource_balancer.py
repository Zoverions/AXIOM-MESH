import json
import os
from pathlib import Path
from typing import TypedDict, Dict, Any

from langgraph.graph import StateGraph, START, END


class SystemMetrics:
    @staticmethod
    def get_local_load() -> float:
        try:
            return min(1.0, os.getloadavg()[0] / max(1, (os.cpu_count() or 1)))
        except OSError:
            return 0.7

    @staticmethod
    def get_memory_pressure() -> float:
        try:
            if Path('/proc/meminfo').exists():
                lines = Path('/proc/meminfo').read_text().splitlines()
                total = next(int(l.split()[1]) for l in lines if l.startswith('MemTotal:'))
                avail = next(int(l.split()[1]) for l in lines if l.startswith('MemAvailable:'))
                return max(0.0, min(1.0, 1 - (avail / total)))
        except Exception:
            pass
        return 0.5

    @staticmethod
    def get_p2p_latency() -> float:
        return 0.1

    @staticmethod
    def get_grid_gas_fee() -> int:
        return 15


class BalancerState(TypedDict):
    intent: str
    priority_tag: str
    selected_route: str
    metrics: Dict[str, Any]


def _load_machine_profile() -> Dict[str, Any]:
    profile_path = os.getenv("MACHINE_PROFILE_PATH", "config/machine_profile.json")
    path = Path(profile_path)
    if path.exists():
        try:
            return json.loads(path.read_text())
        except json.JSONDecodeError:
            return {}
    return {}


def analyze_metrics(state: BalancerState):
    """Gather local host and network metrics with optional test overrides."""
    metrics = {
        "local_load": SystemMetrics.get_local_load(),
        "memory_pressure": SystemMetrics.get_memory_pressure(),
        "p2p_latency": SystemMetrics.get_p2p_latency(),
        "grid_gas": SystemMetrics.get_grid_gas_fee(),
    }
    metrics.update(state.get("metrics", {}))
    metrics["machine_profile"] = _load_machine_profile()
    return {"metrics": metrics}


def evaluate_route(state: BalancerState):
    """Route with role-aware host protection for shared machines."""
    tag = state.get("priority_tag", "default")
    intent = (state.get("intent") or "").lower()
    metrics = state.get("metrics", {})

    from src.engine.alignment import AlignmentProfile

    profile = AlignmentProfile()
    weight = profile.get_priority_weight(tag)

    machine_profile = metrics.get("machine_profile") or {}
    machine_role = machine_profile.get("machine_role", os.getenv("MACHINE_ROLE", "shared-machine"))
    local_threshold = float(machine_profile.get("local_load_threshold", 0.65 if machine_role == "shared-machine" else 0.9))
    mem_threshold = float(machine_profile.get("memory_pressure_threshold", 0.8))

    local_load = float(metrics.get("local_load", 0.0))
    memory_pressure = float(metrics.get("memory_pressure", 0.0))
    p2p_latency = float(metrics.get("p2p_latency", 1.0))

    if any(k in intent for k in ["consensus", "grid", "settle", "l1"]) or tag == "critical" or weight >= 5.0:
        route = "grid"
    elif machine_role != "dedicated-mesh" and (local_load >= local_threshold or memory_pressure >= mem_threshold):
        route = "p2p" if p2p_latency < 0.5 else "grid"
    elif weight <= 0.1 and local_load > 0.5:
        route = "p2p"
    else:
        if local_load < local_threshold:
            route = "local"
        elif p2p_latency < 0.5:
            route = "p2p"
        else:
            route = "grid"

    return {"selected_route": route}


balancer_workflow = StateGraph(BalancerState)
balancer_workflow.add_node("analyze_metrics", analyze_metrics)
balancer_workflow.add_node("evaluate_route", evaluate_route)
balancer_workflow.add_edge(START, "analyze_metrics")
balancer_workflow.add_edge("analyze_metrics", "evaluate_route")
balancer_workflow.add_edge("evaluate_route", END)

resource_balancer_app = balancer_workflow.compile()
