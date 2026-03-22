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
- [x] **M0.1** Freeze this file as the sole execution queue for cross-team delivery. — 2026-03-22 — @agent-orchestrator — completed
- [x] **M0.2** Migrate remaining actionable tasks from legacy roadmap/tracker docs into this file. — 2026-03-22 — @agent-orchestrator — completed
- [x] **M0.3** Archive duplicate planning lists once migrated (retain links/history only). — 2026-03-22 — @agent-orchestrator — completed
- [x] **M0.4** Enforce PR check: execution-impacting PRs must update this file. — 2026-03-22 — @agent-orchestrator — completed

Detailed references:
- `docs/PRODUCTION-EXECUTION-BACKLOG.md` (task definitions)
- `docs/PRODUCTION-READINESS-TRACKER.md` (role tracking)

## Lane M1 — Production Readiness Critical Path
- [ ] **M1.1** Publish owner + deputy roster for all delivery roles.
- [ ] **M1.2** Freeze API/schema/ABI baseline and enforce compatibility checks in CI.
- [ ] **M1.3** Complete route authZ parity audit + remediation backlog.
- [ ] **M1.4** Complete ledger↔chain reconciliation baseline and variance report.
- [ ] **M1.5** Run recovery drills (restart + partial outage) and record RTO/RPO.
- [ ] **M1.6** Build and validate first RC evidence package.
- [ ] **M1.7** Hold gate sync and record go/no-go decision.

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

---



## Lane PR — Production Readiness Roadmap
- [ ] **PR.1** Complete all "Caveats" documentation to "Implementation" status
- [ ] **PR.2** Freeze feature addition; bugfix-only mode
- [ ] **PR.3** Establish formal threat model (STRIDE per component)
- [ ] **PR.4** Implement chaos engineering baseline (failure injection)

## Lane A — Post-Audit Hardening
- [ ] **A.1** Run full static analysis (Security Auditor Agent owns):
- [ ] **A.2** Fix every High/Critical finding; log results to WORM audit trail
- [ ] **A.3** Generate + commit SBOM (`syft . -o spdx-json > sbom.json`)
- [x] **A.4** Enforce `SANDBOX_API_KEY` on **every** east-west and sandbox endpoint (March 20, 2026 - Extracted validateSandboxApiKey to utils/auth.ts and applied to all capsule routes)
- [ ] **A.5** Add strict rate-limiting + improved sanitization on public route `/intent/process/public`
- [ ] **A.6** Front public endpoints with WAF (Cloudflare or equivalent) – config in `gateway/`
- [ ] **A.7** Create `docs/TOKENOMICS.md` with:
- [ ] **A.8** Update `MAINNET_ADDRESSES.md` and `ERC20-COMPATIBILITY.md` with testnet deployment plan
- [ ] **A.9** Deploy **all** contracts (`ComputeBond`, `DualLedgerIdentity`, `WeightOracle`, `DialecticArbitration`, etc.) to Sepolia/Base Sepolia
- [ ] **A.10** Run full test suite + generate coverage report (>85%)
- [ ] **A.11** Add basic OpenZeppelin guards (ReentrancyGuard, Pausable) where missing
- [ ] **A.12** Implement mutual TLS (mTLS) between **all** pillars (Gateway ↔ Hypervisor ↔ Grid ↔ Sandbox)
- [ ] **A.13** Add cryptographic request signing for Grid mutation endpoints
- [ ] **A.14** Enforce signed east-west traffic everywhere
- [ ] **A.15** Complete production-grade chain listener with reorg handling and finality
- [ ] **A.16** Make internal ledger append-only WORM compliant (Phase P1 target)
- [ ] **A.17** Upgrade zkML verification pipeline to production-grade (model commitment + size checks)
- [ ] **A.18** Integrate full OpenZeppelin suite (AccessControl, TimelockController)
- [ ] **A.19** Add timelocks + multi-sig on treasury, governance, and slashing functions
- [ ] **A.20** Prepare contracts for professional external audit (schedule with Zellic/Trail of Bits/Cantina)
- [ ] **A.21** Expand E2E test suite (`test_*.py` + new adversarial scenarios)
- [ ] **A.22** Test: malicious skill capsules, oracle manipulation, slashing abuse, reorg attacks
- [ ] **A.23** Implement immutable audit trail sink (S3 append-only or Arweave/IPFS)
- [ ] **A.24** Launch bug bounty (Immunefi or similar) – Governance Agent
- [ ] **A.25** Complete bicameral governance execution in contracts
- [ ] **A.26** Full treasury management contracts with automatic split enforcement
- [ ] **A.27** zkML + ComputeBond to final production grade

## Lane AE — Agent Enhancements

## Lane RM — Roadmap 2026

## 3) Archive Candidates (After Migration Validation)

Move to `docs/historical/` after confirming no net-new actionable tasks remain:

---

## 4) Definition of Done (Per Task)

A task is done only when all are true:
- checkbox marked `[x]` with date/owner/commit hash,
- linked detailed file items resolved,
- tests/checks recorded in PR,
- documentation updated if behavior changed.

## Lane GPD — Physics Research Kernel Integration
- [x] Full dynamic agent ecosystem: Founder 5% + Network Public Pool (scripts → ascension entities)
