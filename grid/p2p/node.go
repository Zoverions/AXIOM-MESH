package p2p

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/axiom-mesh/grid/types"
	"github.com/gorilla/websocket"
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
	for _, peerID := range n.Peers {
		addr, ok := n.PeerAddresses[peerID]
		if !ok {
			continue
		}
		wsURL := strings.Replace(addr, "http://", "ws://", 1) + "/ws/graph"
		go func(urlStr string) {
			c, _, err := websocket.DefaultDialer.Dial(urlStr, nil)
			if err != nil {
				log.Printf("P2P Node %s: Failed to connect to %s: %v", n.ID, urlStr, err)
				return
			}
			defer c.Close()

			req := map[string]interface{}{
				"type":  "sync",
				"node":  node,
				"edges": edges,
			}
			if err := c.WriteJSON(req); err != nil {
				log.Printf("P2P Node %s: Failed to write to %s: %v", n.ID, urlStr, err)
			}
		}(wsURL)
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

		go func(a string) {
			data, _ := json.Marshal(state)
			resp, err := http.Post(a+"/cache?sync=true", "application/json", bytes.NewBuffer(data))
			if err != nil {
				log.Printf("P2P Node %s: Failed to sync with %s: %v", n.ID, a, err)
				return
			}
			resp.Body.Close()
		}(addr)
	}
}

func (n *Node) QueryNetwork(query string, proof string) {
	log.Printf("P2P Node %s: Querying network for '%s' with ZKP", n.ID, query)
	for _, peerID := range n.Peers {
		addr, ok := n.PeerAddresses[peerID]
		if !ok {
			continue
		}
		wsURL := strings.Replace(addr, "http://", "ws://", 1) + "/ws/graph"
		go func(urlStr string) {
			c, _, err := websocket.DefaultDialer.Dial(urlStr, nil)
			if err != nil {
				log.Printf("P2P Node %s: Failed to connect to %s: %v", n.ID, urlStr, err)
				return
			}
			defer c.Close()

			req := map[string]interface{}{
				"type":  "query",
				"query": query,
				"proof": proof,
			}
			if err := c.WriteJSON(req); err != nil {
				log.Printf("P2P Node %s: Failed to write query to %s: %v", n.ID, urlStr, err)
				return
			}

			var res map[string]interface{}
			if err := c.ReadJSON(&res); err == nil {
				log.Printf("P2P Node %s: Received query result from %s: %v", n.ID, urlStr, res)
			}
		}(wsURL)
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
			found := false
			for _, p := range n.Peers {
				if p == peerID {
					found = true
					break
				}
			}
			if !found {
				n.Peers = append(n.Peers, peerID)
				n.PeerAddresses[peerID] = fmt.Sprintf("http://%s:5000", remoteAddr.IP.String())
				log.Printf("P2P Node %s: Discovered new peer: %s at %s", n.ID, peerID, n.PeerAddresses[peerID])
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
