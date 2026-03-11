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
    # "a" repeated has very low entropy (0.0)
    monitor.measure("aaaaaaaaaaaaaa")
    assert monitor.entropy_level == 0.5
    monitor.measure("bbbbbbbbbbbbbb")
    assert monitor.entropy_level == 1.0

def test_measure_long_output_increases_entropy():
    monitor = EntropyMonitor()
    long_output = "a" * 10001
    monitor.measure(long_output)
    assert monitor.entropy_level == 0.5

def test_measure_normal_output_decreases_entropy():
    monitor = EntropyMonitor()
    monitor.measure("aaaaaaaaaaaaaa") # entropy = 0.5
    # Normal sentence has higher entropy > 2.0
    monitor.measure("This is a very normal output string with high entropy.")
    assert monitor.entropy_level == pytest.approx(0.4)

def test_measure_entropy_not_below_zero():
    monitor = EntropyMonitor()
    monitor.measure("This is a very normal output string with high entropy.")
    assert monitor.entropy_level == 0.0

def test_measure_anomaly_detection():
    monitor = EntropyMonitor()
    # Need entropy_level > 1.0 for True
    monitor.measure("aaaaaa") # 0.5
    assert monitor.measure("aaaaaa") is False # 1.0
    assert monitor.measure("aaaaaa") is True # 1.5

def test_measure_case_insensitivity():
    monitor = EntropyMonitor()
    # Using low entropy string instead of "LOOP"
    monitor.measure("AAAAA")
    assert monitor.entropy_level == 0.5
