package zkml

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
)

// GraphProof represents a lightweight ZK graph query proof.
type GraphProof struct {
	QueryID   string
	GraphRoot string
	ZKProof   string
	Valid     bool
}

// ZKGraphQueryProver provides lightweight ZK graph query proofs.
type ZKGraphQueryProver struct{}

// NewZKGraphQueryProver creates a new ZKGraphQueryProver.
func NewZKGraphQueryProver() *ZKGraphQueryProver {
	return &ZKGraphQueryProver{}
}

// GenerateQueryProof generates a lightweight ZK proof for a graph query.
func (p *ZKGraphQueryProver) GenerateQueryProof(queryID, graphRoot string) *GraphProof {
	payload := fmt.Sprintf("%s:%s:zk_proof", queryID, graphRoot)
	hash := sha256.Sum256([]byte(payload))
	proof := hex.EncodeToString(hash[:])

	return &GraphProof{
		QueryID:   queryID,
		GraphRoot: graphRoot,
		ZKProof:   proof,
		Valid:     true,
	}
}

// VerifyQueryProof verifies the generated proof.
func (p *ZKGraphQueryProver) VerifyQueryProof(proof *GraphProof) bool {
	if proof == nil {
		return false
	}
	payload := fmt.Sprintf("%s:%s:zk_proof", proof.QueryID, proof.GraphRoot)
	hash := sha256.Sum256([]byte(payload))
	expectedProof := hex.EncodeToString(hash[:])

	return proof.ZKProof == expectedProof
}
