package cpor

import (
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
)

// Structures based on schemas/causal_reasoning_attestation.v1.json

type Node struct {
	NodeID              string  `json:"node_id"`
	StepType            string  `json:"step_type"`
	EvidenceHash        string  `json:"evidence_hash"`
	AttentionWeight     float64 `json:"attention_weight"`
	PolicyCheckpointRef string  `json:"policy_checkpoint_ref,omitempty"`
	TimestampMs         int64   `json:"timestamp_ms"`
}

type Edge struct {
	From     string `json:"from"`
	To       string `json:"to"`
	Relation string `json:"relation"`
}

type CausalGraph struct {
	RootHash          string `json:"root_hash"`
	SerializationHash string `json:"serialization_hash"`
	Nodes             []Node `json:"nodes"`
	Edges             []Edge `json:"edges"`
}

type Participant struct {
	NodeID           string  `json:"node_id"`
	AttentionScore   float64 `json:"attention_score"`
	ReliabilityScore float64 `json:"reliability_score"`
}

type ConsensusContext struct {
	TaskProfile  string        `json:"task_profile"`
	Participants []Participant `json:"participants"`
}

type ProofBundle struct {
	ZkmlProof   string `json:"zkml_proof"`
	CausalProof string `json:"causal_proof"`
	Signature   string `json:"signature"`
}

type CausalReasoningAttestation struct {
	AttestationID    string           `json:"attestation_id"`
	IntentID         string           `json:"intent_id"`
	ModelCommitment  string           `json:"model_commitment"`
	InputCommitment  string           `json:"input_commitment"`
	OutputCommitment string           `json:"output_commitment"`
	CausalGraph      CausalGraph      `json:"causal_graph"`
	ConsensusContext ConsensusContext `json:"consensus_context"`
	ProofBundle      ProofBundle      `json:"proof_bundle"`
	Nonce            string           `json:"nonce"`
	TimestampMs      int64            `json:"timestamp_ms"`
}

// Constants for depth and size bounds
const (
	MaxNodesInGraph = 1000
	MaxGraphDepth   = 50
)

// Builder facilitates the construction of a CausalGraph, enforcing depth and size limits
type Builder struct {
	nodes         []Node
	edges         []Edge
	nodeMap       map[string]bool
	nodeDepths    map[string]int
	MaxDepthLimit int
	MaxNodeLimit  int
}

// NewBuilder initializes a new builder with bounded limits
func NewBuilder() *Builder {
	return &Builder{
		nodes:         []Node{},
		edges:         []Edge{},
		nodeMap:       make(map[string]bool),
		nodeDepths:    make(map[string]int),
		MaxDepthLimit: MaxGraphDepth,
		MaxNodeLimit:  MaxNodesInGraph,
	}
}

// AddNode adds a new node to the causal graph if within limits
func (b *Builder) AddNode(node Node) error {
	if len(b.nodes) >= b.MaxNodeLimit {
		return errors.New("graph exceeds maximum node limit")
	}
	if b.nodeMap[node.NodeID] {
		return fmt.Errorf("node %s already exists in the graph", node.NodeID)
	}

	b.nodes = append(b.nodes, node)
	b.nodeMap[node.NodeID] = true

	// Base depth for a node without explicit incoming edges is 1
	b.nodeDepths[node.NodeID] = 1

	return nil
}

// AddEdge adds a directed edge representing causality and updates bounded depth
func (b *Builder) AddEdge(edge Edge) error {
	if !b.nodeMap[edge.From] || !b.nodeMap[edge.To] {
		return errors.New("both from and to nodes must exist before adding an edge")
	}

	// Calculate new depth
	newDepth := b.nodeDepths[edge.From] + 1
	if newDepth > b.MaxDepthLimit {
		return fmt.Errorf("adding edge creates a path exceeding max depth %d", b.MaxDepthLimit)
	}

	// Update depth of target if the new path is longer
	if newDepth > b.nodeDepths[edge.To] {
		err := b.updateDepthsRecursive(edge.To, newDepth)
		if err != nil {
			return err
		}
	}

	b.edges = append(b.edges, edge)
	return nil
}

// updateDepthsRecursive updates the depths of a node and all its descendants
func (b *Builder) updateDepthsRecursive(nodeID string, newDepth int) error {
	if newDepth > b.MaxDepthLimit {
		return fmt.Errorf("updating depth creates a path exceeding max depth %d", b.MaxDepthLimit)
	}

	b.nodeDepths[nodeID] = newDepth

	for _, edge := range b.edges {
		if edge.From == nodeID {
			targetDepth := newDepth + 1
			if targetDepth > b.nodeDepths[edge.To] {
				err := b.updateDepthsRecursive(edge.To, targetDepth)
				if err != nil {
					return err
				}
			}
		}
	}
	return nil
}

// ComputeReplayHash generates the canonical serialization hash and Merkle-like root hash
func (b *Builder) ComputeReplayHash() (string, string, error) {
	// Simple canonical serialization: we rely on stable JSON encoding (Go json.Marshal is not strictly deterministic for maps, but here we serialize slices of structs which preserve order).
	// In production, a strict canonical JSON or a Merkle tree per node/edge would be used.

	// Create the graph structure
	cg := CausalGraph{
		Nodes: b.nodes,
		Edges: b.edges,
	}

	// Serialize graph to byte array
	data, err := json.Marshal(cg)
	if err != nil {
		return "", "", err
	}

	// serialization_hash is just the SHA256 of the JSON bytes
	serializationHash := fmt.Sprintf("%x", sha256.Sum256(data))

	// For root_hash, we hash the serialization hash as a simple stand-in for a full Merkle root
	// until a proper Merkle Tree implementation is needed.
	rootHash := fmt.Sprintf("%x", sha256.Sum256([]byte(serializationHash)))

	return serializationHash, rootHash, nil
}

// Build finalized the graph and returns the CausalGraph payload
func (b *Builder) Build() (*CausalGraph, error) {
	if len(b.nodes) == 0 {
		return nil, errors.New("cannot build empty causal graph")
	}

	serializationHash, rootHash, err := b.ComputeReplayHash()
	if err != nil {
		return nil, err
	}

	cg := &CausalGraph{
		RootHash:          rootHash,
		SerializationHash: serializationHash,
		Nodes:             b.nodes,
		Edges:             b.edges,
	}

	return cg, nil
}
