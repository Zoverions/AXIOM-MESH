package p2p

import (
	"bytes"
	"crypto/ecdsa"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/axiom-mesh/grid/consensus"
	"github.com/axiom-mesh/grid/types"

	"github.com/ethereum/go-ethereum/crypto"
	"github.com/gorilla/websocket"
)

type PeerInfo struct {
	ID       string
	Address  string
	LastSeen time.Time
	Score    int
	Failures int
	Manifest types.CapabilityManifest
}

type Node struct {
	ID                string
	PrivateKey        *ecdsa.PrivateKey
	PublicKey         string
	Peers             map[string]*PeerInfo
	PeerAddresses     map[string]string // Mapping of Peer ID to API endpoint
	Transport         Transport
	SyncCallback      func(msg types.CCIPMessage) bool // Used to inject messages into local ledger
	SyncSwarmCallback func(msg types.Swarm) bool       // Used to inject swarms into local ledger
	mu                sync.RWMutex
}

func NewNode(id string, priv *ecdsa.PrivateKey) *Node {
	pubBytes := crypto.FromECDSAPub(&priv.PublicKey)
	pubHex := hex.EncodeToString(pubBytes)

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
		peer.Address = address
		return
	}

	n.Peers[id] = &PeerInfo{ID: id, Address: address, LastSeen: time.Now()}
	log.Printf("P2P Node %s: Discovered new peer: %s at %s", n.ID, id, address)
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
			delete(n.Peers, id)
			log.Printf("P2P Node %s: Evicted peer %s due to max failures", n.ID, id)
		}
	}
}

func (n *Node) SyncSwarmState() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		if n.SyncSwarmCallback == nil {
			continue
		}

		peers := n.snapshotPeers()
		for _, peer := range peers {
			syncCount := 0
			// Fetch messages from peer
			msgs, err := n.Transport.FetchSwarms(peer.Address)
			if err != nil {
				log.Printf("P2P Node %s: Failed to fetch swarms from peer %s: %v", n.ID, peer.ID, err)
				continue
			}
			for _, msg := range msgs {
				if n.SyncSwarmCallback(msg) {
					syncCount++
				}
			}

			if syncCount > 0 {
				log.Printf("P2P Node %s: Synchronized %d missing swarms from peer %s", n.ID, syncCount, peer.ID)
			}
		}
	}
}

func (n *Node) heartbeatLoop() {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		n.mu.Lock()
		for id, peer := range n.Peers {
			if time.Since(peer.LastSeen) > 30*time.Second || peer.Score <= -5 {
				delete(n.Peers, id)
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
	go n.SyncSwarmState()
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

func (n *Node) snapshotPeers() []PeerInfo {
	n.mu.RLock()
	defer n.mu.RUnlock()
	peers := make([]PeerInfo, 0, len(n.Peers))
	for _, p := range n.Peers {
		peers = append(peers, *p)
	}
	return peers
}

func (n *Node) BroadcastGraphUpdate(node types.GraphNode, edges []types.GraphEdge) {
	peers := n.snapshotPeers()
	for _, peer := range peers {
		wsURL := strings.Replace(peer.Address, "http://", "ws://", 1) + "/ws/graph"
		go func(pID, urlStr string) {
			err := sendWithBackoff(func() error {
				c, _, err := websocket.DefaultDialer.Dial(urlStr, nil)
				if err != nil {
					return fmt.Errorf("dial: %w", err)
				}
				defer c.Close()

				// Sign the node content + edges length as a simple deterministic payload
				req := types.GraphSyncMessage{
					Type:   "sync",
					Node:   node,
					Edges:  edges,
					NodeID: n.PublicKey,
				}
				payloadStr := fmt.Sprintf("%s:%d", node.ID, len(edges))
				sig, err := consensus.SignData(n.PrivateKey, []byte(payloadStr))
				if err == nil {
					req.Signature = sig
				}

				return c.WriteJSON(req)
			})

			if err != nil {
				n.IncrementPeerFailure(pID)
				n.UpdatePeerScore(pID, -1)
			} else {
				n.UpdatePeerScore(pID, 1)
			}
		}(peer.ID, wsURL)
	}
}

func (n *Node) BroadcastWebState(state types.WebState) {
	if state.Signature == "" {
		state.NodeID = n.PublicKey
		payloadStr := fmt.Sprintf("%s:%d", state.URL, state.TextLength)
		sig, err := consensus.SignData(n.PrivateKey, []byte(payloadStr))
		if err == nil {
			state.Signature = sig
		}
	}

	peers := n.snapshotPeers()

	log.Printf("P2P Node %s: Broadcasting web state for URL %s to %d peers", n.ID, state.URL, len(peers))
	for _, peer := range peers {
		go func(pID, addr string) {
			err := sendWithBackoff(func() error {
				data, _ := json.Marshal(state)
				resp, err := http.Post(addr+"/cache?sync=true", "application/json", bytes.NewBuffer(data))
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
				n.IncrementPeerFailure(pID)
				n.UpdatePeerScore(pID, -1)
			} else {
				n.UpdatePeerScore(pID, 1)
			}
		}(peer.ID, peer.Address)
	}
}

func (n *Node) BroadcastSwarm(msg types.Swarm) {
	peers := n.snapshotPeers()

	log.Printf("P2P Node %s: Broadcasting swarm message %s to %d peers", n.ID, msg.ID, len(peers))
	for _, peer := range peers {
		go func(pID, addr string) {
			err := sendWithBackoff(func() error {
				return n.Transport.SendSwarm(addr, msg)
			})
			if err != nil {
				log.Printf("P2P Node %s: Failed to sync swarm message with %s: %v", n.ID, addr, err)
				n.IncrementPeerFailure(pID)
				n.UpdatePeerScore(pID, -1)
			} else {
				n.UpdatePeerScore(pID, 1)
			}
		}(peer.ID, peer.Address)
	}
}

func (n *Node) BroadcastCCIPMessage(msg types.CCIPMessage) {
	peers := n.snapshotPeers()
	log.Printf("P2P Node %s: Broadcasting CCIP message %s to %d peers", n.ID, msg.MessageID, len(peers))
	for _, peer := range peers {
		go func(pID, addr string) {
			err := sendWithBackoff(func() error {
				return n.Transport.SendCCIPMessage(addr, msg)
			})
			if err != nil {
				log.Printf("P2P Node %s: Failed to sync CCIP message with %s: %v", n.ID, addr, err)
				n.IncrementPeerFailure(pID)
				n.UpdatePeerScore(pID, -1)
			} else {
				n.UpdatePeerScore(pID, 1)
			}
		}(peer.ID, peer.Address)
	}
}

type PeerQueryResult struct {
	NodeID      string
	Node        types.GraphNode
	Score       int
	SourcePeer  string
	SourceScore int
}

func (n *Node) QueryNetwork(query string, proof string) []PeerQueryResult {
	peers := n.snapshotPeers()

	log.Printf("P2P Node %s: Querying network for '%s' with ZKP to %d peers", n.ID, query, len(peers))

	var wg sync.WaitGroup
	var mu sync.Mutex
	var allNodes []PeerQueryResult

	for _, peer := range peers {
		wg.Add(1)
		wsURL := strings.Replace(peer.Address, "http://", "ws://", 1) + "/ws/graph"
		go func(pID, urlStr string) {
			defer wg.Done()
			var peerNodes []PeerQueryResult
			err := sendWithBackoff(func() error {
				c, _, err := websocket.DefaultDialer.Dial(urlStr, nil)
				if err != nil {
					return err
				}
				defer c.Close()

				req := types.GraphSyncMessage{Type: "query", Query: query, Proof: proof}
				if err := c.WriteJSON(req); err != nil {
					return err
				}

				var res struct {
					Type  string `json:"type"`
					Nodes []struct {
						Node  types.GraphNode `json:"node"`
						Score int             `json:"score"`
					} `json:"nodes"`
					Error string `json:"error,omitempty"`
				}
				if err := c.ReadJSON(&res); err != nil {
					return err
				}

				if res.Error != "" {
					return fmt.Errorf("peer returned error: %s", res.Error)
				}

				for _, scored := range res.Nodes {
					peerNodes = append(peerNodes, PeerQueryResult{NodeID: scored.Node.ID, Node: scored.Node, Score: scored.Score, SourcePeer: pID, SourceScore: 1})
				}
				return nil
			})
			if err != nil {
				n.IncrementPeerFailure(pID)
				n.UpdatePeerScore(pID, -1)
			} else {
				n.UpdatePeerScore(pID, 1)
				mu.Lock()
				allNodes = append(allNodes, peerNodes...)
				mu.Unlock()
			}
		}(peer.ID, wsURL)
	}

	wg.Wait()
	return allNodes
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
			n.AddPeer(peerID, fmt.Sprintf("http://%s:5000", remoteAddr.IP.String()))
		}
	}
}

func (n *Node) discoverSubnets() {
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
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		if n.SyncCallback == nil {
			continue
		}

		peers := n.snapshotPeers()
		for _, peer := range peers {
			syncCount := 0
			// Fetch messages from peer
			msgs, err := n.Transport.FetchCCIPMessages(peer.Address)
			if err != nil {
				log.Printf("P2P Node %s: Failed to fetch CCIP messages from peer %s: %v", n.ID, peer.ID, err)
				continue
			}

			for _, msg := range msgs {
				if n.SyncCallback(msg) {
					syncCount++
				}
			}

			if syncCount > 0 {
				log.Printf("P2P Node %s: Synchronized %d missing CCIP messages from peer %s", n.ID, syncCount, peer.ID)
			}
		}
	}
}

func (n *Node) UpdatePeerManifest(id string, manifest types.CapabilityManifest) {
	n.mu.Lock()
	defer n.mu.Unlock()
	if peer, exists := n.Peers[id]; exists {
		// CRDT: Only update if the incoming version is strictly greater
		if manifest.Version > peer.Manifest.Version || peer.Manifest.Version == 0 {
			peer.Manifest = manifest
			log.Printf("P2P Node %s: Updated manifest for peer %s (tier: %s, version: %d)", n.ID, id, manifest.Tier, manifest.Version)
		}
	}
}

func (n *Node) BroadcastCapabilityManifest(manifest types.CapabilityManifest) {
	// Simple CRDT delta compression: only compute hash and broadcast if changed
	hashBytes, _ := json.Marshal(manifest)
	newHash := fmt.Sprintf("%x", sha256.Sum256(hashBytes))

	// Increment version locally
	n.mu.Lock()
	if _, exists := n.Peers[n.ID]; !exists {
		// Initialize self peer if missing
		n.Peers[n.ID] = &PeerInfo{ID: n.ID, LastSeen: time.Now()}
	}

	if n.Peers[n.ID].Manifest.Hash == newHash && n.Peers[n.ID].Manifest.Version > 0 {
		n.mu.Unlock()
		return // No change, do not broadcast
	}

	manifest.Version = n.Peers[n.ID].Manifest.Version + 1
	manifest.Hash = newHash
	n.Peers[n.ID].Manifest = manifest
	n.mu.Unlock()

	n.gossipManifest(manifest, n.PublicKey)
}

func (n *Node) gossipManifest(manifest types.CapabilityManifest, sourceNodeID string) {
	peers := n.snapshotPeers()
	log.Printf("P2P Node %s: Gossiping Capability Manifest (v%d) from %s to %d peers", n.ID, manifest.Version, sourceNodeID, len(peers))

	type ManifestPayload struct {
		NodeID   string                   `json:"nodeId"`
		Manifest types.CapabilityManifest `json:"manifest"`
	}

	payload := ManifestPayload{
		NodeID:   sourceNodeID,
		Manifest: manifest,
	}

	for _, peer := range peers {
		if peer.ID == n.ID {
			continue
		} // skip self
		go func(pID, addr string) {
			err := sendWithBackoff(func() error {
				data, err := json.Marshal(payload)
				if err != nil {
					return err
				}
				resp, err := http.Post(addr+"/peers/manifests", "application/json", bytes.NewBuffer(data))
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
				log.Printf("P2P Node %s: Failed to gossip manifest with %s: %v", n.ID, addr, err)
			}
		}(peer.ID, peer.Address)
	}
}

type ManifestWithAddress struct {
	types.CapabilityManifest
	Address string `json:"address"`
}

func (n *Node) GetPeerManifests() map[string]ManifestWithAddress {
	n.mu.RLock()
	defer n.mu.RUnlock()
	manifests := make(map[string]ManifestWithAddress)
	for id, peer := range n.Peers {
		if peer.Manifest.Tier != "" && id != n.ID {
			manifests[id] = ManifestWithAddress{
				CapabilityManifest: peer.Manifest,
				Address:            peer.Address,
			}
		}
	}
	return manifests
}
