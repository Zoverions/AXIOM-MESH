package api

import (
	"encoding/json"
	"net/http"

	"github.com/axiom-mesh/grid/blockchain"
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
			var rawBody map[string]interface{}
			if err := json.NewDecoder(r.Body).Decode(&rawBody); err == nil {
				var skill types.SkillVector
				var poerHash string

				// Check if payload has a nested "skill" object
				if s, ok := rawBody["skill"].(map[string]interface{}); ok {
					skillBytes, _ := json.Marshal(s)
					json.Unmarshal(skillBytes, &skill)
					if ph, ok := rawBody["poerHash"].(string); ok {
						poerHash = ph
					}
				} else {
					// Otherwise, assume the whole body is the skill vector
					skillBytes, _ := json.Marshal(rawBody)
					json.Unmarshal(skillBytes, &skill)
					// Fallback hash
					poerHash = "legacy-hash"
				}

				if err := s.ledger.AddSkill(skill, poerHash); err != nil {
					http.Error(w, err.Error(), http.StatusNotAcceptable)
				} else {
					json.NewEncoder(w).Encode(map[string]string{"status": "success"})
				}
			} else {
				http.Error(w, err.Error(), http.StatusBadRequest)
			}
		}
	})

	return http.ListenAndServe(addr, nil)
}
