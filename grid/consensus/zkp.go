package consensus

import (
	"crypto/sha256"
	"encoding/hex"
	"log"
	"strings"
)

// VerifyGraphQueryProof simulates a Zero-Knowledge Proof verification.
// In a real implementation, this would verify a cryptographic proof that
// the query was performed correctly over the encrypted/subset graph
// without revealing the full state or personal data.
func VerifyGraphQueryProof(query string, proof string) bool {
	log.Printf("Verifying ZKP for query: %s", query)

	if proof == "" {
		return false
	}

	// Mock ZKP: The proof must be a SHA256 hash of the query that starts with "zkp"
	// or in this simplified mock, just a specific format.
	// For our purposes, we'll say a valid mock proof must start with "000"
	// when hashed with the query to simulate computational verification.

	hashBytes := sha256.Sum256([]byte(query + proof))
	hashStr := hex.EncodeToString(hashBytes[:])

	return strings.HasPrefix(hashStr, "000")
}
