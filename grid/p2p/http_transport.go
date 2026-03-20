package p2p

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/axiom-mesh/grid/types"
)

type HTTPTransport struct {
	client *http.Client
}

func NewHTTPTransport() *HTTPTransport {
	return &HTTPTransport{
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (t *HTTPTransport) SendCCIPMessage(addr string, msg types.CCIPMessage) error {
	data, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("failed to marshal ccip message: %w", err)
	}
	resp, err := t.client.Post(addr+"/ccip?sync=true", "application/json", bytes.NewBuffer(data))
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
	resp, err := t.client.Get(addr + "/ccip")
	if err != nil {
		return nil, fmt.Errorf("failed to fetch ccip messages from %s: %w", addr, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}

	var msgs []types.CCIPMessage
	if err := json.NewDecoder(resp.Body).Decode(&msgs); err != nil {
		// Handle the case where the endpoint might return a single message or an error format
		return nil, fmt.Errorf("failed to decode ccip messages: %w", err)
	}

	return msgs, nil
}

func (t *HTTPTransport) SendSwarm(addr string, msg types.Swarm) error {
	data, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("failed to marshal swarm message: %w", err)
	}
	resp, err := t.client.Post(addr+"/swarm?sync=true", "application/json", bytes.NewBuffer(data))
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
	resp, err := t.client.Get(addr + "/swarm")
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
	resp, err := t.client.Post(addr+"/crdt/shard?sync=true", "application/json", bytes.NewBuffer(data))
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
	resp, err := t.client.Get(url)
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
	resp, err := t.client.Post(addr+"/drift/report?sync=true", "application/json", bytes.NewBuffer(data))
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
	resp, err := t.client.Get(url)
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
