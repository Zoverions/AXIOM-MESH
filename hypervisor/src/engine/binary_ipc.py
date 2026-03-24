"""Binary IPC helpers for AICP payloads.

This module now includes transformer proposal tensor forwarding for MODEL_RUN.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Dict, Any


class Modality(str, Enum):
    TEXT = "text"
    LATENT_VECTOR = "latentVector"
    GRAPH_DELTA = "graphDelta"
    ZK_PROOF = "zkProof"


@dataclass(frozen=True)
class ProposalTensorMessage:
    intent_id: bytes
    sender_pub_key: bytes
    timestamp: int
    tensor_payload: bytes
    signature: bytes


def encode_message(payload: Dict[str, Any]) -> bytes:
    """Lightweight deterministic encoder used by tests and local IPC."""
    parts = []
    for key in sorted(payload.keys()):
        value = payload[key]
        parts.append(f"{key}={value}".encode("utf-8"))
    return b"|".join(parts)


def send_proposal_tensor(message: ProposalTensorMessage) -> bytes:
    """Encode latent-vector proposal message for downstream MODEL_RUN handling."""
    payload = {
        "modality": Modality.LATENT_VECTOR.value,
        "intent_id": message.intent_id.hex(),
        "sender": message.sender_pub_key.hex(),
        "timestamp": message.timestamp,
        "tensor": message.tensor_payload.hex(),
        "signature": message.signature.hex(),
    }
    return encode_message(payload)
