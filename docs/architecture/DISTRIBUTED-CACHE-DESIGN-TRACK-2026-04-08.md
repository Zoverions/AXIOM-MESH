# Distributed Cache Design Track (M20.6)

Date: 2026-04-08  
Owner: @agent

## Objective

Define a shared cache architecture across Hypervisor, Grid, and Sandbox using Redis/Dragonfly as primary volatile store plus persistent fallback for fail-closed recovery.

## Design Principles

1. Deterministic key contracts across services.
2. Explicit TTL classes by data criticality.
3. Fail-closed behavior for security-sensitive cache misses.
4. Persistent fallback for integrity-critical artifacts.
5. Auditability for cache writes/invalidations in high-risk flows.

## Topology

- **Primary layer:** Redis or Dragonfly cluster (HA mode, replication).
- **Fallback layer:** Persistent store (existing ledger/db object store) for proof/evidence-critical entries.
- **Client layer:** Service-local adapters in Hypervisor/Grid/Sandbox with common envelope metadata.

## Data Classes

### Class A — Integrity-Critical (must persist)

Examples: zk proof verdicts, signed evidence hashes, approval trace pointers.

- Write path: primary + persistent fallback (dual-write with idempotent upsert).
- Read path: primary first, fallback on miss.
- TTL: long in primary (e.g., 7 days) + persistent indefinite/retention policy.

### Class B — Performance-Critical (recomputable)

Examples: embedding vectors, intermediate planning context, route scoring snapshots.

- Write path: primary only.
- Read path: primary only; recompute on miss.
- TTL: short/medium (minutes to hours).

### Class C — Session/Ephemeral

Examples: transient worker leases, callback correlation tokens.

- Write path: primary only with strict TTL.
- Read path: primary only.
- TTL: very short (seconds to minutes).

## Key Schema Convention

`<domain>:<entity>:<version>:<hash>`

Examples:
- `zkml:proof_verdict:v1:<proof_hash>`
- `render:evidence:v1:<attestation_id>`
- `sandbox:session:v1:<session_id>`

## Consistency + Invalidation

- Use write-through for Class A.
- Use cache-aside for Class B.
- Use lease/lock tokens for concurrent Class C updates.
- Invalidation events must be emitted on policy version changes and key-rotation events.

## Service Integration Tracks

### Hypervisor

- Add cache abstraction for planner/context + attestation lookups.
- Bind render evidence cache keys to attestation envelope id.

### Grid

- Promote existing proof cache access to typed cache client.
- Add fallback reads to persistent ledger for Class A misses.

### Sandbox

- Cache short-lived execution session metadata and allowlist checks.
- Enforce strict TTL and purge on emergency halt.

## Operational Controls

- Metrics: hit ratio, latency p95/p99, fallback-read rate, stale-read rate, eviction rate.
- Alerts: fallback-read spike, replication lag, keyspace memory pressure.
- Security: authn/authz to cache, TLS in transit, keyspace isolation by service.

## Rollout Phases

1. **Phase 1:** shared key schema + adapters (no behavior change).
2. **Phase 2:** Class A dual-write and fallback-read in Grid + Hypervisor.
3. **Phase 3:** Sandbox session cache and unified observability dashboards.
4. **Phase 4:** resilience drills (cache outage, split-brain, stale key poisoning).

## Acceptance Criteria

- Class A data recoverable after primary cache loss.
- No security-sensitive flow proceeds on unverifiable cache miss.
- Cross-service key schema documented and conformance-checked in CI.
- Measured p95 latency improvement for targeted read paths.

