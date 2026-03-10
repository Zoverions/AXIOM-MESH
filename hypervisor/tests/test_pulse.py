import pytest
import sys
import os

# Add hypervisor/src to sys.path
sys.path.append(os.path.join(os.path.dirname(__file__), "..", "src"))

from pulse.pulse import EntropyMonitor

def test_initial_entropy_zero():
    monitor = EntropyMonitor()
    assert monitor.entropy_level == 0.0

def test_measure_loop_increases_entropy():
    monitor = EntropyMonitor()
    monitor.measure("this is a loop")
    assert monitor.entropy_level == 0.5
    monitor.measure("another loop here")
    assert monitor.entropy_level == 1.0

def test_measure_long_output_increases_entropy():
    monitor = EntropyMonitor()
    long_output = "a" * 10001
    monitor.measure(long_output)
    assert monitor.entropy_level == 0.5

def test_measure_normal_output_decreases_entropy():
    monitor = EntropyMonitor()
    monitor.measure("loop") # entropy = 0.5
    monitor.measure("normal output")
    assert monitor.entropy_level == pytest.approx(0.4)

def test_measure_entropy_not_below_zero():
    monitor = EntropyMonitor()
    monitor.measure("normal output")
    assert monitor.entropy_level == 0.0

def test_measure_anomaly_detection():
    monitor = EntropyMonitor()
    # Need entropy_level > 1.0 for True
    monitor.measure("loop") # 0.5
    assert monitor.measure("loop") is False # 1.0
    assert monitor.measure("loop") is True # 1.5

def test_measure_case_insensitivity():
    monitor = EntropyMonitor()
    monitor.measure("LOOP")
    assert monitor.entropy_level == 0.5
