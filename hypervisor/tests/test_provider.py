import pytest
import os
import torch
import numpy as np
from unittest.mock import AsyncMock, patch, MagicMock

from src.llm.provider import LLMProvider

@pytest.fixture
def mock_transformers():
    with patch("src.llm.provider.AutoModelForCausalLM") as mock_model_class, \
         patch("src.llm.provider.AutoTokenizer") as mock_tokenizer_class:

        mock_tokenizer = MagicMock()

        # BatchEncoding behaves like a dict but also has attribute access
        mock_inputs = MagicMock()
        mock_inputs.input_ids.shape = (1, 5)
        # We need it to unpack like a dict when passed to **inputs
        mock_inputs.keys.return_value = ["input_ids"]
        mock_inputs.__getitem__.side_effect = lambda k: mock_inputs.input_ids if k == "input_ids" else None

        mock_tokenizer.return_value.to.return_value = mock_inputs
        mock_tokenizer.decode.return_value = "mock_response"
        mock_tokenizer_class.from_pretrained.return_value = mock_tokenizer

        mock_model = MagicMock()
        mock_outputs = MagicMock()
        mock_outputs.sequences = [[1, 2, 3, 4, 5, 6, 7]]
        mock_outputs.past_key_values = {"cache": "mock"}
        mock_model.generate.return_value = mock_outputs

        mock_embeddings = MagicMock()
        # Create a mock weight tensor that can be converted to numpy
        mock_weights = MagicMock()
        mock_weights.cpu.return_value.numpy.return_value = np.array([1, 0, -1])
        mock_embeddings.weight.__getitem__.return_value = mock_weights
        mock_model.get_input_embeddings.return_value = mock_embeddings

        mock_model_class.from_pretrained.return_value = mock_model

        yield mock_model_class, mock_tokenizer_class

@pytest.mark.asyncio
async def test_llm_provider_initialization(mock_transformers):
    provider = LLMProvider()
    assert provider.model_id == "1bitLLM/bitnet_b1_58-large"
    assert provider.device in ["cuda", "cpu"]
    assert provider.local_model == "1bitLLM/bitnet_b1_58-large"

    mock_model_class, mock_tokenizer_class = mock_transformers
    mock_tokenizer_class.from_pretrained.assert_called_once_with("1bitLLM/bitnet_b1_58-large")
    mock_model_class.from_pretrained.assert_called_once_with(
        "1bitLLM/bitnet_b1_58-large",
        device_map="auto",
        torch_dtype=torch.int8,
        low_cpu_mem_usage=True
    )

@pytest.mark.asyncio
async def test_generate_with_cache(mock_transformers):
    provider = LLMProvider()
    result_text, cache = await provider.generate_with_cache("Test prompt")

    assert result_text == "mock_response"
    assert cache == {"cache": "mock"}

    provider.model.generate.assert_called_once()
    kwargs = provider.model.generate.call_args.kwargs
    assert kwargs["max_new_tokens"] == 512
    assert kwargs["do_sample"] is False
    assert kwargs["temperature"] == 0.0

@pytest.mark.asyncio
async def test_process(mock_transformers):
    provider = LLMProvider()

    # Process is a wrapper around generate_with_cache
    result = await provider.process("Test context")
    assert result == "mock_response"

    kwargs = provider.model.generate.call_args.kwargs
    assert kwargs["use_cache"] is False

def test_get_weights_hash(mock_transformers):
    provider = LLMProvider()
    hash_val = provider.get_weights_hash()
    assert isinstance(hash_val, str)
    assert len(hash_val) == 64  # SHA-256 hash length
