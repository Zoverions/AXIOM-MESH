package p2p

import (
	"log"
	"net"
	"time"

	"github.com/axiom-mesh/grid/types"
)

type Node struct {
	ID            string
	Peers         []string
	PeerAddresses map[string]string // Mapping of Peer ID to API endpoint
}

func NewNode(id string) *Node {
	return &Node{
		ID:            id,
		Peers:         make([]string, 0),
		PeerAddresses: make(map[string]string),
	}
}

func (n *Node) Start() {
	log.Printf("P2P Node %s started", n.ID)
	go n.listenForPeers()
	go n.discoverSubnets()
}

func (n *Node) BroadcastGraphUpdate(node types.GraphNode, edges []types.GraphEdge) {
	log.Printf("P2P Node %s: Broadcasting graph update for node %s", n.ID, node.ID)
	for _, peer := range n.Peers {
		// In a real P2P system, we'd have a mapping of peer IDs to their API addresses.
		// For this mock, we assume peers are reachable on localhost with a specific naming convention or discovery.
		// Since we only have one node in this environment, we just log it.
		log.Printf("P2P Node %s: Syncing graph with peer %s (mocked)", n.ID, peer)
	}
}

func (n *Node) BroadcastWebState(state types.WebState) {
	log.Printf("P2P Node %s: Broadcasting web state for URL %s to %d peers", n.ID, state.URL, len(n.Peers))
	for _, peerID := range n.Peers {
		addr, ok := n.PeerAddresses[peerID]
		if !ok {
			log.Printf("P2P Node %s: No address found for peer %s, skipping sync", n.ID, peerID)
			continue
		}
		log.Printf("P2P Node %s: Syncing web state with peer %s at %s", n.ID, peerID, addr)
		// In a real implementation, we would perform an HTTP POST to addr + "/cache?sync=true"
	}
}

func (n *Node) QueryNetwork(query string, proof string) {
	log.Printf("P2P Node %s: Querying network for '%s' with ZKP", n.ID, query)
	// Mock implementation of network-wide graph query via WebSockets
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
		nBytes, _, err := conn.ReadFromUDP(buf)
		if err != nil {
			log.Printf("P2P Node %s: Error reading UDP: %v", n.ID, err)
			continue
		}
		peerID := string(buf[:nBytes])
		if peerID != n.ID {
			found := false
			for _, p := range n.Peers {
				if p == peerID {
					found = true
					break
				}
			}
			if !found {
				n.Peers = append(n.Peers, peerID)
				log.Printf("P2P Node %s: Discovered new peer: %s", n.ID, peerID)
			}
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
