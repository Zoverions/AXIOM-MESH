# AXIOM-MESH Operations & Chaos Engineering Runbook

This runbook outlines operational procedures and chaos engineering scenarios for testing system resilience and handling critical failure states.

## Chaos Engineering Scenarios

### 1. Network Partitions (Grid / P2P)
**Objective:** Verify system resilience when the decentralized Grid experiences a network split.
**Testing Procedure:**
- Partition Grid nodes into two halves.
- **Verification Criteria:**
  - Gateway queues incoming intents (doesn't drop them).
  - Hypervisor pauses AutoResearch loops to ensure safety.
  - Ledger remains consistent via CRDT synchronization once the partition resolves.

### 2. zkML Verification Failures
**Objective:** Ensure the system handles a high failure rate in zkML proof verification without stalling or staking unverified skills.
**Testing Procedure:**
- Simulate a 50% failure rate for incoming zkML proofs.
- **Verification Criteria:**
  - Skills are not staked without successful verification.
  - Alerts are triggered to bicameral governance channels.
  - The system gracefully falls back to a heuristic mode (degraded but operational).

### 3. Hypervisor Service Disruption
**Objective:** Confirm that the service mesh circuit breakers correctly isolate failures between the Gateway and the Hypervisor.
**Testing Procedure:**
- Induce elevated latency or 500-level errors on the Hypervisor endpoint.
- **Verification Criteria:**
  - Gateway circuit breaker transitions to an `OPEN` state after the configured failure threshold.
  - Gateway gracefully returns local/fallback responses to the user.
  - Circuit breaker enters `HALF_OPEN` state after recovery timeout to test service restoration.

### 4. Database Partition / Disconnect
**Objective:** Validate the persistent ledger's write-ahead log (WAL) and cache durability.
**Testing Procedure:**
- Terminate the BadgerDB process or sever the connection to the persistent volume.
- **Verification Criteria:**
  - Active transactions wait or fail gracefully instead of corrupting state.
  - Upon reconnection, WAL replay correctly restores the last known state.
