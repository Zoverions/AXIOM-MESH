package consensus

import (
	"crypto/sha256"
	"fmt"
	"log"
	"math/bits"
)

// Difficulty represents the number of leading zero bits required for a valid PoER.
// 8 bits corresponds to 1 zero byte, which matches the previous "00" hex prefix requirement.
const Difficulty = 8

// CalculateWork returns the number of leading zero bits in the SHA256 hash of taskID + nonce.
func CalculateWork(taskID string, nonce string) int {
	hash := sha256.Sum256([]byte(taskID + nonce))
	leadingZeros := 0
	for _, b := range hash {
		if b == 0 {
			leadingZeros += 8
		} else {
			leadingZeros += bits.LeadingZeros8(b)
			break
		}
	}
	return leadingZeros
}

// VerifyEntropyReduction checks if the given nonce satisfies the Difficulty for the taskID.
func VerifyEntropyReduction(taskID string, resultHash string) bool {
	log.Printf("Verifying PoER for task %s with hash %s", taskID, resultHash)
	return CalculateWork(taskID, resultHash) >= Difficulty
}

// MineEntropyReduction finds a nonce that satisfies the Difficulty for a given taskID.
func MineEntropyReduction(taskID string) string {
	var nonce int64 = 0
	for {
		nonceStr := fmt.Sprintf("%d", nonce)
		if CalculateWork(taskID, nonceStr) >= Difficulty {
			return nonceStr
		}
		nonce++
	}
}
