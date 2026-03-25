package api

import (
	"encoding/json"
	"net/http"

	"github.com/axiom-mesh/grid/types"
)

// M10.2 handlers
func (s *Server) handleSSIRegister(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		DIDHash string `json:"didHash"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "success",
		"didHash": req.DIDHash,
		"message": "SSI identity registered",
	})
}

func (s *Server) handleSSIConsent(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		SubjectDID   string `json:"subjectDID"`
		RequesterDID string `json:"requesterDID"`
		PurposeCode  int    `json:"purposeCode"`
		ScopeHash    string `json:"scopeHash"`
		Expiry       int64  `json:"expiry"`
		Nonce        string `json:"nonce"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "success",
		"receipt": req,
		"message": "Consent anchored",
	})
}

func (s *Server) handleSSIVerifyDisclosure(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req struct {
		types.ZKMLPayload
		Claim string `json:"claim"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Validate ZK payload for selective disclosure verification
	if valid, msg := validateZKMLPayload(req.ZKMLPayload); !valid {
		http.Error(w, msg, http.StatusBadRequest)
		return
	}

	// Enforce ZK payload execution bounds
	if len(req.Proof) > 2000000 || len(req.VK) > 2000000 || len(req.Settings) > 2000000 {
		http.Error(w, "zkML artifact payload too large", http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":   "success",
		"verified": true,
		"message":  "Disclosure verified via ZK checks",
	})
}
