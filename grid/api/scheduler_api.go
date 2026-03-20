package api

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/axiom-mesh/grid/internal/scheduler"
)

type ScheduleRequest struct {
	CapsuleID         string                  `json:"capsule_id"`
	Token             string                  `json:"token"`
	AttestationPolicy scheduler.RoutingPolicy `json:"attestation_policy"`
	ComputeBudget     int                     `json:"compute_budget"`
}

type ScheduleResponse struct {
	NodeID string                `json:"node_id"`
	Ticket *scheduler.TaskTicket `json:"task_ticket"`
}

type FailoverResponse struct {
	NewNodeID string `json:"new_node_id"`
}

func RegisterSchedulerAPI(mux *http.ServeMux, s *scheduler.Scheduler) {
	mux.HandleFunc("/schedule", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req ScheduleRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		nodeID, ticket, err := s.Schedule(req.CapsuleID, req.Token, req.AttestationPolicy, req.ComputeBudget)
		if err != nil {
			http.Error(w, err.Error(), http.StatusServiceUnavailable)
			return
		}

		resp := ScheduleResponse{
			NodeID: nodeID,
			Ticket: ticket,
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	})

	mux.HandleFunc("/schedule/", func(w http.ResponseWriter, r *http.Request) {
		pathParts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
		if len(pathParts) != 3 {
			http.Error(w, "Invalid path", http.StatusBadRequest)
			return
		}

		ticketID := pathParts[1]
		action := pathParts[2]

		if action == "status" {
			if r.Method != "GET" {
				http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
				return
			}

			status, err := s.GetTaskStatus(ticketID)
			if err != nil {
				http.Error(w, err.Error(), http.StatusNotFound)
				return
			}

			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(status)
			return
		}

		if action == "failover" {
			if r.Method != "POST" {
				http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
				return
			}

			newNodeID, err := s.Failover(ticketID)
			if err != nil {
				http.Error(w, err.Error(), http.StatusServiceUnavailable)
				return
			}

			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(FailoverResponse{NewNodeID: newNodeID})
			return
		}

		http.Error(w, "Unknown action", http.StatusBadRequest)
	})
}
