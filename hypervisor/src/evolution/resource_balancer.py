from src.evolution.hardware import HardwareScanner

class ResourceBalancer:
    """
    Decides routing logic (local vs peer vs Grid vs L1 path)
    based on the hardware profile and task requirements.
    """
    def __init__(self, hardware_scanner=None):
        self.hardware_scanner = hardware_scanner or HardwareScanner()
        self.profile = self.hardware_scanner.get_hardware_profile()

    def route_task(self, task_type: str, complexity_score: int = 50) -> str:
        """
        Routing logic:
        - full_node: highly capable, runs most things locally, unless consensus is required.
        - edge: runs simple tasks locally, offloads complex tasks to peers.
        - tablet: runs only trivial tasks locally, relies heavily on grid.
        - l1: fallback for settlement-critical operations.
        """
        if task_type == "settlement":
            return "l1"

        if task_type == "consensus":
            return "grid"

        if self.profile == "full_node":
            if complexity_score > 90:
                return "peer" # Offload to peers if extremely complex
            return "local"
        elif self.profile == "edge":
            if complexity_score > 90:
                return "grid"
            elif complexity_score > 70:
                return "peer"
            return "local"
        else: # tablet
            if complexity_score > 30:
                return "grid"
            return "local"
