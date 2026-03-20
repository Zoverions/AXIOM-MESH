package api

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"testing"
	"time"

	"github.com/axiom-mesh/grid/blockchain"
	"github.com/axiom-mesh/grid/types"
	"github.com/google/uuid"
)

func signRequest(req *http.Request, apiKey string) {
	timestamp := strconv.FormatInt(time.Now().UnixNano()/int64(time.Millisecond), 10)
	nonce := uuid.New().String()

	var bodyBytes []byte
	if req.Body != nil {
		bodyBytes, _ = io.ReadAll(req.Body)
		req.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))
	}

	payload := fmt.Sprintf("%s:%s:%s", timestamp, nonce, string(bodyBytes))
	mac := hmac.New(sha256.New, []byte(apiKey))
	mac.Write([]byte(payload))
	signature := hex.EncodeToString(mac.Sum(nil))

	req.Header.Set("X-Axiom-Timestamp", timestamp)
	req.Header.Set("X-Axiom-Nonce", nonce)
	req.Header.Set("X-Axiom-Signature", signature)
}

func TestNodeCapabilityDiscoveryAPI(t *testing.T) {
	apiKey := "test_secret_key"
	os.Setenv("HYPERVISOR_API_KEY", apiKey)

	ledger := blockchain.NewLedger()
	server := NewServer(ledger, nil)
	mux := server.SetupRouter()

	// 1. Register 50 simulated nodes
	for i := 1; i <= 50; i++ {
		profile := types.NodeCapabilityProfile{
			NodeID:   fmt.Sprintf("node-%d", i),
			CPUCores: 8,
			RAMGB:    16.0,
		}

		if i%2 == 0 {
			profile.GPUMemGB = 16.0
			profile.ServiceClasses = []string{"compute", "inference"}
		} else {
			profile.GPUMemGB = 0.0
			profile.ServiceClasses = []string{"storage"}
		}

		if i%5 == 0 {
			profile.GPUMemGB = 80.0
			profile.ServiceClasses = append(profile.ServiceClasses, "training")
		}

		body, _ := json.Marshal(profile)
		req, _ := http.NewRequest("POST", "/node/register", bytes.NewBuffer(body))
		req.Header.Set("Content-Type", "application/json")
		signRequest(req, apiKey)

		rr := httptest.NewRecorder()
		mux.ServeHTTP(rr, req)

		if status := rr.Code; status != http.StatusOK {
			t.Fatalf("Register node failed: %v", rr.Body.String())
		}
	}

	// 2. Query matching min_gpu=16.0 (Should be 30 nodes: 25 even ones, plus 5 odd multiples of 5 with 80GB)
	start := time.Now()
	req, _ := http.NewRequest("GET", "/nodes?min_gpu=16.0", nil)
	signRequest(req, apiKey)

	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, req)
	duration := time.Since(start)

	if duration.Milliseconds() > 200 {
		t.Errorf("Query latency too high: %v ms", duration.Milliseconds())
	}

	var resp map[string]interface{}
	json.Unmarshal(rr.Body.Bytes(), &resp)

	nodes := resp["nodes"].([]interface{})
	if len(nodes) != 30 {
		t.Errorf("Expected 30 nodes with min_gpu=16.0, got %d", len(nodes))
	}

	// 3. Query matching service=training (Should be 10 nodes)
	req2, _ := http.NewRequest("GET", "/nodes?service=training", nil)
	signRequest(req2, apiKey)

	rr2 := httptest.NewRecorder()
	mux.ServeHTTP(rr2, req2)

	var resp2 map[string]interface{}
	json.Unmarshal(rr2.Body.Bytes(), &resp2)

	nodes2 := resp2["nodes"].([]interface{})
	if len(nodes2) != 10 {
		t.Errorf("Expected 10 training nodes, got %d", len(nodes2))
	}

	// 4. Test Pagination
	req3, _ := http.NewRequest("GET", "/nodes?limit=10&offset=5", nil)
	signRequest(req3, apiKey)

	rr3 := httptest.NewRecorder()
	mux.ServeHTTP(rr3, req3)

	var resp3 map[string]interface{}
	json.Unmarshal(rr3.Body.Bytes(), &resp3)

	nodes3 := resp3["nodes"].([]interface{})
	if len(nodes3) != 10 {
		t.Errorf("Expected 10 paginated nodes, got %d", len(nodes3))
	}

	// 5. Test specific node
	req4, _ := http.NewRequest("GET", "/node/node-10", nil)
	signRequest(req4, apiKey)
	rr4 := httptest.NewRecorder()
	mux.ServeHTTP(rr4, req4)
	if status := rr4.Code; status != http.StatusOK {
		t.Errorf("Expected OK for get specific node, got %v", status)
	}

	var profile types.NodeCapabilityProfile
	json.Unmarshal(rr4.Body.Bytes(), &profile)
	if profile.NodeID != "node-10" {
		t.Errorf("Expected node-10, got %v", profile.NodeID)
	}
}
