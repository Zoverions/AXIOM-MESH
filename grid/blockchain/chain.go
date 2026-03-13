package blockchain

import (
	"sync"

	"github.com/axiom-mesh/grid/types"
)

type Ledger struct {
	mu       sync.RWMutex
	Skills   []types.SkillVector
	WebCache map[string]types.WebState
	Graph    types.DistributedGraph
}

func NewLedger() *Ledger {
	return &Ledger{
		Skills:   make([]types.SkillVector, 0),
		WebCache: make(map[string]types.WebState),
		Graph: types.DistributedGraph{
			Nodes: make(map[string]types.GraphNode),
			Edges: make([]types.GraphEdge, 0),
		},
	}
}

func (l *Ledger) AddSkill(skill types.SkillVector) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.Skills = append(l.Skills, skill)
}

func (l *Ledger) GetSkills() []types.SkillVector {
	l.mu.RLock()
	defer l.mu.RUnlock()
	return l.Skills
}

func (l *Ledger) AddWebState(state types.WebState) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.WebCache[state.URL] = state
}

func (l *Ledger) GetWebState(url string) (types.WebState, bool) {
	l.mu.RLock()
	defer l.mu.RUnlock()
	state, ok := l.WebCache[url]
	return state, ok
}

func (l *Ledger) UpdateGraph(node types.GraphNode, edges []types.GraphEdge) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.Graph.Nodes[node.ID] = node
	l.Graph.Edges = append(l.Graph.Edges, edges...)
}

func (l *Ledger) GetGraph() types.DistributedGraph {
	l.mu.RLock()
	defer l.mu.RUnlock()

	// Create a deep copy of the graph to avoid external mutation
	nodesCopy := make(map[string]types.GraphNode)
	for k, v := range l.Graph.Nodes {
		nodesCopy[k] = v
	}
	edgesCopy := make([]types.GraphEdge, len(l.Graph.Edges))
	copy(edgesCopy, l.Graph.Edges)

	return types.DistributedGraph{
		Nodes: nodesCopy,
		Edges: edgesCopy,
	}
}
