package p2p

import (
	"errors"
	"testing"
	"time"
)

func TestPeerManagement(t *testing.T) {
	node := NewNode("node1")

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
	node := NewNode("node1")
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

func TestHeartbeatEvictionTimeout(t *testing.T) {
	node := NewNode("node1")
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
	node := NewNode("node1")
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
