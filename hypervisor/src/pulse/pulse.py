import math
from collections import Counter

class EntropyMonitor:
    def __init__(self):
        self.entropy_level = 0.0

    def measure(self, output: str) -> bool:
        if not output:
            return False

        # Calculate Shannon entropy of the character distribution
        counts = Counter(output)
        length = len(output)
        shannon_entropy = -sum((count / length) * math.log2(count / length) for count in counts.values())

        # If entropy is extremely low (e.g., highly repetitive character loops like 'aaaaaa')
        # or output is excessively long, flag it as an anomaly.
        if shannon_entropy < 2.0 or length > 10000:
            self.entropy_level += 0.5
        else:
            self.entropy_level = max(0, self.entropy_level - 0.1)

        return self.entropy_level > 1.0 # returns True if anomalous


class BehavioralDriftDetector:
    """Tracks semantic drift and repetitive loops over consecutive agent steps."""
    def __init__(self, history_limit: int = 10, drift_threshold: float = 0.8):
        self.history = []
        self.history_limit = history_limit
        self.drift_threshold = drift_threshold
        self.runaway_score = 0.0

    def calculate_jaccard_similarity(self, text1: str, text2: str) -> float:
        set1 = set(text1.lower().split())
        set2 = set(text2.lower().split())
        if not set1 or not set2:
            return 0.0
        intersection = len(set1.intersection(set2))
        union = len(set1.union(set2))
        return intersection / union

    def add_state(self, context: str) -> bool:
        """
        Records the context. Returns True if a runaway/drift is detected.
        """
        if not context:
            return False

        if not self.history:
            self.history.append(context)
            return False

        # Compare with previous state
        prev_context = self.history[-1]
        similarity = self.calculate_jaccard_similarity(prev_context, context)

        # High similarity over time indicates a loop with no progression
        if similarity > self.drift_threshold:
            self.runaway_score += 0.5
        else:
            self.runaway_score = max(0.0, self.runaway_score - 0.2)

        self.history.append(context)
        if len(self.history) > self.history_limit:
            self.history.pop(0)

        # If runaway score gets too high, we're stuck in a loop
        is_drifting = self.runaway_score > 2.0

        if is_drifting:
            self._gossip_drift(similarity)

        return is_drifting

    def _gossip_drift(self, drift_score: float):
        import time
        import os
        import json
        import urllib.request
        from urllib.error import URLError

        # We need a stable node ID representing this instance
        from hypervisor.src.engine.alignment import AlignmentProfile
        profile = AlignmentProfile()
        node_id = profile.crdt.node_id if hasattr(profile, 'crdt') else os.getenv("NODE_ID", f"local-{int(time.time())}")

        report = {
            "nodeId": node_id,
            "skillDrift": float(drift_score),
            "consensusLatency": float(self.runaway_score * 100), # Synthetic metric for demo
            "repetitiveLoops": int(self.runaway_score),
            "timestamp": int(time.time()),
            "signature": "" # Mock signature
        }

        try:
            import hmac
            import uuid
            import hashlib

            api_key = os.getenv("HYPERVISOR_API_KEY", "dummy")
            payload_str = json.dumps(report)
            req_timestamp = str(int(time.time() * 1000))
            nonce = str(uuid.uuid4())

            mac = hmac.new(api_key.encode("utf-8"), f"{req_timestamp}:{nonce}:{payload_str}".encode("utf-8"), hashlib.sha256)
            signature = mac.hexdigest()

            req = urllib.request.Request("http://localhost:8080/drift/report", method="POST")
            req.add_header("Content-Type", "application/json")
            req.add_header("X-Axiom-Timestamp", req_timestamp)
            req.add_header("X-Axiom-Nonce", nonce)
            req.add_header("X-Axiom-Signature", signature)

            urllib.request.urlopen(req, payload_str.encode("utf-8"), timeout=2.0)
        except URLError:
            pass # Grid offline or unreachable
        except Exception as e:
            print(f"Failed to gossip drift report: {e}")
