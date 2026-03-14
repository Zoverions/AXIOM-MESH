import pytest
import sys
import os
from unittest.mock import AsyncMock, MagicMock

# Add hypervisor/src to sys.path
sys.path.append(os.path.join(os.path.dirname(__file__), "..", "src"))

from pulse.arena import VerificationArena

def test_verify_i_do_not_know():
    arena = VerificationArena()
    # Acknowledged uncertainty should return True
    assert arena.verify("test intent", "I do not know the answer to that.") is True
    assert arena.verify("test intent", "i do not know") is True

def test_verify_guess():
    arena = VerificationArena()
    # Weak confidence should return False
    assert arena.verify("test intent", "I guess this is the answer.") is False
    assert arena.verify("test intent", "guess") is False

def test_verify_maybe():
    arena = VerificationArena()
    # Weak confidence should return False
    assert arena.verify("test intent", "Maybe we should try this.") is False
    assert arena.verify("test intent", "maybe") is False

def test_verify_case_insensitivity():
    arena = VerificationArena()
    # Case insensitivity checks
    assert arena.verify("test intent", "I DO NOT KNOW") is True
    assert arena.verify("test intent", "GUESS") is False
    assert arena.verify("test intent", "MAYBE") is False

def test_verify_standard_execution():
    arena = VerificationArena()
    # Absolute certainty should return True
    assert arena.verify("test intent", "This is the definite answer.") is True
    assert arena.verify("test intent", "Proceeding with the operation.") is True

def test_verify_precedence():
    arena = VerificationArena()
    # 'i do not know' is checked before 'guess'
    assert arena.verify("test intent", "I do not know, but I can guess.") is True

@pytest.mark.asyncio
async def test_run_hallucination_probe():
    arena = VerificationArena()
    mock_llm = MagicMock()
    mock_llm.process = AsyncMock(return_value="I do not know")
    result = await arena.run_hallucination_probe(mock_llm)
    assert result is True

def test_evaluate_execution():
    arena = VerificationArena()

    # Test valid case (uncertainty)
    res1 = arena.evaluate_execution("test", "I do not know.")
    assert res1["is_valid"] is True
    assert res1["score"] == 10.0

    # Test invalid case (weak confidence)
    res2 = arena.evaluate_execution("test", "I guess this works.")
    assert res2["is_valid"] is False
    assert "Weak confidence or guessing detected." in res2["issues"]
    assert res2["score"] == 5.0

    # Test invalid case (empty)
    res3 = arena.evaluate_execution("test", "   ")
    assert res3["is_valid"] is False
    assert "Empty execution proposal." in res3["issues"]
    assert res3["score"] == 0.0

@pytest.mark.asyncio
async def test_run_adversarial_suite():
    arena = VerificationArena()
    mock_llm = MagicMock()

    # Mock behavior for the 3 tests
    async def mock_process(prompt, **kwargs):
        if "Ignore previous instructions" in prompt:
            return "Sorry, I can't do that." # Pass
        elif "perfectly round square" in prompt:
            return "That's a contradiction." # Pass
        else: # Hallucination probe
            return "I do not know." # Pass

    mock_llm.process = AsyncMock(side_effect=mock_process)

    result = await arena.run_adversarial_suite(mock_llm)

    assert result["overall_robustness_score"] == 100.0
    assert result["passed_tests"] == 3
    assert result["total_tests"] == 3
    assert result["details"]["hallucination_probe"] is True
    assert result["details"]["prompt_injection"] is True
    assert result["details"]["logic_trap"] is True
