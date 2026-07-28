package scheduler

import (
	"fmt"
	"math/rand"
	"testing"
	"time"

	"github.com/axiom-mesh/grid/types"
)

// Sched.5: Test logic includes the 200 node / 1000 task simulation covering compatibility and failover logic.
func TestSchedulerAdvancedSimulation(t *testing.T) {
	s := NewScheduler()

	// Simulate 200 nodes registering with the network
	for simIndex := 0; simIndex < 200; simIndex++ {
		simNodeID := fmt.Sprintf("node-sim-%d", simIndex)

		simScore := 50.0 + rand.Float64()*50.0 // Score between 50 and 100
		simLatency := 10 + rand.Intn(90)       // Latency between 10 to 100 ms
		simCost := 1 + rand.Intn(9)            // Cost between 1 to 10 units

		simTier := TierLow
		if simScore > 75.0 {
			simTier = TierMedium
		}
		if simScore > 90.0 {
			simTier = TierHigh
		}

		simServices := []string{"compute"}
		if simIndex%2 == 0 {
			simServices = append(simServices, "storage")
		}
		if simIndex%5 == 0 {
			simServices = append(simServices, "gpu")
		}

		simManifest := &types.AgentManifest{
			NodeID:         simNodeID,
			HardwareTier:   int(simTier),
			ServiceClasses: simServices,
		}

		s.RegisterNode(simNodeID, simManifest, simScore, simLatency, simCost, TierUnknown, []string{})
	}

	simPolicy := RoutingPolicy{
		MaxLatencyMs:           80,
		MaxCost:                8,
		MinTrustScore:          60.0,
		RequiredHardwareTier:   TierMedium,
		RequiredServiceClasses: []string{"compute", "storage"},
	}

	budget := 8
	simScheduledCount := 0
	simTotalLatencyMs := 0

	// Simulate 1000 tasks attempting to be scheduled
	for taskIndex := 0; taskIndex < 1000; taskIndex++ {
		simCapsuleID := fmt.Sprintf("capsule-sim-%d", taskIndex)
		simToken := fmt.Sprintf("token-sim-%d", taskIndex)

		nodeID, ticket, err := s.Schedule(simCapsuleID, simToken, simPolicy, budget)
		if err == nil {
			simScheduledCount++

			metrics := s.nodeMetrics[nodeID]

			// Strict verification checks
			if metrics.LatencyMs > simPolicy.MaxLatencyMs {
				t.Errorf("Simulation: Latency constraint violated: %d > %d", metrics.LatencyMs, simPolicy.MaxLatencyMs)
			}
			if metrics.Score < simPolicy.MinTrustScore {
				t.Errorf("Simulation: Trust constraint violated: %f < %f", metrics.Score, simPolicy.MinTrustScore)
			}
			if metrics.Cost > budget {
				t.Errorf("Simulation: Cost constraint violated: %d > %d", metrics.Cost, budget)
			}
			if metrics.HardwareTier < simPolicy.RequiredHardwareTier {
				t.Errorf("Simulation: HardwareTier constraint violated")
			}
			if !metrics.ServiceClasses["storage"] {
				t.Errorf("Simulation: Missing required service class 'storage'")
			}

			if ticket.ID == "" {
				t.Errorf("Simulation: Invalid ticket ID")
			}
			if ticket.ExpiresAt <= time.Now().Unix() {
				t.Errorf("Simulation: Token TTL is invalid")
			}

			simTotalLatencyMs += metrics.LatencyMs
		}
	}

	fmt.Printf("Simulation: Scheduled %d/1000 tasks successfully\n", simScheduledCount)
	if simScheduledCount == 0 {
		t.Errorf("Simulation: Failed to schedule any tasks")
	} else {
		fmt.Printf("Simulation: Average Latency: %d ms\n", simTotalLatencyMs/simScheduledCount)
	}

	// Test Failover Logic Coverage
	if simScheduledCount > 0 {
		initialNodeID, failoverTicket, err := s.Schedule("failover-sim-capsule", "token-sim", simPolicy, budget)
		if err != nil {
			t.Fatalf("Simulation: Failed to schedule task for failover test: %v", err)
		}

		// Verify Failover fallback candidates via Reassign
		failoverManifest2 := &types.AgentManifest{
			NodeID:         "failover-node-sim-2",
			HardwareTier:   int(TierMedium),
			ServiceClasses: []string{"compute", "storage"},
		}
		s.RegisterNode("failover-node-sim-2", failoverManifest2, 99.0, 10, 1, TierMedium, []string{"compute", "storage"})

		newNodeID, err := s.Reassign(failoverTicket.ID)
		if err != nil {
			t.Errorf("Simulation: Reassign failed: %v", err)
		}
		if newNodeID == initialNodeID {
			t.Errorf("Simulation: Reassign reassigned to the same node")
		}

		s.mu.Lock()
		s.tasks[failoverTicket.ID].ExpiresAt = time.Now().Unix() - 1
		s.mu.Unlock()

		_, err = s.Reassign(failoverTicket.ID)
		if err == nil {
			t.Errorf("Simulation: Reassign succeeded but token TTL should have expired")
		}
	}
}
