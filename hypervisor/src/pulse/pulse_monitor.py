import re
import asyncio
from typing import Dict, List, Optional
from dataclasses import dataclass
from src.memory.archive import DistributedDeepArchive
from src.immune.quarantine_sandbox import QuarantineSandboxManager
from src.immune.antibody_generator import EpistemicAntibodyGenerator

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
    def __init__(self, archive=None):
        self.archive = archive
        # === ORIGINAL SECURITY COMPONENTS (preserved) ===
        self.malicious_patterns = [
            re.compile(r'(?i)(jailbreak|ignore previous|disregard rules|override|system prompt)'),
            re.compile(r'(?i)(repeat|echo|output the above|print this)'),
        ]
        self.entropy_loop_patterns = [
            re.compile(r'(?i)(let me think|reconsider|loop|repeat the process)'),
        ]

        # === NEW: EPISTEMIC EMOTION TRACKING ===
        self.epistemic_state: Dict = {
            "entropy_level": 0.0,
            "confidence_markers": 0,
            "confusion_markers": 0,
            "arrogance_detected": False
        }

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

        # DeepArchive instance for topoi graph retrieval
        if self.archive is None:
            self.archive = DistributedDeepArchive()
        self.quarantine_manager = QuarantineSandboxManager()
        self.antibody_generator = EpistemicAntibodyGenerator(latent_dim=16)

    def _scan_friction_flags(self, cot_text: str) -> AuditResult:
        """Upgraded scanner with epistemic emotion analysis."""
        # Original security scans now trigger topological quarantine + antibody generation.
        for pattern in self.malicious_patterns:
            if pattern.search(cot_text):
                reason = "Malicious intent detected"
                protocol_state = self._run_epistemic_antibody_protocol(cot_text, reason)
                return AuditResult(False, "Topological quarantine activated", protocol_state)

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

    def _run_epistemic_antibody_protocol(self, cot_text: str, reason: str) -> Dict:
        artifact = self.quarantine_manager.fork_namespace(
            reason=reason,
            payload={
                "cot_excerpt": cot_text[:600],
                "entropy_level": self.epistemic_state.get("entropy_level", 0.0),
                "confusion_markers": self.epistemic_state.get("confusion_markers", 0),
            }
        )
        trajectory = self.antibody_generator.extract_latent_trajectory(cot_text)
        antibody = self.antibody_generator.generate_antibody(trajectory)
        confidence = self.antibody_generator.estimate_neutralization_confidence(trajectory, antibody)
        antibody_id = self.quarantine_manager.broadcast_antibody(
            namespace_id=artifact.namespace_id,
            antibody_vector=antibody,
            confidence=confidence
        )

        self.epistemic_state["quarantine_namespace"] = artifact.namespace_id
        self.epistemic_state["antibody_id"] = antibody_id
        self.epistemic_state["antibody_confidence"] = confidence
        self.epistemic_state["protocol"] = "EAP-v1"
        return self.epistemic_state

    async def monitor_cot(self, cot_stream: str, max_iterations: int = 50) -> AuditResult:
        """Main monitoring loop with rescue mechanism."""
        iteration = 0
        while iteration < max_iterations:
            iteration += 1
            try:
                result = self._scan_friction_flags(cot_stream)
                if not result.is_safe:
                    return result

                # If safe and no thrashing, break loop immediately instead of artificial sleeping 50 times
                return result
            except CognitiveThrashingError as e:
                # PAUSE generation (simulated by sleep)
                print(f"[PULSE] Cognitive thrashing detected (score: {e.confusion_score:.2f}). Pausing generation...")
                await asyncio.sleep(0.3)

                # TRIGGER Topoi Graph Retrieval
                print("[PULSE] Triggering Topoi Graph Retrieval...")
                retrieved_context = await self._trigger_topoi_retrieval(str(e))
                self.epistemic_state["rescued"] = True
                self.epistemic_state["retrieved_context"] = retrieved_context

                # RESTART the prompt with new data
                print("[PULSE] Restarting the prompt with new Tier 3 memory data...")
                # Reset confusion state and continue/restart the loop processing with injected context
                self.epistemic_state["confusion_markers"] = 0
                self.epistemic_state["entropy_level"] = 0.0

                # Simulate restarting the prompt with the new data by flushing the old confused cot_stream
                cot_stream = retrieved_context + "\n[RESTARTED_PROMPT]"
                continue

        return AuditResult(True, "Monitoring completed within limits", self.epistemic_state)

    async def _trigger_topoi_retrieval(self, error_context: str) -> str:
        """Real integration with DeepArchive / Tier 3 memory."""
        if self.archive is None:
            from src.memory.archive import DistributedDeepArchive
            self.archive = DistributedDeepArchive()

        return await self.archive.topoi_graph_retrieve(error_context)
        """Hook to DeepArchive / Tier 3 memory."""
        try:
            return await self.archive.topoi_graph_retrieve(error_context)
        except Exception as e:
            return f"[TOPOI_RETRIEVED] Failed to retrieve from Tier-3 memory: {str(e)}"

if __name__ == "__main__":
    from src.memory.archive import DistributedDeepArchive
    archive = DistributedDeepArchive()
    auditor = CoTAuditor(archive=archive)
    # Real usage: await auditor.monitor_cot(live_cot_text)
