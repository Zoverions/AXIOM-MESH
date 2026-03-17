import re
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger("Axiom-OpenClaw")

class SignalExtractor:
    """
    OpenClaw-RL: Next-State Signal Recovery.
    Identifies Implicit Rewards and Directive Signals from conversation history.
    """
    def __init__(self):
        self.negative_patterns = [
            re.compile(r"error", re.IGNORECASE),
            re.compile(r"failed", re.IGNORECASE),
            re.compile(r"didn't work", re.IGNORECASE),
            re.compile(r"wrong", re.IGNORECASE),
            re.compile(r"no,", re.IGNORECASE),
        ]
        self.positive_patterns = [
            re.compile(r"thank you", re.IGNORECASE),
            re.compile(r"thanks", re.IGNORECASE),
            re.compile(r"perfect", re.IGNORECASE),
            re.compile(r"success", re.IGNORECASE),
            re.compile(r"worked", re.IGNORECASE),
        ]
        # Directive signals for natural language corrections
        self.directive_patterns = [
            re.compile(r"use the other", re.IGNORECASE),
            re.compile(r"instead of", re.IGNORECASE),
            re.compile(r"change to", re.IGNORECASE),
            re.compile(r"actually,", re.IGNORECASE),
        ]

    def extract_signals(self, current_intent: str, previous_response: str) -> Dict[str, Any]:
        """
        Analyzes the current user intent in the context of the previous response
        to extract reward signals.
        """
        reward = 0.0
        is_directive = False

        # Check for implicit rewards
        for p in self.negative_patterns:
            if p.search(current_intent):
                reward -= 0.5

        for p in self.positive_patterns:
            if p.search(current_intent):
                reward += 0.5

        # Check if current intent is a directive signal correcting the last action
        for p in self.directive_patterns:
            if p.search(current_intent):
                is_directive = True
                reward -= 0.2 # Corrections imply previous action was slightly suboptimal

        return {
            "reward": reward,
            "is_directive": is_directive,
            "signal_text": current_intent if is_directive else None
        }

class OnPolicyDistillation:
    """
    Hindsight-Guided On-Policy Distillation (OPD).
    Converts directive signals and rewards into policy updates.
    """
    def __init__(self):
        self.update_log = []

    def distill(self, action: str, signal: Dict[str, Any], sender_identity: str) -> str:
        """
        Simulates distillation of a signal into the local policy.
        In AxiomMesh, this would update the 'Maverick' or 'Grok' backbone.
        """
        update_id = f"upd_{len(self.update_log)}"

        # Gating: Only signals from verified identities are distilled
        if sender_identity != "Owner":
             logger.warning(f"Unauthorized directive signal from {sender_identity} blocked.")
             return "REJECTED_UNAUTHORIZED"

        update_entry = {
            "id": update_id,
            "action": action,
            "reward": signal["reward"],
            "directive": signal["signal_text"],
            "status": "DISTILLED"
        }
        self.update_log.append(update_entry)
        logger.info(f"[🧬] Distilled signal into policy: {update_id}")
        return update_id
