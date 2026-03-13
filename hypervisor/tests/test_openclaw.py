import sys
import os
import pytest

# Append src directory to sys.path dynamically
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'src'))

from evolution.openclaw import SignalExtractor, OnPolicyDistillation
from cortex.mirofish_mapper import MiroFishMapper

def test_signal_extraction_positive():
    extractor = SignalExtractor()
    signals = extractor.extract_signals("Thank you, that worked perfectly!", "I have updated the file.")
    assert signals["reward"] > 0
    assert signals["is_directive"] is False

def test_signal_extraction_negative():
    extractor = SignalExtractor()
    signals = extractor.extract_signals("No, that's wrong. It failed with an error.", "I have executed the command.")
    assert signals["reward"] < 0
    assert signals["is_directive"] is False

def test_signal_extraction_directive():
    extractor = SignalExtractor()
    signals = extractor.extract_signals("Actually, use the other API key instead of this one.", "I used the default API key.")
    assert signals["is_directive"] is True
    assert "Actually" in signals["signal_text"]
    assert signals["reward"] < 0

def test_miro_prm_judge():
    mapper = MiroFishMapper()
    signals = {"reward": 0.5, "is_directive": False}
    score = mapper.judge_rollout("some action", signals)
    assert score > 0.5 # Should have novelty boost since coordinate_plane is empty

def test_opd_distillation_gating():
    opd = OnPolicyDistillation()
    signal = {"reward": -0.2, "is_directive": True, "signal_text": "Change this"}

    # Authorized distillation
    res1 = opd.distill("action1", signal, "Owner")
    assert res1.startswith("upd_")

    # Unauthorized distillation
    res2 = opd.distill("action2", signal, "Attacker")
    assert res2 == "REJECTED_UNAUTHORIZED"
