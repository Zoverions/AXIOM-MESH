package p2p

import "testing"

func TestRouteIntent_LatentVectorRoutesToProposalTensor(t *testing.T) {
	payload, err := EncodeModelRunTensor([]byte{0x01, 0x02}, []uint32{1, 2}, "float16", nil, nil, nil)
	if err != nil {
		t.Fatalf("unexpected encode error: %v", err)
	}

	intent := IntentPayload{Modality: ModalityLatentVector, Payload: payload}

	route, err := RouteIntent(intent)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if route != "proposal_tensor" {
		t.Fatalf("expected proposal_tensor route, got %q", route)
	}

	candidate, err := DecodeProposalTensor(intent)
	if err != nil {
		t.Fatalf("unexpected error decoding proposal tensor: %v", err)
	}
	if candidate.ProposalType != ProposalTypeModelRun {
		t.Fatalf("unexpected proposal type: %s", candidate.ProposalType)
	}
	if len(candidate.Tensor) != 2 {
		t.Fatalf("unexpected tensor length: %d", len(candidate.Tensor))
	}
	if candidate.TensorDType != "float16" {
		t.Fatalf("unexpected tensor dtype: %s", candidate.TensorDType)
	}
}

func TestDecodeProposalTensor_RejectsNonModelRun(t *testing.T) {
	intent := IntentPayload{Modality: ModalityLatentVector, Payload: []byte(`{"proposalType":"OTHER","tensor":"AQI="}`)}
	if _, err := DecodeProposalTensor(intent); err == nil {
		t.Fatal("expected unsupported proposal type error")
	}
}

func TestDecodeProposalTensor_UsesCapnpMetadataFallback(t *testing.T) {
	intent := IntentPayload{
		Modality: ModalityLatentVector,
		Payload:  []byte(`{"proposalType":"MODEL_RUN","tensor":"AQI="}`),
		ProposalTensor: &ProposalTensorMetadata{
			ProposalType: ProposalTypeModelRun,
			TensorShape:  []uint32{1, 2},
			TensorDType:  "float16",
		},
	}

	candidate, err := DecodeProposalTensor(intent)
	if err != nil {
		t.Fatalf("unexpected decode error: %v", err)
	}
	if len(candidate.TensorShape) != 2 || candidate.TensorShape[0] != 1 || candidate.TensorShape[1] != 2 {
		t.Fatalf("unexpected tensor shape fallback: %#v", candidate.TensorShape)
	}
	if candidate.TensorDType != "float16" {
		t.Fatalf("unexpected tensor dtype fallback: %s", candidate.TensorDType)
	}
}
