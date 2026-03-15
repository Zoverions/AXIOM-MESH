package blockchain

import (
	"fmt"
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
	Proposals    map[string]types.Proposal
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
		Proposals:    make(map[string]types.Proposal),
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

func (l *Ledger) Slash(nodeID string, amount int, txHash string) error {
	l.mu.Lock()
	defer l.mu.Unlock()

	bond, ok := l.Bonds[nodeID]
	if !ok || bond.Status != "active" {
		return fmt.Errorf("bond not active or does not exist")
	}

	if bond.Amount < amount {
		return fmt.Errorf("slash amount exceeds bond amount")
	}

	bond.Amount -= amount
	if bond.Amount == 0 {
		bond.Status = "inactive"
	}

	if txHash != "" {
		bond.TxHash = txHash
	}

	l.Bonds[nodeID] = bond
	return nil
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

type SearchResult struct {
	Node  types.GraphNode
	Score int
}

func normalizeToken(t string) string {
	t = strings.ToLower(strings.TrimSpace(t))
	return strings.Trim(t, ".,;!?\"'")
}

func scoreGraphNode(node types.GraphNode, queryTokens []string) int {
	score := 0
	contentLower := strings.ToLower(node.Content)
	keywordSet := make(map[string]struct{}, len(node.Keywords))
	for _, kw := range node.Keywords {
		keywordSet[normalizeToken(kw)] = struct{}{}
	}

	for _, token := range queryTokens {
		if token == "" {
			continue
		}
		if strings.Contains(contentLower, token) {
			score += 2
		}
		if _, ok := keywordSet[token]; ok {
			score += 3
		}
	}

	if score == 0 {
		score = 1
	}
	return score
}

func (l *Ledger) SearchGraphRanked(query string) []SearchResult {
	l.mu.RLock()
	defer l.mu.RUnlock()

	query = strings.ToLower(strings.TrimSpace(query))
	nodes := make([]types.GraphNode, 0)
	if query == "" {
		for _, node := range l.Graph.Nodes {
			nodes = append(nodes, node)
		}
		results := make([]SearchResult, 0, len(nodes))
		for _, node := range nodes {
			results = append(results, SearchResult{Node: node, Score: 1})
		}
		return results
	}

	queryTokens := strings.Fields(query)
	if len(queryTokens) == 0 {
		return nil
	}
	for i := range queryTokens {
		queryTokens[i] = normalizeToken(queryTokens[i])
	}

	candidate := make(map[string]struct{})
	for _, token := range queryTokens {
		if token == "" {
			continue
		}
		for indexToken, ids := range l.GraphIndex {
			if strings.Contains(indexToken, token) {
				for _, id := range ids {
					candidate[id] = struct{}{}
				}
			}
		}
	}

	if len(candidate) == 0 {
		return nil
	}

	results := make([]SearchResult, 0, len(candidate))
	for id := range candidate {
		if node, ok := l.Graph.Nodes[id]; ok {
			results = append(results, SearchResult{Node: node, Score: scoreGraphNode(node, queryTokens)})
		}
	}

	return results
}

func (l *Ledger) ApplyBondChainEvent(evt types.BondChainEvent) error {
	l.mu.Lock()
	defer l.mu.Unlock()

	if evt.NodeID == "" || evt.Type == "" || evt.Amount < 0 {
		return fmt.Errorf("invalid chain event payload")
	}

	bond := l.Bonds[evt.NodeID]
	bond.NodeID = evt.NodeID
	bond.TxHash = evt.TxHash
	bond.LastUpdatedBlock = evt.BlockNumber
	bond.LastEvent = evt.Type
	if evt.Finalized {
		bond.FinalizedBlock = evt.BlockNumber
		bond.PendingFinalityTx = ""
	} else {
		bond.PendingFinalityTx = evt.TxHash
	}

	switch evt.Type {
	case "stake":
		bond.Amount += evt.Amount
		bond.Status = "active"
	case "slash":
		if bond.Status != "active" {
			return fmt.Errorf("bond not active or does not exist")
		}
		if bond.Amount < evt.Amount {
			return fmt.Errorf("slash amount exceeds bond amount")
		}
		bond.Amount -= evt.Amount
		if bond.Amount == 0 {
			bond.Status = "inactive"
		}
	default:
		return fmt.Errorf("unsupported chain event type: %s", evt.Type)
	}

	l.Bonds[evt.NodeID] = bond
	return nil
}

func (l *Ledger) ReconcileBondFromChain(nodeID string, canonical types.ComputeBond, finalizedBlock uint64) {
	l.mu.Lock()
	defer l.mu.Unlock()

	canonical.NodeID = nodeID
	canonical.FinalizedBlock = finalizedBlock
	canonical.PendingFinalityTx = ""
	canonical.LastEvent = "reconcile"
	l.Bonds[nodeID] = canonical
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

func (l *Ledger) ApplyProposalChainEvent(evt types.ProposalChainEvent) error {
	l.mu.Lock()
	defer l.mu.Unlock()

	if evt.ProposalID == "" {
		return fmt.Errorf("proposalId is required")
	}

	proposal, exists := l.Proposals[evt.ProposalID]

	switch evt.Type {
	case "Created":
		if exists {
			return fmt.Errorf("proposal already exists")
		}
		l.Proposals[evt.ProposalID] = types.Proposal{
			ID:          evt.ProposalID,
			Description: evt.Description,
			Impact:      evt.Impact,
			State:       types.ProposalStateActive,
			EndTime:     evt.EndTime,
			Round:       0,
		}
	case "Voted":
		if !exists {
			return fmt.Errorf("proposal does not exist")
		}
		if evt.VoterType == "Agent" {
			if evt.Support {
				proposal.AgentForVotes += evt.Weight
			} else {
				proposal.AgentAgainstVotes += evt.Weight
			}
		} else {
			if evt.Support {
				proposal.HumanForVotes += evt.Weight
			} else {
				proposal.HumanAgainstVotes += evt.Weight
			}
		}
		l.Proposals[evt.ProposalID] = proposal

	case "DeadlockDetected":
		if !exists {
			return fmt.Errorf("proposal does not exist")
		}
		proposal.State = types.ProposalStateAwaitingSynthesis
		l.Proposals[evt.ProposalID] = proposal

	case "SynthesisSubmitted":
		if !exists {
			return fmt.Errorf("proposal does not exist")
		}
		proposal.SynthesisResult = evt.SynthesisResult
		proposal.State = types.ProposalStateActive
		proposal.HumanForVotes = 0
		proposal.HumanAgainstVotes = 0
		proposal.AgentForVotes = 0
		proposal.AgentAgainstVotes = 0
		proposal.Round += 1
		proposal.EndTime = evt.EndTime
		l.Proposals[evt.ProposalID] = proposal

	case "Resolved":
		if !exists {
			return fmt.Errorf("proposal does not exist")
		}
		proposal.State = types.ProposalStateResolved
		l.Proposals[evt.ProposalID] = proposal

	default:
		return fmt.Errorf("unsupported proposal event type: %s", evt.Type)
	}

	return nil
}

func (l *Ledger) GetProposals() []types.Proposal {
	l.mu.RLock()
	defer l.mu.RUnlock()
	proposals := make([]types.Proposal, 0, len(l.Proposals))
	for _, p := range l.Proposals {
		proposals = append(proposals, p)
	}
	return proposals
}

func (l *Ledger) GetProposal(id string) (types.Proposal, bool) {
	l.mu.RLock()
	defer l.mu.RUnlock()
	proposal, ok := l.Proposals[id]
	return proposal, ok
}
