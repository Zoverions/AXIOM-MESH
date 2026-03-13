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
}

type WebState struct {
	URL           string   `json:"url"`
	TextLength    int      `json:"text_length"`
	OutboundLinks []string `json:"outbound_links"`
	CompiledState string   `json:"compiled_state"`
}
