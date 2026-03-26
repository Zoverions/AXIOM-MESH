package consensus

import (
	"crypto/sha256"
	"fmt"
	"math/bits"
)

// Difficulty represents the number of leading zero bits required for a valid PoER.
// 8 bits corresponds to 1 zero byte, which matches the previous "00" hex prefix requirement.
const Difficulty = 8

// CalculatePoERScore returns the number of leading zero bits in the SHA256 hash of taskID + nonce.
func CalculatePoERScore(taskID string, nonce string) int {
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

// MineEntropyReduction finds a nonce that satisfies the Difficulty for a given taskID.
func MineEntropyReduction(taskID string) string {
	var nonce int64 = 0
	for {
		nonceStr := fmt.Sprintf("%d", nonce)
		if CalculatePoERScore(taskID, nonceStr) >= Difficulty {
			return nonceStr
		}
		nonce++
	}
}

// CalculateAttentionWeightedScore computes an attention-weighted consensus score.
// It integrates route-specific semantic profile relevance (attentionWeight) and
// prior reliability, ensuring low-relevance high-reputation peers cannot dominate
// unrelated domains.
func CalculateAttentionWeightedScore(baseScore float64, attentionWeight float64, priorReliability float64) float64 {
	// Simple formula: base score is heavily weighted by the attention relevance,
	// and moderately adjusted by prior reliability.
	// If attentionWeight is 0, the final score should be 0 (no relevance).
	return baseScore * attentionWeight * (0.5 + 0.5*priorReliability)
}
