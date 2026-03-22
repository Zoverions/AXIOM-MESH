import subprocess
import os
import platform
import time

class SystemMonitor:
    def __init__(self):
        self.history = []
        self.max_history = 10
        self.current_tier = "normal"
        self.consecutive_normal_ticks = 0
        self.recovery_threshold = 3

    def get_system_metrics(self) -> dict:
        metrics = {
            "cpu_load": self._get_cpu_load(),
            "memory_pressure": self._get_memory_pressure(),
        }
        return metrics

    def _get_cpu_load(self) -> float:
        # Simple cross-platform 1-minute load average as percentage of cores
        try:
            if platform.system() == "Windows":
                # Not easily available via simple subprocess on windows, return 0 for now
                return 0.0

            # Unix-like
            load_avg = os.getloadavg()[0]
            cores = os.cpu_count() or 1
            return load_avg / cores
        except Exception:
            return 0.0

    def _get_memory_pressure(self) -> float:
        # Returns roughly used memory percentage
        try:
            if platform.system() == "Linux":
                output = subprocess.check_output(["free", "-m"]).decode().split('\n')
                for line in output:
                    if line.startswith("Mem:"):
                        parts = line.split()
                        total = float(parts[1])
                        used = float(parts[2])
                        if total > 0:
                            return used / total
            elif platform.system() == "Darwin":
                # Very rough heuristic for macOS
                vm_stat = subprocess.check_output(["vm_stat"]).decode()
                # Simplified
                return 0.5
        except Exception:
            pass
        return 0.0

    def evaluate_tier(self) -> str:
        metrics = self.get_system_metrics()

        # Log metrics history
        self.history.append(metrics)
        if len(self.history) > self.max_history:
            self.history.pop(0)

        # Basic thresholds
        cpu_critical = 0.90
        cpu_constrained = 0.70
        mem_critical = 0.90
        mem_constrained = 0.75

        # Also consider quiet hours / user activity
        is_quiet_hours = self.check_quiet_hours()

        new_tier = "normal"
        if metrics["cpu_load"] >= cpu_critical or metrics["memory_pressure"] >= mem_critical:
            new_tier = "critical"
        elif metrics["cpu_load"] >= cpu_constrained or metrics["memory_pressure"] >= mem_constrained or is_quiet_hours:
            new_tier = "constrained"

        # Apply hysteresis / recovery threshold
        if new_tier == "normal" and self.current_tier != "normal":
            self.consecutive_normal_ticks += 1
            if self.consecutive_normal_ticks >= self.recovery_threshold:
                self.current_tier = "normal"
                self.consecutive_normal_ticks = 0
        else:
            if new_tier != "normal":
                self.consecutive_normal_ticks = 0
            self.current_tier = new_tier

        return self.current_tier

    def check_quiet_hours(self) -> bool:
        # Example logic: active user session heuristic or specific time window
        # For this implementation, let's just use a time window as an example of "user-activity sensitivity"
        # Say, 9 AM to 5 PM is "quiet hours" (constrained) to prioritize user-facing OS responsiveness
        try:
            current_hour = time.localtime().tm_hour
            if 9 <= current_hour < 17:
                return True
        except Exception:
            pass
        return False
