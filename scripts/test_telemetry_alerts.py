import sys
import os

# Add hypervisor path for imports
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'hypervisor')))

try:
    from src.evolution.monitor import SystemMonitor
except ImportError as e:
    print(f"Failed to import SystemMonitor: {e}")
    sys.exit(1)

def main():
    print("Testing telemetry alerts and degraded-mode playbook triggers...")

    monitor = SystemMonitor()

    # Mocking system metrics to return critical values
    monitor.get_system_metrics = lambda: {
        "cpu_load": 0.95,
        "memory_pressure": 0.95,
        "io_wait": 0.50,
        "thermal_state": 90.0
    }

    # Mock check_quiet_hours to not interfere
    monitor.check_quiet_hours = lambda: False

    # Simulate first tick (critical)
    tier1 = monitor.evaluate_tier()
    assert tier1 == "critical", f"Expected critical tier, got {tier1}"
    assert not monitor.degraded_mode_triggered, "Playbook triggered too early"

    # Simulate second tick (critical, triggers playbook)
    tier2 = monitor.evaluate_tier()
    assert tier2 == "critical", f"Expected critical tier, got {tier2}"
    assert monitor.degraded_mode_triggered, "Playbook failed to trigger on consecutive critical ticks"

    print("✓ Degraded-mode playbook successfully triggered by telemetry alerts.")

    # Simulate recovery
    monitor.get_system_metrics = lambda: {
        "cpu_load": 0.1,
        "memory_pressure": 0.1,
        "io_wait": 0.0,
        "thermal_state": 40.0
    }
    for _ in range(monitor.recovery_threshold):
        monitor.evaluate_tier()

    assert monitor.current_tier == "normal", "Failed to recover to normal tier"
    assert not monitor.degraded_mode_triggered, "Playbook state failed to reset on recovery"
    print("✓ System successfully recovered and playbook state reset.")

    # Simulate P95 Error Budget Alert
    monitor.p95_error_budget_alert = True
    monitor.evaluate_tier() # first tick
    monitor.evaluate_tier() # second tick
    assert monitor.degraded_mode_triggered, "Playbook failed to trigger on P95 error budget alert"
    print("✓ Degraded-mode playbook successfully triggered by P95 error budget alert.")

    print("Telemetry alert checks passed.")
    sys.exit(0)

if __name__ == "__main__":
    main()
