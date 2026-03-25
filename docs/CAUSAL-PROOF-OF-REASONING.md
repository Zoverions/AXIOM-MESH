# Causal Proof-of-Reasoning (CPoR) — Design Blueprint

**Status:** Proposed (Design Candidate)  
**Date:** 2026-03-25  
**Owner lane:** M11 (Causal Proof-of-Reasoning)

---

## 1) Problem Statement

AXIOM-MESH currently verifies inference correctness through zk proofs of computation. That proves **what** was computed, but not the causal rationale behind the decision path ("why this output followed from these signals").

CPoR extends current verification by binding:
1. inference output,
2. causal attribution graph,
3. policy and safety checkpoints,
4. execution consensus context,

into a single attestable artifact that can be audited and challenged.

---

## 2) Design Goals

- **G1 — Causal auditability:** reconstruct machine reasoning lineage with bounded graph depth.
- **G2 — Verifiable provenance:** bind graph + inference + policy checkpoints to cryptographic commitments.
- **G3 — Coalition anomaly visibility:** detect coordinated multi-agent drift before irreversible settlement.
- **G4 — Rewardable contribution accounting:** enable federated memory synthesis with attributable contributions.
- **G5 — Backward compatibility:** preserve existing zkML verification flow and add CPoR as an extension path.

---

## 3) Core Components

### 3.1 Causal Graph Attestation

A DAG where each node represents one reasoning step (observation, transformation, policy check, or decision), and each edge represents a causal dependency.

**Attested fields per node (minimum):**
- `node_id`
- `step_type`
- `evidence_hash`
- `attention_weight`
- `policy_checkpoint_ref`
- `timestamp_ms`

**Output:** Merkle root + canonical serialization hash, embedded in the reasoning attestation payload.

### 3.2 Attention-Weighted Consensus

Consensus weighting is task-contextual, not global static reputation:
- route-specific semantic profile is used to evaluate participant relevance,
- aggregated confidence is weighted by attention relevance + prior reliability,
- low-relevance high-reputation peers cannot dominate unrelated domains.

### 3.3 Emergent Coalition Monitoring

Grid computes rolling coalition signatures from interaction graphs and flags:
- abrupt dense-clique emergence,
- synchronized confidence spikes,
- repeated policy bypass adjacency patterns.

Alerts are emitted as `EMERGENCE_ALERT` events with trace pointers and affected intent IDs.

### 3.4 Cross-Agent Memory Synthesis

Federated updates are accepted only with:
- contribution commitment,
- local proof of update integrity,
- attested utility delta.

Contributions can later be replayed for reward accounting and rollback isolation.

---

## 4) Interface Surface (Proposed)

### 4.1 Hypervisor Endpoint

`POST /verify/reasoning`

Request: CPoR attestation payload (schema: `schemas/causal_reasoning_attestation.v1.json`)  
Response: verification verdict + mismatch reasons + trace references.

### 4.2 Grid Event Type

`EMERGENCE_ALERT`

Payload includes:
- `alert_id`
- `intent_ids[]`
- `coalition_signature_hash`
- `severity`
- `recommended_action`

### 4.3 Contract Extensions (Planned)

- `CausalZkMLVerifier.sol` (extends verifier responsibilities with causal commitment checks).
- `AttentionWeightOracle.sol` (task-contextual weighting input for consensus and slashing logic).
- `FederatedSkillCapsule.sol` (verifiable contribution accounting for cross-agent learning rewards).

---

## 5) Rollout Plan (4 Phases)

### Phase 1 — Causal Graph Foundation (Weeks 1–4)
- define attestation schema and canonical serialization;
- implement causal DAG builder in Grid;
- ship `/verify/reasoning` dry-run mode in Hypervisor;
- publish challenge semantics and mismatch taxonomy.

### Phase 2 — Consensus Integration (Weeks 5–8)
- implement attention-weighted scoring path;
- integrate with compute-bond slashing and confidence gates;
- expose attention telemetry in dashboard/operator cockpit.

### Phase 3 — Emergence Defense (Weeks 9–12)
- launch coalition anomaly detector;
- emit ledger-native `EMERGENCE_ALERT` events;
- tie severe alerts into gateway WAF/rate-limit defense profiles.

### Phase 4 — Federated Memory Economics (Weeks 13–16)
- add verifiable contribution tracking;
- integrate reward accounting for accepted contributions;
- add reversible quarantine for poisoned update clusters.

---

## 6) Security & Trust Properties

- **Fail-closed verification:** missing or malformed causal commitments reject settlement-critical intents.
- **Replay resistance:** attestation nonce + timestamp windows are required.
- **Tamper evidence:** canonical graph hash breaks under any step mutation.
- **Operator explainability:** every accepted decision has a replayable causal trace reference.

---

## 7) Non-Goals (V1)

- Full symbolic theorem proving of every reasoning step.
- Domain-perfect attribution semantics for all model families.
- Universal coalition anomaly classifier beyond configured threat profiles.

---

## 8) Dependencies

- Existing zkML/Groth16 verification interfaces.
- Transformer foundation telemetry already being integrated in Lane M6.
- Grid event pipeline + gateway/operator observability surfaces.

---

## 9) Acceptance Criteria (Design-to-Build Handoff)

A CPoR implementation kickoff is ready once all are true:
1. schema is versioned and validated in CI,
2. mismatch taxonomy is frozen,
3. challenge window semantics are documented,
4. one end-to-end dry-run trace verifies reasoning attestation replay.
