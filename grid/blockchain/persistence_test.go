package blockchain

import (
	"path/filepath"
	"testing"

	"github.com/axiom-mesh/grid/types"
)

func TestLedgerSaveLoadRoundTrip(t *testing.T) {
	ledger := NewLedger()
	ledger.AddSkill(types.SkillVector{ID: "skill-1", Task: "demo"})
	ledger.Stake(types.ComputeBond{NodeID: "node-1", Amount: 100, Status: "active"})
	ledger.CreateSwarm(types.Swarm{ID: "swarm-1", TaskID: "task-1", Nodes: []string{"node-1"}, Status: "active"})

	file := filepath.Join(t.TempDir(), "ledger_snapshot.json")
	if err := ledger.SaveToFile(file); err != nil {
		t.Fatalf("save failed: %v", err)
	}

	reloaded := NewLedger()
	if err := reloaded.LoadFromFile(file); err != nil {
		t.Fatalf("load failed: %v", err)
	}

	if len(reloaded.GetSkills()) != 1 {
		t.Fatalf("expected 1 skill, got %d", len(reloaded.GetSkills()))
	}
	if _, ok := reloaded.GetBond("node-1"); !ok {
		t.Fatalf("expected bond to be restored")
	}
	if _, ok := reloaded.GetSwarm("swarm-1"); !ok {
		t.Fatalf("expected swarm to be restored")
	}
}
