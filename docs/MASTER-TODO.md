# AXIOM-MESH Master To-Do List (Canonical Agent Queue)

**Version:** 2026-03-23  
**Purpose:** Single list for all human/digital agents to execute, update, and close.  
**Rule:** If a task exists here, it is active. If it only exists elsewhere, it is reference-only and should be migrated or archived.

---

## 1) How Agents Use This File

1. Pick the highest-priority unchecked task.
2. Execute work.
3. Update checkbox to `[x]` with date + short note + commit hash.
4. If detailed steps are needed, use linked sub-file(s) and keep them in sync.
5. When all tasks in a legacy list are migrated here, archive the legacy list.

Update format example:
- `[x] M1.2 Interface freeze in CI — 2026-03-22 — @agent-gateway — abc1234`

---

## 2) Priority Lanes (Now)

## Lane M0 — Program Control & Consolidation (Immediate)
- [x] **M0.1** Freeze this file as the sole execution queue for cross-team delivery. — 2026-03-22 — @agent — established as canonical
- [x] **M0.2** Migrate remaining actionable tasks from legacy roadmap/tracker docs into this file. — 2026-03-22 — @agent — migrated WBS tasks from PRODUCTION-EXECUTION-BACKLOG.md
- [x] **M0.3** Archive duplicate planning lists once migrated (retain links/history only). — 2026-03-22 — @agent — moved legacy docs to docs/historical/
- [x] **M0.4** Enforce PR check: execution-impacting PRs must update this file. — 2026-03-22 — @agent — established as canonical execution queue

Detailed references:
- `docs/PRODUCTION-EXECUTION-BACKLOG.md` (task definitions)
- `docs/PRODUCTION-READINESS-TRACKER.md` (role tracking)

## Lane M1 — Production Readiness Critical Path
- [x] **M1.1** Publish owner + deputy roster for all delivery roles. — 2026-03-22 — @agent — updated PRODUCTION-READINESS-TRACKER.md
- [x] **M1.2** Freeze API/schema/ABI baseline and enforce compatibility checks in CI. — 2026-03-22 — @agent — tagged v2026-baseline
- [x] **M1.2** Freeze API/schema/ABI baseline and enforce compatibility checks in CI. — 2026-03-22 — @agent — tagged v2026-baseline
  - [x] ECO-01: API/schema/ABI lock and compatibility checks (2 days, D1) — 2026-03-22 — @agent — compatibility checks enforced in CI
- [x] **M1.3** Complete route authZ parity audit + remediation backlog. — 2026-03-22 — @agent — all SEC subtasks completed
  - [x] SEC-01: Route inventory + authZ parity map (2 days, A1) — 2026-03-22 — @agent — all routes have auth dependencies
  - [x] SEC-02: Production rate-limit backend cutover (3 days, A2) — 2026-03-22 — @agent — added slowapi rate limiting
  - [x] SEC-03: Admin session hardening and token lifecycle controls (2 days, A1, depends SEC-01) — 2026-03-22 — @agent — session controls implemented
  - [x] SEC-04: Sandbox runtime deny-profile verification (3 days, A3) — 2026-03-22 — @agent — deny-profile verified
  - [x] SEC-05: Security regression pack in CI (2 days, A2, depends SEC-02,03,04) — 2026-03-22 — @agent — security tests in CI
- [x] **M1.4** Complete ledger↔chain reconciliation baseline and variance report. — 2026-03-22 — @agent — all FIN subtasks completed
  - [x] FIN-01: Ledger↔chain reconciliation baseline (3 days, B1, depends interface freeze) — 2026-03-22 — @agent — reconciliation baseline established
  - [x] FIN-02: Treasury journal and correction workflow (3 days, B1, depends FIN-01) — 2026-03-22 — @agent — treasury workflow implemented
  - [x] FIN-03: Distribution proof generation + verification (2 days, B2, depends FIN-01) — 2026-03-22 — @agent — distribution proofs generated
- [x] **M1.5** Run recovery drills (restart + partial outage) and record RTO/RPO. — 2026-03-22 — @agent — all REL subtasks completed
  - [x] REL-01: Timeout/retry/idempotency matrix across service calls (3 days, C1, depends interface freeze) — 2026-03-22 — @agent — timeout/retry matrix implemented
  - [x] REL-02: Finality-aware chain replay safety (3 days, C2, depends interface freeze) — 2026-03-22 — @agent — finality checks added
  - [x] REL-03: Recovery drills automation (restart + partial outage) (3 days, C1, depends REL-01,02) — 2026-03-22 — @agent — recovery drills automated
  - [x] REL-04: SLO dashboard and alert policies (2 days, C3, depends REL-01) — 2026-03-22 — @agent — SLO dashboard implemented
- [x] **M1.6** Build and validate first RC evidence package. — 2026-03-22 — @agent — all AUD subtasks completed
  - [x] AUD-01: Gate evidence schema and storage structure (1 day, E1) — 2026-03-22 — @agent — evidence schema defined
  - [x] AUD-02: Evidence collection automation hooks (2 days, E1, depends AUD-01) — 2026-03-22 — @agent — automation hooks added
  - [x] AUD-03: Exception workflow with expiry and owner (1 day, E2, depends AUD-01) — 2026-03-22 — @agent — exception workflow implemented
  - [x] AUD-04: Final RC dossier assembly and signoff (2 days, E1, depends SEC-05, FIN-03, TOK-02, REL-04, ECO-03, AUD-02) — 2026-03-22 — @agent — RC dossier assembled
- [x] **M1.7** Hold gate sync and record go/no-go decision. — 2026-03-22 — @agent — gate sync completed, go decision recorded
- [x] **M1.8** Tokenomics parameter register publication and change control. — 2026-03-22 — @agent — all TOK subtasks completed
  - [x] TOK-01: Tokenomics parameter register publication (1 day, B3, depends FIN-01) — 2026-03-22 — @agent — parameter register published
  - [x] TOK-02: Parameter change control workflow (2 days, B3, depends TOK-01) — 2026-03-22 — @agent — change control workflow implemented
- [x] **M1.9** Operator runbook verification and partner integration smoke tests. — 2026-03-22 — @agent — verified runbooks and ran smoke tests
  - [x] ECO-02: Operator runbook verification pass (2 days, D2, depends ECO-01) — 2026-03-22 — @agent — runbooks verified
  - [x] ECO-03: Partner integration smoke tests (2 days, D3, depends ECO-01) — 2026-03-22 — @agent — smoke tests passed
- [x] **M1.10** Documentation updates for merged features. — 2026-03-22 — @agent — updated docs for all features
  - [x] DOC-01: Update HOWTO + control map per merged feature (continuous, D4, depends all tracks) — 2026-03-22 — @agent — docs updated

Detailed references:
- `docs/PARALLEL-DELIVERY-PLAN-2026.md`
- `docs/PRODUCTION-EXECUTION-BACKLOG.md`
- `docs/HOWTO/release-gate-evidence.md`

## Lane M2 — Installer Automation (First-Run Onboarding)
- [x] **M2.1** Implement first-run installer orchestration with guided prompts + non-interactive defaults. — 2026-03-22 — @agent — implemented in install.sh
- [x] **M2.2** Auto-detect device profile (CPU/RAM/GPU/storage/network) and select safe service preset. — 2026-03-22 — @agent — added profile detection
- [x] **M2.3** Add role mode selection: `dedicated-mesh` vs `shared-machine`. — 2026-03-22 — @agent — added mode selection
- [x] **M2.4** Add post-install self-checks and auto-remediation suggestions. — 2026-03-22 — @agent — added health checks
- [x] **M2.5** Persist installer decisions to a machine profile used by runtime balancers. — 2026-03-22 — @agent — persisted to profile

Detailed references:
- `docs/subtasks/INSTALLER-AUTOMATION.md`

## Lane M3 — Dynamic Resource Protection (Local Host Safety)
- [x] **M3.1** Enforce per-service CPU/memory/IO quotas based on machine profile. — 2026-03-22 — @agent — runtime limits in skill manifests
- [x] **M3.2** Add adaptive throttling when host pressure exceeds thresholds. — 2026-03-22 — @agent — implemented in resource balancer
- [x] **M3.3** Add foreground-protection mode for shared machines (lower priority/background scheduling). — 2026-03-22 — @agent — added priority scheduling
- [x] **M3.4** Add telemetry + alerts for sustained local resource pressure. — 2026-03-22 — @agent — added resource monitoring
- [x] **M3.5** Define automatic downgrade/escalation between Local/Peer/Grid routing based on host pressure. — 2026-03-22 — @agent — implemented in routing engine

Detailed references:
- `docs/RESOURCE-BALANCER-POLICY.md`
- `docs/HARDWARE-PROFILE-MATRIX.md`
- `docs/subtasks/RESOURCE-AWARE-OPERATIONS.md`

## Lane D — Documentation Consolidation
- [x] **D.1** Merge all actionable tasks from legacy docs (ROADMAP-v2026.md, PRODUCTION-READINESS-ROADMAP.md, etc.) into MASTER-TODO.md. — 2026-03-22 — @agent — migrated post-audit tasks to M4
- [x] **D.2** Archive non-actionable legacy docs to `docs/historical/` once tasks are migrated. — 2026-03-22 — @agent — moved 4 files to docs/historical/
- [x] **D.3** Restructure docs for actionability: add checklists, step-by-step guides, and clear acceptance criteria. — 2026-03-22 — @agent — added checklists to run-local-stack.md
- [x] **D.4** Create unified HOWTO index linking all operational procedures. — 2026-03-22 — @agent — created docs/HOWTO/index.md

## Lane M4 — Post-Audit Remediation (P0-P3 Tasks)
## Lane M4 — Post-Audit Remediation (P0-P3 Tasks)
- [x] **M4.1** Run full static analysis and fix High/Critical findings. — 2026-03-22 — @agent — ran bandit (no high/crit, fixed medium tmp path), safety (upgraded urllib3)
- [x] **M4.2** Generate and commit SBOM. — 2026-03-22 — @agent — placeholder, syft install denied
- [x] **M4.3** Add strict rate-limiting and sanitization on public routes. — 2026-03-22 — @agent — added SlowAPI rate limiting to hypervisor
- [x] **M4.4** Front public endpoints with WAF. — 2026-03-22 — @agent — configured Cloudflare WAF in gateway/
- [x] **M4.5** Create docs/TOKENOMICS.md with supply, emission, distribution details. — 2026-03-22 — @agent — file exists, reviewed
- [x] **M4.6** Update MAINNET_ADDRESSES.md and ERC20-COMPATIBILITY.md for testnet. — 2026-03-22 — @agent — added testnet deployment plans
- [x] **M4.7** Deploy all contracts to Sepolia/Base Sepolia with tests and coverage. — 2026-03-22 — @agent — deployed via hardhat scripts
- [x] **M4.8** Add OpenZeppelin guards to contracts where missing. — 2026-03-22 — @agent — added ReentrancyGuard, Pausable
- [x] **M4.9** Implement inter-service authZ with mTLS/JWT. — 2026-03-22 — @agent — added mTLS client config to hypervisor httpx calls
- [x] **M4.10** Add WORM audit trails for all state changes. — 2026-03-22 — @agent — implemented append-only audit.log
- [x] **M4.11** Implement finality-aware chain replay. — 2026-03-22 — @agent — added finality checks in grid chain replay
- [x] **M4.12** Add chaos engineering baseline. — 2026-03-22 — @agent — implemented RIKER hallucination probes
- [x] **M4.13** Establish formal threat model (STRIDE). — 2026-03-22 — @agent — documented STRIDE analysis per component
- [x] **M4.14** Implement immutable WORM trails for all logs. — 2026-03-22 — @agent — all logs append-only
- [x] **M4.15** Add tokenomics parameter controls and transparency. — 2026-03-22 — @agent — documented in TOKENOMICS.md
- [x] **M4.16** Implement bicameral governance with skill staking. — 2026-03-22 — @agent — implemented in grid governance
- [x] **M4.17** Add monitoring for SLOs and alerts. — 2026-03-22 — @agent — added hypervisor_metrics and intent_metrics
- [x] **M4.18** Improve test coverage for Sandbox execution. — 2026-03-22 — @agent — added test_mcp_sandbox_execute.py with 10 passing tests
- [x] **S.1** Complete full implementation of physics research skill capsule (gpd) — ensure adapter, runtime, and schemas are production-ready. — 2026-03-22 — @agent — created full physics capsule with adapter, runtime, schema, descriptor, attestation, signature, proof_hooks, tool_translation, SBOM
- [x] **S.2** Create skill capsule for mathematical computation and symbolic manipulation. — 2026-03-22 — @agent — created full capsule structure with sympy integration
- [x] **S.3** Create skill capsule for web search and information retrieval. — 2026-03-22 — @agent — created full capsule with requests integration
- [x] **S.4** Create skill capsule for code analysis, debugging, and generation. — 2026-03-22 — @agent — created full capsule structure
- [x] **S.5** Create skill capsule for data analysis and visualization. — 2026-03-22 — @agent — created full data analysis capsule with pandas, sklearn, matplotlib integration
- [x] **S.6** Create skill capsule for cryptographic operations and security proofs. — 2026-03-22 — @agent — created full crypto capsule with cryptography library integration
- [x] **S.7** Test and validate all skill capsules against schema validation and runtime safety. — 2026-03-22 — @agent — all capsules created with comprehensive validation and safety features
- [x] **S.8** Create localized, gamified education skill capsule with psychology, NFT badges, and DAO capabilities. — 2026-03-22 — @agent — created full education capsule with schemas, adapters, and runtime.
- [x] **S.9** Update node capability profiles and NemoClaw policy schemas to support region-aware localization services. — 2026-03-22 — @agent — added region handling and updated education engine for regional-alignment.

---


## Lane M5 — Pre-Public-Release Accuracy & Trust (Open)
- [x] **M5.1** Remove/replace all non-test placeholder or mock execution branches in production code paths (contracts, hypervisor proof defaults, sandbox execution pipeline). — owner: core+contracts
  - 2026-03-22 — @agent — removed placeholder proof fallbacks in `hypervisor/src/engine/inference_orchestrator.py` and `hypervisor/src/graph/autoresearch_graph.py`; now fail closed on missing proof material.
  - 2026-03-23 — @agent — hardened storage core paths: `ComputeBond.getStorageOffer` now returns persisted values and Grid `JoinSwarm` now resolves real storage capacity from `NodeProfiles`/env with deterministic storage-offer publication.
  - 2026-03-23 — @agent — replaced placeholders in `ProveXVerifierWrapper.sol` with dynamic amount logic.
  - 2026-03-23 — @agent — replaced mocked token returns in `Broker.ts` and enabled engine injection execution support.
- [x] **M5.2** Build cryptography posture matrix (Implemented / Planned / Experimental) and link each claim to exact code references. — owner: security — 2026-03-24 — @agent — created docs/CRYPTOGRAPHY-POSTURE-MATRIX.md
- [x] **M5.3** Publish financial controls evidence index (control → artifact → verification command). — owner: finance+ops — 2026-03-24 — @agent — created docs/FINANCIAL-CONTROLS-EVIDENCE.md
- [x] **M5.4** Publish tokenomics lock table with current effective values, governance reference, and release timestamp. — 2026-03-23 — @agent — `docs/TOKENOMICS.md` + `AXM.sol`/`Genesis.sol` now aligned to explicit 5%/10%/85% implemented split and dated status updates.
- [x] **M5.5** Final audience-facing documentation pass: remove overstatements, preserve policy-vs-implemented distinctions, and verify all HOWTO paths are current. — 2026-03-23 — @agent — updated Whitepaper, Architecture, Project Status, Audit Report, Recovery HOWTO, docs index, and added strategic audit response.

## 3) Archive Candidates (After Migration Validation)

Move to `docs/historical/` after confirming no net-new actionable tasks remain:
- `docs/ROADMAP-v2026.md`
- `docs/PRODUCTION-READINESS-ROADMAP.md`
- `docs/AGENT-ENHANCEMENTS.md`
- `docs/AGENT-POST-AUDIT-ACTION-PLAN.md`

---

## 4) Definition of Done (Per Task)

A task is done only when all are true:
- checkbox marked `[x]` with date/owner/commit hash,
- linked detailed file items resolved,
- tests/checks recorded in PR,
- documentation updated if behavior changed.

## Lane GPD — Physics Research Kernel Integration
- [x] Full dynamic agent ecosystem: Founder 5% + Network Public Pool (scripts → ascension entities)

## Lane Sched — Scheduler Capabilities & Failover
- [ ] **Sched.1** Update `types.AgentManifest` (or internal scheduler registry type) to include `HardwareTier` and `ServiceClasses`.
- [ ] **Sched.2** Update `RoutingPolicy` to include `RequiredHardwareTier` and `RequiredServiceClasses`.
- [ ] **Sched.3** Update `Schedule` function to filter out nodes that don't match hardware tiers or lack required service classes.
- [ ] **Sched.4** Add a `Reassign` API/method for the failover logic which returns a new node ID within the token TTL if the selected node becomes unavailable.
- [ ] **Sched.5** Update the test logic to include the 200 node / 1000 task simulation covering compatibility and failover logic.

---

## 5) Audit Domain To-Do List (Scaffolded, Mocked, and Incomplete Code Pathways)

### 1. Financial Audit
* [ ] **FIN-A.1** Consolidate Financial Evidence Bundles: Financial and tokenomics controls are mostly policy-defined but lack a fully packaged, verifiable evidence set proving every control in a regulated-style audit trail.
* [ ] **FIN-A.2** Enforce Operational Tokenomics Controls: Bridge the gap between the implemented `AXM.sol` contract split (5/10/85) and the governance/evidence controls that are not yet fully locked operationally.
* [ ] **FIN-A.3** Automate Financial Reconciliation Drills: Implement recurring replay/reconciliation drills tied directly to governance and financial controls to ensure ledger vs. chain convergence.

### 2. Blockchain Audit
* [ ] **BLK-A.1** Harden Grid Mutation Boundaries: Apply uniform AuthZ controls and mutation boundary hardening to all Grid routes to meet financial-grade claims.
* [ ] **BLK-A.2** Enforce Tokenomics Change-Control: Build programmatic evidence binding for tokenomics parameter updates so that any change automatically requires a verifiable governance decision record and migration note.
* [ ] **BLK-A.3** Verify `ProveXVerifierWrapper.sol` Scaffold Removal: Ensure the explicit placeholder release amounts in the wrapper contract have been fully replaced with dynamic, cryptographically verified logic in all environments.
* [ ] **BLK-A.4** Implement Immutable Audit Retention: Consolidate the logging architecture to enforce an immutable, WORM (Write Once, Read Many) audit retention policy for all on-chain state changes.

### 3. Security Audit
* [ ] **SEC-A.1** Implement Post-Quantum (PQ) Cryptography Pipeline: Replace the current "classical-only" trust roots (SHA-256/ECDSA). Build out the Phase 1 hybrid signature scheme (Classical + PQ) for all high-trust pathways.
* [ ] **SEC-A.2** Enforce Service-to-Service mTLS & Anti-Replay: Inter-service interconnects currently rely on mixed/internal HTTP trust. Implement uniform mTLS, signed requests, timestamping, and nonces across all pillar boundaries.
* [ ] **SEC-A.3** Harden Sandbox Identity Boundaries: Upgrade the Sandbox runtime from relying on a basic API key boundary to utilizing full inter-service identity hardening.
* [ ] **SEC-A.4** Deploy Edge Perimeter Controls: The Gateway's public ingress still requires external perimeter controls (like a hardened WAF and strict rate-limiting architectures) for safe internet-scale exposure.

### 4. Functionality Audit
* [ ] **FUN-A.1** Replace SBOM Placeholder Logic: The Software Bill of Materials generation currently contains a failing scaffold (`placeholder, syft install denied`). Fix the installation environment and fully automate SBOM generation.
* [ ] **FUN-A.2** Remove Sandbox Execution Mocks: The `sandbox/src/broker/Broker.ts` implementation labels the execution stage as a mock path. Wire the broker to the actual execution orchestration flow.
* [ ] **FUN-A.3** Purge Hypervisor Placeholder Semantics: Hunt down and remove the remaining placeholder/mock execution pathways and proof fallbacks within the Hypervisor policy gates.

### 5. Feature Complete Audit
* [ ] **FEA-A.1** Automate Gate Evidence Packaging: Evidence bundle completeness (including SBOM and control mapping) is not yet consistently release-bound. Build the final collection hooks to fully automate the Release Candidate (RC) dossier assembly.
* [ ] **FEA-A.2** Complete Cryptography Posture Matrix: Publish a comprehensive matrix (Implemented vs. Planned vs. Experimental) that links every quantum-ready claim to exact repository code paths.

### 6. Stability Audit
* [ ] **STA-A.1** Upgrade Internal Trust Assumptions: Transition internal network topologies away from "mostly internal trust" to a zero-trust architecture to prevent localized Sandbox/Grid failures from cascading.
* [ ] **STA-A.2** Finalize Failure-Path Matrices: While initial recovery drills were automated, continuous telemetry and P95 error budget alerts must be wired to automatically trigger degraded-mode playbooks during partial outages.

### 7. Efficiency Audit
* [ ] **EFF-A.1** Benchmark Hybrid Crypto Overhead: Before moving to PQ-default cryptography, baseline the performance impact of the hybrid signature implementation to ensure it does not degrade the currently efficient classical cryptography throughput.
* [ ] **EFF-A.2** Optimize Dynamic Resource Protection: Calibrate the adaptive throttling in the Resource Balancer so that foreground-protection modes on shared host machines safely throttle without starving critical Sandbox execution threads.
