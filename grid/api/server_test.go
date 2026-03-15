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
