# AxiomMesh v2.5.0

AxiomMesh is a multi-service platform for running an AI interaction stack across four services:
- **Gateway (TypeScript/Node):** REST + WebSocket ingress, dashboard, channel adapters.
- **Hypervisor (Python/FastAPI):** context assembly, memory/archive, safety gates, orchestration.
- **Sandbox (TypeScript/Node):** ephemeral code execution through Docker.
- **Grid (Go):** peer networking, cache/graph sync, PoER/zk verification endpoints.

---

## Architecture
- **Pillar 1: Grid (Go)** — P2P node, signatures, cache, graph sync, consensus helpers.
- **Pillar 2: Hypervisor (Python)** — Context engine, archive, AutoResearch, arena/pulse guards, zkML edge proving endpoint.
- **Pillar 3: Sandbox (Node.js)** — Docker-based Python/Node code execution endpoint.
- **Pillar 4: Gateway (TypeScript)** — REST + WS APIs, static dashboard, channel integrations (Discord/Slack/Telegram/WhatsApp).

---

## Current Deployment Reality (Code Audit)

This section reflects the current codebase behavior and replaces earlier duplicate/overstated roadmap entries.

### 1) Running services and baseline health
- `docker-compose.yml` starts `gateway`, `hypervisor`, `sandbox`, `grid`, and `ipfs`.
- Gateway aggregates status checks for Hypervisor/Sandbox/Grid and serves a static dashboard UI.
- Hypervisor, Sandbox, and Grid each expose `/health` endpoints.

### 2) Feature audit by pillar

#### Gateway (Pillar 4)
**Implemented and usable**
- REST intent processing (`/api/v1/intent/process`) with API-key middleware.
- Public test endpoint (`/api/v1/intent/process/public`).
- Web dashboard tabs (chat/status/agents/network/settings/logs/tester).
- Config read/write endpoints for `.env` and local-only guard.
- Channel registry and concrete adapters for Discord/Slack/Telegram/WhatsApp.

**Partial / caveats**
- WebSocket message contract mismatch: server expects a strict schema (`id`, `identity_hash`, `modality`, `input`, `timestamp`) while dashboard chat sends `{ content }`, causing invalid-message errors in normal use.
- Logs endpoint only has full multi-container visibility when Docker socket is mounted in Gateway.
- Auth posture is mixed: protected production intent endpoint exists, but public endpoint is intentionally open for testing.

#### Hypervisor (Pillar 2)
**Implemented and usable**
- Context assembly merges axioms, temporal state, archive search, NCP/MCP context, and optional oracle data.
- Deep archive with graph-like node/edge storage, keyword-based retrieval, and distributed sync/query hooks.
- Dialectic command (`/dialectic`), sandbox execution command (`/exec`), and skill sync command (`/sync_skills`).
- Arena + pulse checks applied before returning responses.
- AutoResearch daemon fetches from multiple real external sources (NCP/ArXiv/Wikipedia/Crossref/Grokipedia) with retry, dedupe, and confidence scoring.

**Partial / caveats**
- `/process` route depends on `HYPERVISOR_API_KEY`; if absent, service returns server configuration errors.
- `process_intent` references `asyncio` without importing it, which can trigger runtime errors on archive sync path.
- AutoTraining loop parses sandbox output incorrectly (expects `stdout` at top-level rather than nested under `result`), so mutation scoring flow is not reliably effective.
- Chainlink oracle integration is endpoint-based and heuristic (feed mapping by query keywords), not an on-chain verified oracle consumer implementation.

#### Sandbox (Pillar 3)
**Implemented and usable**
- `/execute` for Python/Node snippets via `docker run` with memory limits and timeout.
- `/health` endpoint.

**Partial / caveats**
- Security isolation is minimal (container limits + timeout), but no seccomp profile, filesystem policy, or network egress control is enforced in runner arguments.

#### Grid (Pillar 1)
**Implemented and usable**
- HTTP APIs: health, skills, stake, swarm/join, cache, zkml/verify, ccip.
- UDP peer discovery, heartbeat/eviction, peer scoring/failure tracking.
- Broadcast and sync loops for CCIP messages, swarms, web cache, graph updates.
- Graph websocket supports query/sync with signature checks and NIZK proof verification helper.

**Partial / caveats**
- Graph query handler still performs local substring search in memory and is explicitly marked as simulated search behavior.
- Proof systems are lightweight protocol implementations; they are not a complete production trust layer on their own.
- Smart contract code exists (ComputeBond), but no live chain deployment or runtime integration path is wired into Grid API execution.

### 3) Mock/synthetic/simulated areas still present
- **Simulated graph query behavior** in Grid websocket handler comment/path.
- **AutoTraining "human approval" gate** is environment-variable simulated rather than true human-in-the-loop workflow.
- **OpenClaw distillation** enforces a hardcoded sender identity check (`Owner`), which is a placeholder identity/auth model.
- **Distributed/consensus workflows** depend heavily on local networking assumptions and external infra availability (IPFS, Arweave, peers, oracle endpoint, MCP/NCP servers).

---

## Updated Roadmap Progression (Reality-Based)

### Phase 1 — Foundation services and API wiring
**Status: Completed (with hardening needed).**

### Phase 2 — Secure execution layer
**Status: Functionally complete, security hardening pending.**

### Phase 3 — Context + memory + cognition orchestration
**Status: Mostly complete, with reliability gaps.**

### Phase 4 — Decentralized Grid and sync fabric
**Status: Implemented core loops and APIs; production decentralization maturity pending.**

### Phase 5 — Evolution/ACT/zk-enabled verifiability
**Status: Experimental/partial.** Components exist, but several parts remain prototype-grade or not fully integrated into production operations.

---

## Prioritized To-Do List

### Verified as completed
1. **Gateway WebSocket contract mismatch fix (baseline)** is in place: dashboard chat now sends schema-compatible `input` payloads for the WebSocket intent parser.
2. **Hypervisor runtime/reliability bugfixes** are in place: `asyncio` is imported in the API server, and AutoTraining now parses sandbox output from `result.stdout`.
3. **End-to-end integration test coverage (baseline)** exists for Gateway → Hypervisor → Sandbox (stub) intent processing.

### Still to do

### P0 (Critical)
1. **Unify auth model** across REST/WS/dashboard endpoints and remove accidental insecure defaults.
2. **Expand integration tests to include Grid stubs and stricter contract checks** (to move from baseline coverage to robust multi-service coverage).

### P1 (High)
3. **Strengthen interaction layer (human ↔ digital entity):**
   - Add explicit conversation/session identity model across channels.
   - Add memory controls in UI (view/edit/forget/consent scopes).
   - Add response style controls and confidence/provenance display in chat.
4. **Harden sandbox execution security** (seccomp/apparmor, network policy, restricted mounts, stricter runtime profiles).
5. **Improve observability**: structured logs, trace IDs per intent, service-level metrics, and dashboard health with dependency details.
6. **Formalize distributed failure handling** for IPFS/Arweave/Grid outages with retries, backpressure, and clear degraded modes.

### P2 (Medium)
7. **Replace simulated graph query path** with real indexed graph retrieval and ranked multi-peer merge.
8. **Promote zk/zkML flows from interface-level proof checks to production-grade validation pipelines** (artifact lifecycle, key management, deterministic verification workers).
9. **Wire ComputeBond on-chain lifecycle into Grid APIs** (stake/slash events, reconciliation, chain finality handling).
10. **Improve channel adapters** with delivery receipts, rate-limit handling, and per-channel reliability policies.

### P3 (Opportunistic / Novel improvements)
11. **Adaptive interaction policies**: let user select mode (concise/analytical/socratic/executive) and persist preference.
12. **Operator cockpit**: add intent replay, safety decision audit, and "why this answer" decomposition for trust.
13. **Collaborative swarm UX**: expose swarm task planning UI and human approval checkpoints for high-impact actions.
14. **Policy-driven memory governance**: configurable retention TTLs, encryption-at-rest options, and export/delete controls.

---

## Quick Start
1. Copy or create `.env` (set `GATEWAY_API_KEY`, `HYPERVISOR_API_KEY`, model/provider settings, optional channel tokens).
2. Run `make up` (or `docker compose up --build`).
3. Open dashboard at `http://localhost:3000`.
4. Verify health:
   - Gateway: `GET /health`
   - Hypervisor: `GET http://localhost:8000/health`
   - Sandbox: `GET http://localhost:4000/health`
   - Grid: `GET http://localhost:5000/health`

---

## Notes
- This README intentionally distinguishes **implemented**, **partial**, and **simulated** behavior.
- If you are planning production deployment, prioritize the P0/P1 items before scaling network participation.
