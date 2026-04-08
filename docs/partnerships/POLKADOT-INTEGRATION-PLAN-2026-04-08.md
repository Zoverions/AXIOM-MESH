# Polkadot Integration Plan (M20.4)

Date: 2026-04-08  
Owner: @agent

## Objective

Define how AXIOM-MESH integrates with Polkadot using explicit XCM sender/receiver boundaries, trust assumptions, and staged activation gates.

## Integration Boundaries

### XCM Sender Boundary (AXIOM side)

- Initiation lives in AXIOM governance-approved orchestration layer only.
- Sender responsibilities:
  - construct deterministic XCM intent payloads;
  - attach policy metadata (risk, approvals, route id, evidence pointer);
  - sign and sequence messages with replay protection.
- Sender must not bypass scheduler policy checks or emergency halt controls.

### XCM Receiver Boundary (AXIOM side)

- Receiver adapter accepts only allowlisted origins/parachain IDs.
- Incoming XCM effects are treated as untrusted until policy + attestation checks pass.
- Receiver responsibilities:
  - verify origin and channel state;
  - map external event to internal capability with least privilege;
  - emit immutable audit trail entry for every accepted/rejected message.

## Trust Assumptions

1. Polkadot relay-chain finality is assumed for finalized XCM events, but transport-level delays and reorg-handling windows are explicitly modeled.
2. External parachains are semi-trusted: origin authenticity is necessary but insufficient; policy and evidence checks remain mandatory.
3. Bridge relayers are untrusted for content integrity; signatures/proofs and domain separation are mandatory.
4. Governance actions can alter allowlists and thresholds, but changes require timelock and dual-approval controls.

## Staged Activation Gates

### Stage 0 — Design/Simulation

- Threat model complete for sender/receiver boundaries.
- XCM message catalog and failure modes documented.
- Dry-run simulation with synthetic payloads and audit logs.

### Stage 1 — Shadow Mode (No economic effect)

- Receive and parse XCM events in read-only mode.
- Compare expected vs observed outcomes; no state mutation beyond logs.
- SLOs: parsing success, latency, mismatch rate.

### Stage 2 — Limited Pilot (Allowlisted partners)

- Enable small-scope bidirectional messages for selected parachains.
- Enforce rate limits, value caps, and per-origin quotas.
- Require high-risk approval traces for privileged actions.

### Stage 3 — Controlled Production

- Expand allowlist and throughput after reliability/security KPIs are met.
- Activate treasury and settlement pathways with circuit breakers.
- Quarterly key rotation and trust-anchor review become required.

### Stage 4 — Generalized Multi-Chain Ops

- Add standardized onboarding playbook for new parachain partners.
- Enable dynamic policy routing across local/peer/grid/polkadot routes.
- Maintain evidence-gated release criteria for every expansion.

## Controls and Safeguards

- Fail-closed message handling on schema mismatch or unknown origin.
- Circuit breaker for anomalous volume, repeated invalid proofs, or policy drift.
- Mandatory replay nonce tracking for sender and receiver domains.
- Governance emergency halt supersedes all automated routing decisions.

## Initial Deliverables

1. Sender/receiver boundary contract in architecture docs.
2. Trust-assumption register linked to security review.
3. Activation-gate checklist used by release governance.

