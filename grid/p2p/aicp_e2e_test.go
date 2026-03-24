package p2p

import "testing"

func TestRouteIntent_LatentVectorRoutesToProposalTensor(t *testing.T) {
	intent := IntentPayload{Modality: ModalityLatentVector, Payload: []byte{0x01, 0x02}}

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
	if len(candidate.Tensor) != 2 {
		t.Fatalf("unexpected tensor length: %d", len(candidate.Tensor))
	}
}
