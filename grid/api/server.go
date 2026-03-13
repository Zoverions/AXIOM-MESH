package api

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/axiom-mesh/grid/blockchain"
	"strings"

	"github.com/axiom-mesh/grid/consensus"
	"github.com/axiom-mesh/grid/types"
	"github.com/gorilla/websocket"
)

type Server struct {
	ledger   *blockchain.Ledger
	upgrader websocket.Upgrader
}

func NewServer(ledger *blockchain.Ledger) *Server {
	return &Server{
		ledger: ledger,
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
		if r.Method == "GET" {
			json.NewEncoder(w).Encode(s.ledger.GetSkills())
		} else if r.Method == "POST" {
			var skill types.SkillVector
			if err := json.NewDecoder(r.Body).Decode(&skill); err == nil {
				if !consensus.VerifyEntropyReduction(skill.Task, skill.PoERHash) {
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

	http.HandleFunc("/cache", func(w http.ResponseWriter, r *http.Request) {
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
			if err := json.NewDecoder(r.Body).Decode(&state); err == nil {
				s.ledger.AddWebState(state)
				json.NewEncoder(w).Encode(map[string]string{"status": "success"})
			} else {
				http.Error(w, err.Error(), http.StatusBadRequest)
			}
		}
	})

	http.HandleFunc("/ws/graph", s.handleGraphWebSocket)

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

		var req struct {
			Type    string                 `json:"type"`
			Query   string                 `json:"query"`
			Proof   string                 `json:"proof"`
			Node    types.GraphNode        `json:"node"`
			Edges   []types.GraphEdge      `json:"edges"`
			Payload map[string]interface{} `json:"payload"`
		}

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
			// Simulate search in local graph
			graph := s.ledger.GetGraph()
			results := []types.GraphNode{}
			for _, node := range graph.Nodes {
				if req.Query == "" || strings.Contains(strings.ToLower(node.Content), strings.ToLower(req.Query)) {
					results = append(results, node)
				}
			}
			conn.WriteJSON(map[string]interface{}{"type": "results", "nodes": results})

		case "sync":
			s.ledger.UpdateGraph(req.Node, req.Edges)
			conn.WriteJSON(map[string]string{"status": "synced"})

		default:
			conn.WriteJSON(map[string]string{"error": "unknown request type"})
		}
	}
}
