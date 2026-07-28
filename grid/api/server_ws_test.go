package api

import (
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/axiom-mesh/grid/blockchain"
	"github.com/axiom-mesh/grid/types"
	"github.com/gorilla/websocket"
)

func TestWebSocketEvents(t *testing.T) {
	ledger := blockchain.NewLedger()
	server := NewServer(ledger, nil)

	mux := server.SetupRouter()

	s := httptest.NewServer(mux)
	defer s.Close()

	wsURL := "ws" + strings.TrimPrefix(s.URL, "http") + "/ws/events"
	ws, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("could not open a ws connection on %s %v", wsURL, err)
	}
	defer ws.Close()

	// Trigger an event via the ledger
	evt := types.ProposalChainEvent{
		Type:       "Created",
		ProposalID: "prop-ws-1",
	}

	go func() {
		time.Sleep(50 * time.Millisecond) // let ws connect properly
		ledger.ApplyProposalChainEvent(evt)
	}()

	err = ws.SetReadDeadline(time.Now().Add(1 * time.Second))
	if err != nil {
		t.Fatalf("SetReadDeadline error: %v", err)
	}

	_, p, err := ws.ReadMessage()
	if err != nil {
		t.Fatalf("could not read message from ws: %v", err)
	}

	var received map[string]interface{}
	err = json.Unmarshal(p, &received)
	if err != nil {
		t.Fatalf("could not unmarshal message: %v", err)
	}

	if received["type"] != "proposal_chain_event" {
		t.Errorf("Expected event type 'proposal_chain_event', got %v", received["type"])
	}
}
