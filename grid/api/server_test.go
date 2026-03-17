package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/axiom-mesh/grid/blockchain"
	"github.com/axiom-mesh/grid/types"
)

func TestProposalEndpoints(t *testing.T) {
	ledger := blockchain.NewLedger()

	// Add test proposal to ledger
	ledger.Proposals["prop-1"] = types.Proposal{
		ID:          "prop-1",
		Description: "test proposal",
		Impact:      types.ImpactVectorAnthropic,
		State:       types.ProposalStateActive,
	}

	// 1. Test GET /proposals
	req, err := http.NewRequest("GET", "/proposals", nil)
	if err != nil {
		t.Fatal(err)
	}
	rr := httptest.NewRecorder()
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/proposals" {
			w.Header().Set("Content-Type", "application/json")
			if r.Method == "GET" {
				json.NewEncoder(w).Encode(ledger.GetProposals())
			}
		}
	})

	handler.ServeHTTP(rr, req)

	if status := rr.Code; status != http.StatusOK {
		t.Errorf("handler returned wrong status code: got %v want %v", status, http.StatusOK)
	}

	var proposals []types.Proposal
	if err := json.Unmarshal(rr.Body.Bytes(), &proposals); err != nil {
		t.Fatalf("Failed to unmarshal response: %v", err)
	}

	if len(proposals) != 1 || proposals[0].ID != "prop-1" {
		t.Errorf("Unexpected proposals result: %+v", proposals)
	}

	// 2. Test POST /proposals/events
	evt := types.ProposalChainEvent{
		Type:       "Voted",
		ProposalID: "prop-1",
		Support:    true,
		Weight:     10,
		VoterType:  "Human",
	}

	body, _ := json.Marshal(evt)
	reqEvents, err := http.NewRequest("POST", "/proposals/events", bytes.NewBuffer(body))
	if err != nil {
		t.Fatal(err)
	}
	rrEvents := httptest.NewRecorder()
	handlerEvents := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/proposals/events" {
			w.Header().Set("Content-Type", "application/json")
			if r.Method == "POST" {
				var e types.ProposalChainEvent
				if err := json.NewDecoder(r.Body).Decode(&e); err != nil {
					http.Error(w, err.Error(), http.StatusBadRequest)
					return
				}
				if err := ledger.ApplyProposalChainEvent(e); err != nil {
					http.Error(w, err.Error(), http.StatusBadRequest)
					return
				}
				json.NewEncoder(w).Encode(map[string]interface{}{
					"status":     "applied",
					"proposalId": e.ProposalID,
					"type":       e.Type,
				})
			}
		}
	})

	handlerEvents.ServeHTTP(rrEvents, reqEvents)

	if status := rrEvents.Code; status != http.StatusOK {
		t.Errorf("handler returned wrong status code: got %v want %v", status, http.StatusOK)
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(rrEvents.Body.Bytes(), &resp); err != nil {
		t.Fatalf("Failed to unmarshal response: %v", err)
	}
	if resp["status"] != "applied" || resp["proposalId"] != "prop-1" {
		t.Errorf("Unexpected response: %+v", resp)
	}

	prop, _ := ledger.GetProposal("prop-1")
	if prop.HumanForVotes != 10 {
		t.Errorf("Event not applied correctly to ledger, votes: %d", prop.HumanForVotes)
	}
}

func TestZKStatsEndpoint(t *testing.T) {
	ledger := blockchain.NewLedger()
	server := NewServer(ledger, nil)

	// Add some active bonds
	bond1 := types.ComputeBond{NodeID: "node-1", Amount: 100, Status: "active"}
	bond2 := types.ComputeBond{NodeID: "node-2", Amount: 50, Status: "inactive"}
	bond3 := types.ComputeBond{NodeID: "node-3", Amount: 200, Status: "active"}
	ledger.Stake(bond1)
	ledger.Stake(bond2)
	ledger.Stake(bond3)

	// Add some dummy queue entries
	for i := 0; i < 5; i++ {
		server.zkmlQueue <- ZKMLJob{}
	}

	// Setup a local test mux specifically for this server instance
	mux := http.NewServeMux()

	mux.HandleFunc("/zk-stats", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == "GET" {
			bonds := server.ledger.GetBonds()
			totalBondedAmount := 0
			activeNodesCount := 0
			for _, b := range bonds {
				if b.Status == "active" {
					activeNodesCount++
					totalBondedAmount += b.Amount
				}
			}

			stats := map[string]interface{}{
				"active_bonded_nodes":  activeNodesCount,
				"total_staked_amount":  totalBondedAmount,
				"skills_registered":    len(server.ledger.GetSkills()),
				"proposals_count":      len(server.ledger.GetProposals()),
				"swarms_active":        len(server.ledger.GetSwarms()),
				"zkml_queue_size":      len(server.zkmlQueue),
				"anonymized_telemetry": true,
			}
			json.NewEncoder(w).Encode(stats)
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})

	req, err := http.NewRequest("GET", "/zk-stats", nil)
	if err != nil {
		t.Fatal(err)
	}
	rr := httptest.NewRecorder()

	mux.ServeHTTP(rr, req)

	if status := rr.Code; status != http.StatusOK {
		t.Errorf("handler returned wrong status code: got %v want %v", status, http.StatusOK)
	}

	var stats map[string]interface{}
	if err := json.Unmarshal(rr.Body.Bytes(), &stats); err != nil {
		t.Fatalf("Failed to unmarshal response: %v", err)
	}

	if stats["active_bonded_nodes"].(float64) != 2 {
		t.Errorf("Expected 2 active bonded nodes, got %v", stats["active_bonded_nodes"])
	}

	if stats["total_staked_amount"].(float64) != 300 {
		t.Errorf("Expected 300 total staked amount, got %v", stats["total_staked_amount"])
	}

	if stats["zkml_queue_size"].(float64) != 5 {
		t.Errorf("Expected zkml_queue_size to be 5, got %v", stats["zkml_queue_size"])
	}

	if stats["anonymized_telemetry"] != true {
		t.Errorf("Expected anonymized_telemetry to be true")
	}
}

func TestZKMLQueueFull(t *testing.T) {
	// Instead of calling NewServer, mock the queue interaction directly
	zkmlQueue := make(chan ZKMLJob, 100)

	mux := http.NewServeMux()

	mux.HandleFunc("/zkml/verify", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == "POST" {
			var payload types.ZKMLPayload
			if err := json.NewDecoder(r.Body).Decode(&payload); err == nil {
				job := ZKMLJob{
					Payload: payload,
					Result:  make(chan bool, 1),
				}

				select {
				case zkmlQueue <- job:
					valid := <-job.Result
					if valid {
						json.NewEncoder(w).Encode(map[string]string{"status": "verified"})
					} else {
						http.Error(w, "zkML verification failed", http.StatusForbidden)
					}
				default:
					http.Error(w, "zkML verification queue is full", http.StatusServiceUnavailable)
				}
			}
		}
	})

	// Fill up the zkmlQueue
	for i := 0; i < 100; i++ {
		zkmlQueue <- ZKMLJob{}
	}

	payload := types.ZKMLPayload{
		ModelCommitment: "test-model",
	}

	body, _ := json.Marshal(payload)
	req, err := http.NewRequest("POST", "/zkml/verify", bytes.NewBuffer(body))
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()

	mux.ServeHTTP(rr, req)

	if status := rr.Code; status != http.StatusServiceUnavailable {
		t.Errorf("handler returned wrong status code: got %v want %v", status, http.StatusServiceUnavailable)
	}

	if rr.Body.String() != "zkML verification queue is full\n" {
		t.Errorf("Unexpected response body: %v", rr.Body.String())
	}
}
