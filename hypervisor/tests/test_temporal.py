import pytest
import sys
import os

# Add hypervisor/src to sys.path
sys.path.append(os.path.join(os.path.dirname(__file__), "..", "src"))

from engine.temporal import TemporalStateManager

def test_temporal_state_set_and_get():
    manager = TemporalStateManager()
    manager.set("blood_pressure", 120)
    assert manager.get("blood_pressure") == 120

def test_temporal_state_collapse_overwrites_history():
    manager = TemporalStateManager()
    # Simulate chronological updates
    manager.set("blood_pressure", 120)
    manager.set("blood_pressure", 128)
    manager.set("blood_pressure", 125)

    # Verify that only the latest state is retained, purging historical noise
    assert manager.get("blood_pressure") == 125
    assert manager.get_collapsed_state() == "blood_pressure: 125"

def test_temporal_state_delete():
    manager = TemporalStateManager()
    manager.set("heart_rate", 80)
    manager.delete("heart_rate")
    assert manager.get("heart_rate") is None
    assert manager.get_collapsed_state() == ""

def test_temporal_state_clear():
    manager = TemporalStateManager()
    manager.set("heart_rate", 80)
    manager.set("blood_pressure", 125)
    manager.clear()
    assert manager.get("heart_rate") is None
    assert manager.get("blood_pressure") is None
    assert manager.get_collapsed_state() == ""

def test_temporal_state_formatting():
    manager = TemporalStateManager()
    manager.set("patient_status", "stable")
    manager.set("blood_pressure", 125)

    collapsed = manager.get_collapsed_state()
    assert "patient_status: stable" in collapsed
    assert "blood_pressure: 125" in collapsed
    assert len(collapsed.split("\n")) == 2

def test_temporal_state_empty_string_when_empty():
    manager = TemporalStateManager()
    assert manager.get_collapsed_state() == ""
