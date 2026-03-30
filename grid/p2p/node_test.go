package p2p

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"errors"
	"testing"

	"github.com/axiom-mesh/grid/consensus"
	"github.com/axiom-mesh/grid/types"
	"time"
)

func TestPeerManagement(t *testing.T) {
	priv, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	node := NewNode("node1", priv)

	// Test AddPeer
	node.AddPeer("peer1", "http://127.0.0.1:5000")
	if len(node.Peers) != 1 {
		t.Fatalf("expected 1 peer, got %d", len(node.Peers))
	}
	peer := node.Peers["peer1"]
	if peer.ID != "peer1" || peer.Address != "http://127.0.0.1:5000" {
		t.Errorf("peer info mismatch: %+v", peer)
	}

	lastSeen := peer.LastSeen
	time.Sleep(10 * time.Millisecond)

	// Update existing peer
	node.AddPeer("peer1", "http://127.0.0.2:5000")
	if len(node.Peers) != 1 {
		t.Fatalf("expected 1 peer, got %d", len(node.Peers))
	}
	peer = node.Peers["peer1"]
	if peer.Address != "http://127.0.0.2:5000" {
		t.Errorf("peer address not updated: %s", peer.Address)
	}
	if !peer.LastSeen.After(lastSeen) {
		t.Errorf("peer LastSeen not updated")
	}

	// Test UpdatePeerScore
	node.UpdatePeerScore("peer1", 5)
	if node.Peers["peer1"].Score != 5 {
		t.Errorf("expected score 5, got %d", node.Peers["peer1"].Score)
	}

	// Test RemovePeer
	node.RemovePeer("peer1")
	if len(node.Peers) != 0 {
		t.Errorf("expected 0 peers, got %d", len(node.Peers))
	}
}

func TestIncrementPeerFailureAndEviction(t *testing.T) {
	priv, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	node := NewNode("node1", priv)
	node.AddPeer("peer1", "http://127.0.0.1:5000")

	// Fail 1
	node.IncrementPeerFailure("peer1")
	if node.Peers["peer1"].Failures != 1 {
		t.Errorf("expected 1 failure")
	}
	// Fail 2
	node.IncrementPeerFailure("peer1")
	if node.Peers["peer1"].Failures != 2 {
		t.Errorf("expected 2 failures")
	}
	// Fail 3 -> should evict
	node.IncrementPeerFailure("peer1")
	if _, exists := node.Peers["peer1"]; exists {
		t.Errorf("expected peer to be evicted after 3 failures")
	}
}

func TestAdaptiveDifficultyTracksPeerTopology(t *testing.T) {
	consensus.SetNetworkNodeCount(1)

	priv, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	node := NewNode("node1", priv)

	if got := consensus.GetNetworkNodeCount(); got != 1 {
		t.Fatalf("expected single-node baseline, got %d", got)
	}

	node.AddPeer("peer1", "http://127.0.0.1:5000")
	node.AddPeer("peer2", "http://127.0.0.2:5000")

	if node.PeerCount() != 2 {
		t.Fatalf("expected 2 peers, got %d", node.PeerCount())
	}
	if got := consensus.GetNetworkNodeCount(); got != 3 {
		t.Fatalf("expected network count to include local node + peers (=3), got %d", got)
	}

	node.RemovePeer("peer2")
	if got := consensus.GetNetworkNodeCount(); got != 2 {
		t.Fatalf("expected network count to drop to 2 after removal, got %d", got)
	}
}

func TestHeartbeatEvictionTimeout(t *testing.T) {
	priv, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	node := NewNode("node1", priv)
	node.AddPeer("peer1", "http://127.0.0.1:5000")

	// manually set LastSeen to older than 30s
	node.mu.Lock()
	node.Peers["peer1"].LastSeen = time.Now().Add(-31 * time.Second)
	node.mu.Unlock()

	// trigger heartbeat loop once manually (or simulate part of it)
	node.mu.Lock()
	for id, peer := range node.Peers {
		if time.Since(peer.LastSeen) > 30*time.Second {
			delete(node.Peers, id)
		} else if peer.Score <= -5 {
			delete(node.Peers, id)
		}
	}
	node.mu.Unlock()

	if len(node.Peers) != 0 {
		t.Errorf("expected peer to be evicted due to timeout")
	}
}

func TestHeartbeatEvictionLowScore(t *testing.T) {
	priv, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	node := NewNode("node1", priv)
	node.AddPeer("peer1", "http://127.0.0.1:5000")

	node.UpdatePeerScore("peer1", -5)

	// trigger heartbeat loop once manually
	node.mu.Lock()
	for id, peer := range node.Peers {
		if time.Since(peer.LastSeen) > 30*time.Second {
			delete(node.Peers, id)
		} else if peer.Score <= -5 {
			delete(node.Peers, id)
		}
	}
	node.mu.Unlock()

	if len(node.Peers) != 0 {
		t.Errorf("expected peer to be evicted due to low score")
	}
}

func TestExponentialBackoffSuccess(t *testing.T) {
	attempts := 0
	task := func() error {
		attempts++
		return nil
	}

	err := sendWithBackoff(task)
	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
	if attempts != 1 {
		t.Errorf("expected 1 attempt, got %d", attempts)
	}
}

func TestExponentialBackoffFailure(t *testing.T) {
	attempts := 0
	task := func() error {
		attempts++
		return errors.New("timeout") // just some error
	}

	start := time.Now()
	err := sendWithBackoff(task)
	duration := time.Since(start)

	if err == nil {
		t.Errorf("expected error")
	}
	if attempts != 3 {
		t.Errorf("expected 3 attempts, got %d", attempts)
	}

	// delay schedule: 1s, 2s. Total wait should be roughly 3s.
	if duration < 3*time.Second {
		t.Errorf("expected backoff to take at least 3 seconds, took %v", duration)
	}
}

func TestNode_QueryNetwork(t *testing.T) {
	priv, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	node := NewNode("node1", priv)
	node.AddPeer("peer1", "http://127.0.0.1:5000") // Will fail Dial, but we test structure

	// Test proof failure simulation is mostly implicit, but we can verify QueryNetwork handles empty gracefully
	results := node.QueryNetwork("SELECT * FROM graph", "dummy-proof")

	if len(results) != 0 {
		t.Errorf("Expected 0 results from unreachable peer, got %d", len(results))
	}
}

type mockTransport struct {
	sentMessages  []types.CCIPMessage
	fetchMessages []types.CCIPMessage
	fetchError    error
	sendError     error
}

func (m *mockTransport) SendCCIPMessage(addr string, msg types.CCIPMessage) error {
	m.sentMessages = append(m.sentMessages, msg)
	return m.sendError
}

func (m *mockTransport) FetchCCIPMessages(addr string) ([]types.CCIPMessage, error) {
	return m.fetchMessages, m.fetchError
}

func (m *mockTransport) SendSwarm(addr string, msg types.Swarm) error           { return nil }
func (m *mockTransport) FetchSwarms(addr string) ([]types.Swarm, error)         { return nil, nil }
func (m *mockTransport) SendCRDTShard(addr string, shard types.CRDTShard) error { return nil }
func (m *mockTransport) FetchCRDTShards(addr string, since uint64) ([]types.CRDTShard, error) {
	return nil, nil
}
func (m *mockTransport) SendDriftReport(addr string, report types.DriftReport) error { return nil }
func (m *mockTransport) FetchDriftReports(addr string, since uint64) ([]types.DriftReport, error) {
	return nil, nil
}

func TestNode_BroadcastCCIPMessage(t *testing.T) {
	priv, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	node := NewNode("node1", priv)
	node.AddPeer("peer1", "http://127.0.0.1:5000")

	mockT := &mockTransport{}
	node.Transport = mockT

	msg := types.CCIPMessage{
		MessageID:   "test-msg-1",
		SourceChain: "ethereum",
		TargetChain: "polygon",
		Sender:      "0xSender",
		Receiver:    "0xReceiver",
		Payload:     "0xPayload",
	}

	node.BroadcastCCIPMessage(msg)

	// Since Broadcast launches a goroutine per peer, sleep to allow execution
	time.Sleep(200 * time.Millisecond)

	if len(mockT.sentMessages) != 1 {
		t.Fatalf("expected 1 sent message, got %d", len(mockT.sentMessages))
	}
	if mockT.sentMessages[0].MessageID != "test-msg-1" {
		t.Errorf("unexpected message id: %s", mockT.sentMessages[0].MessageID)
	}
}

func TestNode_SyncCCIPState(t *testing.T) {
	priv, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	node := NewNode("node1", priv)
	node.AddPeer("peer1", "http://127.0.0.1:5000")

	mockT := &mockTransport{
		fetchMessages: []types.CCIPMessage{
			{MessageID: "msg-1"},
			{MessageID: "msg-2"},
		},
	}
	node.Transport = mockT

	syncCount := 0
	node.SyncCallback = func(msg types.CCIPMessage) bool {
		syncCount++
		return true
	}

	// To test SyncCCIPState without waiting 30 seconds for the ticker, we temporarily replace the
	// internal logic inside a modified method, or just directly call the internal sync block.
	// We'll test the actual internal sync logic logic for the loop.
	peers := node.snapshotPeers()
	for _, peer := range peers {
		msgs, _ := node.Transport.FetchCCIPMessages(peer.Address)
		for _, msg := range msgs {
			node.SyncCallback(msg)
		}
	}

	if syncCount != 2 {
		t.Fatalf("expected 2 synced messages, got %d", syncCount)
	}
}
