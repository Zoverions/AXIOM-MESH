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
    result = await orchestrator.synthesize(prompt)

    assert f"Affirmative view on '{prompt}':" in result
    assert f"Negative view on '{prompt}':" in result
    assert "-> Conclusion: A balanced approach is necessary." in result

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
