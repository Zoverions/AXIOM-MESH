from hypervisor.src.engine.binary_ipc import (
    ProposalTensorMessage,
    ProposalType,
    message_from_aicp_intent,
    send_proposal_tensor,
)


def test_send_proposal_tensor_encodes_model_run_payload() -> None:
    message = ProposalTensorMessage(
        intent_id=b"\x01\x02",
        sender_pub_key=b"\xAA",
        timestamp=1_711_264_000,
        tensor_payload=b"\xFF\x00",
        signature=b"\xBB",
        proposal_type=ProposalType.MODEL_RUN,
        tensor_shape=(1, 2),
        tensor_dtype="float16",
    )

    encoded = send_proposal_tensor(message)

    assert b"modality=latentVector" in encoded
    assert b"proposal_type=MODEL_RUN" in encoded
    assert b"tensor=ff00" in encoded
    assert b"tensor_dtype=float16" in encoded


def test_message_from_aicp_intent_rejects_non_model_run() -> None:
    intent = {
        "intent_id": b"\x01",
        "sender_pub_key": b"\x02",
        "timestamp": 100,
        "modality": "latentVector",
        "proposal_type": "OTHER",
        "tensor_payload": b"\x00",
        "signature": b"\x03",
    }

    try:
        message_from_aicp_intent(intent)
        raise AssertionError("expected ValueError")
    except ValueError as exc:
        assert "unsupported proposal type" in str(exc)


def test_message_from_aicp_intent_maps_tensor_metadata() -> None:
    intent = {
        "intent_id": b"\x01",
        "sender_pub_key": b"\x02",
        "timestamp": 100,
        "modality": "latentVector",
        "proposal_type": "MODEL_RUN",
        "tensor_payload": b"\x10\x11",
        "tensor_shape": [2, 1],
        "tensor_dtype": "float32",
        "signature": b"\x03",
    }

    message = message_from_aicp_intent(intent)

    assert message.proposal_type is ProposalType.MODEL_RUN
    assert message.tensor_shape == (2, 1)
    assert message.tensor_payload == b"\x10\x11"
