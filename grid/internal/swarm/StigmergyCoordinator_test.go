package swarm

import (
	"testing"
	"time"
)

// Default mock RPC client to satisfy tests
type defaultMockRPC struct{}

func (d *defaultMockRPC) FetchStateHash(peerID string) (string, error) {
	return "mock_peer_hash_" + peerID, nil
}

func TestStigmergyCoordinator_LayAndSense(t *testing.T) {
	sc := NewStigmergyCoordinator(&defaultMockRPC{})

	loc := "skill-123"

	// Test LayPheromone
	sc.LayPheromone(Pheromone{
		Type:      EXPLORE,
		Location:  loc,
		Intensity: 5.0,
		TTL:       5 * time.Second,
	})

	sc.LayPheromone(Pheromone{
		Type:      ALERT,
		Location:  loc,
		Intensity: 8.0,
		TTL:       5 * time.Second,
	})

	// Test GetPheromones
	pheromones := sc.GetPheromones(loc)
	if len(pheromones) != 2 {
		t.Fatalf("Expected 2 pheromones, got %d", len(pheromones))
	}

	// Because of intensity sorting, ALERT (8.0) should be first
	if pheromones[0].Type != ALERT {
		t.Errorf("Expected first pheromone to be ALERT, got %s", pheromones[0].Type)
	}

	// Test SensePheromones filtering by type
	researcherPheromones := sc.SensePheromones(loc, "researcher")
	if len(researcherPheromones) != 2 {
		t.Errorf("Expected researcher to sense all pheromones (due to filter default implementation + explicit explore)")
	}
}
