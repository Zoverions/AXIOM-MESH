package api

import (
	"strings"
	"testing"

	"github.com/axiom-mesh/grid/types"
)

func TestValidateZKMLPayload(t *testing.T) {
	validPayload := types.ZKMLPayload{
		ModelCommitment: strings.Repeat("a", 64),
		Input:           []float64{1.0},
		Output:          []float64{2.0},
		Proof:           "{}",
		VK:              "dmFsaWQ=",
		Settings:        "{}",
	}

	if ok, msg := validateZKMLPayload(validPayload); !ok {
		t.Fatalf("expected valid payload, got error: %s", msg)
	}

	invalidCommitment := validPayload
	invalidCommitment.ModelCommitment = "../../etc/passwd"
	if ok, _ := validateZKMLPayload(invalidCommitment); ok {
		t.Fatalf("expected invalid commitment to fail")
	}

	oversizedProof := validPayload
	oversizedProof.Proof = strings.Repeat("x", 2_000_001)
	if ok, _ := validateZKMLPayload(oversizedProof); ok {
		t.Fatalf("expected oversized proof to fail")
	}
}
