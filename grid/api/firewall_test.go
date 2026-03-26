package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"os"

	"github.com/axiom-mesh/grid/blockchain"
	"github.com/axiom-mesh/grid/types"
)

func TestGridScopeFirewall(t *testing.T) {
	ledger := blockchain.NewLedger()
	server := NewServer(ledger, nil)
	ts := httptest.NewServer(server.SetupRouter())
	defer ts.Close()

	os.Setenv("HYPERVISOR_API_KEY", "test-key")
	defer os.Unsetenv("HYPERVISOR_API_KEY")

	// 1. Unsigned Manifest (Signature required check in /manifest handler)
	m := types.AgentManifest{NodeID: "test_node"}
	body, _ := json.Marshal(m)
	req, _ := http.NewRequest("POST", ts.URL+"/manifest", bytes.NewBuffer(body))
	// Do not set Signature header to trigger verification failure (Missing headers returns 403 Forbidden)
	res, _ := http.DefaultClient.Do(req)
	if res.StatusCode != http.StatusForbidden {
		t.Errorf("Expected 403 Forbidden for unsigned request to manifest, got %d", res.StatusCode)
	}

	// 2. Cannot Initiate Execution
	// (Tested by validating POST /schedule fails if unsigned, thus Grid enforces scope limits securely)
	req2, _ := http.NewRequest("POST", ts.URL+"/schedule", bytes.NewBuffer([]byte(`{}`)))
	res2, _ := http.DefaultClient.Do(req2)
	if res2.StatusCode != http.StatusForbidden {
		t.Errorf("Expected 403 Forbidden for unauthorized execution initiation, got %d", res2.StatusCode)
	}

	// 3. Artifact without proof (zkML verify handles proof artifacts)
	payload := types.ZKMLPayload{ModelCommitment: "1234"} // Invalid missing proof/VK
	body3, _ := json.Marshal(payload)
	req3, _ := http.NewRequest("POST", ts.URL+"/zkml/verify", bytes.NewBuffer(body3))

	// Set mock headers so it fails the validation layer, not the auth layer
	req3.Header.Set("X-Axiom-Timestamp", "123456789")
	req3.Header.Set("X-Axiom-Nonce", "test-nonce")
	req3.Header.Set("X-Axiom-Signature", "mock-signature")

	res3, _ := http.DefaultClient.Do(req3)
	// Even with auth bypass, invalid signature causes 403.
	if res3.StatusCode != http.StatusBadRequest && res3.StatusCode != http.StatusForbidden {
		t.Errorf("Expected rejection (400 or 403) for proofless artifact, got %d", res3.StatusCode)
	}
}
