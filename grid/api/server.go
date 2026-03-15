package api

import (
	"encoding/json"
	"log"
	"net/http"
	"sort"

	"github.com/axiom-mesh/grid/blockchain"
	"github.com/axiom-mesh/grid/p2p"
	"strings"
	"fmt"

	"github.com/axiom-mesh/grid/consensus"
	"github.com/axiom-mesh/grid/types"
	"github.com/gorilla/websocket"
)

type Server struct {
	ledger   *blockchain.Ledger
	p2pNode  *p2p.Node
	upgrader websocket.Upgrader
}

func NewServer(ledger *blockchain.Ledger, p2pNode *p2p.Node) *Server {
	if p2pNode != nil {
		p2pNode.SyncCallback = func(msg types.CCIPMessage) bool {
			if _, exists := ledger.GetCCIPMessage(msg.MessageID); !exists {
				ledger.AddCCIPMessage(msg)
				return true
			}
			return false
		}
		p2pNode.SyncSwarmCallback = func(msg types.Swarm) bool {
			if _, exists := ledger.GetSwarm(msg.ID); !exists {
				ledger.CreateSwarm(msg)
				return true
			}
			return false
		}
	}

	return &Server{
		ledger:  ledger,
		p2pNode: p2pNode,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
	}
}

func (s *Server) Start(addr string) error {
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]string{"status": "ok", "component": "grid"})
	})

	http.HandleFunc("/skills", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == "GET" {
			json.NewEncoder(w).Encode(s.ledger.GetSkills())
		} else if r.Method == "POST" {
			var skill types.SkillVector
			if err := json.NewDecoder(r.Body).Decode(&skill); err == nil {
				if skill.NodeID == "" {
					http.Error(w, "NodeID is required for PoER skill submission", http.StatusBadRequest)
					return
				}

				bond, ok := s.ledger.GetBond(skill.NodeID)
				if !ok || bond.Status != "active" {
					http.Error(w, "Node does not have an active compute bond", http.StatusForbidden)
					return
				}

				if consensus.CalculatePoERScore(skill.Task, skill.PoERHash) < consensus.Difficulty {
					http.Error(w, "PoER verification failed", http.StatusForbidden)
					return
				}
				s.ledger.AddSkill(skill)
				json.NewEncoder(w).Encode(map[string]string{"status": "success"})
			} else {
				http.Error(w, err.Error(), http.StatusBadRequest)
			}
		}
	})

	http.HandleFunc("/stake", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == "POST" {
			var bond types.ComputeBond
			if err := json.NewDecoder(r.Body).Decode(&bond); err == nil {
				if bond.Amount < 100 {
					http.Error(w, "Minimum stake amount is 100", http.StatusBadRequest)
					return
				}

				if existingBond, ok := s.ledger.GetBond(bond.NodeID); ok && existingBond.Status == "active" {
					bond.Amount += existingBond.Amount
				}

				if bond.Status == "" {
					bond.Status = "active"
				}

				s.ledger.Stake(bond)
				json.NewEncoder(w).Encode(map[string]string{"status": "success", "nodeId": bond.NodeID})
			} else {
				http.Error(w, err.Error(), http.StatusBadRequest)
			}
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})

	http.HandleFunc("/slash", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == "POST" {
			var payload struct {
				NodeID string `json:"nodeId"`
				Amount int    `json:"amount"`
				TxHash string `json:"txHash,omitempty"`
			}
			if err := json.NewDecoder(r.Body).Decode(&payload); err == nil {
				if payload.NodeID == "" || payload.Amount <= 0 {
					http.Error(w, "Invalid nodeId or amount", http.StatusBadRequest)
					return
				}

				if err := s.ledger.Slash(payload.NodeID, payload.Amount, payload.TxHash); err != nil {
					http.Error(w, err.Error(), http.StatusBadRequest)
					return
				}

				// Depending on the network requirements, we could also broadcast this slash event,
				// but since slash events originated from chain, we mostly care about updating local state.
				json.NewEncoder(w).Encode(map[string]string{"status": "success", "nodeId": payload.NodeID})
			} else {
				http.Error(w, err.Error(), http.StatusBadRequest)
			}
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})

	http.HandleFunc("/swarm", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == "GET" {
			json.NewEncoder(w).Encode(s.ledger.GetSwarms())
		} else if r.Method == "POST" {
			var swarm types.Swarm
				isSync := r.URL.Query().Get("sync") == "true"

			if err := json.NewDecoder(r.Body).Decode(&swarm); err == nil {
				if swarm.ID == "" || swarm.TaskID == "" {
					http.Error(w, "ID and TaskID are required", http.StatusBadRequest)
					return
				}
				if len(swarm.Nodes) == 0 {
					http.Error(w, "At least one node is required to initialize a swarm", http.StatusBadRequest)
					return
				}

				// Verify the node creating the swarm has a compute bond
				creatorID := swarm.Nodes[0]
				bond, ok := s.ledger.GetBond(creatorID)
				if !ok || bond.Status != "active" {
					http.Error(w, "Creator node does not have an active compute bond", http.StatusForbidden)
					return
				}

					if _, exists := s.ledger.GetSwarm(swarm.ID); exists && isSync {
						json.NewEncoder(w).Encode(map[string]string{"status": "already_synced"})
						return
					}

				swarm.Status = "active"
				s.ledger.CreateSwarm(swarm)

					if !isSync && s.p2pNode != nil {
						s.p2pNode.BroadcastSwarm(swarm)
					}

				json.NewEncoder(w).Encode(map[string]string{"status": "success"})
			} else {
				http.Error(w, err.Error(), http.StatusBadRequest)
			}
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})

	http.HandleFunc("/swarm/join", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == "POST" {
			var req struct {
				SwarmID string `json:"swarmId"`
				NodeID  string `json:"nodeId"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err == nil {
				if req.SwarmID == "" || req.NodeID == "" {
					http.Error(w, "swarmId and nodeId are required", http.StatusBadRequest)
					return
				}

				// Verify joining node has compute bond
				bond, ok := s.ledger.GetBond(req.NodeID)
				if !ok || bond.Status != "active" {
					http.Error(w, "Joining node does not have an active compute bond", http.StatusForbidden)
					return
				}

				isSync := r.URL.Query().Get("sync") == "true"

				if ok := s.ledger.JoinSwarm(req.SwarmID, req.NodeID); ok {
					if !isSync && s.p2pNode != nil {
						swarm, _ := s.ledger.GetSwarm(req.SwarmID)
						s.p2pNode.BroadcastSwarm(swarm)
					}
					json.NewEncoder(w).Encode(map[string]string{"status": "success"})
				} else {
					http.Error(w, "Swarm not found", http.StatusNotFound)
				}
			} else {
				http.Error(w, err.Error(), http.StatusBadRequest)
			}
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})

	http.HandleFunc("/cache", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == "GET" {
			url := r.URL.Query().Get("url")
			if url == "" {
				http.Error(w, "URL parameter required", http.StatusBadRequest)
				return
			}
			state, ok := s.ledger.GetWebState(url)
			if !ok {
				http.Error(w, "State not found", http.StatusNotFound)
				return
			}
			json.NewEncoder(w).Encode(state)
		} else if r.Method == "POST" {
			var state types.WebState
			isSync := r.URL.Query().Get("sync") == "true"

			if err := json.NewDecoder(r.Body).Decode(&state); err == nil {
				// 1. Check if already in ledger to avoid redundant processing
				if _, exists := s.ledger.GetWebState(state.URL); exists && isSync {
					json.NewEncoder(w).Encode(map[string]string{"status": "already_synced"})
					return
				}

				if isSync {
					if state.NodeID == "" || state.Signature == "" {
						http.Error(w, "Missing NodeID or Signature for sync request", http.StatusBadRequest)
						return
					}
					payloadStr := fmt.Sprintf("%s:%d", state.URL, state.TextLength)
					if !consensus.VerifySignature(state.NodeID, []byte(payloadStr), state.Signature) {
						http.Error(w, "Invalid signature", http.StatusForbidden)
						return
					}
				}

				s.ledger.AddWebState(state)

				// 2. Only broadcast if it's NOT a sync request from another node
				if !isSync && s.p2pNode != nil {
					s.p2pNode.BroadcastWebState(state)
				}

				json.NewEncoder(w).Encode(map[string]string{"status": "success"})
			} else {
				http.Error(w, err.Error(), http.StatusBadRequest)
			}
		}
	})

	http.HandleFunc("/zkml/verify", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == "POST" {
			var payload types.ZKMLPayload
			if err := json.NewDecoder(r.Body).Decode(&payload); err == nil {
				if consensus.VerifyZKMLInference(payload.ModelCommitment, payload.Input, payload.Output, payload.Proof, payload.VK, payload.Settings) {
					json.NewEncoder(w).Encode(map[string]string{"status": "verified"})
				} else {
					http.Error(w, "zkML verification failed", http.StatusForbidden)
				}
			} else {
				http.Error(w, err.Error(), http.StatusBadRequest)
			}
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})

	http.HandleFunc("/ws/graph", s.handleGraphWebSocket)

	http.HandleFunc("/ccip", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == "GET" {
			messageID := r.URL.Query().Get("messageId")
			if messageID == "" {
				// Return all messages for syncing if no messageId is specified
				msgs := s.ledger.GetAllCCIPMessages()
				json.NewEncoder(w).Encode(msgs)
				return
			}
			msg, ok := s.ledger.GetCCIPMessage(messageID)
			if !ok {
				http.Error(w, "Message not found", http.StatusNotFound)
				return
			}
			json.NewEncoder(w).Encode(msg)
		} else if r.Method == "POST" {
			var msg types.CCIPMessage
			isSync := r.URL.Query().Get("sync") == "true"

			if err := json.NewDecoder(r.Body).Decode(&msg); err == nil {
				if msg.MessageID == "" {
					http.Error(w, "message_id is required", http.StatusBadRequest)
					return
				}

				if _, exists := s.ledger.GetCCIPMessage(msg.MessageID); exists && isSync {
					json.NewEncoder(w).Encode(map[string]string{"status": "already_synced"})
					return
				}

				if msg.Status == "" {
					msg.Status = "received"
				}

				s.ledger.AddCCIPMessage(msg)

				if !isSync && s.p2pNode != nil {
					s.p2pNode.BroadcastCCIPMessage(msg)
				}

				json.NewEncoder(w).Encode(map[string]string{"status": "success"})
			} else {
				http.Error(w, err.Error(), http.StatusBadRequest)
			}
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})

	return http.ListenAndServe(addr, nil)
}

func (s *Server) handleGraphWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("Upgrade error: %v", err)
		return
	}
	defer conn.Close()

	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			log.Printf("Read error: %v", err)
			break
		}

		var req types.GraphSyncMessage

		if err := json.Unmarshal(message, &req); err != nil {
			log.Printf("Unmarshal error: %v", err)
			continue
		}

		switch req.Type {
		case "query":
			if !consensus.VerifyGraphQueryProof(req.Query, req.Proof) {
				conn.WriteJSON(map[string]string{"error": "ZKP verification failed"})
				continue
			}

			localResults := s.ledger.SearchGraph(req.Query)

			var peerResults []types.GraphNode
			if s.p2pNode != nil {
				peerResults = s.p2pNode.QueryNetwork(req.Query, req.Proof)
			}

			nodeMap := make(map[string]types.GraphNode)
			nodeScores := make(map[string]int)

			queryTokens := strings.Fields(strings.ToLower(req.Query))

			for _, node := range localResults {
				nodeMap[node.ID] = node
				nodeScores[node.ID] += 1 // base score for returning it

				contentLower := strings.ToLower(node.Content)
				for _, token := range queryTokens {
					if strings.Contains(contentLower, token) {
						nodeScores[node.ID] += 1
					}
				}
			}

			for _, node := range peerResults {
				if _, exists := nodeMap[node.ID]; !exists {
					nodeMap[node.ID] = node

					contentLower := strings.ToLower(node.Content)
					for _, token := range queryTokens {
						if strings.Contains(contentLower, token) {
							nodeScores[node.ID] += 1
						}
					}
				}
				nodeScores[node.ID] += 1 // Bonus score for each peer returning this node
			}

			results := make([]types.GraphNode, 0, len(nodeMap))
			for _, node := range nodeMap {
				results = append(results, node)
			}

			sort.Slice(results, func(i, j int) bool {
				return nodeScores[results[i].ID] > nodeScores[results[j].ID]
			})

			conn.WriteJSON(map[string]interface{}{"type": "results", "nodes": results})

		case "sync":
			if req.NodeID == "" || req.Signature == "" {
				conn.WriteJSON(map[string]string{"error": "Missing NodeID or Signature"})
				continue
			}

			payloadStr := fmt.Sprintf("%s:%d", req.Node.ID, len(req.Edges))
			if !consensus.VerifySignature(req.NodeID, []byte(payloadStr), req.Signature) {
				conn.WriteJSON(map[string]string{"error": "Invalid signature"})
				continue
			}

			s.ledger.UpdateGraph(req.Node, req.Edges)
			conn.WriteJSON(map[string]string{"status": "synced"})

		default:
			conn.WriteJSON(map[string]string{"error": "unknown request type"})
		}
	}
}
