package swarm

import (
	"sort"
	"sync"
	"time"
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

type StigmergyCoordinator struct {
	pheromones map[string][]Pheromone // Location -> pheromones
	mu         sync.RWMutex
}

func NewStigmergyCoordinator() *StigmergyCoordinator {
	return &StigmergyCoordinator{
		pheromones: make(map[string][]Pheromone),
	}
}

// Lay pheromone when agent discovers high-value skill
func (sc *StigmergyCoordinator) LayPheromone(p Pheromone) {
	sc.mu.Lock()
	defer sc.mu.Unlock()

	p.Timestamp = time.Now()
	sc.pheromones[p.Location] = append(sc.pheromones[p.Location], p)

	// Async decay
	go sc.decayPheromones(p.Location)
}

func (sc *StigmergyCoordinator) decayPheromones(location string) {
	// A rudimentary decay system simulating entropy over time
	ticker := time.NewTicker(10 * time.Second)
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
			if time.Since(p.Timestamp) < p.TTL {
				p.Intensity = p.Intensity * 0.9 // exponential decay
				if p.Intensity > 0.1 {
					activePheromones = append(activePheromones, p)
				}
			}
		}

		if len(activePheromones) == 0 {
			delete(sc.pheromones, location)
		} else {
			sc.pheromones[location] = activePheromones
		}

		sc.mu.Unlock()

		if len(activePheromones) == 0 {
			break
		}
	}
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

// Novel: Anti-entropy protocol for pheromone synchronization
func (sc *StigmergyCoordinator) AntiEntropySync(peer Peer) error {
	// Exchange Merkle trees of pheromone state
	// Only transfer differences (efficient bandwidth use)
	// This simulates a successful sync
	return nil
}
