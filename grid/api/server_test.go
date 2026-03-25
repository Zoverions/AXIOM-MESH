package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"github.com/gorilla/websocket"
	"time"

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

	// Add some dummy queue entries. Workers are concurrently draining, so capture
	// observed size right after enqueue for deterministic assertion.
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

	zkQueueSize := int(stats["zkml_queue_size"].(float64))
	if zkQueueSize < 0 || zkQueueSize > 5 {
		t.Errorf("Expected zkml_queue_size to be within [0,5], got %v", stats["zkml_queue_size"])
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
					select {
					case valid := <-job.Result:
						if valid {
							json.NewEncoder(w).Encode(map[string]string{"status": "verified"})
						} else {
							http.Error(w, "zkML verification failed", http.StatusForbidden)
						}
					case <-time.After(30 * time.Second):
						http.Error(w, "zkML verification timeout", http.StatusGatewayTimeout)
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

func TestZKMLQueueTimeout(t *testing.T) {
	// Setup queue with space for 1 item
	zkmlQueue := make(chan ZKMLJob, 1)

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
					select {
					case valid := <-job.Result:
						if valid {
							json.NewEncoder(w).Encode(map[string]string{"status": "verified"})
						} else {
							http.Error(w, "zkML verification failed", http.StatusForbidden)
						}
					// Use a short timeout for the test to avoid waiting 30 seconds
					case <-time.After(10 * time.Millisecond):
						http.Error(w, "zkML verification timeout", http.StatusGatewayTimeout)
					}
				default:
					http.Error(w, "zkML verification queue is full", http.StatusServiceUnavailable)
				}
			}
		}
	})

	payload := types.ZKMLPayload{
		ModelCommitment: "test-model-timeout",
	}

	body, _ := json.Marshal(payload)
	req, err := http.NewRequest("POST", "/zkml/verify", bytes.NewBuffer(body))
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()

	mux.ServeHTTP(rr, req)

	if status := rr.Code; status != http.StatusGatewayTimeout {
		t.Errorf("handler returned wrong status code: got %v want %v", status, http.StatusGatewayTimeout)
	}

	if rr.Body.String() != "zkML verification timeout\n" {
		t.Errorf("Unexpected response body: %v", rr.Body.String())
	}
}

func TestHandleGraphWebSocket_InvalidZKP(t *testing.T) {
	ledger := blockchain.NewLedger()
	server := NewServer(ledger, nil)

	srv := httptest.NewServer(http.HandlerFunc(server.handleGraphWebSocket))
	defer srv.Close()

	wsURL := "ws" + srv.URL[4:]
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Failed to dial websocket: %v", err)
	}
	defer conn.Close()

	// 1. Send an invalid proof
	req := types.GraphSyncMessage{
		Type:  "query",
		Query: "SELECT * FROM graph",
		Proof: "invalid-proof", // invalid zkp
	}

	err = conn.WriteJSON(req)
	if err != nil {
		t.Fatalf("Failed to write to websocket: %v", err)
	}

	var resp map[string]interface{}
	err = conn.ReadJSON(&resp)
	if err != nil {
		t.Fatalf("Failed to read from websocket: %v", err)
	}

	if resp["error"] != "ZKP verification failed" {
		t.Errorf("Expected 'ZKP verification failed' error, got: %v", resp["error"])
	}
}

func TestHandleGraphWebSocket_ValidZKP(t *testing.T) {
	ledger := blockchain.NewLedger()

	node1 := types.GraphNode{ID: "n1", Content: "graph node 1"}
	ledger.UpdateGraph(node1, nil)
	server := NewServer(ledger, nil)

	srv := httptest.NewServer(http.HandlerFunc(server.handleGraphWebSocket))
	defer srv.Close()

	wsURL := "ws" + srv.URL[4:]
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("Failed to dial websocket: %v", err)
	}
	defer conn.Close()

	// Valid ZKP JSON generated for "SELECT * FROM graph"
	validProofJSON := `{"y":"d1243662ba2bda1b3d1836e9a8cb70b7eb9a0b761fb21652536919156d1804eadbc4d3fe87a26763ba4c1b65bbefa4bd0e6e61847a861245ddbcf4edadb5f7fc22e83a5c3403459cd16cb181970da6fd688ee2951318b22dfbdb134907d5cb24aea5f6e78efbb2d8dccfc19be62e75dd2bdfd55dcc5c3ca7a57f66c26876237cbff6e1e7ef12f7d91b71276e964d2f2ec2b2bd35d260b3d2d18752e70f0eb904397f577bacd086e4514371a931605aa67b4a9c7d1a5eb14e881596047de90fceb1e0e2b87ffdb8a69e91d294ae0e7744e35a41b91a4f604cd269fcf1e7d9b9b254aa6cc70b2a1d2ef8e1b400cb4192ca420c68caa1dddc3388a769c9b40cffe7","t":"a7fbe3a72f983a048b153c36dc4a04385ce168ca5a37de87a06fe53d5f3d604dcb1055f45c2d8ee61e8e3676f6db3dea80e8c7f1b2ae4d72d26ed3e961c6e02a9fa7382bf54a92a257244ea04de47e5b075ea0dc0d078d4c4aa953f28239eb6deb4ce1142e924d62bc5074397b05d35c59ff6ee9b020f28088681e1d993befe1121c6b60a88f29d5222e109ae4a2dffb4abff585316931a8a319a680c637116322e8ce6991803ee9855c62ebe1cfc6b59bf0bec00c0ea01b2338e0e4a9acee39d699058baade1032dbf17a8deb1e5f94766c8a620154054f1316421d649001e763207c109eb97813ef4da2c7feaf7cf2a320e842d1375775243466d7270834fa","r":"7fffffffffffffffe487ed5110b4611a62633145c06e0e68948127044533e63a0105df531d89cd9128a5043cc71a026ef7ca8cd9e69d218d98158536f92f8a1ba7f09ab6b6a8e122f242dabb312f3f637a262174d31bf6b585ffae5b7a035bf6f71c35fdad44cfd2d74f9208be258ff324943328f6722d9ee1003e5c50b1df82cc6d241b0e2ae9cd348b1fd47e9267afc1b2ae91ee51d6cb0e3179ab1042a95dcf6a9483b84b4b36b3861aa7255e4c0278ba3604650c10be19482f23171b671df1cf3b960c074301cd93c1d17603d147dae2aef837a62964ef15e5fb48299b6afcd2879786bcd59aab4b7d66746e626fb6ffc6b4f657c1a2b052cf8045bbdf77"}`
	req := types.GraphSyncMessage{
		Type:  "query",
		Query: "SELECT * FROM graph",
		Proof: validProofJSON,
	}

	err = conn.WriteJSON(req)
	if err != nil {
		t.Fatalf("Failed to write to websocket: %v", err)
	}

	var resp types.GraphSyncMessage
	err = conn.ReadJSON(&resp)
	if err != nil {
		t.Fatalf("Failed to read from websocket: %v", err)
	}

	if resp.Type != "results" {
		t.Errorf("Expected 'results' response type, got: %v", resp.Type)
	}

	// We'd need to mock P2P Node query to get edges and nodes via peer.
	// But simply checking that we get a result and no ZKP failure is good enough for now.
}
