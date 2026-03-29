package consensus

import (
	"crypto/sha256"
	"fmt"
	"math/bits"
	"sync/atomic"
)

// BaseDifficulty is the minimum number of leading zero bits required for a valid PoER.
// 8 bits corresponds to 1 zero byte — the floor that keeps the entropy fight meaningful
// even on a single-node network.
const BaseDifficulty = 8

// MaxDifficulty caps the adaptive ceiling to prevent runaway compute requirements.
const MaxDifficulty = 24

// networkNodeCount is updated by the Grid swarm manager whenever nodes join/leave.
// Atomic so it can be read/written from multiple goroutines without a lock.
var networkNodeCount int64 = 1

// SetNetworkNodeCount updates the live node count used for adaptive difficulty.
// Called by the swarm manager on JoinSwarm / LeaveSwarm events.
func SetNetworkNodeCount(count int64) {
	if count < 1 {
		count = 1
	}
	atomic.StoreInt64(&networkNodeCount, count)
}

// GetNetworkNodeCount returns the current node count.
func GetNetworkNodeCount() int64 {
	return atomic.LoadInt64(&networkNodeCount)
}

// AdaptiveDifficulty computes the current PoER difficulty based on network size.
//
// Scaling formula:
//   - 1–99 nodes:    BaseDifficulty (8 bits)
//   - 100–999 nodes: BaseDifficulty + 4 (12 bits)
//   - 1k–9,999:      BaseDifficulty + 8 (16 bits)
//   - 10k+:          BaseDifficulty + 16 (24 bits, capped at MaxDifficulty)
//
// This ensures the entropy fight remains a meaningful Sybil barrier as the network
// grows, without requiring a hard fork to adjust parameters.
func AdaptiveDifficulty() int {
	n := atomic.LoadInt64(&networkNodeCount)
	switch {
	case n >= 10_000:
		d := BaseDifficulty + 16
		if d > MaxDifficulty {
			return MaxDifficulty
		}
		return d
	case n >= 1_000:
		return BaseDifficulty + 8
	case n >= 100:
		return BaseDifficulty + 4
	default:
		return BaseDifficulty
	}
}

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

// MineEntropyReduction finds a nonce that satisfies the current AdaptiveDifficulty for a given taskID.
// The difficulty is sampled once at the start of mining so a single task uses a consistent target.
func MineEntropyReduction(taskID string) string {
	difficulty := AdaptiveDifficulty()
	var nonce int64 = 0
	for {
		nonceStr := fmt.Sprintf("%d", nonce)
		if CalculatePoERScore(taskID, nonceStr) >= difficulty {
			return nonceStr
		}
		nonce++
	}
}

// MineEntropyReductionWithDifficulty mines with an explicit difficulty override.
// Useful for testing and for legacy callers that need a fixed target.
func MineEntropyReductionWithDifficulty(taskID string, difficulty int) string {
	var nonce int64 = 0
	for {
		nonceStr := fmt.Sprintf("%d", nonce)
		if CalculatePoERScore(taskID, nonceStr) >= difficulty {
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
	// If attentionWeight is 0, the final score is 0 (no domain relevance).
	return baseScore * attentionWeight * (0.5 + 0.5*priorReliability)
}
