package consensus

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log"
	"strings"
)

// VerifyZKMLInference simulates a zkML verification process.
// In a production environment, this would integrate with a library
// like gnark or ezkl to verify cryptographic STARK/SNARK proofs.
// This ensures that the edge node correctly executed a specific ML model
// (identified by modelCommitment) on the given inputs to produce the outputs.
func VerifyZKMLInference(commitment string, input []float64, output []float64, proof string) bool {
	log.Printf("Verifying zkML inference proof for model commitment: %s", commitment)

	if proof == "" || commitment == "" {
		return false
	}

	// We simulate the zero-knowledge verification by ensuring the proof
	// mathematically binds the model commitment, inputs, and outputs.
	// We'll enforce that the hash(commitment + inputs + outputs + proof)
	// has a specific property (e.g., starts with "zkml") to prove computational work.

	var builder strings.Builder
	builder.WriteString(commitment)
	for _, val := range input {
		builder.WriteString(fmt.Sprintf("%f", val))
	}
	for _, val := range output {
		builder.WriteString(fmt.Sprintf("%f", val))
	}
	builder.WriteString(proof)

	hashBytes := sha256.Sum256([]byte(builder.String()))
	hashStr := hex.EncodeToString(hashBytes[:])

	// In a real zkML system, the proof validation wouldn't just be a hash prefix check,
	// but an evaluation of a polynomial commitment scheme over the execution trace.
	return strings.HasPrefix(hashStr, "0000")
}
