package zkml

import (
	"testing"
)

func TestGenerateAndVerifyQueryProof(t *testing.T) {
	prover := NewZKGraphQueryProver()

	queryID := "query-123"
	graphRoot := "root-hash-456"

	// Generate Proof
	proof := prover.GenerateQueryProof(queryID, graphRoot)

	if proof == nil {
		t.Fatalf("expected proof to be generated, got nil")
	}
	if proof.QueryID != queryID {
		t.Errorf("expected QueryID '%s', got '%s'", queryID, proof.QueryID)
	}
	if proof.GraphRoot != graphRoot {
		t.Errorf("expected GraphRoot '%s', got '%s'", graphRoot, proof.GraphRoot)
	}
	if proof.ZKProof == "" {
		t.Errorf("expected non-empty ZKProof")
	}
	if !proof.Valid {
		t.Errorf("expected proof to be marked as Valid")
	}

	// Verify Proof
	isValid := prover.VerifyQueryProof(proof)
	if !isValid {
		t.Errorf("expected generated proof to be valid")
	}
}

func TestVerifyQueryProof_Invalid(t *testing.T) {
	prover := NewZKGraphQueryProver()

	proof := &GraphProof{
		QueryID:   "query-123",
		GraphRoot: "root-hash-456",
		ZKProof:   "invalid-proof-hash",
		Valid:     true,
	}

	isValid := prover.VerifyQueryProof(proof)
	if isValid {
		t.Errorf("expected tampered proof to be invalid")
	}
}

func TestVerifyQueryProof_Nil(t *testing.T) {
	prover := NewZKGraphQueryProver()

	isValid := prover.VerifyQueryProof(nil)
	if isValid {
		t.Errorf("expected nil proof to be invalid")
	}
}
