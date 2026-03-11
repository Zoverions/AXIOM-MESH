import uuid
import time
import os
import httpx
from src.models.intent import IntentObject, IntentResponse

class LLMProvider:
    def __init__(self):
        self.fallback_mode = False
        self.openai_key = os.environ.get("OPENAI_API_KEY", "")
        self.anthropic_key = os.environ.get("ANTHROPIC_API_KEY", "")
        # By default, use local unless explicitly allowed
        self.allow_cloud = os.environ.get("ALLOW_CLOUD_LLM", "false").lower() == "true"
        self.local_model = os.environ.get("LOCAL_MODEL_FALLBACK", "llama3:8b")
        self.provider_preference = os.environ.get("LLM_PROVIDER", "local").lower()

    async def process(self, context: str) -> str:
        """
        Process the intent context. It dynamically routes to the most efficient model.
        Local models are prioritized by default to save API credits, unless ALLOW_CLOUD_LLM is true
        and the provider preference explicitly requires a cloud API for complex tasks.
        """
        use_cloud = self.allow_cloud and (self.provider_preference in ["openai", "anthropic"])

        # Simple heuristic: if context is extremely large, we might *need* cloud,
        # but only if we have funds (ALLOW_CLOUD_LLM).
        if len(context) > 10000 and self.allow_cloud and self.openai_key:
            return await self._call_openai(context, model="gpt-4-turbo")

        if use_cloud:
            if self.provider_preference == "openai" and self.openai_key:
                return await self._call_openai(context)
            elif self.provider_preference == "anthropic" and self.anthropic_key:
                return await self._call_anthropic(context)

        # Default back to Local LLM (Ollama/Llama.cpp style)
        return await self._call_local(context)

    async def _call_local(self, context: str) -> str:
        # Standard local Ollama fallback endpoint logic
        url = "http://localhost:11434/api/generate"
        payload = {
            "model": self.local_model,
            "prompt": context,
            "stream": False
        }
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(url, json=payload, timeout=30.0)
                response.raise_for_status()
                return response.json().get("response", "")
        except Exception as e:
            return f"[Local {self.local_model} Error] Failed to process intelligently: {e}"

    async def _call_openai(self, context: str, model: str = "gpt-4o-mini") -> str:
        url = "https://api.openai.com/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.openai_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": context}]
        }
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(url, headers=headers, json=payload, timeout=30.0)
                response.raise_for_status()
                return response.json()["choices"][0]["message"]["content"]
        except Exception as e:
            return f"[Cloud {model} Error] Failed to process intelligently using OpenAI: {e}"

    async def _call_anthropic(self, context: str) -> str:
        url = "https://api.anthropic.com/v1/messages"
        headers = {
            "x-api-key": self.anthropic_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json"
        }
        payload = {
            "model": "claude-3-haiku-20240307",
            "max_tokens": 1024,
            "messages": [{"role": "user", "content": context}]
        }
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(url, headers=headers, json=payload, timeout=30.0)
                response.raise_for_status()
                return response.json()["content"][0]["text"]
        except Exception as e:
            return f"[Cloud Claude-3 Error] Failed to process intelligently using Anthropic: {e}"
