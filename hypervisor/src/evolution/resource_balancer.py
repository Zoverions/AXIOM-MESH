import logging
from src.evolution.hardware import HardwareScanner
from src.evolution.monitor import SystemMonitor

class ResourceBalancer:
    """
    Decides routing logic (local vs peer vs Grid vs L1 path)
    based on the hardware profile and task requirements.
    """
    def __init__(self, hardware_scanner=None, system_monitor=None):
        self.hardware_scanner = hardware_scanner or HardwareScanner()
        self.system_monitor = system_monitor or SystemMonitor()
        self.profile = self.hardware_scanner.get_hardware_profile()
        self.logger = logging.getLogger("ResourceBalancer")

    def route_task(self, task_type: str, complexity_score: int = 50) -> str:

        tier = self.system_monitor.evaluate_tier()

        # Adaptation under pressure
        if tier == "critical":
            if task_type == "sandbox-exec" or task_type.startswith("sandbox"):
                self.logger.info(f"Throttle tier is CRITICAL. Preserving critical sandbox thread {task_type} locally.")
                return "local"

            self.logger.info(f"Throttle tier is CRITICAL. Escalating task {task_type} (complexity {complexity_score}) to grid/l1.")
            if task_type == "settlement":
                self.logger.info(f"Routed {task_type} to l1 (Tier: {tier}, Profile: {self.profile})")
                return "l1"
            self.logger.info(f"Routed {task_type} to grid (Tier: {tier}, Profile: {self.profile})")
            return "grid"
        elif tier == "constrained":
            # Reduce thresholds for local execution
            self.logger.info(f"Throttle tier is CONSTRAINED. Escalating threshold for task {task_type}.")
            complexity_score += 30 # Artificially inflate complexity to discourage local

        if task_type == "settlement":
            decision = "l1"
            self.logger.info(f"Routed {task_type} to {decision} (Tier: {tier}, Profile: {self.profile})")
            return decision

        if task_type == "consensus":
            decision = "grid"
            self.logger.info(f"Routed {task_type} to {decision} (Tier: {tier}, Profile: {self.profile})")
            return decision

        decision = "local"
        if self.profile == "full_node":
            if complexity_score > 90:
                decision = "peer" # Offload to peers if extremely complex
        elif self.profile == "edge":
            if complexity_score > 90:
                decision = "grid"
            elif complexity_score > 70:
                decision = "peer"
        else: # tablet
            if complexity_score > 30:
                decision = "grid"

        self.logger.info(f"Routed {task_type} to {decision} (Tier: {tier}, Profile: {self.profile})")
        return decision
