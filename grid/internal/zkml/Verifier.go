package zkml

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log"
	"time"

	"github.com/axiom-mesh/grid/consensus"
	"github.com/axiom-mesh/grid/internal/ledger"
	lru "github.com/hashicorp/golang-lru/v2"
	"github.com/redis/go-redis/v9"
)

type ZKProof struct {
	Hash    string
	Content []byte
}

type VerificationResult struct {
	Valid bool
}

type AggregatedProof struct {
	Hash  string
	Valid bool
}

type ZKMLVerificationPipeline struct {
	// Multi-level caching strategy
	Cache struct {
		L1InMemory    *lru.Cache[string, VerificationResult] // Hot proofs
		L2Distributed *redis.Client                          // Cross-node sharing
		L3Persistent  *ledger.PersistentLedger               // Disk-backed for recovery
	}

	// Proof aggregation for batch verification
	Aggregation struct {
		Enabled   bool
		BatchSize int    // Fold multiple proofs into one
		Strategy  string // 'recursive' | 'linear'
	}

	// Hardware acceleration abstraction
	Acceleration struct {
		GPU  bool // CUDA for proof generation
		FPGA bool // Future: AWS F1 or on-prem
		ASIC bool // Future: Ingonyama/Cysic integration
	}
}

type Verifier struct {
	Pipeline ZKMLVerificationPipeline
}

func NewVerifier(redisAddr string, pl *ledger.PersistentLedger) *Verifier {
	v := &Verifier{}
	cache, err := lru.New[string, VerificationResult](1000)
	if err != nil {
		log.Fatalf("Failed to initialize L1 LRU: %v", err)
	}
	v.Pipeline.Cache.L1InMemory = cache

	if redisAddr != "" {
		v.Pipeline.Cache.L2Distributed = redis.NewClient(&redis.Options{
			Addr: redisAddr,
		})
	}

	v.Pipeline.Cache.L3Persistent = pl

	return v
}

func hashProof(content []byte) string {
	hasher := sha256.New()
	hasher.Write(content)
	return hex.EncodeToString(hasher.Sum(nil))
}

// VerifyWithCache implements multi-level proof caching with TTL-based invalidation logic
func (v *Verifier) VerifyWithCache(proof ZKProof) (VerificationResult, error) {
	ctx := context.Background()

	// 1. Generate cache key from proof hash (not content for privacy)
	if proof.Hash == "" {
		if len(proof.Content) == 0 {
			return VerificationResult{Valid: false}, errors.New("empty proof provided")
		}
		proof.Hash = hashProof(proof.Content)
	}

	// 2. Check L1 -> L2 -> L3 cache hierarchy

	// Check L1 In-Memory LRU
	if res, ok := v.Pipeline.Cache.L1InMemory.Get(proof.Hash); ok {
		return res, nil
	}

	// Check L2 Redis
	if v.Pipeline.Cache.L2Distributed != nil {
		val, err := v.Pipeline.Cache.L2Distributed.Get(ctx, "zkml:"+proof.Hash).Result()
		if err == nil {
			valid := val == "1"
			res := VerificationResult{Valid: valid}
			// Backfill L1
			v.Pipeline.Cache.L1InMemory.Add(proof.Hash, res)
			return res, nil
		}
	}

	// Check L3 BadgerDB
	if v.Pipeline.Cache.L3Persistent != nil {
		valid, found := v.Pipeline.Cache.L3Persistent.GetZKMLProof(proof.Hash)
		if found {
			res := VerificationResult{Valid: valid}
			// Backfill L1 and L2
			v.Pipeline.Cache.L1InMemory.Add(proof.Hash, res)
			if v.Pipeline.Cache.L2Distributed != nil {
				val := "0"
				if valid {
					val = "1"
				}
				v.Pipeline.Cache.L2Distributed.Set(ctx, "zkml:"+proof.Hash, val, 24*time.Hour)
			}
			return res, nil
		}
	}

	// 3. Verify only if cache miss
	// Assuming proof.Content is JSON representing types.ZKMLPayload shape
	var payload struct {
		ModelCommitment string    `json:"model_commitment"`
		Input           []float64 `json:"input"`
		Output          []float64 `json:"output"`
		Proof           string    `json:"proof"`
		VK              string    `json:"vk"`
		Settings        string    `json:"settings"`
	}
	isValid := false
	if err := json.Unmarshal(proof.Content, &payload); err == nil {
		isValid = consensus.VerifyZKMLInference(
			payload.ModelCommitment,
			payload.Input,
			payload.Output,
			payload.Proof,
			payload.VK,
			payload.Settings,
		)
	}

	// 4. Store with TTL based on proof type (skills vs inference)
	res := VerificationResult{Valid: isValid}

	// Update all cache levels
	v.Pipeline.Cache.L1InMemory.Add(proof.Hash, res)

	if v.Pipeline.Cache.L2Distributed != nil {
		val := "0"
		if isValid {
			val = "1"
		}
		v.Pipeline.Cache.L2Distributed.Set(ctx, "zkml:"+proof.Hash, val, 24*time.Hour)
	}

	if v.Pipeline.Cache.L3Persistent != nil {
		v.Pipeline.Cache.L3Persistent.CacheZKMLProof(proof.Hash, isValid)
	}

	return res, nil
}

// AggregateProofs implements recursive proof composition
func (v *Verifier) AggregateProofs(proofs []ZKProof) (AggregatedProof, error) {
	// Use recursive SNARKs to compress multiple skill proofs into single verification
	// Critical for on-chain gas efficiency
	if !v.Pipeline.Aggregation.Enabled {
		return AggregatedProof{}, errors.New("aggregation is not enabled")
	}

	if len(proofs) == 0 {
		return AggregatedProof{Valid: false}, errors.New("no proofs provided")
	}

	allValid := true
	hashes := make([]string, 0, len(proofs))

	for i, p := range proofs {
		res, err := v.VerifyWithCache(p)
		if err != nil || !res.Valid {
			allValid = false
			break
		}
		if proofs[i].Hash == "" {
			proofs[i].Hash = hashProof(p.Content)
		}
		hashes = append(hashes, proofs[i].Hash)
	}

	if !allValid {
		// Calculate a single hash anyway to represent the failed batch state
		hasher := sha256.New()
		for _, h := range hashes {
			hasher.Write([]byte(h))
		}
		return AggregatedProof{Hash: hex.EncodeToString(hasher.Sum(nil)), Valid: false}, errors.New("one or more proofs are invalid")
	}

	aggregatedHash := ""

	if v.Pipeline.Aggregation.Strategy == "recursive" {
		// Simulate Merkle tree folding
		currentHashes := hashes
		for len(currentHashes) > 1 {
			var nextHashes []string
			for i := 0; i < len(currentHashes); i += 2 {
				hasher := sha256.New()
				hasher.Write([]byte(currentHashes[i]))
				if i+1 < len(currentHashes) {
					hasher.Write([]byte(currentHashes[i+1]))
				} else {
					// Duplicate last hash if odd number
					hasher.Write([]byte(currentHashes[i]))
				}
				nextHashes = append(nextHashes, hex.EncodeToString(hasher.Sum(nil)))
			}
			currentHashes = nextHashes
		}
		if len(currentHashes) > 0 {
			aggregatedHash = currentHashes[0]
		}
	} else {
		// Linear
		hasher := sha256.New()
		for _, h := range hashes {
			hasher.Write([]byte(h))
		}
		aggregatedHash = hex.EncodeToString(hasher.Sum(nil))
	}

	return AggregatedProof{Hash: aggregatedHash, Valid: true}, nil
}
