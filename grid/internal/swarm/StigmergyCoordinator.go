package swarm

import (
	"sort"
	"sync"
	"time"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
)

type PheromoneType string

const (
	EXPLORE PheromoneType = "EXPLORE"
	EXPLOIT PheromoneType = "EXPLOIT"
	ALERT   PheromoneType = "ALERT"
	RECRUIT PheromoneType = "RECRUIT"
)

type AgentType string

type Peer struct {
	ID string
}

// Stigmergy: Agents communicate via digital pheromones (skill graph annotations)
type Pheromone struct {
	Type      PheromoneType // EXPLORE, EXPLOIT, ALERT, RECRUIT
	Location  string        // Skill ID or graph node
	Intensity float64       // Decays over time
	TTL       time.Duration
	Payload   []byte        // Contextual data
	Timestamp time.Time
}

// RPCClient interface for mocking or actual RPC communication
type RPCClient interface {
	FetchStateHash(peerID string) (string, error)
}

type StigmergyCoordinator struct {
	pheromones map[string][]Pheromone // Location -> pheromones
	mu         sync.RWMutex
	rpcClient  RPCClient
}

func NewStigmergyCoordinator(client RPCClient) *StigmergyCoordinator {
	return &StigmergyCoordinator{
		pheromones: make(map[string][]Pheromone),
		rpcClient:  client,
	}
}

// Lay pheromone when agent discovers high-value skill or encounters something notable
func (sc *StigmergyCoordinator) LayPheromone(p Pheromone) {
	sc.mu.Lock()
	defer sc.mu.Unlock()

	if p.Timestamp.IsZero() {
		p.Timestamp = time.Now()
	}

	// Update existing pheromone of same type or append new one
	found := false
	for i, existing := range sc.pheromones[p.Location] {
		if existing.Type == p.Type {
			// Reinforce existing pheromone
			sc.pheromones[p.Location][i].Intensity += p.Intensity
			sc.pheromones[p.Location][i].Timestamp = p.Timestamp
			sc.pheromones[p.Location][i].TTL = p.TTL
			sc.pheromones[p.Location][i].Payload = p.Payload
			found = true
			break
		}
	}

	if !found {
		sc.pheromones[p.Location] = append(sc.pheromones[p.Location], p)
		// Async decay per location when first created
		if len(sc.pheromones[p.Location]) == 1 {
			go sc.decayPheromones(p.Location)
		}
	}
}

func (sc *StigmergyCoordinator) decayPheromones(location string) {
	// A rudimentary decay system simulating entropy over time
	ticker := time.NewTicker(1 * time.Second) // Check more frequently to be responsive in tests
	defer ticker.Stop()

	for range ticker.C {
		sc.mu.Lock()
		phList, ok := sc.pheromones[location]
		if !ok {
			sc.mu.Unlock()
			return // Nothing to decay
		}

		var activePheromones []Pheromone
		for _, p := range phList {
			timePassed := time.Since(p.Timestamp)
			if timePassed < p.TTL {
				// decay formula: reduce intensity by roughly 10% per second
				decayFactor := 0.9
				p.Intensity = p.Intensity * decayFactor
				if p.Intensity > 0.1 {
					activePheromones = append(activePheromones, p)
				}
			}
		}

		if len(activePheromones) == 0 {
			delete(sc.pheromones, location)
			sc.mu.Unlock()
			return // stop goroutine when empty
		} else {
			sc.pheromones[location] = activePheromones
		}

		sc.mu.Unlock()
	}
}

// GetPheromones returns all pheromones at a location regardless of agent type
func (sc *StigmergyCoordinator) GetPheromones(location string) []Pheromone {
	sc.mu.RLock()
	defer sc.mu.RUnlock()

	pheromones := sc.pheromones[location]
	// Return a copy to avoid concurrent slice mutation issues
	result := make([]Pheromone, len(pheromones))
	copy(result, pheromones)
	return sortByIntensity(result)
}

func filterByType(pheromones []Pheromone, agentType AgentType) []Pheromone {
	var relevant []Pheromone
	// In a real implementation this would match based on specific agent capabilities
	for _, p := range pheromones {
		if p.Type == EXPLORE && agentType == "researcher" {
			relevant = append(relevant, p)
		} else if p.Type == EXPLOIT && agentType == "worker" {
			relevant = append(relevant, p)
		} else {
			// default to all
			relevant = append(relevant, p)
		}
	}
	return relevant
}

func sortByIntensity(pheromones []Pheromone) []Pheromone {
	sort.Slice(pheromones, func(i, j int) bool {
		return pheromones[i].Intensity > pheromones[j].Intensity
	})
	return pheromones
}

// Agents sense pheromones to coordinate without direct communication
func (sc *StigmergyCoordinator) SensePheromones(
	location string,
	agentType AgentType,
) []Pheromone {
	sc.mu.RLock()
	defer sc.mu.RUnlock()

	pheromones := sc.pheromones[location]
	relevant := filterByType(pheromones, agentType)

	// Return sorted by intensity (highest first)
	return sortByIntensity(relevant)
}

// ComputeStateHash computes a simulated Merkle-like root hash of local pheromones
func (sc *StigmergyCoordinator) ComputeStateHash() string {
	sc.mu.RLock()
	defer sc.mu.RUnlock()

	var locations []string
	for loc := range sc.pheromones {
		locations = append(locations, loc)
	}
	sort.Strings(locations)

	hasher := sha256.New()
	for _, loc := range locations {
		pheromonesCopy := make([]Pheromone, len(sc.pheromones[loc]))
		copy(pheromonesCopy, sc.pheromones[loc])
		sort.Slice(pheromonesCopy, func(i, j int) bool {
			return pheromonesCopy[i].Type < pheromonesCopy[j].Type
		})
		for _, p := range pheromonesCopy {
			data := fmt.Sprintf("%s:%s:%f:%d", loc, p.Type, p.Intensity, p.Timestamp.Unix())
			hasher.Write([]byte(data))
		}
	}
	return hex.EncodeToString(hasher.Sum(nil))
}

// Novel: Anti-entropy protocol for pheromone synchronization
func (sc *StigmergyCoordinator) AntiEntropySync(peer Peer) error {
	// 1. Compute local state hash (simulated Merkle root)
	localHash := sc.ComputeStateHash()

	// 2. Fetch peer's state hash via RPC
	peerHash, err := sc.rpcClient.FetchStateHash(peer.ID)
	if err != nil {
		return fmt.Errorf("failed to fetch state hash for peer %s: %w", peer.ID, err)
	}

	if localHash != peerHash {
		// Log difference detected
		fmt.Printf("[Stigmergy] State divergence detected with peer %s. Local: %s, Peer: %s\n", peer.ID, localHash, peerHash)
		// Only transfer differences (efficient bandwidth use)
		// 3. Simulate state reconciliation here
	} else {
		fmt.Printf("[Stigmergy] State in sync with peer %s\n", peer.ID)
	}

	return nil
}
