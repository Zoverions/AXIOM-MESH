package p2p

import (
	"log"
	"net"
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
	log.Printf("P2P Node %s started", n.ID)
	go n.listenForPeers()
	go n.discoverSubnets()
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
