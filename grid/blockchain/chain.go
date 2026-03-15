package blockchain

import (
	"strings"
	"sync"

	"github.com/axiom-mesh/grid/types"
)

type Ledger struct {
	mu           sync.RWMutex
	Skills       []types.SkillVector
	WebCache     map[string]types.WebState
	Graph        types.DistributedGraph
	GraphIndex   map[string][]string // Token -> []NodeIDs
	Bonds        map[string]types.ComputeBond
	CCIPMessages map[string]types.CCIPMessage
	Swarms       map[string]types.Swarm
}

func NewLedger() *Ledger {
	return &Ledger{
		Skills:   make([]types.SkillVector, 0),
		WebCache: make(map[string]types.WebState),
		Graph: types.DistributedGraph{
			Nodes: make(map[string]types.GraphNode),
			Edges: make([]types.GraphEdge, 0),
		},
		GraphIndex:   make(map[string][]string),
		Bonds:        make(map[string]types.ComputeBond),
		CCIPMessages: make(map[string]types.CCIPMessage),
		Swarms:       make(map[string]types.Swarm),
	}
}

func (l *Ledger) AddSkill(skill types.SkillVector) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.Skills = append(l.Skills, skill)
}

func (l *Ledger) Stake(bond types.ComputeBond) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.Bonds[bond.NodeID] = bond
}

func (l *Ledger) GetBond(nodeID string) (types.ComputeBond, bool) {
	l.mu.RLock()
	defer l.mu.RUnlock()
	bond, ok := l.Bonds[nodeID]
	return bond, ok
}

func (l *Ledger) GetSkills() []types.SkillVector {
	l.mu.RLock()
	defer l.mu.RUnlock()
	return l.Skills
}

func (l *Ledger) CreateSwarm(swarm types.Swarm) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.Swarms[swarm.ID] = swarm
}

func (l *Ledger) GetSwarm(swarmID string) (types.Swarm, bool) {
	l.mu.RLock()
	defer l.mu.RUnlock()
	swarm, ok := l.Swarms[swarmID]
	return swarm, ok
}

func (l *Ledger) JoinSwarm(swarmID string, nodeID string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	swarm, ok := l.Swarms[swarmID]
	if !ok {
		return false
	}

	// Check if already in swarm
	for _, n := range swarm.Nodes {
		if n == nodeID {
			return true
		}
	}

	swarm.Nodes = append(swarm.Nodes, nodeID)
	l.Swarms[swarmID] = swarm
	return true
}

func (l *Ledger) GetSwarms() []types.Swarm {
	l.mu.RLock()
	defer l.mu.RUnlock()
	swarms := make([]types.Swarm, 0, len(l.Swarms))
	for _, s := range l.Swarms {
		swarms = append(swarms, s)
	}
	return swarms
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

	// Update index
	tokens := strings.Fields(strings.ToLower(node.Content))
	for _, kw := range node.Keywords {
		tokens = append(tokens, strings.ToLower(kw))
	}

	seenTokens := make(map[string]bool)
	for _, t := range tokens {
		t = strings.Trim(t, ".,;!?\"'")
		if t != "" && !seenTokens[t] {
			l.GraphIndex[t] = append(l.GraphIndex[t], node.ID)
			seenTokens[t] = true
		}
	}
}

func (l *Ledger) SearchGraph(query string) []types.GraphNode {
	l.mu.RLock()
	defer l.mu.RUnlock()

	query = strings.ToLower(strings.TrimSpace(query))
	if query == "" {
		// If empty query, return all nodes
		nodes := make([]types.GraphNode, 0, len(l.Graph.Nodes))
		for _, node := range l.Graph.Nodes {
			nodes = append(nodes, node)
		}
		return nodes
	}

	queryTokens := strings.Fields(query)
	if len(queryTokens) == 0 {
		return nil
	}

	// Simple AND logic for tokens
	// Start with the set of nodes for the first token
	var currentNodes []string
	firstToken := strings.Trim(queryTokens[0], ".,;!?\"'")

	// Check exact token matches first, then partial matches
	matchedNodesMap := make(map[string]bool)

	for token, nodeIDs := range l.GraphIndex {
		if strings.Contains(token, firstToken) {
			for _, id := range nodeIDs {
				matchedNodesMap[id] = true
			}
		}
	}

	for id := range matchedNodesMap {
		currentNodes = append(currentNodes, id)
	}

	for i := 1; i < len(queryTokens); i++ {
		token := strings.Trim(queryTokens[i], ".,;!?\"'")
		if token == "" {
			continue
		}

		nextTokenMatchedNodesMap := make(map[string]bool)
		for indexToken, nodeIDs := range l.GraphIndex {
			if strings.Contains(indexToken, token) {
				for _, id := range nodeIDs {
					nextTokenMatchedNodesMap[id] = true
				}
			}
		}

		var nextCurrentNodes []string
		for _, id := range currentNodes {
			if nextTokenMatchedNodesMap[id] {
				nextCurrentNodes = append(nextCurrentNodes, id)
			}
		}
		currentNodes = nextCurrentNodes
		if len(currentNodes) == 0 {
			break
		}
	}

	results := make([]types.GraphNode, 0, len(currentNodes))
	for _, id := range currentNodes {
		if node, ok := l.Graph.Nodes[id]; ok {
			results = append(results, node)
		}
	}
	return results
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

func (l *Ledger) AddCCIPMessage(msg types.CCIPMessage) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.CCIPMessages[msg.MessageID] = msg
}

func (l *Ledger) GetCCIPMessage(messageID string) (types.CCIPMessage, bool) {
	l.mu.RLock()
	defer l.mu.RUnlock()
	msg, ok := l.CCIPMessages[messageID]
	return msg, ok
}

func (l *Ledger) GetAllCCIPMessages() []types.CCIPMessage {
	l.mu.RLock()
	defer l.mu.RUnlock()
	msgs := make([]types.CCIPMessage, 0, len(l.CCIPMessages))
	for _, msg := range l.CCIPMessages {
		msgs = append(msgs, msg)
	}
	return msgs
}
