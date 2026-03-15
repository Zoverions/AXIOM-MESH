import pytest
import sys
import os
from unittest.mock import AsyncMock, MagicMock

# Add hypervisor/src to sys.path
sys.path.append(os.path.join(os.path.dirname(__file__), "..", "src"))

from cortex.dialectic import DialecticOrchestrator

@pytest.mark.asyncio
async def test_synthesize_normal_prompt():
    mock_llm = MagicMock()
    mock_llm.process = AsyncMock(side_effect=[
        "Thesis response",
        "Antithesis response",
        "Synthesis response"
    ])

    orchestrator = DialecticOrchestrator(llm=mock_llm)
    prompt = "AI safety"
    result = await orchestrator.synthesize(prompt)

    assert "[THESIS]\nThesis response" in result
    assert "[ANTITHESIS]\nAntithesis response" in result
    assert "[SYNTHESIS]\nSynthesis response" in result
    assert f"--- Dialectic Cognitive Partitioning: {prompt} ---" in result

    assert mock_llm.process.call_count == 3

@pytest.mark.asyncio
async def test_synthesize_no_llm_fallback():
    orchestrator = DialecticOrchestrator(llm=None)
    prompt = "AI safety"
    with pytest.raises(ValueError, match="LLM provider is required for dialectic synthesis."):
        await orchestrator.synthesize(prompt)

@pytest.mark.asyncio
async def test_synthesize_empty_prompt():
    mock_llm = MagicMock()
    mock_llm.process = AsyncMock(return_value="Empty prompt response")

    orchestrator = DialecticOrchestrator(llm=mock_llm)
    prompt = ""
    result = await orchestrator.synthesize(prompt)

    assert "--- Dialectic Cognitive Partitioning:  ---" in result
    assert "[THESIS]" in result
    assert "Empty prompt response" in result

@pytest.mark.asyncio
async def test_evaluate_synthesis():
    mock_llm = MagicMock()
    # Mock LLM to return a score
    mock_llm.process = AsyncMock(return_value="Good synthesis. Score: 8.5")

    orchestrator = DialecticOrchestrator(llm=mock_llm)
    score, feedback = await orchestrator.evaluate_synthesis("Pro", "Con", "Synthesis result")

    assert score == 8.5
    assert "Score: 8.5" in feedback

@pytest.mark.asyncio
async def test_synthesize_with_feedback_loop():
    mock_llm = MagicMock()

    async def side_effect(prompt, **kwargs):
        if "You are an expert logician" in prompt:
            if mock_llm.process.call_count <= 4:
                return "Score: 5.0"
            else:
                return "Score: 9.0"
        return "Generic response"

    mock_llm.process = AsyncMock(side_effect=side_effect)

    orchestrator = DialecticOrchestrator(llm=mock_llm)
    result = await orchestrator.synthesize_with_feedback_loop("Test prompt", max_retries=3)

    # Ensure it ran multiple times (Thesis, Antithesis, Synthesis, Eval) * 2
    assert mock_llm.process.call_count > 4
    assert "[EVALUATION SCORE]: 9.0" in result

@pytest.mark.asyncio
async def test_run_adversarial_suite():
    mock_llm = MagicMock()

    # Mock behavior for paradox and dilemma
    async def mock_process(prompt, **kwargs):
        if "This statement is false" in prompt:
            return "This is a self-referential paradox." # Pass
        elif "Trolley Problem" in prompt:
            return "A classic dilemma of utilitarianism vs other moral frameworks." # Pass
        return "Generic synthesis"

    mock_llm.process = AsyncMock(side_effect=mock_process)

    orchestrator = DialecticOrchestrator(llm=mock_llm)
    result = await orchestrator.run_adversarial_suite()

    assert result["overall_robustness_score"] == 100.0
    assert result["passed_tests"] == 2
    assert result["total_tests"] == 2
    assert result["details"]["paradox_test"] is True
    assert result["details"]["dilemma_test"] is True
