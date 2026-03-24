package p2p

import (
	"encoding/json"
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

const ProposalTypeModelRun = "MODEL_RUN"

// IntentPayload is the transport-level normalized frame.
type IntentPayload struct {
	ID             []byte
	SenderKey      []byte
	Timestamp      uint64
	Modality       Modality
	Payload        []byte
	ProposalTensor *ProposalTensorMetadata
	Signature      []byte
}

// ProposalTensorMetadata mirrors the capnp ProposalTensor schema metadata.
type ProposalTensorMetadata struct {
	ProposalType string
	TensorShape  []uint32
	TensorDType  string
}

// ProposalTensorEnvelope is the latent vector wire format for proposal execution.
type ProposalTensorEnvelope struct {
	ProposalType string   `json:"proposalType"`
	Tensor       []byte   `json:"tensor"`
	TensorShape  []uint32 `json:"tensorShape,omitempty"`
	TensorDType  string   `json:"tensorDtype,omitempty"`
}

// ProposalTensorEnvelope is the latent vector wire format for proposal execution.
type ProposalTensorEnvelope struct {
	ProposalType string   `json:"proposalType"`
	Tensor       []byte   `json:"tensor"`
	TensorShape  []uint32 `json:"tensorShape,omitempty"`
	TensorDType  string   `json:"tensorDtype,omitempty"`
}

// ProposalCandidate represents a transformer proposal tensor routed to MODEL_RUN.
type ProposalCandidate struct {
	ProposalType string
	Tensor       []byte
	TensorShape  []uint32
	TensorDType  string
	Source       string
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

	var envelope ProposalTensorEnvelope
	if err := json.Unmarshal(intent.Payload, &envelope); err != nil {
		return ProposalCandidate{}, fmt.Errorf("invalid proposal tensor envelope: %w", err)
	}
	if envelope.ProposalType != ProposalTypeModelRun {
		return ProposalCandidate{}, fmt.Errorf("unsupported proposal type: %s", envelope.ProposalType)
	}
	if len(envelope.Tensor) == 0 {
		return ProposalCandidate{}, errors.New("proposal tensor payload is empty")
	}

	tensorShape := envelope.TensorShape
	if len(tensorShape) == 0 && intent.ProposalTensor != nil {
		tensorShape = intent.ProposalTensor.TensorShape
	}

	tensorDType := envelope.TensorDType
	if tensorDType == "" && intent.ProposalTensor != nil {
		tensorDType = intent.ProposalTensor.TensorDType
	}

	return ProposalCandidate{
		ProposalType: envelope.ProposalType,
		Tensor:       envelope.Tensor,
		TensorShape:  tensorShape,
		TensorDType:  tensorDType,
		Source:       "aicp",
	}, nil
}

// EncodeModelRunTensor builds the AICP payload envelope for MODEL_RUN proposal tensors.
func EncodeModelRunTensor(tensor []byte, tensorShape []uint32, tensorDType string) ([]byte, error) {
	if len(tensor) == 0 {
		return nil, errors.New("tensor payload is empty")
	}
	envelope := ProposalTensorEnvelope{
		ProposalType: ProposalTypeModelRun,
		Tensor:       tensor,
		TensorShape:  tensorShape,
		TensorDType:  tensorDType,
	}
	payload, err := json.Marshal(envelope)
	if err != nil {
		return nil, fmt.Errorf("marshal proposal envelope: %w", err)
	}
	return payload, nil
}
