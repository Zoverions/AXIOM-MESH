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
        return self.runaway_score > 2.0
