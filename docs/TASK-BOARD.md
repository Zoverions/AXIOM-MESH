# AXIOM-MESH Canonical Task Board (Agent-Actionable)

**Status Date:** 2026-03-21  
**Execution Rule:** This is the single source of truth for actionable work items in `docs/`.

When an agent is asked to “follow the tasks in docs,” use this file first.

---

## 1) Global Delivery Rules (Must Always Apply)

- [ ] Every implementation PR updates impacted HOWTO docs under `docs/HOWTO/`.
- [ ] Every implementation PR updates root `README.md` when behavior/user flow changes.
- [ ] Every implementation PR links test/validation evidence.
- [ ] No PR is complete if docs lag code changes.

See `docs/AGENT-DOC-UPDATE-POLICY.md` for enforcement details.

---

## 2) Critical Path Tasks (Pre-Testnet)

## CP-1 Interface & Contract Freeze
- [ ] Freeze API/schema/ABI baseline.
- [ ] Enforce compatibility checks in CI.
- [ ] Document versioning policy in ICD and release notes workflow.

## CP-2 Security Baseline Completion
- [ ] Complete route authZ parity audit.
- [ ] Complete distributed rate-limit hardening.
- [ ] Complete sandbox isolation verification evidence.

## CP-3 Financial & Tokenomics Integrity
- [ ] Complete ledger↔chain reconciliation baseline.
- [ ] Complete treasury journal and correction workflow.
- [ ] Publish tokenomics parameter register with governance controls.

## CP-4 Reliability & Recovery
- [ ] Complete timeout/retry/idempotency matrix across service boundaries.
- [ ] Complete replay/reorg safety validation.
- [ ] Complete RTO/RPO recovery drills with evidence.

## CP-5 RC Gate Promotion
- [ ] Assemble release evidence package.
- [ ] Validate using strict mode (`STRICT=1 ENFORCE_SUMMARY=1`).
- [ ] Capture gate review decision and exceptions.

---

## 3) Parallel Workstreams

### WS-A Security
- [ ] Auth hardening tasks complete.
- [ ] Security regression CI suite complete.

### WS-B Financial/Tokenomics
- [ ] Reconciliation and distribution proof paths complete.
- [ ] Parameter governance trails complete.

### WS-C Reliability
- [ ] SLO instrumentation complete.
- [ ] Recovery automation complete.

### WS-D Ecosystem Integration
- [ ] Partner smoke tests complete.
- [ ] Operator runbook verification complete.

### WS-E Audit & Governance
- [ ] Evidence schema and storage complete.
- [ ] Exception workflow and expiry controls complete.

---

## 4) Done Criteria for Any Task

A task is only done when all are true:
1. Code is merged and passing tests.
2. Relevant HOWTO(s) are updated.
3. Root `README.md` reflects any behavior change.
4. Evidence is attached in PR or RC package.
5. Tracking checkbox in this file is updated.

