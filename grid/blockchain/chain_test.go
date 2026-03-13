package blockchain

import (
	"reflect"
	"testing"

	"github.com/axiom-mesh/grid/types"
)

func TestNewLedger(t *testing.T) {
	l := NewLedger()
	if l == nil {
		t.Fatalf("NewLedger() returned nil")
	}
	if l.Skills == nil {
		t.Fatalf("NewLedger() should initialize Skills slice")
	}
	if len(l.Skills) != 0 {
		t.Fatalf("NewLedger() initialized Skills with non-zero length")
	}
	if l.CCIPMessages == nil {
		t.Fatalf("NewLedger() should initialize CCIPMessages map")
	}
}

func TestLedger_AddSkill_And_GetSkills(t *testing.T) {
	l := NewLedger()

	skill1 := types.SkillVector{
		ID:     "skill-1",
		Vector: []float64{0.1, 0.2, 0.3},
		Task:   "task-1",
	}

	skill2 := types.SkillVector{
		ID:     "skill-2",
		Vector: []float64{0.4, 0.5},
		Task:   "task-2",
	}

	// Add first skill
	l.AddSkill(skill1)

	skills := l.GetSkills()
	if len(skills) != 1 {
		t.Fatalf("Expected 1 skill, got %d", len(skills))
	}
	if !reflect.DeepEqual(skills[0], skill1) {
		t.Errorf("Expected skill1 %v, got %v", skill1, skills[0])
	}

	// Add second skill
	l.AddSkill(skill2)

	skills = l.GetSkills()
	if len(skills) != 2 {
		t.Fatalf("Expected 2 skills, got %d", len(skills))
	}
	if !reflect.DeepEqual(skills[0], skill1) {
		t.Errorf("Expected skill1 at index 0 %v, got %v", skill1, skills[0])
	}
	if !reflect.DeepEqual(skills[1], skill2) {
		t.Errorf("Expected skill2 at index 1 %v, got %v", skill2, skills[1])
	}
}

func TestLedger_Stake_And_GetBond(t *testing.T) {
	l := NewLedger()
	nodeID := "node-1"
	bond := types.ComputeBond{
		NodeID: nodeID,
		Amount: 500,
		Status: "active",
	}

	l.Stake(bond)

	retrievedBond, ok := l.GetBond(nodeID)
	if !ok {
		t.Fatalf("Bond for node %s not found", nodeID)
	}
	if !reflect.DeepEqual(retrievedBond, bond) {
		t.Errorf("Expected bond %v, got %v", bond, retrievedBond)
	}

	_, ok = l.GetBond("non-existent-node")
	if ok {
		t.Error("Expected no bond for non-existent-node")
	}
}

func TestLedger_AddCCIPMessage_And_GetCCIPMessage(t *testing.T) {
	l := NewLedger()
	msgID := "msg-123"
	msg := types.CCIPMessage{
		MessageID:   msgID,
		SourceChain: "ethereum",
		TargetChain: "polygon",
		Sender:      "0x123",
		Receiver:    "0x456",
		Payload:     "hello world",
		Status:      "received",
	}

	l.AddCCIPMessage(msg)

	retrievedMsg, ok := l.GetCCIPMessage(msgID)
	if !ok {
		t.Fatalf("CCIP message %s not found", msgID)
	}
	if !reflect.DeepEqual(retrievedMsg, msg) {
		t.Errorf("Expected CCIP message %v, got %v", msg, retrievedMsg)
	}

	_, ok = l.GetCCIPMessage("non-existent-msg")
	if ok {
		t.Error("Expected no CCIP message for non-existent-msg")
	}
}
