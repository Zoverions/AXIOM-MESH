package p2p

import (
	"log"
	"time"
)

type Node struct {
	ID    string
	Peers []string
}

func NewNode(id string) *Node {
	return &Node{
		ID:    id,
		Peers: make([]string, 0),
	}
}

func (n *Node) Start() {
	log.Printf("P2P Node %s started (mock libp2p)", n.ID)
	go n.discoverSubnets()
}

func (n *Node) discoverSubnets() {
	// Simulating an active discovery loop over DHT/MDNS
	log.Printf("P2P Node %s: Initializing DHT Subnet Discovery...", n.ID)
	time.Sleep(1 * time.Second)

	// Mock found peers
	foundPeers := []string{"node-1", "node-alpha", "node-omega"}
	n.Peers = append(n.Peers, foundPeers...)
	log.Printf("P2P Node %s: Discovered subnets and connected to peers: %v", n.ID, foundPeers)
}
