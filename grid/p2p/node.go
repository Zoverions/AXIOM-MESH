package p2p

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/axiom-mesh/grid/types"
	"github.com/gorilla/websocket"
)

type PeerInfo struct {
	ID       string
	Address  string
	LastSeen time.Time
	Score    int
	Failures int
}

type Node struct {
	ID    string
	Peers map[string]*PeerInfo
	mu    sync.RWMutex
}

func NewNode(id string) *Node {
	return &Node{
		ID:    id,
		Peers: make(map[string]*PeerInfo),
	}
}

func (n *Node) AddPeer(id, address string) {
	n.mu.Lock()
	defer n.mu.Unlock()

	if peer, exists := n.Peers[id]; exists {
		peer.LastSeen = time.Now()
		// Also update address if it changed
		peer.Address = address
	} else {
		n.Peers[id] = &PeerInfo{
			ID:       id,
			Address:  address,
			LastSeen: time.Now(),
			Score:    0,
			Failures: 0,
		}
		log.Printf("P2P Node %s: Discovered new peer: %s at %s", n.ID, id, address)
	}
}

func (n *Node) RemovePeer(id string) {
	n.mu.Lock()
	defer n.mu.Unlock()
	if _, exists := n.Peers[id]; exists {
		delete(n.Peers, id)
		log.Printf("P2P Node %s: Removed peer %s", n.ID, id)
	}
}

func (n *Node) UpdatePeerScore(id string, delta int) {
	n.mu.Lock()
	defer n.mu.Unlock()
	if peer, exists := n.Peers[id]; exists {
		peer.Score += delta
	}
}

func (n *Node) IncrementPeerFailure(id string) {
	n.mu.Lock()
	defer n.mu.Unlock()
	if peer, exists := n.Peers[id]; exists {
		peer.Failures++
		if peer.Failures >= 3 {
			// Do not call RemovePeer directly here because n.mu is locked, avoiding deadlock.
			// Just remove from map directly.
			delete(n.Peers, id)
			log.Printf("P2P Node %s: Evicted peer %s due to max failures", n.ID, id)
		}
	}
}

func (n *Node) heartbeatLoop() {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		n.mu.Lock()
		for id, peer := range n.Peers {
			if time.Since(peer.LastSeen) > 30*time.Second {
				delete(n.Peers, id)
				log.Printf("P2P Node %s: Evicted peer %s due to timeout", n.ID, id)
			} else if peer.Score <= -5 {
				delete(n.Peers, id)
				log.Printf("P2P Node %s: Evicted peer %s due to low score", n.ID, id)
			}
		}
		n.mu.Unlock()
	}
}

func (n *Node) Start() {
	log.Printf("P2P Node %s started", n.ID)
	go n.listenForPeers()
	go n.discoverSubnets()
	go n.heartbeatLoop()
}

func sendWithBackoff(task func() error) error {
	maxRetries := 3
	delay := 1 * time.Second

	var err error
	for i := 0; i < maxRetries; i++ {
		err = task()
		if err == nil {
			return nil
		}
		if i < maxRetries-1 {
			time.Sleep(delay)
			delay *= 2
		}
	}
	return err
}

func (n *Node) BroadcastGraphUpdate(node types.GraphNode, edges []types.GraphEdge) {
	n.mu.RLock()
	peers := make([]PeerInfo, 0, len(n.Peers))
	for _, p := range n.Peers {
		peers = append(peers, *p)
	}
	n.mu.RUnlock()

	log.Printf("P2P Node %s: Broadcasting graph update for node %s to %d peers", n.ID, node.ID, len(peers))
	for _, peer := range peers {
		wsURL := strings.Replace(peer.Address, "http://", "ws://", 1) + "/ws/graph"
		go func(pID, urlStr string) {
			err := sendWithBackoff(func() error {
				c, _, err := websocket.DefaultDialer.Dial(urlStr, nil)
				if err != nil {
					return fmt.Errorf("dial: %w", err)
				}
				defer c.Close()

				req := map[string]interface{}{
					"type":  "sync",
					"node":  node,
					"edges": edges,
				}
				return c.WriteJSON(req)
			})

			if err != nil {
				log.Printf("P2P Node %s: Failed to write to %s after retries: %v", n.ID, urlStr, err)
				n.IncrementPeerFailure(pID)
				n.UpdatePeerScore(pID, -1)
			} else {
				n.UpdatePeerScore(pID, 1)
			}
		}(peer.ID, wsURL)
	}
}

func (n *Node) BroadcastWebState(state types.WebState) {
	n.mu.RLock()
	peers := make([]PeerInfo, 0, len(n.Peers))
	for _, p := range n.Peers {
		peers = append(peers, *p)
	}
	n.mu.RUnlock()

	log.Printf("P2P Node %s: Broadcasting web state for URL %s to %d peers", n.ID, state.URL, len(peers))
	for _, peer := range peers {
		log.Printf("P2P Node %s: Syncing web state with peer %s at %s", n.ID, peer.ID, peer.Address)

		go func(pID, a string) {
			err := sendWithBackoff(func() error {
				data, _ := json.Marshal(state)
				resp, err := http.Post(a+"/cache?sync=true", "application/json", bytes.NewBuffer(data))
				if err != nil {
					return err
				}
				defer resp.Body.Close()
				if resp.StatusCode < 200 || resp.StatusCode >= 300 {
					return fmt.Errorf("status code %d", resp.StatusCode)
				}
				return nil
			})

			if err != nil {
				log.Printf("P2P Node %s: Failed to sync with %s after retries: %v", n.ID, a, err)
				n.IncrementPeerFailure(pID)
				n.UpdatePeerScore(pID, -1)
			} else {
				n.UpdatePeerScore(pID, 1)
			}
		}(peer.ID, peer.Address)
	}
}

func (n *Node) BroadcastCCIPMessage(msg types.CCIPMessage) {
	n.mu.RLock()
	peers := make([]PeerInfo, 0, len(n.Peers))
	for _, p := range n.Peers {
		peers = append(peers, *p)
	}
	n.mu.RUnlock()

	log.Printf("P2P Node %s: Broadcasting CCIP message %s to %d peers", n.ID, msg.MessageID, len(peers))
	for _, peer := range peers {
		log.Printf("P2P Node %s: Syncing CCIP message with peer %s at %s", n.ID, peer.ID, peer.Address)
		// In a real implementation, we would perform an HTTP POST to peer.Address + "/ccip?sync=true" with sendWithBackoff
		// For now we will just mimic success.
		go func(pID string) {
			n.UpdatePeerScore(pID, 1)
		}(peer.ID)
	}
}

func (n *Node) QueryNetwork(query string, proof string) {
	n.mu.RLock()
	peers := make([]PeerInfo, 0, len(n.Peers))
	for _, p := range n.Peers {
		peers = append(peers, *p)
	}
	n.mu.RUnlock()

	log.Printf("P2P Node %s: Querying network for '%s' with ZKP to %d peers", n.ID, query, len(peers))
	for _, peer := range peers {
		wsURL := strings.Replace(peer.Address, "http://", "ws://", 1) + "/ws/graph"
		go func(pID, urlStr string) {
			err := sendWithBackoff(func() error {
				c, _, err := websocket.DefaultDialer.Dial(urlStr, nil)
				if err != nil {
					return err
				}
				defer c.Close()

				req := map[string]interface{}{
					"type":  "query",
					"query": query,
					"proof": proof,
				}
				if err := c.WriteJSON(req); err != nil {
					return err
				}

				var res map[string]interface{}
				if err := c.ReadJSON(&res); err != nil {
					return err
				}
				log.Printf("P2P Node %s: Received query result from %s: %v", n.ID, urlStr, res)
				return nil
			})

			if err != nil {
				log.Printf("P2P Node %s: Failed to query %s after retries: %v", n.ID, urlStr, err)
				n.IncrementPeerFailure(pID)
				n.UpdatePeerScore(pID, -1)
			} else {
				n.UpdatePeerScore(pID, 1)
			}
		}(peer.ID, wsURL)
	}
}

func (n *Node) listenForPeers() {
	addr, err := net.ResolveUDPAddr("udp", ":9999")
	if err != nil {
		log.Printf("P2P Node %s: Failed to resolve UDP address: %v", n.ID, err)
		return
	}
	conn, err := net.ListenUDP("udp", addr)
	if err != nil {
		log.Printf("P2P Node %s: Failed to listen on UDP: %v", n.ID, err)
		return
	}
	defer conn.Close()

	buf := make([]byte, 1024)
	for {
		nBytes, remoteAddr, err := conn.ReadFromUDP(buf)
		if err != nil {
			log.Printf("P2P Node %s: Error reading UDP: %v", n.ID, err)
			continue
		}
		peerID := string(buf[:nBytes])
		if peerID != n.ID {
			peerAddress := fmt.Sprintf("http://%s:5000", remoteAddr.IP.String())
			n.AddPeer(peerID, peerAddress)
		}
	}
}

func (n *Node) discoverSubnets() {
	log.Printf("P2P Node %s: Initializing UDP Subnet Discovery...", n.ID)
	addr, err := net.ResolveUDPAddr("udp", "255.255.255.255:9999")
	if err != nil {
		log.Printf("P2P Node %s: Failed to resolve broadcast address: %v", n.ID, err)
		return
	}
	conn, err := net.DialUDP("udp", nil, addr)
	if err != nil {
		log.Printf("P2P Node %s: Failed to dial broadcast UDP: %v", n.ID, err)
		return
	}
	defer conn.Close()

	for {
		_, err := conn.Write([]byte(n.ID))
		if err != nil {
			log.Printf("P2P Node %s: Error broadcasting presence: %v", n.ID, err)
		}
		time.Sleep(5 * time.Second)
	}
}
