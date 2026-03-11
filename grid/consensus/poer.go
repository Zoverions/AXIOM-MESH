package consensus

import (
	"crypto/sha256"
	"encoding/hex"
	"log"
	"strings"
)

func VerifyEntropyReduction(taskID string, resultHash string) bool {
	log.Printf("Verifying PoER for task %s with hash %s", taskID, resultHash)

	// A simple thermodynamic proof mock: hash must start with "00"
	// reflecting actual computational work / entropy reduction.
	hashBytes := sha256.Sum256([]byte(taskID + resultHash))
	hashStr := hex.EncodeToString(hashBytes[:])

	// Check if the generated hash starts with our "work" requirement
	// The thermodynamic proof requires the SHA256 hash of taskID + poerHash to start with '00'
	return strings.HasPrefix(hashStr, "00")
}
