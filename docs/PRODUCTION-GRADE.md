# Production Grade
Security model, audit checklist, enterprise deployment.

## Integrated Specifications
# AXIOM-MESH Security Reality Check (March 2026)

This is the implementation-accurate security posture and production-readiness gradecard for AXIOM-MESH as of **March 18, 2026**.

It distinguishes:
1. Controls currently implemented in code.
2. Interconnect security posture between pillars.
3. Production hardening required before financial/critical deployment.

---

## 1) Executive Gradecard

| Domain | Grade | Rationale |
|---|---:|---|
| Gateway edge security | **B-** | API-key auth exists for protected routes/WS; public route has local rate limit; no external WAF/DDOS layer in-repo. |
| Hypervisor policy controls | **B** | Authenticated `/process`, policy gate, AST checks for `/exec`, structured audit trail fields. |
| Sandbox isolation | **B+** | Strong container runtime restrictions (`--network=none`, seccomp, apparmor, no-new-privileges, limits); now supports optional service-to-service API key gate. |
| Grid API security | **C** | Strong domain validation for zkML payloads and bond rules; no pervasive API auth/TLS boundary in current HTTP server. |
| Inter-service interconnects | **C-** | Calls are mostly internal plain HTTP; partial auth boundaries now present on Hypervisor→Sandbox path; no mTLS/service mesh. |
| Auditability & governance trail | **B-** | Safety decision trail and ledger events exist; immutable WORM-grade audit sink and compliance workflow not complete. |
| Production readiness overall | **B- (non-financial prod)** | Suitable for controlled production environments with perimeter controls; not yet financial-grade/regulated-ready by default. |

---

## 2) Implemented Security Controls (Verified)

### Gateway
- Protected REST routes use API-key auth middleware.
- WebSocket connections enforce API-key validation.
- Public intent route (`/api/v1/intent/process/public`) is intentionally unauthenticated but rate-limited.
- Basic content/metadata sanitization is present in ingress processing.

### Hypervisor
- `/process` enforces bearer API key.
- Policy gate checks input length, consent scope validity, and execution-specific consent.
- `/exec` path applies AST denylist checks before sandbox handoff.
- Response payload includes structured `audit_trail.safety_decisions` metadata.
- Hypervisor now forwards optional `SANDBOX_API_KEY` bearer token on sandbox execution calls.

### Sandbox
- Docker execution uses restrictive runtime flags (`--network=none`, CPU/memory/pids limits, cap-drop, seccomp, apparmor, readonly rootfs, tmpfs writes).
- External/high-risk code paths require proof fields (`ase_proof`, `zk_proof`) in current policy model.
- `/execute` now supports optional service-to-service authorization via `SANDBOX_API_KEY` (when set).

### Grid
- zkML endpoint validates required fields, model commitment format, and vector/artifact size bounds.
- Bond/stake logic enforces minimums and status checks.
- Ledger supports persistence snapshot save/load and event reconcile primitives.

---

## 3) Interconnect Security Grade (Pillar-to-Pillar)

| Interconnect | Current state | Grade | Required to reach A |
|---|---|---:|---|
| Client → Gateway | API key on protected routes + WS; public route rate-limited | **B-** | Add managed WAF, bot defense, geo/IP reputation, distributed rate-limit, SIEM alerts |
| Gateway → Hypervisor | Bearer API key on `/process`, retries/backpressure | **B** | mTLS, request signing, per-route scoped service identity |
| Hypervisor → Sandbox | Hardened sandbox + optional bearer auth (`SANDBOX_API_KEY`) | **B** | Mandatory mTLS + mandatory auth + nonce/replay protection |
| Gateway → Grid | Internal HTTP calls, no strong API auth boundary by default | **C-** | Service authn/authz for Grid APIs, mTLS, signed mutation requests |
| Hypervisor ↔ Grid | URL-config driven, mixed trust assumptions | **C** | Formal service accounts, signed events, anti-replay, consensus-finality aware event consumer |
| Grid ↔ Chain (optional client) | Optional on-chain mirror calls | **C** | Production listener/replay with reorg handling, key isolation (HSM/KMS), finality SLOs |

---

## 4) Production Gaps (Blocking for Financial-Grade)

1. **No mandatory service-to-service mTLS across pillars.**
2. **Grid mutation endpoints are not consistently protected by strong service auth in current server layer.**
3. **No repository-native WORM/immutable audit sink policy with retention and legal hold controls.**
4. **No full chain listener/replay/finality subsystem with tested reorg semantics.**
5. **No formal secrets rotation/attestation workflow across all services in this repo alone.**

---

## 5) Build-Out Plan to Production (Interconnect First)

### Phase P0 (Immediate hardening)
- Enforce `SANDBOX_API_KEY` in all non-dev deployments.
- Remove unrestricted public ingress in production profile or enforce strict upstream gateway/WAF policy.
- Add network policy to restrict east-west traffic to explicit service pairs only.

### Phase P1 (Service identity)
- Introduce mTLS between Gateway, Hypervisor, Sandbox, and Grid.
- Add signed service-to-service requests (timestamp + nonce + signature) for mutation endpoints.
- Add Grid API auth boundary for all non-read routes.

### Phase P2 (Audit and chain reliability)
- Ship immutable audit event sink (append-only object store or ledger-backed WORM policy).
- Implement chain event listener with replay cursor, confirmation depth policy, and reorg rollback handlers.

### Phase P3 (Operational maturity)
- Add alerting SLOs: auth failures, sandbox denial rates, zk verification latency/error budget, and policy gate rejects.
- Add incident response runbooks and automated key rotation drills.

---

## 6) Deployment Label Guidance

- **Allowed today:** internal production, controlled enterprise pilots, and security-supervised deployments with external perimeter controls.
- **Not allowed today (without additional controls):** financial-grade, high-compliance, or adversarial internet exposure without mTLS + Grid auth boundary + immutable audit sink.

In short: AXIOM-MESH is strong relative to prototype agent stacks, but still requires interconnect hardening and audit immutability completion to claim full production-grade trust posture.
# AXIOM-MESH Security Hardening Guide

## MCP (Model Context Protocol) Security Architecture [PRIORITY: CRITICAL]

### Identified Vulnerabilities
- **Tool Poisoning:** 5.5% of MCP servers exhibit tool poisoning patterns; 7.2% contain general vulnerabilities.
- **Confused Deputy Problem:** MCP servers may execute actions with server permissions rather than user permissions.
- **Prompt Injection:** Malicious prompts can instruct agents to write insecure code or modify databases without authorization.
- **Supply Chain Risks:** Unsigned MCP servers with typosquatting potential.

### Required Implementation
1. Implement mandatory code signing verification for all MCP servers.
2. Deploy gVisor or Kata Containers for MCP server isolation (not just Docker).
3. Implement OpenTelemetry tracing for all MCP interactions.
4. Create a centralized MCP server inventory with automated shadow deployment detection.

## Sandbox Escape Prevention [PRIORITY: CRITICAL]

### Vulnerability Context
- CVE-2024-1753: Buildah/Podman mount escape via symbolic links.
- CVE-2024-21626: runc container escape via file descriptor manipulation.
- 2024-2025: Multiple Docker vulnerabilities in BuildKit and Moby.

### Required Implementation
1. Wire Rust `airgap.rs` into the default Node.js sandbox runtime path.
2. Implement seccomp-bpf profiles custom to AXIOM (block execve, ptrace, mount).
3. Add cgroup v2 resource limits to prevent fork bombs.
4. Enable Docker Content Trust for image verification.

## zkML Verification Pipeline Hardening [PRIORITY: HIGH]

### Industry Context
- Hardware acceleration: ASICs expected mid-2027 for 1B+ parameter models.
- Lagrange DeepProve: 54-158x faster than EZKL, first complete GPT-2 proofs.

### Required Implementation
1. Implement multi-level proof caching (L1: in-memory LRU, L2: Redis, L3: BadgerDB).
2. Add verification key CDN distribution for fast access.
3. Design recursive proof composition for batch skill verification.
4. Abstract hardware acceleration layer for future GPU/ASIC integration.
# Test Strategy & CI Acceptance Gates

## Test Strategy
The AXIOM-MESH testing approach ensures robust coverage across all four pillars (Gateway, Hypervisor, Sandbox, Grid) with a focus on cryptographic integrity, execution isolation, and decentralized consensus.

1. **Unit Testing**:
   - **Python (Hypervisor)**: Uses `pytest` and `pytest-asyncio` focusing on orchestrator logic, hardware profiling, `ResourceBalancer`, and mock CRDT sync. Run with `PYTHONPATH=.:src:../ pytest tests/`.
   - **Node.js (Gateway/Sandbox)**: Uses `jest` (and `ts-jest`) for API validation, intent parsing, and sandbox isolation validation.
   - **Go (Grid)**: Uses `go test` for ledger state, ECDSA signing, P2P logic, and zkML verification primitives. Run with `go test -v ./...`.
2. **Integration Testing**:
   - Uses a Docker Compose matrix for verifying cross-pillar communication (`Gateway -> Hypervisor -> Sandbox/Grid`).
3. **Chaos & Degraded Mode Testing**:
   - Explicit CI matrix simulating disconnected network modes to verify Offline-first and Degraded-mode resilience (configured in `.github/workflows/ci.yml`).
4. **Smart Contract Verification**:
   - Hardhat tests (`npx hardhat test` inside `grid/contracts`) for solidity contract lifecycle events.

## CI Acceptance Gates
Before any pull request can be merged into `main`, the following gates must pass:

1. **Lint & Formatting**: `flake8` for Python, `go vet` for Go, and `tsc --noEmit` for TypeScript.
2. **Test Suites**: All language-specific test suites (Go, Python, Node-Gateway, Node-Sandbox) must pass successfully.
3. **Network Resilience Matrix**: The `integration-matrix` job must succeed in both `connected` and `disconnected` modes, demonstrating graceful degradation.
4. **Security Scans**: Container hardening configurations (e.g., `network=none` for Sandbox) must remain intact.
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

### 4. Ledger Snapshot Persistence Disruption
**Objective:** Validate Grid snapshot durability and startup restore behavior.
**Testing Procedure:**
- Corrupt or remove `GRID_LEDGER_PATH` snapshot file, then restart Grid.
- Simulate write failures to the snapshot directory (permission/volume fault).
- **Verification Criteria:**
  - Grid starts with explicit warning logs (no silent corruption).
  - Fresh in-memory ledger initializes safely if snapshot load fails.
  - Periodic snapshot saves resume once storage is restored.
# AXIOM-MESH Hardware Profile Matrix

This document defines the hardware profiles supported by the AXIOM-MESH system. These profiles dictate resource allocation, task routing (via the `ResourceBalancer`), and security capabilities across the network.

## Profiles

### 1. `full_node`
- **Minimum Requirements**: 16GB+ RAM, 8000MB+ VRAM.
- **Capabilities**: Can run full local zkML proofs, host large local models (e.g., `llama3:8b`, `qwen2.5-coder:7b`, `mistral:7b`), and participate fully in the Grid ledger consensus.
- **Network Role**: Primary compute provider, relayer, and full archiver. Ideal for handling heavy network tasks and deep archival queries.

### 2. `edge`
- **Minimum Requirements**: 8GB+ RAM, <8000MB VRAM.
- **Capabilities**: Can run smaller localized models, participate in partial mesh routing, and perform lighter zkML verifications.
- **Network Role**: Edge node, local inference, and partial participant in consensus. Functions as a reliable intermediate node.

### 3. `tablet` (or legacy/constrained devices)
- **Minimum Requirements**: <8GB RAM.
- **Capabilities**: Highly constrained. Uses minimal local models (e.g., `llama3:1b`) and relies heavily on the Grid and L1 network for heavier operations via `ResourceBalancer`.
- **Network Role**: Thin client, offline-first sync participant, reliant on P2P and L1 for complex cryptographic and AI tasks.

## Enforcement
The `HardwareScanner` (`hypervisor/src/evolution/hardware.py`) automatically determines the local node's profile on startup. The `ResourceBalancer` routes traffic to local, P2P, Grid, or L1 based on this hardware footprint.
# ResourceBalancer Policy

## Overview
The ResourceBalancer is a core routing node in the Hypervisor's execution graph (currently implemented in `hypervisor/src/graph/autoresearch_graph.py`). Its primary function is to dynamically route computational tasks to the most appropriate execution environment based on task complexity, required security, and intent. It ensures that resources are allocated efficiently while maintaining the rigorous security guarantees of the AXIOM-MESH network.

## Routing Heuristics
The policy evaluates the user or agent intent to determine the optimal execution path. The current decision matrix is as follows:

1.  **Local (Default):**
    *   **Intent Keywords:** N/A (Fallback)
    *   **Priority Tag:** `normal`
    *   **Use Case:** Standard, low-complexity tasks that do not require distributed consensus or high security. Executed within the local sandbox.

2.  **Peer (P2P):**
    *   **Intent Keywords:** `peer`, `offload`
    *   **Priority Tag:** `low`
    *   **Use Case:** Tasks that can be offloaded to trusted peers within the MCP compatibility matrix. Used for parallelizing workloads or accessing distributed knowledge without the overhead of full Grid consensus.

3.  **Grid (Consensus):**
    *   **Intent Keywords:** `consensus`, `grid`
    *   **Priority Tag:** `high`
    *   **Use Case:** Tasks requiring zero-knowledge proofs (zkML), Proof-of-Execution-Result (PoER) validation, or updates to the distributed knowledge graph. This path leverages bonded nodes and enforces strict verification.

4.  **L1 (Settlement):**
    *   **Intent Keywords:** `settle`, `l1`
    *   **Priority Tag:** `critical`
    *   **Use Case:** High-value transactions, permanent state anchors, or cross-chain operations (e.g., via CCIP). This is the most secure but also the most expensive execution path.

## Cost-Benefit Evaluation Criteria
When determining the routing decision, the ResourceBalancer considers the following factors:
*   **Security vs. Speed:** Grid and L1 paths offer high security (zk-proofs, immutable ledgers) but incur higher latency and token costs. Local and Peer paths are faster but rely on local sandboxing and peer trust (MCP profiles).
*   **Treasury Implications:** Routing to the Grid or L1 automatically triggers treasury split calculations, ensuring that network security and wealth generation pools are funded appropriately from the transaction costs.
*   **Hardware Profile:** The decision also factors in the local hardware capabilities (e.g., 'edge', 'full_node'). Devices with lower capabilities will naturally bias towards Peer or Grid routing for complex tasks.
# MCP Integration: Work In Progress & Troubleshooting

## Current Status
This document details the progress made towards implementing the enhancements specified in `AGENT-ENHANCEMENTS.md`, specifically the 2026 Framework Integrations.

**Completed successfully:**
*   Updated `README.md` to include the Framework Comparison.
*   Updated `plan.md` to reflect the new Phase 5 roadmaps.
*   Updated `docs/MASTER-INTEGRATION.md` with the full consolidated Master Directive v2.1.
*   Integrated **LangSmith tracing** into `hypervisor/src/graph/autoresearch_graph.py` (toggled via the `LANGSMITH_TRACING_ENABLED` environment variable).
*   Created the **MCP Server** logic in `hypervisor/src/api/mcp_server.py` using `mcp.server.fastmcp.FastMCP` (including tools for `sandbox_execute` and `register_grid_skill`, and required security validations).
*   Added `mcp` and `sse-starlette` to `hypervisor/requirements.txt`.

## Blockers & Next Steps

**The primary blocker is integrating the `mcp_server` (FastMCP) into the existing FastAPI application (`hypervisor/src/api/server.py`).**

### Issues Encountered:
1.  **FastMCP Native APIs:** The `FastMCP` class does not reliably expose an `sse_app` property or a direct mounting method (like `to_fastapi_app()`) that works universally out-of-the-box across all `mcp` SDK versions without generating an `AttributeError`.
2.  **SseServerTransport Wrapping:** Attempting to manually create SSE endpoints (e.g., `/mcp/sse` and `/mcp/messages`) and wrapping the transport logic inside `sse_starlette.EventSourceResponse` caused hanging connections. The ASGI protocol logic inside `mcp_transport.connect_sse` requires raw ASGI streams (`scope`, `receive`, `send`), which clash with FastAPI's standard response handling.
3.  **FastAPI Routing Overwrites:** Attempting to mount the raw ASGI transport handlers directly to `app.routes.append(Route(...))` inexplicably caused existing FastAPI routes (like `/health`) to return 404s during test initialization (`test_server_startup.py`).

### Instructions for Next Agents:
*   Review `hypervisor/src/api/mcp_server.py`. The tool logic and security requirements (identity chains, prompt injection defense, etc.) are implemented there but should be tested once mounted.
*   Find the canonical, stable method to mount an `mcp` (or `FastMCP`) server inside an existing `FastAPI` application (running on uvicorn) using SSE transport.
*   Modify `hypervisor/src/api/server.py` to import `mcp_server` and mount its endpoints without breaking the core application routes.
*   Once mounted, verify the functionality using an external MCP client (like AgentZero or an MCP Inspector).
