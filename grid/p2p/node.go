package p2p

import "log"

type Node struct {
	ID string
}

func NewNode(id string) *Node {
	return &Node{ID: id}
}

func (n *Node) Start() {
	log.Printf("P2P Node %s started (mock libp2p)", n.ID)
}
