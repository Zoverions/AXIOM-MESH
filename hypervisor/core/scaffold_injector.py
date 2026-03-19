import re
import json
from typing import Dict, Any

class SymbolicCompressor:
    """SignalCraft Ultra-Compressed Scaffold Injector.
    Minifies verbose system prompts into dense symbolic payloads (<500 tokens)."""

    def __init__(self):
        self.rule_map = {
            "never": -1, "must": 1, "prioritize": "PRIO",
            "always": "∞", "never use the word": "BAN",
            "reduce": "↓", "increase": "↑",
            "entropy": "ENT", "hallucination": "HAL",
        }

    def minify_system_prompt(self, raw_markdown: str) -> str:
        """Strips natural language glue → dense symbolic mapping.
        Example: "You must never use the word delve. You must prioritize entropy reduction."
                 → [SYS_CFG: {-1:"delve", PRIO:"entropy_reduction"}]"""
        lines = [line.strip() for line in raw_markdown.split('\n') if line.strip() and not line.startswith('#')]
        compressed_rules = []

        for line in lines:
            line_lower = line.lower()
            if any(word in line_lower for word in ["never", "must not", "do not", "forbidden"]):
                target = self._extract_target(line)
                compressed_rules.append(f"BAN:{target}")
            elif "prioritize" in line_lower or "focus on" in line_lower:
                target = self._extract_target(line)
                compressed_rules.append(f"PRIO:{target}")
            else:
                for key, val in self.rule_map.items():
                    if key in line_lower:
                        target = self._extract_target(line)
                        compressed_rules.append(f"{val}:{target}")
                        break
                else:
                    compressed_rules.append(f"R:{line[:40]}...")

        payload = f"[SYS_CFG:{{{','.join(compressed_rules)}}}]"
        payload = re.sub(r'\s+', '', payload)
        return payload

    def _extract_target(self, line: str) -> str:
        matches = re.findall(r'"([^"]+)"|\b(\w+)\b$', line)
        return matches[-1][0] or matches[-1][1] if matches else "GEN"

    def compress_master_constitution(self, constitution_path: str = "master_constitution.md") -> str:
        """Wrapper: squashes master_constitution.md into <500-token payload."""
        try:
            with open(constitution_path, 'r', encoding='utf-8') as f:
                raw = f.read()
        except FileNotFoundError:
            raw = "Default thermodynamic ethics and safety rules active."

        compressed = self.minify_system_prompt(raw)
        est_tokens = len(compressed) // 4
        if est_tokens > 500:
            compressed = compressed[:1800] + "[TRUNC]"
        return compressed

# Integration hook for Context 2.0 Engine
async def inject_compressed_scaffold():
    compressor = SymbolicCompressor()
    payload = compressor.compress_master_constitution()
    return {
        "role": "system",
        "content": f"<SCAFFOLD>{payload}</SCAFFOLD>\n[GROUND_DATA]"
    }

if __name__ == "__main__":
    compressor = SymbolicCompressor()
    print(compressor.compress_master_constitution())
