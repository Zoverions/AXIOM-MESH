import pytest
import sys
import os

# Add hypervisor/src to sys.path
sys.path.append(os.path.join(os.path.dirname(__file__), "..", "src"))

from cortex.dialectic import DialecticOrchestrator

def test_synthesize_normal_prompt():
    orchestrator = DialecticOrchestrator()
    prompt = "AI safety"
    result = orchestrator.synthesize(prompt)

    assert f"Affirmative view on '{prompt}': It is absolutely essential for progress." in result
    assert f"Negative view on '{prompt}': It presents catastrophic risks." in result
    assert "-> Conclusion: A balanced approach is necessary." in result
    assert f"Dialectic Synthesis for '{prompt}':\n" in result

def test_synthesize_empty_prompt():
    orchestrator = DialecticOrchestrator()
    prompt = ""
    result = orchestrator.synthesize(prompt)

    assert f"Affirmative view on '{prompt}':" in result
    assert f"Negative view on '{prompt}':" in result

def test_synthesize_special_characters_prompt():
    orchestrator = DialecticOrchestrator()
    prompt = "!@#$%^&*()_+-=[]{}|;':\",./<>?"
    result = orchestrator.synthesize(prompt)

    assert f"Affirmative view on '{prompt}':" in result
    assert f"Negative view on '{prompt}':" in result
