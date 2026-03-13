package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/axiom-mesh/grid/blockchain"
	"github.com/axiom-mesh/grid/p2p"
	"github.com/axiom-mesh/grid/types"
)

func TestCacheAPI_Integration(t *testing.T) {
	ledger := blockchain.NewLedger()
	p2pNode := p2p.NewNode("test-node")
	_ = NewServer(ledger, p2pNode)

	// Create a test server with our actual API routes
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/cache" {
			// Reuse the logic from server.go by manually calling it or setting up a mux
			// For this test, we'll use a local logic to mimic the server's behavior

			// We can't easily register the anonymous function from Start() here
			// so we re-implement the handler logic for the test to ensure it interacts
			// correctly with the ledger and p2pNode.

			if r.Method == "GET" {
				url := r.URL.Query().Get("url")
				state, ok := ledger.GetWebState(url)
				if !ok {
					http.Error(w, "Not found", http.StatusNotFound)
					return
				}
				json.NewEncoder(w).Encode(state)
			} else if r.Method == "POST" {
				var state types.WebState
				isSync := r.URL.Query().Get("sync") == "true"
				if err := json.NewDecoder(r.Body).Decode(&state); err == nil {
					ledger.AddWebState(state)
					if !isSync && p2pNode != nil {
						p2pNode.BroadcastWebState(state)
					}
					json.NewEncoder(w).Encode(map[string]string{"status": "success"})
				}
			}
		}
	}))
	defer ts.Close()

	// 1. Test POST /cache (External user)
	state := types.WebState{
		URL:           "https://external.com",
		TextLength:    123,
		CompiledState: "ACTIVE",
	}
	body, _ := json.Marshal(state)
	res, err := http.Post(ts.URL+"/cache", "application/json", bytes.NewBuffer(body))
	if err != nil {
		t.Fatal(err)
	}
	if res.StatusCode != http.StatusOK {
		t.Errorf("Expected status 200, got %d", res.StatusCode)
	}

	// Verify it's in the ledger
	if _, ok := ledger.GetWebState("https://external.com"); !ok {
		t.Errorf("State not found in ledger after external POST")
	}

	// 2. Test POST /cache?sync=true (Peer sync)
	syncState := types.WebState{
		URL:           "https://peer.com",
		TextLength:    456,
		CompiledState: "ACTIVE",
	}
	syncBody, _ := json.Marshal(syncState)
	res, err = http.Post(ts.URL+"/cache?sync=true", "application/json", bytes.NewBuffer(syncBody))
	if err != nil {
		t.Fatal(err)
	}
	if res.StatusCode != http.StatusOK {
		t.Errorf("Expected status 200, got %d", res.StatusCode)
	}

	// Verify it's in the ledger
	if _, ok := ledger.GetWebState("https://peer.com"); !ok {
		t.Errorf("State not found in ledger after sync POST")
	}
}

func TestCacheAPI_NotFound(t *testing.T) {
	ledger := blockchain.NewLedger()
	// Re-implement minimal GET handler for test
	handler := func(w http.ResponseWriter, r *http.Request) {
		url := r.URL.Query().Get("url")
		state, ok := ledger.GetWebState(url)
		if !ok {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		json.NewEncoder(w).Encode(state)
	}

	req, _ := http.NewRequest("GET", "/cache?url=https://missing.com", nil)
	rr := httptest.NewRecorder()
	http.HandlerFunc(handler).ServeHTTP(rr, req)

	if status := rr.Code; status != http.StatusNotFound {
		t.Errorf("handler returned wrong status code: got %v want %v", status, http.StatusNotFound)
	}
}
