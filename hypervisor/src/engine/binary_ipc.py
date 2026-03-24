"""Binary IPC helpers for AICP payloads.

This module includes transformer proposal tensor forwarding for MODEL_RUN.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Dict, Any, Sequence


class Modality(str, Enum):
    TEXT = "text"
    LATENT_VECTOR = "latentVector"
    GRAPH_DELTA = "graphDelta"
    ZK_PROOF = "zkProof"


class ProposalType(str, Enum):
    MODEL_RUN = "MODEL_RUN"


@dataclass(frozen=True)
class ProposalTensorMessage:
    intent_id: bytes
    sender_pub_key: bytes
    timestamp: int
    tensor_payload: bytes
    signature: bytes
    proposal_type: ProposalType = ProposalType.MODEL_RUN
    tensor_shape: Sequence[int] = ()
    tensor_dtype: str = "float32"


def encode_message(payload: Dict[str, Any]) -> bytes:
    """Lightweight deterministic encoder used by tests and local IPC."""
    parts = []
    for key in sorted(payload.keys()):
        value = payload[key]
        parts.append(f"{key}={value}".encode("utf-8"))
    return b"|".join(parts)


def message_from_aicp_intent(intent: Dict[str, Any]) -> ProposalTensorMessage:
    """Convert normalized AICP intent dict into a MODEL_RUN IPC message."""
    proposal_type = intent.get("proposal_type")
    if proposal_type != ProposalType.MODEL_RUN.value:
        raise ValueError(f"unsupported proposal type: {proposal_type}")

    modality = intent.get("modality")
    if modality != Modality.LATENT_VECTOR.value:
        raise ValueError(f"unsupported modality: {modality}")

    tensor_payload = intent.get("tensor_payload")
    if not isinstance(tensor_payload, (bytes, bytearray)) or len(tensor_payload) == 0:
        raise ValueError("tensor payload must be non-empty bytes")

    return ProposalTensorMessage(
        intent_id=intent["intent_id"],
        sender_pub_key=intent["sender_pub_key"],
        timestamp=int(intent["timestamp"]),
        tensor_payload=bytes(tensor_payload),
        signature=intent["signature"],
        proposal_type=ProposalType.MODEL_RUN,
        tensor_shape=tuple(intent.get("tensor_shape", ())),
        tensor_dtype=intent.get("tensor_dtype", "float32"),
    )


def send_proposal_tensor(message: ProposalTensorMessage) -> bytes:
    """Encode latent-vector proposal message for downstream MODEL_RUN handling."""
    payload = {
        "intent_id": message.intent_id.hex(),
        "modality": Modality.LATENT_VECTOR.value,
        "proposal_type": message.proposal_type.value,
        "sender": message.sender_pub_key.hex(),
        "signature": message.signature.hex(),
        "tensor": message.tensor_payload.hex(),
        "tensor_dtype": message.tensor_dtype,
        "tensor_shape": list(message.tensor_shape),
        "timestamp": message.timestamp,
    }
    return encode_message(payload)
