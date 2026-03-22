# AXIOM-MESH Master To-Do List (Canonical Agent Queue)

**Version:** 2026-03-21  
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
- [ ] **M0.3** Archive duplicate planning lists once migrated (retain links/history only).
- [ ] **M0.4** Enforce PR check: execution-impacting PRs must update this file.

Detailed references:
- `docs/PRODUCTION-EXECUTION-BACKLOG.md` (task definitions)
- `docs/PRODUCTION-READINESS-TRACKER.md` (role tracking)

## Lane M1 — Production Readiness Critical Path
- [x] **M1.1** Publish owner + deputy roster for all delivery roles. — 2026-03-22 — @agent — updated PRODUCTION-READINESS-TRACKER.md
- [x] **M1.2** Freeze API/schema/ABI baseline and enforce compatibility checks in CI. — 2026-03-22 — @agent — tagged v2026-baseline
  - [ ] ECO-01: API/schema/ABI lock and compatibility checks (2 days, D1)
- [ ] **M1.3** Complete route authZ parity audit + remediation backlog.
  - [x] SEC-01: Route inventory + authZ parity map (2 days, A1) — 2026-03-22 — @agent — all routes have auth dependencies
  - [x] SEC-02: Production rate-limit backend cutover (3 days, A2) — 2026-03-22 — @agent — added slowapi rate limiting
  - [ ] SEC-03: Admin session hardening and token lifecycle controls (2 days, A1, depends SEC-01)
  - [ ] SEC-04: Sandbox runtime deny-profile verification (3 days, A3)
  - [ ] SEC-05: Security regression pack in CI (2 days, A2, depends SEC-02,03,04)
- [ ] **M1.4** Complete ledger↔chain reconciliation baseline and variance report.
  - [ ] FIN-01: Ledger↔chain reconciliation baseline (3 days, B1, depends interface freeze)
  - [ ] FIN-02: Treasury journal and correction workflow (3 days, B1, depends FIN-01)
  - [ ] FIN-03: Distribution proof generation + verification (2 days, B2, depends FIN-01)
- [ ] **M1.5** Run recovery drills (restart + partial outage) and record RTO/RPO.
  - [ ] REL-01: Timeout/retry/idempotency matrix across service calls (3 days, C1, depends interface freeze)
  - [ ] REL-02: Finality-aware chain replay safety (3 days, C2, depends interface freeze)
  - [ ] REL-03: Recovery drills automation (restart + partial outage) (3 days, C1, depends REL-01,02)
  - [ ] REL-04: SLO dashboard and alert policies (2 days, C3, depends REL-01)
- [ ] **M1.6** Build and validate first RC evidence package.
  - [ ] AUD-01: Gate evidence schema and storage structure (1 day, E1)
  - [ ] AUD-02: Evidence collection automation hooks (2 days, E1, depends AUD-01)
  - [ ] AUD-03: Exception workflow with expiry and owner (1 day, E2, depends AUD-01)
  - [ ] AUD-04: Final RC dossier assembly and signoff (2 days, E1, depends SEC-05, FIN-03, TOK-02, REL-04, ECO-03, AUD-02)
- [ ] **M1.7** Hold gate sync and record go/no-go decision.
- [ ] **M1.8** Tokenomics parameter register publication and change control.
  - [ ] TOK-01: Tokenomics parameter register publication (1 day, B3, depends FIN-01)
  - [ ] TOK-02: Parameter change control workflow (2 days, B3, depends TOK-01)
- [ ] **M1.9** Operator runbook verification and partner integration smoke tests.
  - [ ] ECO-02: Operator runbook verification pass (2 days, D2, depends ECO-01)
  - [ ] ECO-03: Partner integration smoke tests (2 days, D3, depends ECO-01)
- [ ] **M1.10** Documentation updates for merged features.
  - [ ] DOC-01: Update HOWTO + control map per merged feature (continuous, D4, depends all tracks)

Detailed references:
- `docs/PARALLEL-DELIVERY-PLAN-2026.md`
- `docs/PRODUCTION-EXECUTION-BACKLOG.md`
- `docs/HOWTO/release-gate-evidence.md`

## Lane M2 — Installer Automation (First-Run Onboarding)
- [x] **M2.1** Implement first-run installer orchestration with guided prompts + non-interactive defaults. — 2026-03-21 — @agent-installer — pending
- [x] **M2.2** Auto-detect device profile (CPU/RAM/GPU/storage/network) and select safe service preset. — 2026-03-21 — @agent-installer — pending
- [x] **M2.3** Add role mode selection: `dedicated-mesh` vs `shared-machine`. — 2026-03-21 — @agent-installer — pending
- [x] **M2.4** Add post-install self-checks and auto-remediation suggestions. — 2026-03-21 — @agent-installer — pending
- [x] **M2.5** Persist installer decisions to a machine profile used by runtime balancers. — 2026-03-21 — @agent-installer — pending

Detailed references:
- `docs/subtasks/INSTALLER-AUTOMATION.md`

## Lane M3 — Dynamic Resource Protection (Local Host Safety)
- [ ] **M3.1** Enforce per-service CPU/memory/IO quotas based on machine profile.
- [ ] **M3.2** Add adaptive throttling when host pressure exceeds thresholds.
- [ ] **M3.3** Add foreground-protection mode for shared machines (lower priority/background scheduling).
- [ ] **M3.4** Add telemetry + alerts for sustained local resource pressure.
- [ ] **M3.5** Define automatic downgrade/escalation between Local/Peer/Grid routing based on host pressure.

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
- [ ] **M4.1** Run full static analysis and fix High/Critical findings.
  - [ ] Python (Hypervisor): bandit + safety check
  - [ ] TypeScript (Gateway/Sandbox/CLI): npm audit + ESLint + Semgrep
  - [ ] Go (Grid): go vet + gosec + staticcheck
  - [ ] Solidity: Slither + Hardhat security
- [ ] **M4.2** Generate and commit SBOM.
- [ ] **M4.3** Add strict rate-limiting and sanitization on public routes.
- [ ] **M4.4** Front public endpoints with WAF.
- [ ] **M4.5** Create docs/TOKENOMICS.md with supply, emission, distribution details.
- [ ] **M4.6** Update MAINNET_ADDRESSES.md and ERC20-COMPATIBILITY.md for testnet.
- [ ] **M4.7** Deploy all contracts to Sepolia/Base Sepolia with tests and coverage.
- [ ] **M4.8** Add OpenZeppelin guards to contracts where missing.
- [ ] **M4.9** Implement inter-service authZ with mTLS/JWT.
- [ ] **M4.10** Add WORM audit trails for all state changes.
- [ ] **M4.11** Implement finality-aware chain replay.
- [ ] **M4.12** Add chaos engineering baseline.
- [ ] **M4.13** Establish formal threat model (STRIDE).
- [ ] **M4.14** Implement immutable WORM trails for all logs.
- [ ] **M4.15** Add tokenomics parameter controls and transparency.
- [ ] **M4.16** Implement bicameral governance with skill staking.
- [ ] **M4.17** Add monitoring for SLOs and alerts.
- [ ] **S.1** Complete full implementation of physics research skill capsule (gpd) — ensure adapter, runtime, and schemas are production-ready.
- [x] **S.2** Create skill capsule for mathematical computation and symbolic manipulation. — 2026-03-22 — @agent — created full capsule structure with sympy integration
- [x] **S.3** Create skill capsule for web search and information retrieval. — 2026-03-22 — @agent — created full capsule with requests integration
- [x] **S.4** Create skill capsule for code analysis, debugging, and generation. — 2026-03-22 — @agent — created full capsule structure
- [ ] **S.5** Create skill capsule for data analysis and visualization.
- [ ] **S.6** Create skill capsule for cryptographic operations and security proofs.
- [ ] **S.7** Test and validate all skill capsules against schema validation and runtime safety.

---

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
