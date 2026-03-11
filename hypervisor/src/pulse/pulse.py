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
