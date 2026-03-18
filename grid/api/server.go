package api

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"math"
	"net/http"
	"os"
	"regexp"
	"sort"
	"strconv"
	"time"

	"github.com/axiom-mesh/grid/blockchain"
	chainclient "github.com/axiom-mesh/grid/chain"
	"github.com/axiom-mesh/grid/consensus"
	"github.com/axiom-mesh/grid/p2p"
	"github.com/axiom-mesh/grid/types"
	"github.com/gorilla/websocket"
)

func verifySignatureMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "GET" || r.Method == "OPTIONS" {
			next.ServeHTTP(w, r)
			return
		}

		apiKey := os.Getenv("HYPERVISOR_API_KEY")
		if apiKey == "" {
			http.Error(w, "Server configuration error: HYPERVISOR_API_KEY not set", http.StatusInternalServerError)
			return
		}

		timestampStr := r.Header.Get("X-Axiom-Timestamp")
		nonce := r.Header.Get("X-Axiom-Nonce")
		signature := r.Header.Get("X-Axiom-Signature")

		if timestampStr == "" || nonce == "" || signature == "" {
			http.Error(w, "Missing required signature headers", http.StatusForbidden)
			return
		}

		timestamp, err := strconv.ParseInt(timestampStr, 10, 64)
		if err != nil {
			http.Error(w, "Invalid timestamp format", http.StatusBadRequest)
			return
		}

		now := time.Now().UnixNano() / int64(time.Millisecond)
		if math.Abs(float64(now)-float64(timestamp)) > 300000 {
			http.Error(w, "Request signature expired", http.StatusForbidden)
			return
		}

		bodyBytes, err := ioutil.ReadAll(r.Body)
		if err != nil {
			http.Error(w, "Failed to read request body", http.StatusInternalServerError)
			return
		}
		// Restore the body for the next handler
		r.Body = ioutil.NopCloser(bytes.NewBuffer(bodyBytes))

		payload := fmt.Sprintf("%s:%s:%s", timestampStr, nonce, string(bodyBytes))
		mac := hmac.New(sha256.New, []byte(apiKey))
		mac.Write([]byte(payload))
		expectedMac := hex.EncodeToString(mac.Sum(nil))

		if !hmac.Equal([]byte(expectedMac), []byte(signature)) {
			http.Error(w, "Invalid request signature", http.StatusForbidden)
			return
		}

		next.ServeHTTP(w, r)
	}
}

type ZKMLJob struct {
	Payload types.ZKMLPayload
	Result  chan bool
}

type Server struct {
	ledger             *blockchain.Ledger
	p2pNode            *p2p.Node
	upgrader           websocket.Upgrader
	zkmlQueue          chan ZKMLJob
	computeBondOnChain *chainclient.ComputeBondClient
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

	server := &Server{
		ledger:  ledger,
		p2pNode: p2pNode,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
		zkmlQueue: make(chan ZKMLJob, 100), // Buffered queue for deterministic workers
	}

	// Start a deterministic worker pool for zkML verifications (concurrency limited to 2 for deterministic compute)
	for i := 0; i < 2; i++ {
		go server.startZKMLWorker()
	}

	return server
}

func (s *Server) SetComputeBondClient(client *chainclient.ComputeBondClient) {
	s.computeBondOnChain = client
}

// startZKMLWorker runs a deterministic worker pool for zkML verifications
func (s *Server) startZKMLWorker() {
	for job := range s.zkmlQueue {
		log.Printf("Worker processing zkML verification for %s", job.Payload.ModelCommitment)

		var valid bool
		proofHash := consensus.GenerateProofHash(job.Payload.ModelCommitment, job.Payload.Proof)

		// Try L3 Cache (BadgerDB) if available
		var l3Found bool
		if s.ledger.Persistent != nil {
			valid, l3Found = s.ledger.Persistent.GetZKMLProof(proofHash)
		}

		if l3Found {
			log.Printf("zkML proof verification found in L3 BadgerDB cache for %s", job.Payload.ModelCommitment)
		} else {
			// Not in L3 cache, run verification (which also hits L1 LRU internal to consensus package)
			valid = consensus.VerifyZKMLInference(job.Payload.ModelCommitment, job.Payload.Input, job.Payload.Output, job.Payload.Proof, job.Payload.VK, job.Payload.Settings)

			// Cache result in L3 if we ran it
			if s.ledger.Persistent != nil {
				s.ledger.Persistent.CacheZKMLProof(proofHash, valid)
			}
		}

		if valid {
			log.Printf("Worker verified zkML for %s", job.Payload.ModelCommitment)
		} else {
			log.Printf("Worker failed zkML verification for %s", job.Payload.ModelCommitment)
		}
		job.Result <- valid
	}
}

func validateZKMLPayload(payload types.ZKMLPayload) (bool, string) {
	if payload.ModelCommitment == "" || payload.Proof == "" || payload.VK == "" || payload.Settings == "" {
		return false, "missing required zkML payload fields"
	}
	match, _ := regexp.MatchString("^[a-fA-F0-9]{64}$", payload.ModelCommitment)
	if !match {
		return false, "invalid model_commitment format"
	}
	if len(payload.Input) == 0 || len(payload.Output) == 0 {
		return false, "input and output vectors are required"
	}
	if len(payload.Proof) > 2_000_000 || len(payload.VK) > 2_000_000 || len(payload.Settings) > 2_000_000 {
		return false, "zkML artifact payload too large"
	}
	if len(payload.Input) > 4096 || len(payload.Output) > 4096 {
		return false, "zkML vector payload too large"
	}
	return true, ""
}

func (s *Server) Start(addr string) error {
	mux := http.NewServeMux()

	mux.HandleFunc("/health", verifySignatureMiddleware(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":    "ok",
			"component": "grid",
			"dependencies": map[string]string{
				"p2p": "ok",
			},
		})
	}))

	mux.HandleFunc("/skills", verifySignatureMiddleware(func(w http.ResponseWriter, r *http.Request) {
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
	}))

	mux.HandleFunc("/stake", verifySignatureMiddleware(func(w http.ResponseWriter, r *http.Request) {
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

				var txHash string
				if s.computeBondOnChain != nil {
					hash, err := s.computeBondOnChain.Stake(bond.NodeID, int64(bond.Amount))
					if err != nil {
						http.Error(w, "on-chain stake failed: "+err.Error(), http.StatusBadGateway)
						return
					}
					txHash = hash.Hex()
					bond.TxHash = txHash
				}

				s.ledger.Stake(bond)
				resp := map[string]string{"status": "success", "nodeId": bond.NodeID}
				if txHash != "" {
					resp["txHash"] = txHash
				}
				json.NewEncoder(w).Encode(resp)
			} else {
				http.Error(w, err.Error(), http.StatusBadRequest)
			}
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))

	mux.HandleFunc("/bond/sever", verifySignatureMiddleware(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == "POST" {
			var payload struct {
				NodeID  string `json:"nodeId"`
				ZKProof string `json:"zkProof,omitempty"`
			}
			if err := json.NewDecoder(r.Body).Decode(&payload); err == nil {
				if payload.NodeID == "" {
					http.Error(w, "Invalid nodeId", http.StatusBadRequest)
					return
				}

				if bond, ok := s.ledger.GetBond(payload.NodeID); ok {
					bond.Status = "severed"
					// Agent memory must be zeroized by hypervisor locally. Here we update state.
					s.ledger.Stake(bond) // Update bond status
					json.NewEncoder(w).Encode(map[string]string{"status": "success", "nodeId": payload.NodeID})
				} else {
					http.Error(w, "Bond not found", http.StatusNotFound)
				}
			} else {
				http.Error(w, err.Error(), http.StatusBadRequest)
			}
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))

	mux.HandleFunc("/bond/delegate", verifySignatureMiddleware(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == "POST" {
			var payload struct {
				NodeID       string `json:"nodeId"`
				ParentNodeID string `json:"parentNodeId"`
			}
			if err := json.NewDecoder(r.Body).Decode(&payload); err == nil {
				if payload.NodeID == "" || payload.ParentNodeID == "" {
					http.Error(w, "Invalid nodeId or parentNodeId", http.StatusBadRequest)
					return
				}

				if bond, ok := s.ledger.GetBond(payload.NodeID); ok {
					bond.ParentNodeID = payload.ParentNodeID
					s.ledger.Stake(bond) // Update bond
					json.NewEncoder(w).Encode(map[string]string{"status": "success", "nodeId": payload.NodeID, "parentNodeId": payload.ParentNodeID})
				} else {
					http.Error(w, "Bond not found", http.StatusNotFound)
				}
			} else {
				http.Error(w, err.Error(), http.StatusBadRequest)
			}
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))

	mux.HandleFunc("/slash", verifySignatureMiddleware(func(w http.ResponseWriter, r *http.Request) {
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

				if s.computeBondOnChain != nil {
					hash, err := s.computeBondOnChain.Slash(payload.NodeID, int64(payload.Amount))
					if err != nil {
						http.Error(w, "on-chain slash failed: "+err.Error(), http.StatusBadGateway)
						return
					}
					payload.TxHash = hash.Hex()
				}

				if err := s.ledger.Slash(payload.NodeID, payload.Amount, payload.TxHash); err != nil {
					http.Error(w, err.Error(), http.StatusBadRequest)
					return
				}

				// Depending on the network requirements, we could also broadcast this slash event,
				// but since slash events originated from chain, we mostly care about updating local state.
				resp := map[string]string{"status": "success", "nodeId": payload.NodeID}
				if payload.TxHash != "" {
					resp["txHash"] = payload.TxHash
				}
				json.NewEncoder(w).Encode(resp)
			} else {
				http.Error(w, err.Error(), http.StatusBadRequest)
			}
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))

	mux.HandleFunc("/bond/events", verifySignatureMiddleware(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var evt types.BondChainEvent
		if err := json.NewDecoder(r.Body).Decode(&evt); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		if evt.RequiredConfirm > 0 && !evt.Finalized {
			json.NewEncoder(w).Encode(map[string]interface{}{"status": "pending_finality", "nodeId": evt.NodeID, "requiredConfirmations": evt.RequiredConfirm})
			return
		}

		if err := s.ledger.ApplyBondChainEvent(evt); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		json.NewEncoder(w).Encode(map[string]interface{}{"status": "applied", "nodeId": evt.NodeID, "txHash": evt.TxHash, "finalized": evt.Finalized})
	}))

	mux.HandleFunc("/bond/reconcile", verifySignatureMiddleware(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var payload struct {
			NodeID         string            `json:"nodeId"`
			CanonicalBond  types.ComputeBond `json:"canonicalBond"`
			FinalizedBlock uint64            `json:"finalizedBlock"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if payload.NodeID == "" {
			http.Error(w, "nodeId is required", http.StatusBadRequest)
			return
		}

		s.ledger.ReconcileBondFromChain(payload.NodeID, payload.CanonicalBond, payload.FinalizedBlock)
		json.NewEncoder(w).Encode(map[string]interface{}{"status": "reconciled", "nodeId": payload.NodeID, "finalizedBlock": payload.FinalizedBlock})
	}))
	mux.HandleFunc("/swarm", verifySignatureMiddleware(func(w http.ResponseWriter, r *http.Request) {
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
	}))

	mux.HandleFunc("/swarm/join", verifySignatureMiddleware(func(w http.ResponseWriter, r *http.Request) {
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
	}))

	mux.HandleFunc("/cache", verifySignatureMiddleware(func(w http.ResponseWriter, r *http.Request) {
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
	}))

	mux.HandleFunc("/zk-stats", verifySignatureMiddleware(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == "GET" {
			// Calculate anonymized metrics for fairness proofs and anti-overload controls
			bonds := s.ledger.GetBonds()
			totalBondedAmount := 0
			activeNodesCount := 0
			for _, b := range bonds {
				if b.Status == "active" {
					activeNodesCount++
					totalBondedAmount += b.Amount
				}
			}

			// Add zero-knowledge/anonymized reporting metrics
			stats := map[string]interface{}{
				"active_bonded_nodes":  activeNodesCount,
				"total_staked_amount":  totalBondedAmount,
				"skills_registered":    len(s.ledger.GetSkills()),
				"proposals_count":      len(s.ledger.GetProposals()),
				"swarms_active":        len(s.ledger.GetSwarms()),
				"zkml_queue_size":      len(s.zkmlQueue),
				"anonymized_telemetry": true,
			}
			json.NewEncoder(w).Encode(stats)
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))

	mux.HandleFunc("/zkml/verify", verifySignatureMiddleware(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == "POST" {
			var payload types.ZKMLPayload
			if err := json.NewDecoder(r.Body).Decode(&payload); err == nil {
				if valid, msg := validateZKMLPayload(payload); !valid {
					http.Error(w, msg, http.StatusBadRequest)
					return
				}
				// Deterministic Worker Pipeline
				// Submit the job to the deterministic worker queue, limiting concurrency,
				// and await the verification synchronously to fulfill the client contract.
				job := ZKMLJob{
					Payload: payload,
					Result:  make(chan bool, 1),
				}

				select {
				case s.zkmlQueue <- job:
					select {
					case valid := <-job.Result:
						if valid {
							json.NewEncoder(w).Encode(map[string]string{"status": "verified"})
						} else {
							http.Error(w, "zkML verification failed", http.StatusForbidden)
						}
					case <-time.After(30 * time.Second):
						http.Error(w, "zkML verification timeout", http.StatusGatewayTimeout)
					}
				default:
					http.Error(w, "zkML verification queue is full", http.StatusServiceUnavailable)
				}
			} else {
				http.Error(w, err.Error(), http.StatusBadRequest)
			}
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))

	mux.HandleFunc("/ws/graph", s.handleGraphWebSocket)

	mux.HandleFunc("/proposals", verifySignatureMiddleware(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method == "GET" {
			json.NewEncoder(w).Encode(s.ledger.GetProposals())
		} else {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	}))

	mux.HandleFunc("/proposals/events", verifySignatureMiddleware(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var evt types.ProposalChainEvent
		if err := json.NewDecoder(r.Body).Decode(&evt); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		if err := s.ledger.ApplyProposalChainEvent(evt); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":     "applied",
			"proposalId": evt.ProposalID,
			"type":       evt.Type,
		})
	}))

	mux.HandleFunc("/ccip", verifySignatureMiddleware(func(w http.ResponseWriter, r *http.Request) {
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
	}))

	return http.ListenAndServe(addr, mux)
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

			localResults := s.ledger.SearchGraphRanked(req.Query)
			var peerResults []p2p.PeerQueryResult
			if s.p2pNode != nil {
				peerResults = s.p2pNode.QueryNetwork(req.Query, req.Proof)
			}

			nodeMap := make(map[string]types.GraphNode)
			nodeScores := make(map[string]int)
			peerVotes := make(map[string]int)

			for _, result := range localResults {
				nodeMap[result.Node.ID] = result.Node
				nodeScores[result.Node.ID] += result.Score + 2
			}

			for _, peerRes := range peerResults {
				if _, exists := nodeMap[peerRes.NodeID]; !exists {
					nodeMap[peerRes.NodeID] = peerRes.Node
				}
				nodeScores[peerRes.NodeID] += peerRes.Score + peerRes.SourceScore
				peerVotes[peerRes.NodeID]++
			}

			results := make([]struct {
				Node      types.GraphNode `json:"node"`
				Score     int             `json:"score"`
				PeerVotes int             `json:"peerVotes"`
			}, 0, len(nodeMap))
			for nodeID, node := range nodeMap {
				results = append(results, struct {
					Node      types.GraphNode `json:"node"`
					Score     int             `json:"score"`
					PeerVotes int             `json:"peerVotes"`
				}{Node: node, Score: nodeScores[nodeID], PeerVotes: peerVotes[nodeID]})
			}

			sort.Slice(results, func(i, j int) bool {
				if results[i].Score == results[j].Score {
					return results[i].PeerVotes > results[j].PeerVotes
				}
				return results[i].Score > results[j].Score
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
