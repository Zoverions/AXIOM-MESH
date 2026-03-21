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
- [ ] **M0.1** Freeze this file as the sole execution queue for cross-team delivery.
- [ ] **M0.2** Migrate remaining actionable tasks from legacy roadmap/tracker docs into this file.
- [ ] **M0.3** Archive duplicate planning lists once migrated (retain links/history only).
- [ ] **M0.4** Enforce PR check: execution-impacting PRs must update this file.

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
- [ ] **M2.1** Implement first-run installer orchestration with guided prompts + non-interactive defaults.
- [ ] **M2.2** Auto-detect device profile (CPU/RAM/GPU/storage/network) and select safe service preset.
- [ ] **M2.3** Add role mode selection: `dedicated-mesh` vs `shared-machine`.
- [ ] **M2.4** Add post-install self-checks and auto-remediation suggestions.
- [ ] **M2.5** Persist installer decisions to a machine profile used by runtime balancers.

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


## Lane M4 — Task Contracting & Public-Goods Economy
- [ ] **M4.1** Deploy `TaskRequestMarket` for testnet validation.
- [ ] **M4.2** Define task classes for digital work, physical logistics, and hybrid tasks.
- [ ] **M4.3** Implement feedback-weighted reputation and slashing hooks.
- [ ] **M4.4** Integrate public-goods treasury split policy with governance controls.
- [ ] **M4.5** Publish bridge playbooks for mainstream service workflows into mesh contracts.

Detailed references:
- `grid/contracts/contracts/TaskRequestMarket.sol`
- `docs/GOVERNANCE.md`
- `docs/TOKENOMICS.md`

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
