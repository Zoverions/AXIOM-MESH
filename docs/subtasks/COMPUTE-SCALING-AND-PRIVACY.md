# Compute Structure & Scaling Resilience Subtasks (Lane M14)

## Architecture Overview
As AXIOM-MESH usage scales, the fundamental bottlenecks shift from compute isolation to network discovery and proof verification overhead. Edge nodes ("Symbiotes") face memory and compute exhaustion if routing falls back to global broadcasts, and the blockchain ledger suffers bloat if every intent generates an un-aggregated verification artifact.

This subtask document outlines the engineering plan to solve scale and enforce privacy through structural engineering.

---

## 1. Capability Manifest Enforcement (M14.1)

**Problem:** Agents and Symbiotes can propose memory-intensive or I/O heavy executions without declaring their resource constraints, leading to node exhaustion and memory fragmentation.
**Solution:** A cryptographically signed `Capability Manifest` must be present for every high-stakes execution intent.
**Actionable Task:**
- Modify the Hypervisor (`hypervisor/src/api/server.py`) to validate `intent.metadata["capability_manifest"]`.
- The manifest MUST declare at least: `required_hardware`, `memory_quota_mb`, and `network_scope`.
- If missing or unsigned, the Hypervisor immediately returns a `System Halt` fail-fast response.

## 2. Recursive zkML & Proof Caching (M14.2)

**Problem:** Generating zkML proofs for repeated, common queries introduces massive latency overhead.
**Solution:** Implement multi-level proof caching and recursive folding.
**Actionable Tasks:**
- `grid/internal/zkml/Verifier.go`: Build a multi-level cache (L1 LRU in-memory, L2 Redis, L3 BadgerDB on disk). When a matching intent hash is requested, return the cached proof instantly.
- Integrate recursive SNARKs (e.g. Halo2) so that 100 individual verifiable executions can be aggregated into a single proof commitment before on-chain settlement, slashing gas costs.

## 3. Stigmergic Node Routing (M14.3)

**Problem:** P2P networks degrade to O(N^2) complexity if nodes constantly broadcast state to find capable peers.
**Solution:** Pheromone-based Stigmergy.
**Actionable Task:**
- `grid/internal/swarm/StigmergyCoordinator.go`: Expand the existing pheromone layout. Nodes dynamically leave digital breadcrumbs when they successfully execute specific capabilities.
- Future intent routing paths follow the strongest pheromone gradients to discover the most efficient nodes automatically without a centralized lookup directory.

## 4. Sovereign Scaffold Locality (M14.4)

**Problem:** Executing municipal or corporate tasks on global distributed meshes risks violating GDPR or regional data-residency laws.
**Solution:** Bound routing to Sovereign Scaffolds (Guilds).
**Actionable Task:**
- Implement location-aware logic in `RoutingEngine` (`hypervisor/src/evolution/routing.py`). If an intent is tagged with a Guild ID (e.g., "Ontario Health Guild"), the router must drop any peer manifest lacking a verifiable regional credential, restricting compute solely to that physical boundary.

## 5. Symbiote Privacy & Disclosure Framework (M14.5)

**Problem:** Digital entities risk over-sharing PII when transitioning from a local dedicated mesh to a shared grid node.
**Solution:** Explicit Consent Cryptography.
**Actionable Task:**
- `PrivateVault` endpoints and general Grid synchronization logic must enforce the presence of `X-UCP-Consent` (Universal Consent Protocol) and `X-Requester-DID` headers.
- If these headers are missing, the task fails closed to ensure privacy is *never* sacrificed without the user’s explicit approval.
