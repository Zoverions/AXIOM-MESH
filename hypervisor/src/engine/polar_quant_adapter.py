import logging
import math
from typing import Dict

import torch

logger = logging.getLogger("AxiomMesh-TurboQuant")


class PolarQuantQJLAdapter:
    """
    Two-stage TurboQuant KV cache compression for key tensors.

    Stage 1: random orthogonal preconditioning + polar quantization.
    Stage 2: 1-bit QJL residual sign correction for attention logit bias.
    """

    def __init__(self, head_dim: int, bits_polar: int = 3):
        if head_dim <= 0:
            raise ValueError("head_dim must be > 0")
        if head_dim % 2 != 0:
            raise ValueError("head_dim must be even so the tensor can be split into polar pairs")
        if bits_polar <= 0 or bits_polar > 8:
            raise ValueError("bits_polar must be in the range [1, 8]")

        self.head_dim = head_dim
        self.bits_polar = bits_polar

        random_matrix = torch.randn(head_dim, head_dim)
        q, _ = torch.linalg.qr(random_matrix)
        self.rotation_matrix = q.to(torch.float16)

        self.angle_max = math.pi
        self.angle_min = -math.pi
        self.polar_levels = (2**bits_polar) - 1

    def _validate_keys(self, keys: torch.Tensor) -> None:
        if keys.ndim != 4:
            raise ValueError("keys must have shape (batch, heads, seq_len, head_dim)")
        if keys.shape[-1] != self.head_dim:
            raise ValueError(f"keys head_dim mismatch: expected {self.head_dim}, got {keys.shape[-1]}")

    def compress_keys(self, keys: torch.Tensor) -> Dict[str, torch.Tensor]:
        """Compresses keys of shape (batch, heads, seq_len, head_dim)."""
        self._validate_keys(keys)

        self.rotation_matrix = self.rotation_matrix.to(keys.device)
        rotated_keys = torch.matmul(keys.to(torch.float16), self.rotation_matrix)

        half_dim = self.head_dim // 2
        x = rotated_keys[..., :half_dim]
        y = rotated_keys[..., half_dim:]

        radii = torch.sqrt((x**2) + (y**2))
        angles = torch.atan2(y, x)

        normalized_angles = (angles - self.angle_min) / (self.angle_max - self.angle_min)
        quantized_angles = torch.round(normalized_angles * self.polar_levels).clamp(0, self.polar_levels)

        dequant_normalized = quantized_angles / self.polar_levels
        dequant_angles = (dequant_normalized * (self.angle_max - self.angle_min)) + self.angle_min

        approx_x = radii * torch.cos(dequant_angles)
        approx_y = radii * torch.sin(dequant_angles)
        approx_rotated_keys = torch.cat([approx_x, approx_y], dim=-1)

        residual = rotated_keys - approx_rotated_keys
        qjl_residual_signs = torch.sign(residual).to(torch.int8)

        logger.debug(
            "[TurboQuant] Compressed %s tensor to %s-bit Polar + 1-bit QJL.",
            tuple(keys.shape),
            self.bits_polar,
        )

        return {
            "radii": radii.to(torch.float16),
            "quantized_angles": quantized_angles.to(torch.uint8),
            "qjl_signs": qjl_residual_signs,
        }

    def compute_attention_logits(
        self,
        query: torch.Tensor,
        compressed_cache: Dict[str, torch.Tensor],
        residual_scale: float = 0.1,
    ) -> torch.Tensor:
        """
        Computes QK^T logits using compressed keys.
        query shape: (batch, heads, query_len, head_dim)
        """
        if query.ndim != 4:
            raise ValueError("query must have shape (batch, heads, query_len, head_dim)")
        if query.shape[-1] != self.head_dim:
            raise ValueError(f"query head_dim mismatch: expected {self.head_dim}, got {query.shape[-1]}")

        self.rotation_matrix = self.rotation_matrix.to(query.device)
        rotated_query = torch.matmul(query.to(torch.float16), self.rotation_matrix)

        radii = compressed_cache["radii"].to(query.device)
        quantized_angles = compressed_cache["quantized_angles"].to(query.device)
        qjl_signs = compressed_cache["qjl_signs"].to(query.device)

        dequant_normalized = quantized_angles.to(torch.float16) / self.polar_levels
        dequant_angles = (dequant_normalized * (self.angle_max - self.angle_min)) + self.angle_min

        approx_k_x = radii * torch.cos(dequant_angles)
        approx_k_y = radii * torch.sin(dequant_angles)
        approx_k = torch.cat([approx_k_x, approx_k_y], dim=-1)

        base_logits = torch.einsum("bhqd,bhkd->bhqk", rotated_query, approx_k)
        residual_correction = torch.einsum("bhqd,bhkd->bhqk", rotated_query, qjl_signs.to(torch.float16))

        return base_logits + (residual_scale * residual_correction)
