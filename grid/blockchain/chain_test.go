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

func TestLedger_Slash(t *testing.T) {
	l := NewLedger()
	nodeID := "node-slash"

	// Try to slash non-existent bond
	err := l.Slash(nodeID, 100, "")
	if err == nil || err.Error() != "bond not active or does not exist" {
		t.Errorf("Expected error for non-existent bond, got %v", err)
	}

	// Stake bond
	l.Stake(types.ComputeBond{
		NodeID: nodeID,
		Amount: 500,
		Status: "active",
	})

	// Slash more than bond amount
	err = l.Slash(nodeID, 600, "")
	if err == nil || err.Error() != "slash amount exceeds bond amount" {
		t.Errorf("Expected error for slashing more than bond amount, got %v", err)
	}

	// Successful partial slash
	err = l.Slash(nodeID, 200, "0xabc")
	if err != nil {
		t.Errorf("Unexpected error during partial slash: %v", err)
	}

	bond, _ := l.GetBond(nodeID)
	if bond.Amount != 300 {
		t.Errorf("Expected bond amount 300, got %d", bond.Amount)
	}
	if bond.Status != "active" {
		t.Errorf("Expected bond status active, got %s", bond.Status)
	}
	if bond.TxHash != "0xabc" {
		t.Errorf("Expected txHash 0xabc, got %s", bond.TxHash)
	}

	// Successful full slash
	err = l.Slash(nodeID, 300, "0xdef")
	if err != nil {
		t.Errorf("Unexpected error during full slash: %v", err)
	}

	bond, _ = l.GetBond(nodeID)
	if bond.Amount != 0 {
		t.Errorf("Expected bond amount 0, got %d", bond.Amount)
	}
	if bond.Status != "inactive" {
		t.Errorf("Expected bond status inactive, got %s", bond.Status)
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

func TestLedger_UpdateGraph_And_SearchGraph(t *testing.T) {
	l := NewLedger()
	node1 := types.GraphNode{ID: "n1", Content: "First node content", Keywords: []string{"first", "test"}}
	node2 := types.GraphNode{ID: "n2", Content: "Second node data", Keywords: []string{"second", "data", "test"}}
	edge1 := types.GraphEdge{Source: "n1", Target: "n2", Relationship: "links", Weight: 1}

	// Test UpdateGraph
	l.UpdateGraph(node1, []types.GraphEdge{edge1})
	l.UpdateGraph(node2, nil)

	graph := l.GetGraph()
	if len(graph.Nodes) != 2 {
		t.Fatalf("expected 2 nodes, got %d", len(graph.Nodes))
	}
	if len(graph.Edges) != 1 {
		t.Fatalf("expected 1 edge, got %d", len(graph.Edges))
	}

	// Test SearchGraph with empty query (should return all nodes)
	resEmpty := l.SearchGraph("")
	if len(resEmpty) != 2 {
		t.Fatalf("expected 2 nodes for empty query, got %d", len(resEmpty))
	}

	// Test SearchGraph with exact token match
	resExact := l.SearchGraph("first")
	if len(resExact) != 1 || resExact[0].ID != "n1" {
		t.Fatalf("expected 1 node (n1) for 'first', got %v", resExact)
	}

	// Test SearchGraph with multiple tokens (AND logic)
	resAnd := l.SearchGraph("second data")
	if len(resAnd) != 1 || resAnd[0].ID != "n2" {
		t.Fatalf("expected 1 node (n2) for 'second data', got %v", resAnd)
	}

	// Test SearchGraph with a token matching multiple nodes
	resMulti := l.SearchGraph("test")
	if len(resMulti) != 2 {
		t.Fatalf("expected 2 nodes for 'test', got %d", len(resMulti))
	}

	// Test SearchGraph with non-existent token
	resNone := l.SearchGraph("nonexistent")
	if len(resNone) != 0 {
		t.Fatalf("expected 0 nodes for 'nonexistent', got %d", len(resNone))
	}
}

func TestLedger_SearchGraphRanked(t *testing.T) {
	l := NewLedger()
	l.UpdateGraph(types.GraphNode{ID: "n1", Content: "Distributed graph retrieval", Keywords: []string{"graph", "retrieval"}}, nil)
	l.UpdateGraph(types.GraphNode{ID: "n2", Content: "Channel delivery policy", Keywords: []string{"channel"}}, nil)

	results := l.SearchGraphRanked("graph retrieval")
	if len(results) == 0 {
		t.Fatalf("expected ranked results")
	}
	if results[0].Node.ID != "n1" {
		t.Fatalf("expected n1 as best ranked node, got %s", results[0].Node.ID)
	}
}

func TestLedger_ApplyBondChainEvent_And_Reconcile(t *testing.T) {
	l := NewLedger()
	evtStake := types.BondChainEvent{Type: "stake", NodeID: "node-1", Amount: 200, TxHash: "0x1", BlockNumber: 10, Finalized: false}
	if err := l.ApplyBondChainEvent(evtStake); err != nil {
		t.Fatalf("stake chain event failed: %v", err)
	}

	bond, ok := l.GetBond("node-1")
	if !ok || bond.Amount != 200 || bond.PendingFinalityTx != "0x1" {
		t.Fatalf("unexpected bond after stake event: %+v", bond)
	}

	evtSlash := types.BondChainEvent{Type: "slash", NodeID: "node-1", Amount: 50, TxHash: "0x2", BlockNumber: 12, Finalized: true}
	if err := l.ApplyBondChainEvent(evtSlash); err != nil {
		t.Fatalf("slash chain event failed: %v", err)
	}

	bond, _ = l.GetBond("node-1")
	if bond.Amount != 150 || bond.FinalizedBlock != 12 {
		t.Fatalf("unexpected bond after slash event: %+v", bond)
	}

	// Test bond severance via full slash to inactive
	evtSeverance := types.BondChainEvent{Type: "slash", NodeID: "node-1", Amount: 150, TxHash: "0x3", BlockNumber: 13, Finalized: true}
	if err := l.ApplyBondChainEvent(evtSeverance); err != nil {
		t.Fatalf("bond severance event failed: %v", err)
	}

	bond, _ = l.GetBond("node-1")
	if bond.Amount != 0 || bond.Status != "inactive" {
		t.Fatalf("unexpected bond after severance: %+v", bond)
	}

	l.ReconcileBondFromChain("node-1", types.ComputeBond{Amount: 175, Status: "active", TxHash: "0xcanon"}, 20)
	bond, _ = l.GetBond("node-1")
	if bond.Amount != 175 || bond.FinalizedBlock != 20 || bond.PendingFinalityTx != "" {
		t.Fatalf("unexpected reconciled bond: %+v", bond)
	}
}

func TestApplyProposalChainEvent(t *testing.T) {
	l := NewLedger()

	// 1. Create a proposal
	createEvt := types.ProposalChainEvent{
		Type:        "Created",
		ProposalID:  "prop-1",
		Description: "A test proposal",
		Impact:      types.ImpactVectorAnthropic,
		EndTime:     1000,
	}
	err := l.ApplyProposalChainEvent(createEvt)
	if err != nil {
		t.Fatalf("Failed to create proposal: %v", err)
	}

	prop, exists := l.GetProposal("prop-1")
	if !exists {
		t.Fatalf("Proposal should exist")
	}
	if prop.State != types.ProposalStateActive || prop.Impact != types.ImpactVectorAnthropic {
		t.Fatalf("Proposal state/impact mismatch")
	}

	// 2. Vote on proposal
	voteEvtHuman := types.ProposalChainEvent{
		Type:       "Voted",
		ProposalID: "prop-1",
		Support:    true,
		Weight:     10,
		VoterType:  "Human",
	}
	err = l.ApplyProposalChainEvent(voteEvtHuman)
	if err != nil {
		t.Fatalf("Failed to vote: %v", err)
	}

	voteEvtAgent := types.ProposalChainEvent{
		Type:       "Voted",
		ProposalID: "prop-1",
		Support:    false,
		Weight:     5,
		VoterType:  "Agent",
	}
	err = l.ApplyProposalChainEvent(voteEvtAgent)
	if err != nil {
		t.Fatalf("Failed to vote: %v", err)
	}

	prop, _ = l.GetProposal("prop-1")
	if prop.HumanForVotes != 10 || prop.AgentAgainstVotes != 5 {
		t.Fatalf("Vote counts incorrect: %+v", prop)
	}

	// 3. Deadlock detected
	deadlockEvt := types.ProposalChainEvent{
		Type:       "DeadlockDetected",
		ProposalID: "prop-1",
	}
	err = l.ApplyProposalChainEvent(deadlockEvt)
	if err != nil {
		t.Fatalf("Failed to apply deadlock: %v", err)
	}
	prop, _ = l.GetProposal("prop-1")
	if prop.State != types.ProposalStateAwaitingSynthesis {
		t.Fatalf("Proposal should be awaiting synthesis")
	}

	// 4. Synthesis submitted
	synthEvt := types.ProposalChainEvent{
		Type:            "SynthesisSubmitted",
		ProposalID:      "prop-1",
		SynthesisResult: "Qmcid...",
		EndTime:         2000,
	}
	err = l.ApplyProposalChainEvent(synthEvt)
	if err != nil {
		t.Fatalf("Failed to submit synthesis: %v", err)
	}
	prop, _ = l.GetProposal("prop-1")
	if prop.State != types.ProposalStateActive || prop.SynthesisResult != "Qmcid..." || prop.Round != 1 {
		t.Fatalf("Proposal state after synthesis incorrect: %+v", prop)
	}

	// 5. Resolved
	resolveEvt := types.ProposalChainEvent{
		Type:       "Resolved",
		ProposalID: "prop-1",
	}
	err = l.ApplyProposalChainEvent(resolveEvt)
	if err != nil {
		t.Fatalf("Failed to resolve: %v", err)
	}
	prop, _ = l.GetProposal("prop-1")
	if prop.State != types.ProposalStateResolved {
		t.Fatalf("Proposal should be resolved")
	}
}

func TestLedger_SwarmManagement(t *testing.T) {
	l := NewLedger()

	swarmID := "swarm-1"
	swarm := types.Swarm{
		ID:     swarmID,
		TaskID: "task-1",
		Nodes:  []string{"node-1"},
		Status: "active",
	}

	// 1. Get non-existent swarm
	_, ok := l.GetSwarm(swarmID)
	if ok {
		t.Fatalf("Expected no swarm to exist initially")
	}

	// 2. Create and Get swarm
	l.CreateSwarm(swarm)
	retrievedSwarm, ok := l.GetSwarm(swarmID)
	if !ok {
		t.Fatalf("Expected swarm to exist after creation")
	}
	if retrievedSwarm.ID != swarmID {
		t.Errorf("Expected swarm ID %s, got %s", swarmID, retrievedSwarm.ID)
	}
	if len(retrievedSwarm.Nodes) != 1 {
		t.Errorf("Expected 1 node in swarm, got %d", len(retrievedSwarm.Nodes))
	}

	// 3. Join swarm (new node)
	nodeID := "node-2"
	joined := l.JoinSwarm(swarmID, nodeID)
	if !joined {
		t.Fatalf("Expected joining swarm to be successful")
	}

	retrievedSwarm, _ = l.GetSwarm(swarmID)
	if len(retrievedSwarm.Nodes) != 2 {
		t.Errorf("Expected 2 nodes in swarm, got %d", len(retrievedSwarm.Nodes))
	}
	if retrievedSwarm.Nodes[1] != nodeID {
		t.Errorf("Expected second node to be %s, got %s", nodeID, retrievedSwarm.Nodes[1])
	}

	// 4. Join swarm (existing node, idempotent)
	joinedAgain := l.JoinSwarm(swarmID, nodeID)
	if !joinedAgain {
		t.Fatalf("Expected joining swarm again to return true")
	}
	retrievedSwarm, _ = l.GetSwarm(swarmID)
	if len(retrievedSwarm.Nodes) != 2 {
		t.Errorf("Expected still 2 nodes in swarm after redundant join, got %d", len(retrievedSwarm.Nodes))
	}

	// 5. Join non-existent swarm
	joinedNonExistent := l.JoinSwarm("non-existent-swarm", "node-3")
	if joinedNonExistent {
		t.Fatalf("Expected joining non-existent swarm to fail")
	}

	// 6. Get all swarms
	swarm2 := types.Swarm{
		ID:     "swarm-2",
		TaskID: "task-2",
		Nodes:  []string{"node-4"},
		Status: "active",
	}
	l.CreateSwarm(swarm2)

	swarms := l.GetSwarms()
	if len(swarms) != 2 {
		t.Fatalf("Expected 2 swarms total, got %d", len(swarms))
	}

	found1 := false
	found2 := false
	for _, s := range swarms {
		if s.ID == swarmID {
			found1 = true
		}
		if s.ID == "swarm-2" {
			found2 = true
		}
	}

	if !found1 || !found2 {
		t.Errorf("Expected both swarms to be present in GetSwarms result")
	}
}
