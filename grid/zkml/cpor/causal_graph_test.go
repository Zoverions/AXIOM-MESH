package cpor

import (
	"testing"
)

func TestBuilder_AddNode(t *testing.T) {
	b := NewBuilder()

	// Test adding a node
	err := b.AddNode(Node{NodeID: "node1", StepType: "observation"})
	if err != nil {
		t.Fatalf("Failed to add node: %v", err)
	}

	// Test duplicate node
	err = b.AddNode(Node{NodeID: "node1", StepType: "decision"})
	if err == nil {
		t.Fatal("Expected error when adding duplicate node")
	}

	// Test max node limit
	b.MaxNodeLimit = 2
	err = b.AddNode(Node{NodeID: "node2"})
	if err != nil {
		t.Fatalf("Failed to add second node: %v", err)
	}
	err = b.AddNode(Node{NodeID: "node3"})
	if err == nil {
		t.Fatal("Expected error when exceeding max node limit")
	}
}

func TestBuilder_AddEdge(t *testing.T) {
	b := NewBuilder()
	_ = b.AddNode(Node{NodeID: "node1"})
	_ = b.AddNode(Node{NodeID: "node2"})

	// Test adding valid edge
	err := b.AddEdge(Edge{From: "node1", To: "node2", Relation: "depends_on"})
	if err != nil {
		t.Fatalf("Failed to add edge: %v", err)
	}

	// Test missing nodes
	err = b.AddEdge(Edge{From: "node1", To: "node3", Relation: "depends_on"})
	if err == nil {
		t.Fatal("Expected error when adding edge to non-existent node")
	}

	// Test max depth limit
	b.MaxDepthLimit = 2
	_ = b.AddNode(Node{NodeID: "node3"})
	err = b.AddEdge(Edge{From: "node2", To: "node3", Relation: "depends_on"})
	if err == nil {
		t.Fatal("Expected error when exceeding max depth limit")
	}
}

func TestBuilder_RecursiveDepthUpdate(t *testing.T) {
	b := NewBuilder()
	b.MaxDepthLimit = 3

	_ = b.AddNode(Node{NodeID: "n1"})
	_ = b.AddNode(Node{NodeID: "n2"})
	_ = b.AddNode(Node{NodeID: "n3"})
	_ = b.AddNode(Node{NodeID: "n4"})

	// Add edges in reverse topological order
	_ = b.AddEdge(Edge{From: "n3", To: "n4", Relation: "depends_on"})
	_ = b.AddEdge(Edge{From: "n2", To: "n3", Relation: "depends_on"})

	// Adding this edge connects the whole chain (n1 -> n2 -> n3 -> n4)
	// This should cause n4's depth to exceed the limit (4 > 3)
	err := b.AddEdge(Edge{From: "n1", To: "n2", Relation: "depends_on"})

	if err == nil {
		t.Fatal("Expected error when recursive depth update exceeds limit")
	}
}

func TestBuilder_ComputeReplayHash(t *testing.T) {
	b1 := NewBuilder()
	_ = b1.AddNode(Node{NodeID: "n1", StepType: "obs", EvidenceHash: "h1", TimestampMs: 123})
	_ = b1.AddNode(Node{NodeID: "n2", StepType: "dec", EvidenceHash: "h2", TimestampMs: 124})
	_ = b1.AddEdge(Edge{From: "n1", To: "n2", Relation: "depends_on"})

	serHash1, rootHash1, err := b1.ComputeReplayHash()
	if err != nil {
		t.Fatalf("ComputeReplayHash failed: %v", err)
	}
	if serHash1 == "" || rootHash1 == "" {
		t.Fatal("ComputeReplayHash returned empty hashes")
	}

	// Ensure determinism
	b2 := NewBuilder()
	_ = b2.AddNode(Node{NodeID: "n1", StepType: "obs", EvidenceHash: "h1", TimestampMs: 123})
	_ = b2.AddNode(Node{NodeID: "n2", StepType: "dec", EvidenceHash: "h2", TimestampMs: 124})
	_ = b2.AddEdge(Edge{From: "n1", To: "n2", Relation: "depends_on"})

	serHash2, rootHash2, _ := b2.ComputeReplayHash()
	if serHash1 != serHash2 || rootHash1 != rootHash2 {
		t.Fatal("ComputeReplayHash is not deterministic")
	}

	// Ensure different graph creates different hash
	b3 := NewBuilder()
	_ = b3.AddNode(Node{NodeID: "n1", StepType: "obs", EvidenceHash: "h1", TimestampMs: 123})
	_ = b3.AddNode(Node{NodeID: "n3", StepType: "dec", EvidenceHash: "h3", TimestampMs: 125})

	serHash3, rootHash3, _ := b3.ComputeReplayHash()
	if serHash1 == serHash3 || rootHash1 == rootHash3 {
		t.Fatal("ComputeReplayHash did not change for different graph")
	}
}

func TestBuilder_Build(t *testing.T) {
	b := NewBuilder()

	// Test building empty graph
	_, err := b.Build()
	if err == nil {
		t.Fatal("Expected error when building empty graph")
	}

	_ = b.AddNode(Node{NodeID: "n1"})
	cg, err := b.Build()
	if err != nil {
		t.Fatalf("Build failed: %v", err)
	}

	if cg.RootHash == "" || cg.SerializationHash == "" {
		t.Fatal("Build did not set hashes correctly")
	}
	if len(cg.Nodes) != 1 || len(cg.Edges) != 0 {
		t.Fatal("Build returned incorrect graph structure")
	}
}
