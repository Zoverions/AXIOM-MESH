package p2p

import (
	"errors"
	"fmt"
)

// Modality encodes AICP transport payload class.
type Modality uint8

const (
	ModalityText Modality = iota
	ModalityLatentVector
	ModalityGraphDelta
	ModalityZKProof
)

// IntentPayload is the transport-level normalized frame.
type IntentPayload struct {
	ID        []byte
	SenderKey []byte
	Timestamp uint64
	Modality  Modality
	Payload   []byte
	Signature []byte
}

// ProposalCandidate represents a transformer proposal tensor routed to MODEL_RUN.
type ProposalCandidate struct {
	Tensor []byte
	Source string
}

// RouteIntent routes an AICP payload to a logical path.
func RouteIntent(intent IntentPayload) (string, error) {
	switch intent.Modality {
	case ModalityText:
		return "text", nil
	case ModalityLatentVector:
		return "proposal_tensor", nil
	case ModalityGraphDelta:
		return "graph_delta", nil
	case ModalityZKProof:
		return "zk_proof", nil
	default:
		return "", fmt.Errorf("unsupported modality: %d", intent.Modality)
	}
}

// DecodeProposalTensor constrains latent vectors into proposal candidates.
func DecodeProposalTensor(intent IntentPayload) (ProposalCandidate, error) {
	if intent.Modality != ModalityLatentVector {
		return ProposalCandidate{}, errors.New("intent is not latentVector modality")
	}
	if len(intent.Payload) == 0 {
		return ProposalCandidate{}, errors.New("latent vector payload is empty")
	}
	return ProposalCandidate{Tensor: intent.Payload, Source: "aicp"}, nil
}
