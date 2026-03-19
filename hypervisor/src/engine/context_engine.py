import logging
import tiktoken

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def enforce_context_cap(prompt: str, max_tokens: int = 8192) -> str:
    """
    Enforces a strict context cap on the incoming prompt to prevent Context Degradation Spikes.
    """
    # Use cl100k_base which is standard for modern OpenAI models like gpt-3.5/gpt-4
    encoding = tiktoken.get_encoding("cl100k_base")

    tokens = encoding.encode(prompt)
    if len(tokens) > max_tokens:
        logger.warning("Context Degradation Prevented: Input truncated to 8K tokens.")
        # Truncate tokens and decode back to string
        truncated_tokens = tokens[:max_tokens]
        return encoding.decode(truncated_tokens)

    return prompt
