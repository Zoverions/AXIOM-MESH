# Network Efficiency & Capability Expansion Strategies (Lane M15)

## Goal
Design scale-first networking patterns that improve throughput and reliability as AXIOM-MESH grows, while preserving strong security, privacy, and operator control.

---

## 1) Intent-Scoped Gossip (Adaptive Fanout)

### Why
Classic gossip fanout creates unnecessary duplicate traffic as node count increases.

### Approach
- Partition all message propagation by `intent_class` and `trust_domain`.
- Use adaptive fanout: high fanout for novel or urgent intents; low fanout for routine intents with high cache-hit probability.
- Encode a bounded propagation budget into each message envelope (`max_hops`, `max_relay_cost`).

### Security/Control Guardrails
- Require signature + replay nonce for each hop.
- Add per-domain relay quotas governed by policy.
- Default fail-closed if envelope controls are absent.

### Expected Impact
Lower bandwidth amplification and better tail-latency at large peer counts.

---

## 2) Proof-Carrying Packets + Early Rejection

### Why
Nodes waste CPU validating packets that should have been discarded at ingress.

### Approach
- Attach lightweight attestations to routing metadata (node class, allowed region, capability level, policy epoch).
- Verify attestations before expensive execution planning.
- Introduce "fast deny" path in Gateway/Hypervisor for malformed or out-of-policy traffic.

### Security/Privacy Guardrails
- Rotate attestation keys and policy epochs.
- Keep attestations minimally disclosive (capability classes vs full host fingerprints).

### Expected Impact
Substantial CPU savings under adversarial or noisy network conditions.

---

## 3) Zero-Knowledge Capability Matching

### Why
Capability discovery often leaks node-specific hardware, geography, or tenancy profile.

### Approach
- Replace plain-text capability broadcasting with zk predicates:
  - "I satisfy memory >= X, region in allowed set, and trust tier >= T".
- Route tasks to qualifying peers without exposing raw host details.

### Security/Control Guardrails
- Verify proofs against a pinned circuit and trusted setup metadata.
- Use short-lived proof validity windows.

### Expected Impact
Preserves discovery efficiency while reducing metadata leakage.

---

## 4) Locality-First Settlement Trees

### Why
Global settlement for every micro-operation creates avoidable network and ledger pressure.

### Approach
- Aggregate local neighborhood outcomes into Merkle subtrees.
- Periodically commit subtree roots to the global Grid.
- Enable challenge windows with fraud proofs that can open subtree internals only when needed.

### Security/Control Guardrails
- Deterministic subtree rotation schedule.
- Mandatory availability commitments for subtree witnesses.

### Expected Impact
Higher effective throughput and lower consensus overhead without sacrificing auditability.

---

## 5) Congestion-Aware Multi-Path Routing

### Why
Single-path routing creates hotspots and cascading slowdowns.

### Approach
- Route critical flows across disjoint paths with weighted erasure coding.
- Use online congestion signals (queue depth, retransmit rate, proof verification backlog) to rebalance in near real-time.

### Security/Privacy Guardrails
- Encrypt shard fragments independently.
- Prevent full payload recovery unless quorum threshold is met.

### Expected Impact
Improved resilience and lower p99 latency during churn or partial outages.

---

## 6) Confidential Control Plane + Open Data Plane Metrics

### Why
Operators need control and observability without exposing sensitive operational topology.

### Approach
- Keep policy issuance, node admission, and capability grants on a confidential control plane.
- Publish privacy-preserving aggregate metrics on the data plane (cohort-level latency, failure rates, proof cache hit-rate).

### Security/Control Guardrails
- Signed policy snapshots with monotonic versioning.
- "Break-glass" rollback with dual-approval governance.

### Expected Impact
Better operator control and faster incident response with reduced intelligence leakage.

---

## 7) Economic QoS With Abuse-Resistant Credits

### Why
Unpriced network usage enables spam and resource starvation.

### Approach
- Introduce intent credits based on risk and resource class.
- Dynamic pricing adjusts with congestion and policy priority.
- Refunds for tasks that fail due to platform-side faults.

### Security/Control Guardrails
- Sybil-resistant admission + stake-weighted rate limiting.
- Audit logs for all credit burns/refunds.

### Expected Impact
Predictable capacity allocation and reduced spam amplification.

---

## 8) Privacy-Budgeted Telemetry

### Why
Telemetry is essential for scaling decisions, but raw traces can expose user behavior.

### Approach
- Implement differential privacy budgets by tenant and time window.
- Collect only decision-relevant counters (routing miss rate, cache staleness, congestion index).
- Auto-disable high-cardinality labels unless explicitly approved.

### Security/Privacy Guardrails
- Enforce per-tenant epsilon ceilings.
- Signed approvals for any temporary debug escalation.

### Expected Impact
Actionable observability with controlled privacy risk.

---

## 9) Upgrade Strategy: Scale Without Flag Days

### Why
Monolithic protocol upgrades create downtime and split-brain risk.

### Approach
- Versioned protocol envelopes with feature negotiation.
- Canary domains and gradual expansion by trust region.
- Shadow verification paths to compare old/new routing outcomes before cutover.

### Security/Control Guardrails
- Auto-revert on SLO regression beyond policy threshold.
- Compatibility tests required before widening rollout.

### Expected Impact
Faster innovation cycles with safer production evolution.

---

## 90-Day Delivery Sequence (Proposed)

1. **Weeks 1-3:** Fast deny path + adaptive gossip envelopes.
2. **Weeks 4-6:** Congestion-aware multipath + privacy-budgeted telemetry.
3. **Weeks 7-9:** Local settlement trees + canary upgrade framework.
4. **Weeks 10-12:** ZK capability matching pilot in one sovereign domain.

### Success Metrics
- 35% reduction in inter-node bandwidth per completed intent.
- 40% reduction in p99 intent routing latency under 2x load.
- 50% reduction in invalid traffic CPU burn.
- No increase in privacy incident rate or policy violation rate.

---

## Active Build Slice (2026-04-07)

### Congestion-Aware Scheduled Task Routing (Started)
- Wire Hypervisor scheduled command execution to `resource_balancer` route evaluation before local process spawn.
- If route resolves to `p2p` or `grid`, defer local execution (fail-safe for shared-machine performance).
- Preserve existing command allowlist + signed payload controls to avoid security regressions.
- Add regression tests proving non-local route decisions do not execute local shell commands.
