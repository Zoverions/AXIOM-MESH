package types

type AgentManifest struct {
	NodeID          string    `json:"nodeId"`
	CognitiveVector []float64 `json:"cognitiveVector"`
	Signature       string    `json:"signature"`
	Timestamp       int64     `json:"timestamp"`
}

type LightweightPingProfile struct {
	NodeID       string  `json:"node_id"`
	Tier         string  `json:"tier"`          // e.g. "minimal-edge", "dedicated-mesh"
	TrustScore   float64 `json:"trust_score"`   // 0.0 to 1.0
	LatencyScore float64 `json:"latency_score"` // 0.0 to 1.0 (or ms)
	Version      uint64  `json:"version"`
	Hash         string  `json:"hash"`
}

type NodeCapabilityProfile struct {
	NodeID         string   `json:"node_id"`
	CPUCores       int      `json:"cpu_cores"`
	CPUFeatures    []string `json:"cpu_features,omitempty"`
	GPUModel       string   `json:"gpu_model,omitempty"`
	GPUMemGB       float64  `json:"gpu_mem_gb,omitempty"`
	HasTEE         bool     `json:"has_tee"`
	TEEType        string   `json:"tee_type,omitempty"`
	RAMGB          float64  `json:"ram_gb"`
	StorageGB      float64  `json:"storage_gb"`
	BandwidthMbps  float64  `json:"bandwidth_mbps,omitempty"`
	ServiceClasses []string `json:"service_classes,omitempty"`
	LatencyScore   float64  `json:"latency_score,omitempty"`
	TrustScore     float64  `json:"trust_score,omitempty"`
	LastSeenTS     int64    `json:"last_seen_ts,omitempty"`
	Version        uint64   `json:"version,omitempty"`
	Hash           string   `json:"hash,omitempty"`
}

type Task struct {
	ID          string `json:"id"`
	Description string `json:"description"`
	Status      string `json:"status"`
}

type SkillVector struct {
	ID       string    `json:"id"`
	Vector   []float64 `json:"vector"`
	Task     string    `json:"task"`
	PoERHash string    `json:"poerHash"`
	NodeID   string    `json:"nodeId"`
}

type ComputeBond struct {
	NodeID            string `json:"nodeId"`
	Amount            int    `json:"amount"`
	Status            string `json:"status"`
	TxHash            string `json:"txHash,omitempty"`
	LastEvent         string `json:"lastEvent,omitempty"`
	LastUpdatedBlock  uint64 `json:"lastUpdatedBlock,omitempty"`
	FinalizedBlock    uint64 `json:"finalizedBlock,omitempty"`
	PendingFinalityTx string `json:"pendingFinalityTx,omitempty"`
	ParentNodeID      string `json:"parentNodeId,omitempty"`
}

type BondChainEvent struct {
	Type            string `json:"type"` // "stake", "slash", "delegate"
	NodeID          string `json:"nodeId"`
	ParentNodeID    string `json:"parentNodeId,omitempty"`
	Amount          int    `json:"amount"`
	TxHash          string `json:"txHash"`
	BlockNumber     uint64 `json:"blockNumber"`
	Finalized       bool   `json:"finalized"`
	RequiredConfirm uint64 `json:"requiredConfirmations,omitempty"`
}

type WebState struct {
	URL           string   `json:"url"`
	TextLength    int      `json:"text_length"`
	OutboundLinks []string `json:"outbound_links"`
	CompiledState string   `json:"compiled_state"`
	NodeID        string   `json:"node_id,omitempty"`
	Signature     string   `json:"signature,omitempty"`
}

type GraphNode struct {
	ID       string                 `json:"id"`
	Content  string                 `json:"content"`
	Metadata map[string]interface{} `json:"metadata"`
	Keywords []string               `json:"keywords"`
}

type GraphEdge struct {
	Source       string `json:"source"`
	Target       string `json:"target"`
	Relationship string `json:"relationship"`
	Weight       int    `json:"weight"`
}

type DistributedGraph struct {
	Nodes map[string]GraphNode `json:"nodes"`
	Edges []GraphEdge          `json:"edges"`
}

type ZKMLPayload struct {
	ModelCommitment string    `json:"model_commitment"`
	Input           []float64 `json:"input"`
	Output          []float64 `json:"output"`
	Proof           string    `json:"proof"`
	VK              string    `json:"vk"`
	Settings        string    `json:"settings"`
}

type CitizenshipNFTMint struct {
	NodeID          string `json:"nodeId"`
	Jurisdiction    string `json:"jurisdiction"`
	RightsTier      string `json:"rightsTier"`
	TxHash          string `json:"txHash,omitempty"`
}

type VaultACL struct {
	NodeID        string   `json:"nodeId"`
	OwnerDID      string   `json:"ownerDID"`
	AllowedAgents []string `json:"allowedAgents"`
}

type CCIPMessage struct {
	MessageID   string `json:"message_id"`
	SourceChain string `json:"source_chain"`
	TargetChain string `json:"target_chain"`
	Sender      string `json:"sender"`
	Receiver    string `json:"receiver"`
	Payload     string `json:"payload"`
	Status      string `json:"status"`
}

type Swarm struct {
	ID     string   `json:"id"`
	TaskID string   `json:"taskId"`
	Nodes  []string `json:"nodes"`
	Status string   `json:"status"`
}

type GraphSyncMessage struct {
	Type      string                 `json:"type"`
	Query     string                 `json:"query,omitempty"`
	Proof     string                 `json:"proof,omitempty"`
	Node      GraphNode              `json:"node,omitempty"`
	Edges     []GraphEdge            `json:"edges,omitempty"`
	Payload   map[string]interface{} `json:"payload,omitempty"`
	NodeID    string                 `json:"node_id,omitempty"`
	Signature string                 `json:"signature,omitempty"`
}

type ProposalState string

const (
	ProposalStateActive            ProposalState = "Active"
	ProposalStateAwaitingSynthesis ProposalState = "AwaitingSynthesis"
	ProposalStateResolved          ProposalState = "Resolved"
)

type ImpactVector string

const (
	ImpactVectorAnthropic     ImpactVector = "Anthropic"
	ImpactVectorThermodynamic ImpactVector = "Thermodynamic"
	ImpactVectorNeutral       ImpactVector = "Neutral"
)

type Proposal struct {
	ID                string        `json:"id"`
	Description       string        `json:"description"`
	Impact            ImpactVector  `json:"impact"`
	State             ProposalState `json:"state"`
	SynthesisResult   string        `json:"synthesisResult,omitempty"`
	HumanForVotes     int           `json:"humanForVotes"`
	HumanAgainstVotes int           `json:"humanAgainstVotes"`
	AgentForVotes     int           `json:"agentForVotes"`
	AgentAgainstVotes int           `json:"agentAgainstVotes"`
	EndTime           uint64        `json:"endTime"`
	Round             uint64        `json:"round"`
}

type ProposalChainEvent struct {
	Type            string       `json:"type"` // "Created", "Voted", "DeadlockDetected", "SynthesisSubmitted", "Resolved"
	ProposalID      string       `json:"proposalId"`
	Description     string       `json:"description,omitempty"`
	Impact          ImpactVector `json:"impact,omitempty"`
	EndTime         uint64       `json:"endTime,omitempty"`
	Voter           string       `json:"voter,omitempty"`
	Support         bool         `json:"support,omitempty"`
	Weight          int          `json:"weight,omitempty"`
	SynthesisResult string       `json:"synthesisResult,omitempty"`
	Passed          bool         `json:"passed,omitempty"`
	VoterType       string       `json:"voterType,omitempty"` // "Human" or "Agent"
	TxHash          string       `json:"txHash,omitempty"`
	BlockNumber     uint64       `json:"blockNumber,omitempty"`
}

type TreasurySplitConfig struct {
	NetworkSecurityFund  uint `json:"networkSecurityFund"`  // e.g., 70
	WealthGenerationPool uint `json:"wealthGenerationPool"` // e.g., 30
}

type GuildPowerOracle struct {
	// Represents the oracle configuring power and distribution
	NodeID      string `json:"nodeId"`
	PowerWeight int    `json:"powerWeight"`
}

type DistributionManager struct {
	TreasurySplit TreasurySplitConfig `json:"treasurySplit"`
}

// GPPEvent models an ERC-20 compatible mint/burn/transfer event
type GPPEvent struct {
	Type   string `json:"type"`   // "Mint", "Burn", "Transfer"
	From   string `json:"from"`   // 0x0 for Mint
	To     string `json:"to"`     // 0x0 for Burn
	Amount uint64 `json:"amount"` // The amount of GPP tokens
}

// RelayerSettlement represents L1 piggyback settlement queue item
type RelayerSettlement struct {
	ID        string `json:"id"`
	Recipient string `json:"recipient"`
	Amount    uint64 `json:"amount"`
	Token     string `json:"token"` // e.g., "GPP"
	Status    string `json:"status"` // "Queued", "Processing", "Settled"
}

type CapabilityManifest struct {
	Tier       string             `json:"tier"`
	Services   []string           `json:"services"`
	Benchmarks map[string]float64 `json:"benchmarks"`
	Version    uint64             `json:"version,omitempty"`
	Hash       string             `json:"hash,omitempty"`
}

// CRDTShard represents a fragmented Last-Write-Wins map piece for edge scaling
type CRDTShard struct {
	ShardID   string                 `json:"shardId"`
	RootHash  string                 `json:"rootHash"`
	NodeID    string                 `json:"nodeId"`
	Data      map[string]interface{} `json:"data"`
	Timestamp uint64                 `json:"timestamp"`
	Signature string                 `json:"signature"`
}

// DriftReport represents an automated behavioral drift assessment
type DriftReport struct {
	NodeID           string  `json:"nodeId"`
	SkillDrift       float64 `json:"skillDrift"`
	ConsensusLatency float64 `json:"consensusLatency"`
	RepetitiveLoops  int     `json:"repetitiveLoops,omitempty"`
	Timestamp        uint64  `json:"timestamp"`
	Signature        string  `json:"signature"`
}
