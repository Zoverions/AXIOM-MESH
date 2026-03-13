package types

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
	NodeID string `json:"nodeId"`
	Amount int    `json:"amount"`
	Status string `json:"status"`
}

type WebState struct {
	URL           string   `json:"url"`
	TextLength    int      `json:"text_length"`
	OutboundLinks []string `json:"outbound_links"`
	CompiledState string   `json:"compiled_state"`
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
