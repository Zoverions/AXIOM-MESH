package api

import (
	"encoding/json"
	"path/filepath"
	"testing"

	"github.com/santhosh-tekuri/jsonschema/v5"
)

func TestNodeCapabilityProfileSchemaValidation(t *testing.T) {
	schemaPath := filepath.Join("..", "..", "schemas", "node_capability_profile.v1.json")
	compiler := jsonschema.NewCompiler()
	compiler.Draft = jsonschema.Draft7
	schema, err := compiler.Compile(schemaPath)
	if err != nil {
		t.Fatalf("Failed to compile schema: %v", err)
	}

	validJSON := `{
		"node_id": "test-node-123",
		"cpu_cores": 16,
		"cpu_features": ["avx2", "avx512"],
		"gpu_model": "NVIDIA RTX 4090",
		"gpu_mem_gb": 24.0,
		"has_tee": false,
		"ram_gb": 64.0,
		"storage_gb": 2000.0,
		"bandwidth_mbps": 1000.0,
		"service_classes": ["compute", "inference", "training"],
		"latency_score": 15.5,
		"trust_score": 0.99,
		"last_seen_ts": 1711012345
	}`

	var validInst interface{}
	if err := json.Unmarshal([]byte(validJSON), &validInst); err != nil {
		t.Fatalf("Failed to unmarshal valid JSON: %v", err)
	}

	if err := schema.Validate(validInst); err != nil {
		t.Errorf("Valid JSON failed schema validation: %v", err)
	}

	// Test missing required fields
	invalidJSON1 := `{
		"cpu_cores": 16,
		"ram_gb": 64.0,
		"storage_gb": 2000.0
	}`

	var invalidInst1 interface{}
	if err := json.Unmarshal([]byte(invalidJSON1), &invalidInst1); err != nil {
		t.Fatalf("Failed to unmarshal invalid JSON 1: %v", err)
	}

	if err := schema.Validate(invalidInst1); err == nil {
		t.Errorf("Invalid JSON (missing node_id) incorrectly passed schema validation")
	}

	// Test incorrect type
	invalidJSON2 := `{
		"node_id": "test-node-123",
		"cpu_cores": "sixteen",
		"ram_gb": 64.0,
		"storage_gb": 2000.0
	}`

	var invalidInst2 interface{}
	if err := json.Unmarshal([]byte(invalidJSON2), &invalidInst2); err != nil {
		t.Fatalf("Failed to unmarshal invalid JSON 2: %v", err)
	}

	if err := schema.Validate(invalidInst2); err == nil {
		t.Errorf("Invalid JSON (incorrect type for cpu_cores) incorrectly passed schema validation")
	}

	// Test additional properties
	invalidJSON3 := `{
		"node_id": "test-node-123",
		"cpu_cores": 16,
		"ram_gb": 64.0,
		"storage_gb": 2000.0,
		"unknown_field": "some_value"
	}`

	var invalidInst3 interface{}
	if err := json.Unmarshal([]byte(invalidJSON3), &invalidInst3); err != nil {
		t.Fatalf("Failed to unmarshal invalid JSON 3: %v", err)
	}

	if err := schema.Validate(invalidInst3); err == nil {
		t.Errorf("Invalid JSON (additional properties) incorrectly passed schema validation")
	}
}
