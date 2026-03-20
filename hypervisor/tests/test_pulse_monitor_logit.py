import pytest
from core.pulse_monitor import LogitVarianceTracker, CoTAuditor, CognitiveThrashingError

def test_logit_variance():
    tracker = LogitVarianceTracker(window_size=20)
    for _ in range(19):
        tracker.add_logit([0.99, 0.01])

    assert tracker.is_in_attractor_trap() == False

    tracker.add_logit([0.99, 0.01])
    assert tracker.is_in_attractor_trap() == True
