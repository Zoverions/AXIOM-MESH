from hypervisor.src.engine.binary_ipc import ProposalTensorMessage, send_proposal_tensor


def test_send_proposal_tensor_encodes_latent_vector_payload() -> None:
    message = ProposalTensorMessage(
        intent_id=b"\x01\x02",
        sender_pub_key=b"\xAA",
        timestamp=1_711_264_000,
        tensor_payload=b"\xFF\x00",
        signature=b"\xBB",
    )

    encoded = send_proposal_tensor(message)

    assert b"modality=latentVector" in encoded
    assert b"tensor=ff00" in encoded
