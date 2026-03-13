package blockchain

import (
	"reflect"
	"testing"

	"github.com/axiom-mesh/grid/types"
)

func TestLedger_AddWebState_And_GetWebState(t *testing.T) {
	l := NewLedger()

	state1 := types.WebState{
		URL:           "https://example.com",
		TextLength:    100,
		OutboundLinks: []string{"https://example.com/about"},
		CompiledState: "ACTIVE",
	}

	state2 := types.WebState{
		URL:           "https://test.com",
		TextLength:    200,
		OutboundLinks: []string{},
		CompiledState: "ACTIVE",
	}

	// Add first state
	l.AddWebState(state1)

	gotState1, ok := l.GetWebState("https://example.com")
	if !ok {
		t.Fatalf("Expected to find state for https://example.com")
	}
	if !reflect.DeepEqual(gotState1, state1) {
		t.Errorf("Expected %v, got %v", state1, gotState1)
	}

	// Add second state
	l.AddWebState(state2)

	gotState2, ok := l.GetWebState("https://test.com")
	if !ok {
		t.Fatalf("Expected to find state for https://test.com")
	}
	if !reflect.DeepEqual(gotState2, state2) {
		t.Errorf("Expected %v, got %v", state2, gotState2)
	}

	// Check non-existent URL
	_, ok = l.GetWebState("https://nonexistent.com")
	if ok {
		t.Errorf("Expected not to find state for https://nonexistent.com")
	}
}
