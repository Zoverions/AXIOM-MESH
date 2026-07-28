package p2p

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/axiom-mesh/grid/types"
	"github.com/google/uuid"
)

type HTTPTransport struct {
	client *http.Client
}

func NewHTTPTransport() *HTTPTransport {
	var cert tls.Certificate
	var err error
	var caCert []byte

	mtlsClientCert := os.Getenv("MTLS_CLIENT_CERT")
	mtlsClientKey := os.Getenv("MTLS_CLIENT_KEY")
	mtlsCaCert := os.Getenv("MTLS_CA_CERT")

	if mtlsClientCert != "" && mtlsClientKey != "" && mtlsCaCert != "" {
		cert, err = tls.X509KeyPair([]byte(mtlsClientCert), []byte(mtlsClientKey))
		if err != nil {
			log.Fatalf("Failed to load key pair from environment: %v", err)
		}
		caCert = []byte(mtlsCaCert)
	} else {
		if runningInGoTest() {
			return &HTTPTransport{client: &http.Client{Timeout: 10 * time.Second}}
		}
		log.Fatalf("mTLS certs not found in env vars and file fallback is disabled. mTLS is mandatory for security.")
	}

	caCertPool := x509.NewCertPool()
	caCertPool.AppendCertsFromPEM(caCert)

	tlsConfig := &tls.Config{
		Certificates: []tls.Certificate{cert},
		RootCAs:      caCertPool,
	}

	return &HTTPTransport{
		client: &http.Client{
			Timeout: 10 * time.Second,
			Transport: &http.Transport{
				TLSClientConfig: tlsConfig,
			},
		},
	}
}

func (t *HTTPTransport) BuildSignedHeaders(req *http.Request, payload []byte) error {
	apiKey := os.Getenv("HYPERVISOR_API_KEY")
	if apiKey == "" {
		return fmt.Errorf("HYPERVISOR_API_KEY not configured")
	}

	timestamp := fmt.Sprintf("%d", time.Now().UnixNano()/int64(time.Millisecond))
	nonce := uuid.New().String()

	req.Header.Set("X-Axiom-Timestamp", timestamp)
	req.Header.Set("X-Axiom-Nonce", nonce)

	payloadStr := fmt.Sprintf("%s:%s:%s", timestamp, nonce, string(payload))
	mac := hmac.New(sha256.New, []byte(apiKey))
	mac.Write([]byte(payloadStr))
	signature := hex.EncodeToString(mac.Sum(nil))

	req.Header.Set("X-Axiom-Signature", signature)
	return nil
}

func (t *HTTPTransport) postWithAuth(url string, payload []byte) (*http.Response, error) {
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if err := t.BuildSignedHeaders(req, payload); err != nil {
		return nil, err
	}
	return t.client.Do(req)
}

func (t *HTTPTransport) getWithAuth(url string) (*http.Response, error) {
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	// For GET requests, the payload is an empty string
	if err := t.BuildSignedHeaders(req, []byte("")); err != nil {
		return nil, err
	}
	return t.client.Do(req)
}

func (t *HTTPTransport) SendCCIPMessage(addr string, msg types.CCIPMessage) error {
	data, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("failed to marshal ccip message: %w", err)
	}
	resp, err := t.postWithAuth(addr+"/ccip?sync=true", data)
	if err != nil {
		return fmt.Errorf("failed to send ccip message to %s: %w", addr, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}

	return nil
}

func (t *HTTPTransport) FetchCCIPMessages(addr string) ([]types.CCIPMessage, error) {
	resp, err := t.getWithAuth(addr + "/ccip")
	if err != nil {
		return nil, fmt.Errorf("failed to fetch ccip messages from %s: %w", addr, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}

	var msgs []types.CCIPMessage
	if err := json.NewDecoder(resp.Body).Decode(&msgs); err != nil {
		return nil, fmt.Errorf("failed to decode ccip messages: %w", err)
	}

	return msgs, nil
}

func (t *HTTPTransport) SendSwarm(addr string, msg types.Swarm) error {
	data, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("failed to marshal swarm message: %w", err)
	}
	resp, err := t.postWithAuth(addr+"/swarm?sync=true", data)
	if err != nil {
		return fmt.Errorf("failed to send swarm message to %s: %w", addr, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}

	return nil
}

func (t *HTTPTransport) FetchSwarms(addr string) ([]types.Swarm, error) {
	resp, err := t.getWithAuth(addr + "/swarm")
	if err != nil {
		return nil, fmt.Errorf("failed to fetch swarms from %s: %w", addr, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}

	var swarms []types.Swarm
	if err := json.NewDecoder(resp.Body).Decode(&swarms); err != nil {
		return nil, fmt.Errorf("failed to decode swarms: %w", err)
	}

	return swarms, nil
}

func (t *HTTPTransport) SendCRDTShard(addr string, shard types.CRDTShard) error {
	data, err := json.Marshal(shard)
	if err != nil {
		return fmt.Errorf("failed to marshal crdt shard: %w", err)
	}
	resp, err := t.postWithAuth(addr+"/crdt/shard?sync=true", data)
	if err != nil {
		return fmt.Errorf("failed to send crdt shard to %s: %w", addr, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}
	return nil
}

func (t *HTTPTransport) FetchCRDTShards(addr string, since uint64) ([]types.CRDTShard, error) {
	url := fmt.Sprintf("%s/crdt/shard?since=%d", addr, since)
	resp, err := t.getWithAuth(url)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch crdt shards from %s: %w", addr, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}

	var shards []types.CRDTShard
	if err := json.NewDecoder(resp.Body).Decode(&shards); err != nil {
		return nil, fmt.Errorf("failed to decode crdt shards: %w", err)
	}
	return shards, nil
}

func (t *HTTPTransport) SendDriftReport(addr string, report types.DriftReport) error {
	data, err := json.Marshal(report)
	if err != nil {
		return fmt.Errorf("failed to marshal drift report: %w", err)
	}
	resp, err := t.postWithAuth(addr+"/drift/report?sync=true", data)
	if err != nil {
		return fmt.Errorf("failed to send drift report to %s: %w", addr, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}
	return nil
}

func (t *HTTPTransport) FetchDriftReports(addr string, since uint64) ([]types.DriftReport, error) {
	url := fmt.Sprintf("%s/drift/report?since=%d", addr, since)
	resp, err := t.getWithAuth(url)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch drift reports from %s: %w", addr, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}

	var reports []types.DriftReport
	if err := json.NewDecoder(resp.Body).Decode(&reports); err != nil {
		return nil, fmt.Errorf("failed to decode drift reports: %w", err)
	}
	return reports, nil
}

func runningInGoTest() bool {
	return strings.HasSuffix(os.Args[0], ".test")
}
