#!/usr/bin/env python3
import sys
import logging

sys.path.insert(0, './hypervisor')
from src.evolution.resource_balancer import ResourceBalancer
from src.evolution.hardware import HardwareScanner
from src.evolution.monitor import SystemMonitor

def main():
    print("Testing ResourceBalancer dynamic resource throttling...")

    class MockHardwareScanner(HardwareScanner):
        def __init__(self, footprint):
            self.mock_footprint = footprint

        def scan(self):
            return self.mock_footprint

    footprint_full = {"cpu_cores": 8, "total_ram_gb": 16, "vram_mb": 8000, "has_gpu": True}
    scanner = MockHardwareScanner(footprint_full)

    class MockMonitorCritical(SystemMonitor):
        def evaluate_tier(self): return "critical"

    rb_crit = ResourceBalancer(hardware_scanner=scanner, system_monitor=MockMonitorCritical())

    # Assert standard tasks get escalated
    standard_decision = rb_crit.route_task("standard", 50)
    assert standard_decision == "grid", f"Expected standard task to route to grid under critical tier, got {standard_decision}"
    print("Standard task correctly routed to grid under critical tier.")

    # Assert sandbox tasks are preserved
    sandbox_decision = rb_crit.route_task("sandbox-exec", 50)
    assert sandbox_decision == "local", f"Expected sandbox task to route locally under critical tier to prevent starvation, got {sandbox_decision}"
    print("Sandbox execution correctly routed locally under critical tier.")

    print("Resource throttling logic verified successfully.")

if __name__ == "__main__":
    main()
