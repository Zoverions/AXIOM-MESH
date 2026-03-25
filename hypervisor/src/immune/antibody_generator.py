import hashlib
from typing import Iterable


class EpistemicAntibodyGenerator:
    """
    Deterministic phase-1 antibody generator.
    Maps text to a latent trajectory and computes its inverse vector.
    """

    def __init__(self, latent_dim: int = 16) -> None:
        self.latent_dim = latent_dim

    def extract_latent_trajectory(self, text: str) -> list[float]:
        buckets = [0.0 for _ in range(self.latent_dim)]
        if not text:
            return buckets

        digest = hashlib.sha256(text.encode("utf-8", errors="replace")).digest()
        for idx, byte_val in enumerate(digest):
            slot = idx % self.latent_dim
            buckets[slot] += (byte_val / 255.0) - 0.5

        norm = sum(abs(v) for v in buckets) or 1.0
        return [round(v / norm, 6) for v in buckets]

    def generate_antibody(self, trajectory: Iterable[float]) -> list[float]:
        vector = list(trajectory)
        if not vector:
            return [0.0 for _ in range(self.latent_dim)]
        return [round(-1.0 * value, 6) for value in vector]

    def estimate_neutralization_confidence(self, trajectory: list[float], antibody: list[float]) -> float:
        if not trajectory or not antibody or len(trajectory) != len(antibody):
            return 0.0
        residual = sum(abs(a + b) for a, b in zip(trajectory, antibody))
        baseline = sum(abs(v) for v in trajectory) or 1.0
        score = max(0.0, 1.0 - (residual / baseline))
        return round(score, 4)
