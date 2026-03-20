package scheduler

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"sort"
	"sync"
	"time"

	"github.com/axiom-mesh/grid/types"
)

type HardwareTier int

const (
	TierUnknown HardwareTier = iota
	TierLow
	TierMedium
	TierHigh
)

type RoutingPolicy struct {
	MaxLatencyMs           int          `json:"max_latency_ms"`
	MaxCost                int          `json:"max_cost"`
	MinTrustScore          float64      `json:"min_trust_score"`
	RequiredHardwareTier   HardwareTier `json:"required_hardware_tier"`
	RequiredServiceClasses []string     `json:"required_service_classes"`
}

type TaskTicket struct {
	ID            string        `json:"id"`
	CapsuleID     string        `json:"capsule_id"`
	NodeID        string        `json:"node_id"`
	Status        string        `json:"status"`
	CreatedAt     int64         `json:"created_at"`
	ExpiresAt     int64         `json:"expires_at"`
	Token         string        `json:"token"`
	// Store constraints to ensure failovers respect them
	Policy        RoutingPolicy `json:"-"`
	ComputeBudget int           `json:"-"`
}

// Clone creates a deep copy of the task ticket to prevent torn reads
func (t *TaskTicket) Clone() *TaskTicket {
	if t == nil {
		return nil
	}
	return &TaskTicket{
		ID:            t.ID,
		CapsuleID:     t.CapsuleID,
		NodeID:        t.NodeID,
		Status:        t.Status,
		CreatedAt:     t.CreatedAt,
		ExpiresAt:     t.ExpiresAt,
		Token:         t.Token,
		Policy:        t.Policy,
		ComputeBudget: t.ComputeBudget,
	}
}

type NodeMetrics struct {
	Score          float64
	LatencyMs      int
	Cost           int
	HardwareTier   HardwareTier
	ServiceClasses map[string]bool
}

type Scheduler struct {
	mu          sync.RWMutex
	tasks       map[string]*TaskTicket
	nodes       map[string]*types.AgentManifest
	nodeMetrics map[string]NodeMetrics
}

func NewScheduler() *Scheduler {
	return &Scheduler{
		tasks:       make(map[string]*TaskTicket),
		nodes:       make(map[string]*types.AgentManifest),
		nodeMetrics: make(map[string]NodeMetrics),
	}
}

func (s *Scheduler) RegisterNode(nodeID string, manifest *types.AgentManifest, score float64, latencyMs int, cost int, tier HardwareTier, services []string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.nodes[nodeID] = manifest

	svcMap := make(map[string]bool)
	for _, svc := range services {
		svcMap[svc] = true
	}

	s.nodeMetrics[nodeID] = NodeMetrics{
		Score:          score,
		LatencyMs:      latencyMs,
		Cost:           cost,
		HardwareTier:   tier,
		ServiceClasses: svcMap,
	}
}

func (s *Scheduler) UnregisterNode(nodeID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.nodes, nodeID)
	delete(s.nodeMetrics, nodeID)
}

func (s *Scheduler) generateTicketID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// findCandidates returns nodes matching the policy constraints.
// Requires lock to be held by the caller (RLock is sufficient).
func (s *Scheduler) findCandidates(policy RoutingPolicy, budget int, excludeNodeID string) []string {
	var candidates []string

	for nodeID, metrics := range s.nodeMetrics {
		if nodeID == excludeNodeID {
			continue
		}
		if metrics.Score < policy.MinTrustScore {
			continue
		}
		if metrics.LatencyMs > policy.MaxLatencyMs {
			continue
		}
		if metrics.Cost > budget {
			continue
		}
		if metrics.HardwareTier < policy.RequiredHardwareTier {
			continue
		}

		missingService := false
		for _, requiredSvc := range policy.RequiredServiceClasses {
			if !metrics.ServiceClasses[requiredSvc] {
				missingService = true
				break
			}
		}
		if missingService {
			continue
		}

		candidates = append(candidates, nodeID)
	}

	// Sort candidates by a combined metric: trust / (latency * cost)
	sort.SliceStable(candidates, func(i, j int) bool {
		mi := s.nodeMetrics[candidates[i]]
		mj := s.nodeMetrics[candidates[j]]

		// avoid division by zero
		costI := mi.Cost
		if costI == 0 {
			costI = 1
		}
		latI := mi.LatencyMs
		if latI == 0 {
			latI = 1
		}

		costJ := mj.Cost
		if costJ == 0 {
			costJ = 1
		}
		latJ := mj.LatencyMs
		if latJ == 0 {
			latJ = 1
		}

		scoreI := mi.Score / float64(latI*costI)
		scoreJ := mj.Score / float64(latJ*costJ)
		return scoreI > scoreJ // Descending order
	})

	return candidates
}

func (s *Scheduler) Schedule(capsuleID string, token string, policy RoutingPolicy, budget int) (string, *TaskTicket, error) {
	s.mu.RLock()
	candidates := s.findCandidates(policy, budget, "")
	s.mu.RUnlock()

	if len(candidates) == 0 {
		return "", nil, errors.New("no suitable nodes found satisfying the policy and budget")
	}

	selectedNode := candidates[0]

	// Create token TTL (e.g., 30 seconds for task assignment validity)
	ttlSecs := int64(30)

	ticket := &TaskTicket{
		ID:            s.generateTicketID(),
		CapsuleID:     capsuleID,
		NodeID:        selectedNode,
		Status:        "Scheduled",
		CreatedAt:     time.Now().Unix(),
		ExpiresAt:     time.Now().Unix() + ttlSecs,
		Token:         token,
		Policy:        policy,
		ComputeBudget: budget,
	}

	s.mu.Lock()
	s.tasks[ticket.ID] = ticket
	s.mu.Unlock()

	return selectedNode, ticket.Clone(), nil
}

func (s *Scheduler) Failover(ticketID string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	ticket, exists := s.tasks[ticketID]
	if !exists {
		return "", errors.New("ticket not found")
	}

	if time.Now().Unix() > ticket.ExpiresAt {
		return "", errors.New("token TTL expired, cannot reassign task")
	}

	if ticket.Status != "Scheduled" && ticket.Status != "Failed" {
		return "", errors.New("task is not in a state that allows failover")
	}

	candidates := s.findCandidates(ticket.Policy, ticket.ComputeBudget, ticket.NodeID)

	if len(candidates) == 0 {
		return "", errors.New("no alternative nodes available for failover satisfying policy")
	}

	newSelectedNode := candidates[0]
	ticket.NodeID = newSelectedNode
	ticket.Status = "Scheduled"

	return newSelectedNode, nil
}

func (s *Scheduler) GetTaskStatus(ticketID string) (*TaskTicket, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	ticket, exists := s.tasks[ticketID]
	if !exists {
		return nil, errors.New("ticket not found")
	}

	return ticket.Clone(), nil
}
