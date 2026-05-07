import pytest
import base64
import json
from hypervisor.src.engine.binary_ipc import (
    message_from_aicp_intent,
    ProposalTensorMessage,
    ProposalType,
    Modality
)

def test_message_from_aicp_intent_happy_path_snake_case():
    intent = {
        "intent_id": b"id123",
        "sender_pub_key": b"pubkey123",
        "timestamp": 123456789,
        "modality": "latentVector",
        "proposal_type": "MODEL_RUN",
        "tensor_payload": b"tensor_data",
        "signature": b"sig123",
        "tensor_shape": [1, 2, 3],
        "tensor_dtype": "float16"
    }
    msg = message_from_aicp_intent(intent)
    assert isinstance(msg, ProposalTensorMessage)
    assert msg.intent_id == b"id123"
    assert msg.sender_pub_key == b"pubkey123"
    assert msg.timestamp == 123456789
    assert msg.tensor_payload == b"tensor_data"
    assert msg.signature == b"sig123"
    assert msg.proposal_type == ProposalType.MODEL_RUN
    assert msg.tensor_shape == (1, 2, 3)
    assert msg.tensor_dtype == "float16"

def test_message_from_aicp_intent_happy_path_camel_case():
    intent = {
        "id": b"id456",
        "senderPubKey": b"pubkey456",
        "timestamp": "987654321",
        "modality": Modality.LATENT_VECTOR,
        "proposalType": "MODEL_RUN",
        "tensor_payload": b"more_data",
        "tensorShape": [4, 5],
        "tensorDtype": "int8"
    }
    msg = message_from_aicp_intent(intent)
    assert msg.intent_id == b"id456"
    assert msg.sender_pub_key == b"pubkey456"
    assert msg.timestamp == 987654321
    assert msg.tensor_shape == (4, 5)
    assert msg.tensor_dtype == "int8"

def test_message_from_aicp_intent_nested_proposal_tensor():
    intent = {
        "timestamp": 1000,
        "modality": "latentVector",
        "proposalTensor": {
            "proposalType": "MODEL_RUN",
            "tensorShape": [10],
            "tensorDtype": "float64"
        },
        "tensor_payload": b"data"
    }
    msg = message_from_aicp_intent(intent)
    assert msg.proposal_type == ProposalType.MODEL_RUN
    assert msg.tensor_shape == (10,)
    assert msg.tensor_dtype == "float64"

def test_message_from_aicp_intent_payload_json_fallback():
    payload_dict = {
        "tensor": base64.b64encode(b"decoded_data").decode("utf-8"),
        "proposalType": "MODEL_RUN"
    }
    intent = {
        "timestamp": 2000,
        "modality": "latentVector",
        "proposalType": "MODEL_RUN",
        "payload": json.dumps(payload_dict).encode("utf-8")
    }
    msg = message_from_aicp_intent(intent)
    assert msg.tensor_payload == b"decoded_data"

def test_message_from_aicp_intent_unsupported_proposal_type():
    intent = {
        "proposal_type": "NOT_MODEL_RUN",
        "timestamp": 0
    }
    with pytest.raises(ValueError, match="unsupported proposal type: NOT_MODEL_RUN"):
        message_from_aicp_intent(intent)

@pytest.mark.parametrize("modality", ["text", "graphDelta", "zkProof", None])
def test_message_from_aicp_intent_unsupported_modality(modality):
    intent = {
        "proposal_type": "MODEL_RUN",
        "modality": modality,
        "timestamp": 0
    }
    with pytest.raises(ValueError, match="unsupported modality"):
        message_from_aicp_intent(intent)

@pytest.mark.parametrize("tensor_payload", [None, b"", "", 123])
def test_message_from_aicp_intent_invalid_tensor_payload(tensor_payload):
    intent = {
        "proposal_type": "MODEL_RUN",
        "modality": "latentVector",
        "timestamp": 0,
        "tensor_payload": tensor_payload
    }
    with pytest.raises(ValueError, match="tensor payload must be non-empty bytes"):
        message_from_aicp_intent(intent)

def test_message_from_aicp_intent_missing_timestamp():
    intent = {
        "proposal_type": "MODEL_RUN",
        "modality": "latentVector",
        "tensor_payload": b"data"
    }
    with pytest.raises(KeyError):
        message_from_aicp_intent(intent)

def test_message_from_aicp_intent_invalid_timestamp_type():
    intent = {
        "proposal_type": "MODEL_RUN",
        "modality": "latentVector",
        "tensor_payload": b"data",
        "timestamp": "not-a-number"
    }
    with pytest.raises(ValueError):
        message_from_aicp_intent(intent)

def test_message_from_aicp_intent_defaults():
    intent = {
        "proposal_type": "MODEL_RUN",
        "modality": "latentVector",
        "tensor_payload": b"data",
        "timestamp": 0
    }
    msg = message_from_aicp_intent(intent)
    assert msg.intent_id == b""
    assert msg.sender_pub_key == b""
    assert msg.signature == b""
    assert msg.tensor_shape == ()
    assert msg.tensor_dtype == "float32"
