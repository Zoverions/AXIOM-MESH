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
	"os"
	"strings"
	"sync"
	"time"

	"github.com/axiom-mesh/grid/consensus"
	"github.com/axiom-mesh/grid/types"

	"github.com/cloudflare/circl/sign/dilithium/mode3"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/gorilla/websocket"
)

// generateHybridSignature generates a phase 1 hybrid signature combining classical ECDSA
// and post-quantum Dilithium signatures.
func (n *Node) generateHybridSignature(data []byte) (string, error) {
	// 1. Classical ECDSA signature
	classicalSig, err := consensus.SignData(n.PrivateKey, data)
	if err != nil {
		return "", err
	}

	// 2. Post-Quantum Dilithium signature
	var pqSig [mode3.SignatureSize]byte
	mode3.SignTo(n.DilithiumPrivateKey, data, pqSig[:])
	pqSigHex := hex.EncodeToString(pqSig[:])

	// Return combined signatures separated by a delimiter
	return classicalSig + ":" + pqSigHex, nil
}

type PeerInfo struct {
	ID       string
	Address  string
	LastSeen time.Time
	Score    int
	Failures int
	Manifest types.CapabilityManifest
	Profile  types.NodeCapabilityProfile
}

type Node struct {
	ShardID                 string // Sharded consensus identifier
	ID                      string
	PrivateKey              *ecdsa.PrivateKey
	PublicKey               string
	KyberPublicKey          string // Phase 1 hybrid signature scheme (Classical + PQ)
	DilithiumPrivateKey     *mode3.PrivateKey
	DilithiumPublicKey      *mode3.PublicKey
	Peers                   map[string]*PeerInfo
	PeerAddresses           map[string]string // Mapping of Peer ID to API endpoint
	Transport               Transport
	SyncCallback            func(msg types.CCIPMessage) bool // Used to inject messages into local ledger
	SyncSwarmCallback       func(msg types.Swarm) bool       // Used to inject swarms into local ledger
	SyncCRDTShardCallback   func(shard types.CRDTShard) bool
	SyncDriftReportCallback func(report types.DriftReport) bool
	mu                      sync.RWMutex
}

func NewNode(id string, priv *ecdsa.PrivateKey) *Node {
	pubBytes := crypto.FromECDSAPub(&priv.PublicKey)
	pubHex := hex.EncodeToString(pubBytes)

	// Post-Quantum Kyber Key Generation Mock
	kyberPub := "PQ_Kyber1024_" + pubHex[:16]

	pqPub, pqPriv, _ := mode3.GenerateKey(nil)

	shardID := os.Getenv("GRID_SHARD_ID")
	if shardID == "" {
		shardID = "global" // Default fallback if not set
	}

	return &Node{
		ID:                  id,
		ShardID:             shardID,
		PrivateKey:          priv,
		PublicKey:           pubHex,
		KyberPublicKey:      kyberPub,
		DilithiumPrivateKey: pqPriv,
		DilithiumPublicKey:  pqPub,
		Peers:               make(map[string]*PeerInfo),
		PeerAddresses:       make(map[string]string),
		Transport:           NewHTTPTransport(),
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
	n.refreshAdaptiveDifficultyLocked()
}

func (n *Node) RemovePeer(id string) {
	n.mu.Lock()
	defer n.mu.Unlock()
	if _, exists := n.Peers[id]; exists {
		delete(n.Peers, id)
		log.Printf("P2P Node %s: Removed peer %s", n.ID, id)
		n.refreshAdaptiveDifficultyLocked()
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
			n.refreshAdaptiveDifficultyLocked()
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
		n.refreshAdaptiveDifficultyLocked()
		n.mu.Unlock()
	}
}

func (n *Node) Start() {
	log.Printf("P2P Node %s started", n.ID)
	n.updateAdaptiveDifficulty()
	go n.listenForPeers()
	go n.discoverSubnets()
	go n.heartbeatLoop()
	go n.SyncCCIPState()
	go n.SyncSwarmState()
	go n.SyncCRDTState()
	go n.SyncDriftState()
}

// PeerCount returns the known peer count.
func (n *Node) PeerCount() int {
	n.mu.RLock()
	defer n.mu.RUnlock()
	return len(n.Peers)
}

func (n *Node) updateAdaptiveDifficulty() {
	n.mu.Lock()
	defer n.mu.Unlock()
	n.refreshAdaptiveDifficultyLocked()
}

func (n *Node) refreshAdaptiveDifficultyLocked() {
	// Include local node (+1) so network size is never under-reported.
	consensus.SetNetworkNodeCount(int64(len(n.Peers) + 1))
}

func (n *Node) SyncCRDTState() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	var lastSync uint64 = 0

	for range ticker.C {
		if n.SyncCRDTShardCallback == nil {
			continue
		}

		currentSyncTime := uint64(time.Now().Unix())
		peers := n.snapshotPeers()
		for _, peer := range peers {
			syncCount := 0
			shards, err := n.Transport.FetchCRDTShards(peer.Address, lastSync)
			if err != nil {
				log.Printf("P2P Node %s: Failed to fetch crdt shards from peer %s: %v", n.ID, peer.ID, err)
				continue
			}
			for _, shard := range shards {
				if n.SyncCRDTShardCallback(shard) {
					syncCount++
				}
			}

			if syncCount > 0 {
				log.Printf("P2P Node %s: Synchronized %d crdt shards from peer %s", n.ID, syncCount, peer.ID)
			}
		}
		lastSync = currentSyncTime
	}
}

func (n *Node) SyncDriftState() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	var lastSync uint64 = 0

	for range ticker.C {
		if n.SyncDriftReportCallback == nil {
			continue
		}

		currentSyncTime := uint64(time.Now().Unix())
		peers := n.snapshotPeers()
		for _, peer := range peers {
			syncCount := 0
			reports, err := n.Transport.FetchDriftReports(peer.Address, lastSync)
			if err != nil {
				log.Printf("P2P Node %s: Failed to fetch drift reports from peer %s: %v", n.ID, peer.ID, err)
				continue
			}

			for _, report := range reports {
				if n.SyncDriftReportCallback(report) {
					syncCount++
				}
			}

			if syncCount > 0 {
				log.Printf("P2P Node %s: Synchronized %d drift reports from peer %s", n.ID, syncCount, peer.ID)
			}
		}
		lastSync = currentSyncTime
	}
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
		wsURL := strings.Replace(peer.Address, "https://", "wss://", 1) + "/ws/graph"
		go func(pID, urlStr string) {
			err := sendWithBackoff(func() error {

				// Setup TLS dialer since mTLS is enabled
				dialer := &websocket.Dialer{
					Proxy:            http.ProxyFromEnvironment,
					HandshakeTimeout: 45 * time.Second,
				}
				if transport, ok := n.Transport.(*HTTPTransport); ok {
					if transport.client.Transport != nil {
						if httpTransport, ok := transport.client.Transport.(*http.Transport); ok {
							dialer.TLSClientConfig = httpTransport.TLSClientConfig
						}
					}
				}

				// Create header
				header := make(http.Header)
				httpReq, _ := http.NewRequest("GET", urlStr, nil)
				if transport, ok := n.Transport.(*HTTPTransport); ok {
					transport.BuildSignedHeaders(httpReq, []byte(""))
					header = httpReq.Header
				}
				c, _, err := dialer.Dial(urlStr, header)
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
				sig, err := n.generateHybridSignature([]byte(payloadStr))
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
		sig, err := n.generateHybridSignature([]byte(payloadStr))
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
				req, err := http.NewRequest("POST", addr+"/cache?sync=true", bytes.NewBuffer(data))
				if err != nil {
					return err
				}
				req.Header.Set("Content-Type", "application/json")
				var resp *http.Response
				if transport, ok := n.Transport.(*HTTPTransport); ok {
					if err := transport.BuildSignedHeaders(req, data); err != nil {
						return err
					}
					resp, err = transport.client.Do(req)
				} else {
					resp, err = http.DefaultClient.Do(req)
				}
				if err != nil {
					return err
				}
				defer resp.Body.Close()
				if err != nil {
					return err
				}

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

func (n *Node) BroadcastCRDTShard(shard types.CRDTShard) {
	peers := n.snapshotPeers()
	log.Printf("P2P Node %s: Broadcasting CRDT Shard %s to %d peers", n.ID, shard.ShardID, len(peers))
	for _, peer := range peers {
		go func(pID, addr string) {
			err := sendWithBackoff(func() error {
				return n.Transport.SendCRDTShard(addr, shard)
			})
			if err != nil {
				log.Printf("P2P Node %s: Failed to sync CRDT Shard with %s: %v", n.ID, addr, err)
				n.IncrementPeerFailure(pID)
				n.UpdatePeerScore(pID, -1)
			} else {
				n.UpdatePeerScore(pID, 1)
			}
		}(peer.ID, peer.Address)
	}
}

func (n *Node) BroadcastDriftReport(report types.DriftReport) {
	peers := n.snapshotPeers()
	log.Printf("P2P Node %s: Broadcasting Drift Report for node %s to %d peers", n.ID, report.NodeID, len(peers))
	for _, peer := range peers {
		go func(pID, addr string) {
			err := sendWithBackoff(func() error {
				return n.Transport.SendDriftReport(addr, report)
			})
			if err != nil {
				log.Printf("P2P Node %s: Failed to sync Drift Report with %s: %v", n.ID, addr, err)
				n.IncrementPeerFailure(pID)
				n.UpdatePeerScore(pID, -1)
			} else {
				n.UpdatePeerScore(pID, 1)
			}
		}(peer.ID, peer.Address)
	}
}

func (n *Node) BroadcastSwarm(msg types.Swarm) {
	// Sign the swarm ID to fulfill the hybrid signature requirement for high-trust pathways
	if msg.Signature == "" {
		sig, err := n.generateHybridSignature([]byte(msg.ID))
		if err == nil {
			msg.Signature = sig
		}
	}

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

	// Generate a lightweight ZK proof for the query if not provided
	// Since the node does not have a real private key stored for this demo, we use a deterministic secret derived from Node ID
	if proof == "" {
		secretHex := fmt.Sprintf("%x", sha256.Sum256([]byte(n.ID)))
		var err error
		proof, err = consensus.GenerateGraphQueryProof(query, secretHex)
		if err != nil {
			log.Printf("P2P Node %s: Failed to generate graph query proof: %v", n.ID, err)
			proof = ""
		}
	}
	peers := n.snapshotPeers()

	log.Printf("P2P Node %s: Querying network for '%s' with ZKP to %d peers", n.ID, query, len(peers))

	var wg sync.WaitGroup
	var mu sync.Mutex
	var allNodes []PeerQueryResult

	for _, peer := range peers {
		wg.Add(1)
		wsURL := strings.Replace(peer.Address, "https://", "wss://", 1) + "/ws/graph"
		go func(pID, urlStr string) {
			defer wg.Done()
			var peerNodes []PeerQueryResult
			err := sendWithBackoff(func() error {

				// Setup TLS dialer since mTLS is enabled
				dialer := &websocket.Dialer{
					Proxy:            http.ProxyFromEnvironment,
					HandshakeTimeout: 45 * time.Second,
				}
				if transport, ok := n.Transport.(*HTTPTransport); ok {
					if transport.client.Transport != nil {
						if httpTransport, ok := transport.client.Transport.(*http.Transport); ok {
							dialer.TLSClientConfig = httpTransport.TLSClientConfig
						}
					}
				}

				// Create header
				header := make(http.Header)
				httpReq, _ := http.NewRequest("GET", urlStr, nil)
				if transport, ok := n.Transport.(*HTTPTransport); ok {
					transport.BuildSignedHeaders(httpReq, []byte(""))
					header = httpReq.Header
				}
				c, _, err := dialer.Dial(urlStr, header)
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
			n.AddPeer(peerID, fmt.Sprintf("https://%s:5000", remoteAddr.IP.String()))
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
				req, err := http.NewRequest("POST", addr+"/peers/manifests", bytes.NewBuffer(data))
				if err != nil {
					return err
				}
				req.Header.Set("Content-Type", "application/json")
				var resp *http.Response
				if transport, ok := n.Transport.(*HTTPTransport); ok {
					if err := transport.BuildSignedHeaders(req, data); err != nil {
						return err
					}
					resp, err = transport.client.Do(req)
				} else {
					resp, err = http.DefaultClient.Do(req)
				}
				if err != nil {
					return err
				}
				defer resp.Body.Close()
				if err != nil {
					return err
				}

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

func (n *Node) UpdatePeerProfile(id string, profile types.NodeCapabilityProfile) {
	n.mu.Lock()
	updated := false
	peer, exists := n.Peers[id]
	if !exists {
		peer = &PeerInfo{ID: id, LastSeen: time.Now()}
		n.Peers[id] = peer
	}

	// CRDT: Only update if the incoming version is strictly greater
	if profile.Version > peer.Profile.Version || peer.Profile.Version == 0 {
		peer.Profile = profile
		peer.LastSeen = time.Now()
		updated = true
		log.Printf("P2P Node %s: Updated profile for peer %s (version: %d)", n.ID, id, profile.Version)
	}
	n.mu.Unlock()

	if updated {
		// Re-gossip the updated profile to other peers to propagate it through the network
		go n.gossipProfile(profile, id)
	}
}

func (n *Node) BroadcastNodeProfile(profile types.NodeCapabilityProfile) {
	// Ensure the profile's NodeID is set to this node's ID
	if profile.NodeID == "" {
		profile.NodeID = n.ID
	}

	// Simple CRDT delta compression: only compute hash and broadcast if changed
	hashBytes, _ := json.Marshal(profile)
	newHash := fmt.Sprintf("%x", sha256.Sum256(hashBytes))

	// Increment version locally
	n.mu.Lock()
	if _, exists := n.Peers[n.ID]; !exists {
		// Initialize self peer if missing
		n.Peers[n.ID] = &PeerInfo{ID: n.ID, LastSeen: time.Now()}
	}

	if n.Peers[n.ID].Profile.Hash == newHash && n.Peers[n.ID].Profile.Version > 0 {
		n.mu.Unlock()
		return // No change, do not broadcast
	}

	profile.Version = n.Peers[n.ID].Profile.Version + 1
	profile.Hash = newHash
	n.Peers[n.ID].Profile = profile
	n.mu.Unlock()

	n.gossipProfile(profile, n.ID)
}

func (n *Node) gossipProfile(profile types.NodeCapabilityProfile, sourceNodeID string) {
	peers := n.snapshotPeers()
	log.Printf("P2P Node %s: Gossiping Capability Profile (v%d) from %s to %d peers", n.ID, profile.Version, sourceNodeID, len(peers))

	type ProfilePayload struct {
		NodeID  string                      `json:"nodeId"`
		Profile types.NodeCapabilityProfile `json:"profile"`
	}

	payload := ProfilePayload{
		NodeID:  sourceNodeID,
		Profile: profile,
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
				req, err := http.NewRequest("POST", addr+"/peers/profiles?sync=true", bytes.NewBuffer(data))
				if err != nil {
					return err
				}
				req.Header.Set("Content-Type", "application/json")
				var resp *http.Response
				if transport, ok := n.Transport.(*HTTPTransport); ok {
					if err := transport.BuildSignedHeaders(req, data); err != nil {
						return err
					}
					resp, err = transport.client.Do(req)
				} else {
					resp, err = http.DefaultClient.Do(req)
				}
				if err != nil {
					return err
				}
				defer resp.Body.Close()
				if err != nil {
					return err
				}

				if resp.StatusCode < 200 || resp.StatusCode >= 300 {
					return fmt.Errorf("status code %d", resp.StatusCode)
				}
				return nil
			})
			if err != nil {
				log.Printf("P2P Node %s: Failed to gossip profile with %s: %v", n.ID, addr, err)
			}
		}(peer.ID, peer.Address)
	}
}

type ProfileWithAddress struct {
	types.NodeCapabilityProfile
	Address string `json:"address"`
}

func (n *Node) GetPeerProfiles() map[string]ProfileWithAddress {
	n.mu.RLock()
	defer n.mu.RUnlock()
	profiles := make(map[string]ProfileWithAddress)
	for id, peer := range n.Peers {
		if peer.Profile.NodeID != "" && id != n.ID {
			profiles[id] = ProfileWithAddress{
				NodeCapabilityProfile: peer.Profile,
				Address:               peer.Address,
			}
		}
	}
	return profiles
}
