import uuid
import time
import os
import requests
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

    def process(self, context: str) -> str:
        """
        Process the intent context. It dynamically routes to the most efficient model.
        Local models are prioritized by default to save API credits, unless ALLOW_CLOUD_LLM is true
        and the provider preference explicitly requires a cloud API for complex tasks.
        """
        use_cloud = self.allow_cloud and (self.provider_preference in ["openai", "anthropic"])

        # Simple heuristic: if context is extremely large, we might *need* cloud,
        # but only if we have funds (ALLOW_CLOUD_LLM).
        if len(context) > 10000 and self.allow_cloud and self.openai_key:
            return self._call_openai(context, model="gpt-4-turbo")

        if use_cloud:
            if self.provider_preference == "openai" and self.openai_key:
                return self._call_openai(context)
            elif self.provider_preference == "anthropic" and self.anthropic_key:
                return self._call_anthropic(context)

        # Default back to Local LLM (Ollama/Llama.cpp style)
        return self._call_local(context)

    def _call_local(self, context: str) -> str:
        # Standard local Ollama fallback endpoint logic
        # For simulation, we return a mock acknowledging the local model
        return f"[Local {self.local_model}] Processed intelligently: [{context[:100]}...] - Reduced entropy locally."

    def _call_openai(self, context: str, model: str = "gpt-4o-mini") -> str:
        # Simulated OpenAI processing to manage cloud resources efficiently
        return f"[Cloud {model}] Processed intelligently using OpenAI: [{context[:100]}...] - Reduced entropy via Cloud."

    def _call_anthropic(self, context: str) -> str:
        return f"[Cloud Claude-3] Processed intelligently using Anthropic: [{context[:100]}...] - Reduced entropy via Cloud."
