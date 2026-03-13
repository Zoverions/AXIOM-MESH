import os
import httpx
from src.evolution.hardware import HardwareScanner

class LLMProvider:
    def __init__(self):
        self.fallback_mode = False
        self.openai_key = os.environ.get("OPENAI_API_KEY", "")
        self.anthropic_key = os.environ.get("ANTHROPIC_API_KEY", "")
        # By default, use local unless explicitly allowed
        self.allow_cloud = os.environ.get("ALLOW_CLOUD_LLM", "false").lower() == "true"
        self.provider_preference = os.environ.get("LLM_PROVIDER", "local").lower()

        self.hardware_scanner = HardwareScanner()
        self.footprint = self.hardware_scanner.scan()
        self.recommended_models = self.hardware_scanner.recommend_models(self.footprint)

        # Override with environment variable if provided, otherwise use hardware recommendation
        self.local_model = os.environ.get("LOCAL_MODEL_FALLBACK", self.recommended_models["default"])

    async def process(self, context: str, frequency_penalty: float = 0.0, presence_penalty: float = 0.0) -> str:
        """
        Process the intent context. It dynamically routes to the most efficient model.
        Local models are prioritized by default to save API credits, unless ALLOW_CLOUD_LLM is true
        and the provider preference explicitly requires a cloud API for complex tasks.
        """
        use_cloud = self.allow_cloud and (self.provider_preference in ["openai", "anthropic"])

        # Temperature Guard: Dynamic scaling based on context length
        # Prevent 10x fabrication spikes as context exceeds 128K.
        context_len = len(context)
        temperature = 0.7 # default
        if context_len > 128000:
            temperature = 0.0
        elif context_len > 64000:
            temperature = 0.2
        elif context_len > 32000:
            temperature = 0.4

        # Simple heuristic: if context is extremely large, we might *need* cloud,
        # but only if we have funds (ALLOW_CLOUD_LLM).
        if context_len > 10000 and self.allow_cloud and self.openai_key:
            return await self._call_openai(context, model="gpt-4-turbo", temperature=temperature, frequency_penalty=frequency_penalty, presence_penalty=presence_penalty)

        if use_cloud:
            if self.provider_preference == "openai" and self.openai_key:
                return await self._call_openai(context, temperature=temperature, frequency_penalty=frequency_penalty, presence_penalty=presence_penalty)
            elif self.provider_preference == "anthropic" and self.anthropic_key:
                return await self._call_anthropic(context, temperature=temperature)

        # Default back to Local LLM (Ollama/Llama.cpp style)
        return await self._call_local(context, temperature=temperature)

    async def _call_local(self, context: str, temperature: float = 0.7) -> str:
        # Infer task from context to select optimal local model
        ctx_lower = context.lower()
        if "code" in ctx_lower or "python" in ctx_lower or "def " in ctx_lower or "function" in ctx_lower:
            model = self.recommended_models.get("coding", self.local_model)
        elif "reason" in ctx_lower or "explain" in ctx_lower or "why" in ctx_lower or "analyze" in ctx_lower:
            model = self.recommended_models.get("reasoning", self.local_model)
        else:
            model = self.local_model

        # Standard local Ollama fallback endpoint logic
        url = "http://localhost:11434/api/generate"
        payload = {
            "model": model,
            "prompt": context,
            "stream": False,
            "options": {
                "temperature": temperature
            }
        }
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(url, json=payload, timeout=30.0)
                response.raise_for_status()
                return response.json().get("response", "")
        except Exception as e:
            return f"[Local {model} Error] Failed to process intelligently: {e}"

    async def _call_openai(self, context: str, model: str = "gpt-4o-mini", temperature: float = 0.7, frequency_penalty: float = 0.0, presence_penalty: float = 0.0) -> str:
        url = "https://api.openai.com/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.openai_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": context}],
            "temperature": temperature,
            "frequency_penalty": frequency_penalty,
            "presence_penalty": presence_penalty
        }
        try:
            async with httpx.AsyncClient() as client:
                # Filter out default 0.0 to avoid cluttering payload if supported
                actual_payload = {k: v for k, v in payload.items() if v != 0.0 or k in ["model", "messages", "temperature"]}
                response = await client.post(url, headers=headers, json=actual_payload, timeout=30.0)
                response.raise_for_status()
                return response.json()["choices"][0]["message"]["content"]
        except Exception as e:
            return f"[Cloud {model} Error] Failed to process intelligently using OpenAI: {e}"

    async def _call_anthropic(self, context: str, temperature: float = 0.7) -> str:
        url = "https://api.anthropic.com/v1/messages"
        headers = {
            "x-api-key": self.anthropic_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json"
        }
        payload = {
            "model": "claude-3-haiku-20240307",
            "max_tokens": 1024,
            "messages": [{"role": "user", "content": context}],
            "temperature": temperature
        }
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(url, headers=headers, json=payload, timeout=30.0)
                response.raise_for_status()
                return response.json()["content"][0]["text"]
        except Exception as e:
            return f"[Cloud Claude-3 Error] Failed to process intelligently using Anthropic: {e}"
