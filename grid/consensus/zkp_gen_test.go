package consensus

import (
	"testing"
)

func TestGenerateGraphQueryProof(t *testing.T) {
	query := "SELECT * FROM test_graph"
	secretHex := "0123456789abcdef"

	proofJSON, err := GenerateGraphQueryProof(query, secretHex)
	if err != nil {
		t.Fatalf("GenerateGraphQueryProof failed: %v", err)
	}

	if proofJSON == "" {
		t.Fatalf("Generated proof is empty")
	}

	valid := VerifyGraphQueryProof(query, proofJSON)
	if !valid {
		t.Errorf("Generated proof failed verification")
	}
}
