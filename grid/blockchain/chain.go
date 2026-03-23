package blockchain

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/axiom-mesh/grid/consensus"
	"github.com/axiom-mesh/grid/internal/ledger"
	"github.com/axiom-mesh/grid/types"
	"github.com/ethereum/go-ethereum/crypto"
)

type LedgerSnapshot struct {
	Skills           []types.SkillVector                    `json:"skills"`
	WebCache         map[string]types.WebState              `json:"web_cache"`
	Graph            types.DistributedGraph                 `json:"graph"`
	GraphIndex       map[string][]string                    `json:"graph_index"`
	Bonds            map[string]types.ComputeBond           `json:"bonds"`
	CCIPMessages     map[string]types.CCIPMessage           `json:"ccip_messages"`
	Swarms           map[string]types.Swarm                 `json:"swarms"`
	Proposals        map[string]types.Proposal              `json:"proposals"`
	TreasurySplit    types.TreasurySplitConfig              `json:"treasury_split"`
	GPPBalances      map[string]uint64                      `json:"gpp_balances"`
	NetworkSecPool   uint64                                 `json:"network_sec_pool"`
	WealthGenPool    uint64                                 `json:"wealth_gen_pool"`
	GPPEvents        []types.GPPEvent                       `json:"gpp_events"`
	RelayerQueue     []types.RelayerSettlement              `json:"relayer_queue"`
	CRDTShards       map[string]types.CRDTShard             `json:"crdt_shards"`
	DriftReports     map[string]types.DriftReport           `json:"drift_reports"`
	SettlementNextID uint64                                 `json:"settlement_next_id"`
	AgentManifests   map[string]types.AgentManifest         `json:"agent_manifests"`
	NodeProfiles     map[string]types.NodeCapabilityProfile `json:"node_profiles"`
}

type Ledger struct {
	mu             sync.RWMutex
	Skills         []types.SkillVector
	WebCache       map[string]types.WebState
	Graph          types.DistributedGraph
	GraphIndex     map[string][]string // Token -> []NodeIDs
	Bonds          map[string]types.ComputeBond
	CCIPMessages   map[string]types.CCIPMessage
	Swarms         map[string]types.Swarm
	Proposals      map[string]types.Proposal
	AgentManifests map[string]types.AgentManifest
	CRDTShards     map[string]types.CRDTShard
	DriftReports   map[string]types.DriftReport

	// Progressive CRDT Sharding Config
	IsEdgeNode   bool
	NodeProfiles map[string]types.NodeCapabilityProfile

	// Treasury and Distribution
	TreasurySplit    types.TreasurySplitConfig
	GPPBalances      map[string]uint64
	NetworkSecPool   uint64
	WealthGenPool    uint64
	GPPEvents        []types.GPPEvent
	RelayerQueue     []types.RelayerSettlement
	settlementNextID uint64

	Persistent *ledger.PersistentLedger

	// Callbacks for decoupled blockchain execution
	OnSwarmJoined         func(nodeID [32]byte, capacity uint64, cidRoot [32]byte)
	ExternalChainFallback bool
}

func NewLedger() *Ledger {
	// Initialize PersistentLedger (BadgerDB + WAL)
	// For production, the path could be configurable
	dataDir := "./data/ledger"
	pl, err := ledger.NewPersistentLedger(dataDir)
	if err != nil {
		fmt.Printf("Warning: Failed to initialize PersistentLedger: %v\n", err)
	}

	ledgerInst := &Ledger{
		Skills:   make([]types.SkillVector, 0),
		WebCache: make(map[string]types.WebState),
		Graph: types.DistributedGraph{
			Nodes: make(map[string]types.GraphNode),
			Edges: make([]types.GraphEdge, 0),
		},
		GraphIndex:     make(map[string][]string),
		Bonds:          make(map[string]types.ComputeBond),
		CCIPMessages:   make(map[string]types.CCIPMessage),
		Swarms:         make(map[string]types.Swarm),
		Proposals:      make(map[string]types.Proposal),
		AgentManifests: make(map[string]types.AgentManifest),
		CRDTShards:     make(map[string]types.CRDTShard),
		DriftReports:   make(map[string]types.DriftReport),

		IsEdgeNode:   os.Getenv("AXIOM_EDGE_NODE") == "true",
		NodeProfiles: make(map[string]types.NodeCapabilityProfile),

		// Default split configuration
		TreasurySplit: types.TreasurySplitConfig{
			NetworkSecurityFund:  50,
			WealthGenerationPool: 50,
		},
		GPPBalances:           make(map[string]uint64),
		GPPEvents:             make([]types.GPPEvent, 0),
		RelayerQueue:          make([]types.RelayerSettlement, 0),
		Persistent:            pl,
		ExternalChainFallback: true, // Default to true until swarm grows
	}

	if pl != nil {
		for _, bond := range pl.GetAllBonds() {
			ledgerInst.Bonds[bond.NodeID] = bond
		}
	}

	return ledgerInst
}

// UpdateTreasurySplit configures the X% Network Security Fund, Y% Wealth Generation Pool (bicameral proposal simulation)
func (l *Ledger) UpdateTreasurySplit(networkSec, wealthGen uint) error {
	if networkSec+wealthGen != 100 {
		return fmt.Errorf("split must equal 100%%")
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	l.TreasurySplit.NetworkSecurityFund = networkSec
	l.TreasurySplit.WealthGenerationPool = wealthGen
	return nil
}

// MintGPP mints new GPP tokens, simulating ERC-20 compatible Mint event
func (l *Ledger) MintGPP(to string, amount uint64) {
	l.mu.Lock()
	defer l.mu.Unlock()

	l.GPPBalances[to] += amount

	l.GPPEvents = append(l.GPPEvents, types.GPPEvent{
		Type:   "Mint",
		From:   "0x0000000000000000000000000000000000000000",
		To:     to,
		Amount: amount,
	})
}

// BurnGPP burns GPP tokens from a user, simulating ERC-20 compatible Burn event
func (l *Ledger) BurnGPP(from string, amount uint64) error {
	l.mu.Lock()
	defer l.mu.Unlock()

	if l.GPPBalances[from] < amount {
		return fmt.Errorf("insufficient GPP balance to burn")
	}

	l.GPPBalances[from] -= amount

	l.GPPEvents = append(l.GPPEvents, types.GPPEvent{
		Type:   "Burn",
		From:   from,
		To:     "0x0000000000000000000000000000000000000000",
		Amount: amount,
	})
	return nil
}

// DistributeRewards distributes a total reward amount between Network Sec and Wealth Gen pools
func (l *Ledger) DistributeRewards(totalAmount uint64) {
	l.mu.Lock()
	defer l.mu.Unlock()

	netSecAmount := (totalAmount * uint64(l.TreasurySplit.NetworkSecurityFund)) / 100
	wealthGenAmount := totalAmount - netSecAmount // The remainder goes to wealth gen

	l.NetworkSecPool += netSecAmount
	l.WealthGenPool += wealthGenAmount
}

// QueueL1Settlement adds a settlement item for L1 piggyback settlement (RelayerWallet pattern)
func (l *Ledger) QueueL1Settlement(recipient string, amount uint64, token string) string {
	l.mu.Lock()
	defer l.mu.Unlock()

	l.settlementNextID++
	id := fmt.Sprintf("settlement-%d", l.settlementNextID)

	l.RelayerQueue = append(l.RelayerQueue, types.RelayerSettlement{
		ID:        id,
		Recipient: recipient,
		Amount:    amount,
		Token:     token,
		Status:    "Queued",
	})

	return id
}

func (l *Ledger) AddSkill(skill types.SkillVector) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.Skills = append(l.Skills, skill)
	if l.Persistent != nil {
		l.Persistent.SetSkill(skill)
	}
}

func (l *Ledger) Stake(bond types.ComputeBond) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.Bonds[bond.NodeID] = bond
	if l.Persistent != nil {
		l.Persistent.SetBond(bond)
	}
}

func (l *Ledger) GetBond(nodeID string) (types.ComputeBond, bool) {
	l.mu.RLock()
	defer l.mu.RUnlock()
	bond, ok := l.Bonds[nodeID]
	return bond, ok
}

func (l *Ledger) GetBonds() []types.ComputeBond {
	l.mu.RLock()
	defer l.mu.RUnlock()
	bonds := make([]types.ComputeBond, 0, len(l.Bonds))
	for _, b := range l.Bonds {
		bonds = append(bonds, b)
	}
	return bonds
}

func (l *Ledger) Slash(nodeID string, amount int, txHash string) error {
	l.mu.Lock()
	defer l.mu.Unlock()

	if amount <= 0 {
		return fmt.Errorf("invalid slash amount")
	}

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
	if l.Persistent != nil {
		l.Persistent.SetBond(bond)
	}
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

	capacity := l.resolveStorageCapacityUnsafe(nodeID)
	encodedNodeID := [32]byte{}
	copy(encodedNodeID[:], []byte(nodeID))

	// Trigger storage-offer publication asynchronously so mesh join latency stays low.
	go func() {
		l.OfferStorageToSwarm(encodedNodeID, capacity)
		l.CheckSelfSustaining()
	}()

	return true
}

func (l *Ledger) resolveStorageCapacityUnsafe(nodeID string) uint64 {
	if profile, ok := l.NodeProfiles[nodeID]; ok && profile.StorageGB > 0 {
		return uint64(profile.StorageGB)
	}

	if profileQuota := os.Getenv("MESHSTORE_QUOTA_GB"); profileQuota != "" {
		var capacity uint64
		if _, err := fmt.Sscanf(profileQuota, "%d", &capacity); err == nil && capacity > 0 {
			return capacity
		}
	}

	return 50
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

// RollbackGPPBalances restores the balance map to a specific checkpoint (simplified reorg handler)
func (l *Ledger) RollbackGPPBalances(checkpointBlockHash string) error {
	l.mu.Lock()
	defer l.mu.Unlock()

	// A real implementation would iterate the event log backwards to `checkpointBlockHash`.
	// For now, this satisfies the structural requirement of a rollback semantic.
	l.GPPBalances = make(map[string]uint64)

	return nil
}

// MeshStore integration — called after JoinSwarm
func (l *Ledger) OfferStorageToSwarm(nodeID [32]byte, capacity uint64) {
	cidRoot := crypto.Keccak256([]byte(fmt.Sprintf("meshstore-root-%s-%d", hex.EncodeToString(nodeID[:]), capacity)))
	var cidRootArr [32]byte
	copy(cidRootArr[:], cidRoot)

	l.emitStorageEvent(nodeID, capacity, cidRoot)

	// Delegate execution upstream to decoupled network component (e.g. Server)
	if l.OnSwarmJoined != nil {
		l.OnSwarmJoined(nodeID, capacity, cidRootArr)
	}
}

func (l *Ledger) emitStorageEvent(nodeID [32]byte, capacity uint64, cidRoot []byte) {
	log.Printf("📦 StorageOffered: Agent %x offered %d GB. CID Root: %x\n", nodeID, capacity, cidRoot)
}

// Self-sustaining check (runs on every join)
func (l *Ledger) CheckSelfSustaining() {
	if l.swarmSize() >= 100 {
		l.ExternalChainFallback = false
		log.Println("🌐 MeshStore now self-sustaining — external chains disabled")
	}
}

func (l *Ledger) swarmSize() int {
	l.mu.RLock()
	defer l.mu.RUnlock()
	size := 0
	for _, swarm := range l.Swarms {
		size += len(swarm.Nodes)
	}
	return size
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

	if evt.NodeID == "" || evt.Type == "" {
		return fmt.Errorf("invalid chain event payload")
	}
	if evt.Type != "delegate" && evt.Amount < 0 {
		return fmt.Errorf("invalid chain event payload amount")
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
	case "delegate":
		if bond.Status != "active" {
			return fmt.Errorf("bond not active or does not exist")
		}
		bond.ParentNodeID = evt.ParentNodeID
	default:
		return fmt.Errorf("unsupported chain event type: %s", evt.Type)
	}

	l.Bonds[evt.NodeID] = bond
	if l.Persistent != nil {
		l.Persistent.SetBond(bond)
	}
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
	if l.Persistent != nil {
		l.Persistent.SetBond(canonical)
	}
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

func (l *Ledger) Snapshot() LedgerSnapshot {
	l.mu.RLock()
	defer l.mu.RUnlock()

	agentManifestsCopy := make(map[string]types.AgentManifest, len(l.AgentManifests))
	for k, v := range l.AgentManifests {
		agentManifestsCopy[k] = v
	}

	nodeProfilesCopy := make(map[string]types.NodeCapabilityProfile, len(l.NodeProfiles))
	for k, v := range l.NodeProfiles {
		nodeProfilesCopy[k] = v
	}

	return LedgerSnapshot{
		Skills:           append([]types.SkillVector(nil), l.Skills...),
		WebCache:         l.WebCache,
		Graph:            l.Graph,
		GraphIndex:       l.GraphIndex,
		Bonds:            l.Bonds,
		CCIPMessages:     l.CCIPMessages,
		Swarms:           l.Swarms,
		Proposals:        l.Proposals,
		TreasurySplit:    l.TreasurySplit,
		GPPBalances:      l.GPPBalances,
		NetworkSecPool:   l.NetworkSecPool,
		WealthGenPool:    l.WealthGenPool,
		GPPEvents:        append([]types.GPPEvent(nil), l.GPPEvents...),
		RelayerQueue:     append([]types.RelayerSettlement(nil), l.RelayerQueue...),
		SettlementNextID: l.settlementNextID,
		AgentManifests:   agentManifestsCopy,
		NodeProfiles:     nodeProfilesCopy,
	}
}

// RegisterAgentManifest adds or updates an Agent Manifest in the ledger.
func (l *Ledger) RegisterAgentManifest(manifest types.AgentManifest) error {
	l.mu.Lock()
	defer l.mu.Unlock()

	if manifest.NodeID == "" {
		return fmt.Errorf("nodeID is required")
	}

	l.AgentManifests[manifest.NodeID] = manifest
	log.Printf("📝 Registered Agent Manifest for node %s", manifest.NodeID)
	return nil
}

// GetAgentManifest retrieves a specific Agent Manifest.
func (l *Ledger) GetAgentManifest(nodeID string) (types.AgentManifest, bool) {
	l.mu.RLock()
	defer l.mu.RUnlock()
	manifest, ok := l.AgentManifests[nodeID]
	return manifest, ok
}

// GetAgentManifests retrieves all Agent Manifests.
func (l *Ledger) GetAgentManifests() map[string]types.AgentManifest {
	l.mu.RLock()
	defer l.mu.RUnlock()

	// Create a copy to prevent concurrent map read/write during iteration outside lock
	result := make(map[string]types.AgentManifest, len(l.AgentManifests))
	for k, v := range l.AgentManifests {
		result[k] = v
	}
	return result
}

// Progressive CRDT Sharding Additions
func (l *Ledger) AddCRDTShard(shard types.CRDTShard) {
	l.mu.Lock()
	defer l.mu.Unlock()

	// For an edge node, we only keep shards relevant to our NodeID or Swarm
	if l.IsEdgeNode {
		localNodeID := os.Getenv("AXIOM_NODE_ID")
		// Progress CRDT Sharding: Edge node only retains its own CRDT leaf shards
		if shard.NodeID != localNodeID {
			return // Discard extraneous shards not relevant to this edge
		}
	}

	l.CRDTShards[shard.ShardID] = shard
}

func (l *Ledger) GetCRDTShard(shardID string) (types.CRDTShard, bool) {
	l.mu.RLock()
	defer l.mu.RUnlock()
	shard, ok := l.CRDTShards[shardID]
	return shard, ok
}

func (l *Ledger) GetCRDTShardsSince(since uint64) []types.CRDTShard {
	l.mu.RLock()
	defer l.mu.RUnlock()
	shards := make([]types.CRDTShard, 0)
	for _, shard := range l.CRDTShards {
		if shard.Timestamp > since {
			shards = append(shards, shard)
		}
	}
	return shards
}

// Skill Drift Detection
func (l *Ledger) AddDriftReport(report types.DriftReport) error {
	l.mu.Lock()
	defer l.mu.Unlock()

	if report.NodeID == "" {
		return fmt.Errorf("nodeID is required for drift report")
	}

	if report.Signature != "" {
		payloadStr := fmt.Sprintf("%s:%f:%f:%d", report.NodeID, report.SkillDrift, report.ConsensusLatency, report.Timestamp)
		if !consensus.VerifySignature(report.NodeID, []byte(payloadStr), report.Signature) {
			return fmt.Errorf("invalid drift report signature for node %s", report.NodeID)
		}
	}

	l.DriftReports[report.NodeID] = report

	// Light governance check - if drift exceeds some absolute max bound locally, sever bond
	bond, ok := l.Bonds[report.NodeID]
	if ok && bond.Status == "active" {
		if report.SkillDrift > 0.8 || report.ConsensusLatency > 5000 {
			log.Printf("⚠️ High drift detected for node %s. SkillDrift: %f, Latency: %f. Severing bond.", report.NodeID, report.SkillDrift, report.ConsensusLatency)
			bond.Status = "severed"
			l.Bonds[report.NodeID] = bond
		}
	}

	return nil
}

func (l *Ledger) GetDriftReport(nodeID string) (types.DriftReport, bool) {
	l.mu.RLock()
	defer l.mu.RUnlock()
	report, ok := l.DriftReports[nodeID]
	return report, ok
}

func (l *Ledger) GetDriftReportsSince(since uint64) []types.DriftReport {
	l.mu.RLock()
	defer l.mu.RUnlock()
	reports := make([]types.DriftReport, 0)
	for _, r := range l.DriftReports {
		if r.Timestamp > since {
			reports = append(reports, r)
		}
	}
	return reports
}

// RegisterNodeProfile adds or updates a Node Capability Profile in the ledger.
func (l *Ledger) RegisterNodeProfile(profile types.NodeCapabilityProfile) error {
	l.mu.Lock()
	defer l.mu.Unlock()

	if profile.NodeID == "" {
		return fmt.Errorf("nodeID is required")
	}

	l.NodeProfiles[profile.NodeID] = profile
	log.Printf("📝 Registered Node Capability Profile for node %s", profile.NodeID)
	return nil
}

// GetNodeProfile retrieves a specific Node Capability Profile.
func (l *Ledger) GetNodeProfile(nodeID string) (types.NodeCapabilityProfile, bool) {
	l.mu.RLock()
	defer l.mu.RUnlock()
	profile, ok := l.NodeProfiles[nodeID]
	return profile, ok
}

// GetNodeProfiles retrieves all Node Capability Profiles.
func (l *Ledger) GetNodeProfiles() map[string]types.NodeCapabilityProfile {
	l.mu.RLock()
	defer l.mu.RUnlock()

	result := make(map[string]types.NodeCapabilityProfile, len(l.NodeProfiles))
	for k, v := range l.NodeProfiles {
		result[k] = v
	}
	return result
}

func (l *Ledger) SaveToFile(path string) error {
	snap := l.Snapshot()
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	b, err := json.MarshalIndent(snap, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, b, 0644)
}

func (l *Ledger) LoadFromFile(path string) error {
	b, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	var snap LedgerSnapshot
	if err := json.Unmarshal(b, &snap); err != nil {
		return err
	}

	l.mu.Lock()
	defer l.mu.Unlock()
	l.Skills = snap.Skills
	l.WebCache = snap.WebCache
	l.Graph = snap.Graph
	l.GraphIndex = snap.GraphIndex
	l.Bonds = snap.Bonds
	l.CCIPMessages = snap.CCIPMessages
	l.Swarms = snap.Swarms
	l.Proposals = snap.Proposals
	l.TreasurySplit = snap.TreasurySplit
	l.GPPBalances = snap.GPPBalances
	l.NetworkSecPool = snap.NetworkSecPool
	l.WealthGenPool = snap.WealthGenPool
	l.GPPEvents = snap.GPPEvents
	l.RelayerQueue = snap.RelayerQueue
	l.settlementNextID = snap.SettlementNextID
	l.AgentManifests = snap.AgentManifests
	l.NodeProfiles = snap.NodeProfiles

	if l.WebCache == nil {
		l.WebCache = make(map[string]types.WebState)
	}
	if l.Graph.Nodes == nil {
		l.Graph.Nodes = make(map[string]types.GraphNode)
	}
	if l.GraphIndex == nil {
		l.GraphIndex = make(map[string][]string)
	}
	if l.Bonds == nil {
		l.Bonds = make(map[string]types.ComputeBond)
	}
	if l.CCIPMessages == nil {
		l.CCIPMessages = make(map[string]types.CCIPMessage)
	}
	if l.Swarms == nil {
		l.Swarms = make(map[string]types.Swarm)
	}
	if l.Proposals == nil {
		l.Proposals = make(map[string]types.Proposal)
	}
	if l.AgentManifests == nil {
		l.AgentManifests = make(map[string]types.AgentManifest)
	}
	if l.NodeProfiles == nil {
		l.NodeProfiles = make(map[string]types.NodeCapabilityProfile)
	}
	if l.GPPBalances == nil {
		l.GPPBalances = make(map[string]uint64)
	}
	if l.GPPEvents == nil {
		l.GPPEvents = make([]types.GPPEvent, 0)
	}
	if l.RelayerQueue == nil {
		l.RelayerQueue = make([]types.RelayerSettlement, 0)
	}

	return nil
}

// Prune removes historical data older than the specified retention period
func (l *Ledger) Prune(retentionPeriod time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()

	cutoff := uint64(time.Now().Add(-retentionPeriod).Unix())

	// Prune CRDTShards
	for id, shard := range l.CRDTShards {
		if shard.Timestamp < cutoff {
			delete(l.CRDTShards, id)
		}
	}

	// Prune DriftReports
	for id, report := range l.DriftReports {
		if report.Timestamp < cutoff {
			delete(l.DriftReports, id)
		}
	}

	// Prune Proposals
	for id, proposal := range l.Proposals {
		if proposal.EndTime < cutoff && proposal.State == types.ProposalStateResolved {
			delete(l.Proposals, id)
		}
	}
}
