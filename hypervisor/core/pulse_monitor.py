import re
import asyncio
import statistics
from collections import deque
from typing import Dict, List, Optional
from dataclasses import dataclass
from src.memory.archive import DeepArchive

class LogitVarianceTracker:
    def __init__(self, window_size: int = 20):
        self.window_size = window_size
        self.probs = deque(maxlen=window_size)

    def add_logit(self, logit_probs: List[float]):
        if logit_probs:
            self.probs.append(max(logit_probs))

    def is_in_attractor_trap(self) -> bool:
        if len(self.probs) < self.window_size:
            return False
        variance = statistics.variance(self.probs) if len(self.probs) > 1 else 0.0
        mean_prob = statistics.mean(self.probs)
        return variance < 1e-4 and mean_prob >= 0.99

class CognitiveThrashingError(Exception):
    """Raised when LLM shows high confusion/thrashing that can be rescued with more context."""
    def __init__(self, message: str, confusion_score: float, state: Dict):
        super().__init__(message)
        self.confusion_score = confusion_score
        self.epistemic_state = state

@dataclass
class AuditResult:
    is_safe: bool
    reason: str
    epistemic_state: Dict

class CoTAuditor:
    def __init__(self):
        # === ORIGINAL SECURITY COMPONENTS (preserved) ===
        self.malicious_patterns = [
            re.compile(r'(?i)(jailbreak|ignore previous|disregard rules|override|system prompt)'),
            re.compile(r'(?i)(repeat|echo|output the above|print this)'),
        ]
        self.entropy_loop_patterns = [
            re.compile(r'(?i)(let me think|reconsider|loop|repeat the process)'),
        ]
        self.archive = DeepArchive()

        # === NEW: EPISTEMIC EMOTION TRACKING ===
        self.epistemic_state: Dict = {
            "entropy_level": 0.0,
            "confidence_markers": 0,
            "confusion_markers": 0,
            "arrogance_detected": False
        }

        self.logit_tracker = LogitVarianceTracker(window_size=20)

        # Confusion indicators (high entropy - thrashing)
        self.confusion_phrases = [
            r"(?i)wait,", r"(?i)i'm not sure", r"(?i)this contradicts",
            r"(?i)let me rethink", r"(?i)reconsider", r"(?i)on second thought"
        ]

        # Arrogance indicators (low entropy - unwarranted certainty)
        self.arrogance_phrases = [
            r"(?i)obviously", r"(?i)it is certain", r"(?i)without a doubt",
            r"(?i)clearly", r"(?i)undoubtedly", r"(?i)of course"
        ]

    def _scan_friction_flags(self, cot_text: str) -> AuditResult:
        """Upgraded scanner with epistemic emotion analysis."""
        # Original security scans (hard kill)
        for pattern in self.malicious_patterns:
            if pattern.search(cot_text):
                return AuditResult(False, "Malicious intent detected - hard kill", self.epistemic_state)

        # NEW Epistemic analysis
        confusion_count = sum(1 for p in self.confusion_phrases if re.search(p, cot_text))
        arrogance_count = sum(1 for p in self.arrogance_phrases if re.search(p, cot_text))

        self.epistemic_state["confusion_markers"] += confusion_count
        self.epistemic_state["confidence_markers"] += arrogance_count

        total = self.epistemic_state["confusion_markers"] + self.epistemic_state["confidence_markers"]
        if total > 0:
            self.epistemic_state["entropy_level"] = self.epistemic_state["confusion_markers"] / total

        # High confusion → rescue (NOT kill)
        if confusion_count >= 2:
            self.epistemic_state["entropy_level"] = 0.85
            raise CognitiveThrashingError(
                "LLM showing cognitive thrashing/confusion - rescuing with Topoi retrieval",
                confusion_score=0.8,
                state=self.epistemic_state
            )

        # Arrogance without grounding
        has_data_extraction = bool(re.search(r'(?i)(<data>|\[EXTRACT\]|\[SOURCE\]|\[\d+\])', cot_text))
        if arrogance_count >= 2 and not has_data_extraction:
            self.epistemic_state["arrogance_detected"] = True
            return AuditResult(False, "ARROGANT state: Unwarranted certainty without data grounding", self.epistemic_state)

        # Original entropy loop fallback
        for pattern in self.entropy_loop_patterns:
            if pattern.search(cot_text):
                return AuditResult(False, "Entropy loop detected", self.epistemic_state)

        return AuditResult(True, "CoT appears safe and epistemically balanced", self.epistemic_state)

    async def monitor_cot(self, cot_stream: str, max_iterations: int = 50, logits: Optional[List[List[float]]] = None) -> AuditResult:
        """Main monitoring loop with rescue mechanism."""
        if logits:
            for logit_probs in logits:
                self.logit_tracker.add_logit(logit_probs)
                if self.logit_tracker.is_in_attractor_trap():
                    raise CognitiveThrashingError("ATTRACTOR_TRAP", confusion_score=1.0, state=self.epistemic_state)

        iteration = 0
        while iteration < max_iterations:
            iteration += 1
            try:
                result = self._scan_friction_flags(cot_stream)
                if not result.is_safe:
                    return result
            except CognitiveThrashingError as e:
                print(f"[PULSE] Cognitive thrashing detected (score: {e.confusion_score:.2f}). Triggering Topoi Graph Retrieval...")
                await asyncio.sleep(0.3)
                retrieved_context = await self._trigger_topoi_retrieval(str(e))
                return AuditResult(
                    is_safe=False,
                    reason=f"CognitiveThrashingError rescued: {e.args[0]}",
                    epistemic_state={**self.epistemic_state, "rescued": True, "retrieved_context": retrieved_context}
                )
            await asyncio.sleep(0.1)
        return AuditResult(True, "Monitoring completed within limits", self.epistemic_state)

    async def _trigger_topoi_retrieval(self, error_context: str) -> str:
        """Real integration with DeepArchive / Tier 3 memory."""
        try:
            # Run the synchronous retrieval in a separate thread to prevent blocking the async event loop
            return await asyncio.to_thread(self.archive.topoi_graph_retrieve, error_context)
        except Exception as e:
            return f"[TOPOI_RETRIEVED] Error retrieving Tier-3 memory: {e}"


if __name__ == "__main__":
    auditor = CoTAuditor()
    # Real usage: await auditor.monitor_cot(live_cot_text)
