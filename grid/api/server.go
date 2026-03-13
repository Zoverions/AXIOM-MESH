package api

import (
	"encoding/json"
	"net/http"

	"github.com/axiom-mesh/grid/blockchain"
	"github.com/axiom-mesh/grid/consensus"
	"github.com/axiom-mesh/grid/types"
)

type Server struct {
	ledger *blockchain.Ledger
}

func NewServer(ledger *blockchain.Ledger) *Server {
	return &Server{ledger: ledger}
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

	return http.ListenAndServe(addr, nil)
}
