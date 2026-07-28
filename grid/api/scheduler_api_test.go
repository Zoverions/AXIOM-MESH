package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"os"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"time"
	"strconv"

	"github.com/axiom-mesh/grid/internal/scheduler"
)

func signRequestForTest(req *http.Request, payload []byte) {
	apiKey := "test-api-key"
	os.Setenv("HYPERVISOR_API_KEY", apiKey)

	timestamp := time.Now().UnixNano() / int64(time.Millisecond)
	timestampStr := strconv.FormatInt(timestamp, 10)
	nonce := fmt.Sprintf("test-nonce-%d", time.Now().UnixNano())

	payloadStr := fmt.Sprintf("%s:%s:%s", timestampStr, nonce, string(payload))
	mac := hmac.New(sha256.New, []byte(apiKey))
	mac.Write([]byte(payloadStr))
	signature := hex.EncodeToString(mac.Sum(nil))

	req.Header.Set("X-Axiom-Timestamp", timestampStr)
	req.Header.Set("X-Axiom-Nonce", nonce)
	req.Header.Set("X-Axiom-Signature", signature)
}

func TestSchedulerAPI(t *testing.T) {
	s := scheduler.NewScheduler()
	mux := http.NewServeMux()
	RegisterSchedulerAPI(mux, s)

	// Register some nodes
	services := []string{"compute", "storage"}
	s.RegisterNode("node-1", nil, 90.0, 20, 2, scheduler.TierMedium, services)
	s.RegisterNode("node-2", nil, 60.0, 60, 8, scheduler.TierLow, services)

	// Test POST /schedule
	reqBody, _ := json.Marshal(ScheduleRequest{
		CapsuleID: "cap-1",
		Token:     "tok-1",
		AttestationPolicy: scheduler.RoutingPolicy{
			MinTrustScore: 80.0,
			MaxLatencyMs:  50,
			MaxCost:       5,
			RequiredHardwareTier: scheduler.TierMedium,
			RequiredServiceClasses: []string{"compute"},
		},
		ComputeBudget: 5,
	})

	req := httptest.NewRequest("POST", "/schedule", bytes.NewBuffer(reqBody))
	signRequestForTest(req, reqBody)
	rr := httptest.NewRecorder()

	mux.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("Expected status OK, got %d", rr.Code)
	}

	var resp ScheduleResponse
	if err := json.NewDecoder(rr.Body).Decode(&resp); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	if resp.NodeID != "node-1" {
		t.Errorf("Expected node-1, got %s", resp.NodeID)
	}
	if resp.Ticket == nil {
		t.Fatalf("Expected ticket, got nil")
	}

	// Test GET /schedule/{ticket}/status
	reqStatus := httptest.NewRequest("GET", "/schedule/"+resp.Ticket.ID+"/status", nil)
	signRequestForTest(reqStatus, []byte(""))
	rrStatus := httptest.NewRecorder()

	mux.ServeHTTP(rrStatus, reqStatus)

	if rrStatus.Code != http.StatusOK {
		t.Errorf("Expected status OK, got %d", rrStatus.Code)
	}

	var statusResp scheduler.TaskTicket
	if err := json.NewDecoder(rrStatus.Body).Decode(&statusResp); err != nil {
		t.Errorf("Failed to decode response: %v", err)
	}

	if statusResp.ID != resp.Ticket.ID {
		t.Errorf("Expected ticket ID %s, got %s", resp.Ticket.ID, statusResp.ID)
	}

	// Test POST /schedule/{ticket}/failover
	s.RegisterNode("node-3", nil, 90.0, 20, 2, scheduler.TierMedium, []string{"compute"})
	reqFailover := httptest.NewRequest("POST", "/schedule/"+resp.Ticket.ID+"/failover", nil)
	signRequestForTest(reqFailover, []byte(""))
	rrFailover := httptest.NewRecorder()

	mux.ServeHTTP(rrFailover, reqFailover)

	if rrFailover.Code != http.StatusOK {
		t.Errorf("Expected status OK, got %d", rrFailover.Code)
	}

	var failoverResp FailoverResponse
	if err := json.NewDecoder(rrFailover.Body).Decode(&failoverResp); err != nil {
		t.Errorf("Failed to decode failover response: %v", err)
	}

	if failoverResp.NewNodeID == "" || failoverResp.NewNodeID == resp.NodeID {
		t.Errorf("Expected new node ID different from %s, got %s", resp.NodeID, failoverResp.NewNodeID)
	}
}
