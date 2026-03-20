import pytest
import os
from unittest.mock import AsyncMock, patch, MagicMock
import httpx

from src.llm.provider import LLMProvider

@pytest.fixture
def mock_hardware_scanner():
    with patch("src.llm.provider.HardwareScanner") as mock_scanner_class:
        mock_scanner = MagicMock()
        mock_scanner.scan.return_value = {"has_gpu": False, "total_ram_gb": 8, "vram_mb": 0}
        mock_scanner.recommend_models.return_value = {
            "default": "llama3:1b",
            "coding": "llama3:1b",
            "reasoning": "llama3:1b"
        }
        mock_scanner_class.return_value = mock_scanner
        yield mock_scanner

def test_init(mock_hardware_scanner):
    with patch.dict(os.environ, {
        "OPENAI_API_KEY": "test_openai_key",
        "ANTHROPIC_API_KEY": "test_anthropic_key",
        "ALLOW_CLOUD_LLM": "true",
        "LLM_PROVIDER": "openai",
        "LOCAL_MODEL_FALLBACK": "custom-model"
    }):
        provider = LLMProvider()
        assert provider.openai_key == "test_openai_key"
        assert provider.anthropic_key == "test_anthropic_key"
        assert provider.allow_cloud is True
        assert provider.provider_preference == "openai"
        assert provider.local_model == "custom-model"

@pytest.mark.asyncio
async def test_process_routes_to_local_by_default(mock_hardware_scanner):
    with patch.dict(os.environ, {"ALLOW_CLOUD_LLM": "false"}):
        provider = LLMProvider()
        provider._call_local = AsyncMock(return_value="local_response")

        response = await provider.process("test context")

        assert response == "local_response"
        provider._call_local.assert_called_once_with("test context", temperature=0.7)

@pytest.mark.asyncio
async def test_process_routes_to_openai(mock_hardware_scanner):
    with patch.dict(os.environ, {
        "ALLOW_CLOUD_LLM": "true",
        "LLM_PROVIDER": "openai",
        "OPENAI_API_KEY": "key"
    }):
        provider = LLMProvider()
        provider._call_openai = AsyncMock(return_value="openai_response")

        response = await provider.process("test context")

        assert response == "openai_response"
        provider._call_openai.assert_called_once_with("test context", temperature=0.7, frequency_penalty=0.0, presence_penalty=0.0)

@pytest.mark.asyncio
async def test_process_routes_to_anthropic(mock_hardware_scanner):
    with patch.dict(os.environ, {
        "ALLOW_CLOUD_LLM": "true",
        "LLM_PROVIDER": "anthropic",
        "ANTHROPIC_API_KEY": "key"
    }):
        provider = LLMProvider()
        provider._call_anthropic = AsyncMock(return_value="anthropic_response")

        response = await provider.process("test context")

        assert response == "anthropic_response"
        provider._call_anthropic.assert_called_once_with("test context", temperature=0.7)

@pytest.mark.asyncio
async def test_process_large_context_temperature_0_0(mock_hardware_scanner):
    with patch.dict(os.environ, {"ALLOW_CLOUD_LLM": "false"}):
        provider = LLMProvider()
        provider._call_local = AsyncMock(return_value="local_response")

        context = "a" * 128001
        await provider.process(context)

        provider._call_local.assert_called_once_with(context, temperature=0.0)

@pytest.mark.asyncio
async def test_process_large_context_temperature_0_2(mock_hardware_scanner):
    with patch.dict(os.environ, {"ALLOW_CLOUD_LLM": "false"}):
        provider = LLMProvider()
        provider._call_local = AsyncMock(return_value="local_response")

        context = "a" * 64001
        await provider.process(context)

        provider._call_local.assert_called_once_with(context, temperature=0.2)

@pytest.mark.asyncio
async def test_process_large_context_temperature_0_4(mock_hardware_scanner):
    with patch.dict(os.environ, {"ALLOW_CLOUD_LLM": "false"}):
        provider = LLMProvider()
        provider._call_local = AsyncMock(return_value="local_response")

        context = "a" * 32001
        await provider.process(context)

        provider._call_local.assert_called_once_with(context, temperature=0.4)

@pytest.mark.asyncio
async def test_process_extremely_large_context_forces_cloud(mock_hardware_scanner):
    with patch.dict(os.environ, {
        "ALLOW_CLOUD_LLM": "true",
        "OPENAI_API_KEY": "key"
    }):
        provider = LLMProvider()
        provider._call_openai = AsyncMock(return_value="openai_large_context")

        context = "a" * 10001
        response = await provider.process(context)

        assert response == "openai_large_context"
        provider._call_openai.assert_called_once_with(context, model="gpt-4-turbo", temperature=0.7, frequency_penalty=0.0, presence_penalty=0.0)

@pytest.mark.asyncio
async def test_call_local_success_code(mock_hardware_scanner):
    with patch.dict(os.environ, {"LOCAL_MODEL_FALLBACK": "llama3:1b"}):
        provider = LLMProvider()

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {"response": "local_coding_success"}

        mock_post = AsyncMock(return_value=mock_response)

        with patch("httpx.AsyncClient.post", mock_post):
            response = await provider._call_local("write python code")
            assert response == "local_coding_success"

@pytest.mark.asyncio
async def test_call_local_success_reason(mock_hardware_scanner):
    with patch.dict(os.environ, {"LOCAL_MODEL_FALLBACK": "llama3:1b"}):
        provider = LLMProvider()

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {"response": "local_reasoning_success"}

        mock_post = AsyncMock(return_value=mock_response)

        with patch("httpx.AsyncClient.post", mock_post):
            response = await provider._call_local("explain this")
            assert response == "local_reasoning_success"

@pytest.mark.asyncio
async def test_call_local_exception(mock_hardware_scanner):
    with patch.dict(os.environ, {"LOCAL_MODEL_FALLBACK": "llama3:1b"}):
        provider = LLMProvider()

        mock_post = AsyncMock(side_effect=httpx.RequestError("Connection failed"))

        with patch("httpx.AsyncClient.post", mock_post):
            response = await provider._call_local("test")
            assert "[Local llama3:1b Error] Failed to process intelligently: Connection failed" in response

@pytest.mark.asyncio
async def test_call_openai_success(mock_hardware_scanner):
    with patch.dict(os.environ, {"OPENAI_API_KEY": "key"}):
        provider = LLMProvider()

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "choices": [{"message": {"content": "openai_success"}}]
        }

        mock_post = AsyncMock(return_value=mock_response)

        with patch("httpx.AsyncClient.post", mock_post):
            response = await provider._call_openai("test")
            assert response == "openai_success"

@pytest.mark.asyncio
async def test_call_openai_exception(mock_hardware_scanner):
    with patch.dict(os.environ, {"OPENAI_API_KEY": "key"}):
        provider = LLMProvider()

        mock_post = AsyncMock(side_effect=Exception("API Error"))

        with patch("httpx.AsyncClient.post", mock_post):
            response = await provider._call_openai("test")
            assert "[Cloud gpt-4o-mini Error] Failed to process intelligently using OpenAI: API Error" in response

@pytest.mark.asyncio
async def test_call_anthropic_success(mock_hardware_scanner):
    with patch.dict(os.environ, {"ANTHROPIC_API_KEY": "key"}):
        provider = LLMProvider()

        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "content": [{"text": "anthropic_success"}]
        }

        mock_post = AsyncMock(return_value=mock_response)

        with patch("httpx.AsyncClient.post", mock_post):
            response = await provider._call_anthropic("test")
            assert response == "anthropic_success"

@pytest.mark.asyncio
async def test_call_anthropic_exception(mock_hardware_scanner):
    with patch.dict(os.environ, {"ANTHROPIC_API_KEY": "key"}):
        provider = LLMProvider()

        mock_post = AsyncMock(side_effect=Exception("API Error"))

        with patch("httpx.AsyncClient.post", mock_post):
            response = await provider._call_anthropic("test")
            assert "[Cloud Claude-3 Error] Failed to process intelligently using Anthropic: API Error" in response
