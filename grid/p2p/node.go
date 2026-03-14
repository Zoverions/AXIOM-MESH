package p2p

import (
	"bytes"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/axiom-mesh/grid/types"
	"github.com/axiom-mesh/grid/consensus"
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
	ID            string
	PrivateKey    *ecdsa.PrivateKey
	PublicKey     string
	Peers         map[string]*PeerInfo
	PeerAddresses map[string]string // Mapping of Peer ID to API endpoint
	mu            sync.RWMutex
	Transport     Transport
	SyncCallback  func(msg types.CCIPMessage) bool // Used to inject messages into local ledger
}

func NewNode(id string) *Node {
	priv, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		log.Fatalf("Failed to generate ECDSA key for node: %v", err)
	}
	pubBytes := elliptic.Marshal(elliptic.P256(), priv.PublicKey.X, priv.PublicKey.Y)
	pubHex := hex.EncodeToString(pubBytes)

	// If id is provided, we might still want to use it as an alias, but for cryptographic identity
	// we use the public key as the true NodeID in signatures. For backwards compatibility with
	// tests and network discovery, we'll keep the provided ID for network presence, but we'll use
	// the public key for signing operations.

	return &Node{
		ID:            id,
		PrivateKey:    priv,
		PublicKey:     pubHex,
		Peers:         make(map[string]*PeerInfo),
		PeerAddresses: make(map[string]string),
		Transport:     NewHTTPTransport(),
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
	go n.SyncCCIPState()
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

				req := types.GraphSyncMessage{
					Type:   "sync",
					Node:   node,
					Edges:  edges,
					NodeID: n.PublicKey,
				}

				// Sign the node content + edges length as a simple deterministic payload
				payloadStr := fmt.Sprintf("%s:%d", node.ID, len(edges))
				sig, err := consensus.SignData(n.PrivateKey, []byte(payloadStr))
				if err == nil {
					req.Signature = sig
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
	log.Printf("P2P Node %s: Broadcasting web state for URL %s to %d peers", n.ID, state.URL, len(n.Peers))

	// Add signature if not present
	if state.Signature == "" {
		state.NodeID = n.PublicKey
		payloadStr := fmt.Sprintf("%s:%d", state.URL, state.TextLength)
		sig, err := consensus.SignData(n.PrivateKey, []byte(payloadStr))
		if err == nil {
			state.Signature = sig
		}
	}

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

	log.Printf("P2P Node %s: Broadcasting CCIP message %s to %d peers", n.ID, msg.MessageID, len(n.Peers))
	for pID, _ := range n.Peers {
		addr, ok := n.PeerAddresses[pID]
		if !ok {
			log.Printf("P2P Node %s: No address found for peer %s, skipping CCIP sync", n.ID, pID)
			continue
		}
		log.Printf("P2P Node %s: Syncing CCIP message with peer %s at %s", n.ID, pID, addr)
		go func(peerAddr string) {
			if err := n.Transport.SendCCIPMessage(peerAddr, msg); err != nil {
				log.Printf("P2P Node %s: Failed to sync CCIP message with %s: %v", n.ID, peerAddr, err)
			}
		}(addr)
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

func (n *Node) SyncCCIPState() {
	log.Printf("P2P Node %s: Starting CCIP State Reconciliation process", n.ID)
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		if len(n.Peers) == 0 {
			continue
		}
		if n.SyncCallback == nil {
			log.Printf("P2P Node %s: SyncCallback not set, skipping reconciliation", n.ID)
			continue
		}

		for pID, _ := range n.Peers {
			addr, ok := n.PeerAddresses[pID]
			if !ok {
				continue
			}

			// Fetch messages from peer
			msgs, err := n.Transport.FetchCCIPMessages(addr)
			if err != nil {
				log.Printf("P2P Node %s: Failed to fetch CCIP messages from peer %s: %v", n.ID, pID, err)
				continue
			}

			// Inject each message into the local ledger if missing
			syncCount := 0
			for _, msg := range msgs {
				if n.SyncCallback(msg) {
					syncCount++
				}
			}

			if syncCount > 0 {
				log.Printf("P2P Node %s: Synchronized %d missing CCIP messages from peer %s", n.ID, syncCount, pID)
			}
		}
	}
}
