# AXIOM-MESH Codebase + Documentation Analysis

**Date:** 2026-03-29  
**Scope:** Code/document consistency, feature-claim accuracy, to-do accuracy, completeness/robustness, and security posture.

---

## 1) Method

This pass focused on:

1. Cross-checking canonical planning/status docs against code reality (`README.md`, `docs/MASTER-TODO.md`, `docs/PROJECT-STATUS-2026.md`, `docs/PRODUCTION-READINESS-TRACKER.md`, `docs/AUDIT_REPORT.md`).
2. Running repository-wide pattern scans for indicators of non-finalized behavior (`TODO`, `FIXME`, `mock`, `placeholder`) and security-sensitive markers (embedded keys/secrets/fallback defaults).
3. Verifying select high-risk implementation paths in Gateway, Grid, Sandbox, and security assets.

---

## 2) Executive Findings

## 2.1 Overall assessment

- The repository has substantial implementation breadth and contains many hardened pathways.
- There is still **material drift** between some docs and current code reality.
- The highest-risk gap is **credential/key handling posture mismatch**: docs/todo entries claim certificate migration is complete, but private key material is still present in-repo.

## 2.2 Risk ranking summary

- **Critical:** Private keys committed in `certs/`.
- **High:** Internal-auth dev fallback secret values hardcoded in both Gateway and Grid alert path.
- **Medium:** Dashboard and education subsystems still include mock/demo/static logic while some high-level docs communicate stronger completion.
- **Medium:** Status board inconsistencies across docs can mislead release/readiness decisions.

---

## 3) Evidence Matrix: Feature Claim vs Code Reality

| Area | Documented Claim | Code/Repo Reality | Verdict |
|---|---|---|---|
| mTLS cert migration (M9.4) | Marked complete in canonical TODO | `certs/*.key` files are tracked in git | **Not accurate / incomplete** |
| Dashboard interfaces | M13.6 marked pending | Gateway dashboard endpoints currently return mock/static values | **Accurate that integration is incomplete** |
| Education capsule completeness | M13.7 says define `schemas/education_tome.capcp` and personas | `schemas/education_tome.capnp` already exists; runtime still contains mock/demo logic | **Partially inaccurate wording** |
| Production readiness tracker | Shows critical path still unchecked | Canonical TODO records many of these as complete | **Out of sync** |
| Audit report placeholder findings | Flags ProveX placeholder amount | Current contract computes dynamic release amount | **Outdated statement** |

---

## 4) Detailed Findings

## 4.1 Security: key-material and secret management

### F1 — Private keys are committed to repository
- `certs/ca.key`, `certs/gateway.key`, and `certs/grid.key` are tracked files and contain PEM private keys.
- This directly conflicts with completed-task narrative that cert/key handling was moved out of repo.

**Impact:** Immediate credential leakage risk, key compromise risk, and audit credibility risk.

**Action:** Re-open/continue M9.4 until key rotation + history cleanup + runtime secret injection are fully complete.

### F2 — Dev fallback internal secret remains in runtime paths
- Gateway internal auth falls back to `internal-dev-secret-1234` when env var is absent (outside production mode).
- Grid emits the same fallback when pushing `EMERGENCE_ALERT` to Gateway.

**Impact:** Inconsistent hardening posture, easier lateral movement in misconfigured environments.

**Action:** Remove fallback and fail closed in all environments except explicit local-test mode behind compile/runtime flag.

## 4.2 Feature completeness and robustness

### F3 — Dashboard endpoints remain mostly demo/static
- Trust score and pipeline endpoints use static payloads and comments indicating mock data.
- Comprehensive endpoint uses static status/model/asset structures.

**Impact:** Operational dashboards can be mistaken for live telemetry.

**Action:** Keep M13.6 open (already open) and add acceptance checks requiring real Grid + Hypervisor wiring.

### F4 — Education capsule still has mock decision logic
- `check_dao_access` includes explicit “Default mock logic for demonstration”.

**Impact:** Functional claims for production-grade educational governance behavior are premature.

**Action:** Keep M13.7 open, but correct task wording (schema exists; runtime depth remains).

## 4.3 Document consistency and governance hygiene

### F5 — Canonical TODO vs readiness tracker contradiction
- `docs/PRODUCTION-READINESS-TRACKER.md` still marks interface freeze/authz/reconciliation/recovery/RC package as in progress while canonical TODO marks corresponding M1 tasks complete.

**Impact:** Decision ambiguity for release gates and stakeholder reporting.

**Action:** Align tracker with canonical TODO or explicitly label tracker as historical snapshot.

### F6 — Audit report includes now-outdated finding
- `docs/AUDIT_REPORT.md` states ProveX contains explicit placeholder release amount; contract now uses dynamic logic.

**Impact:** Audit narrative can understate remediation progress and reduce trust in report freshness.

**Action:** Refresh audit report findings with date-stamped deltas.

---

## 5) To-Do List Accuracy Review

## 5.1 Accurate open items
- M13.6 (dashboard real data integration) is correctly open and supported by code reality.

## 5.2 Inaccurate/needs correction
- M9.4 was marked complete but is not complete given tracked private keys.
- M13.7 references `education_tome.capcp` (typo/non-existent target) and claims schema definition pending although schema exists.

---

## 6) Recommended Remediation Sequence (Security-first)

1. **P0 — Key hygiene emergency pass**
   - Rotate all exposed keys.
   - Remove private keys from repository and secret inject at runtime.
   - Add pre-commit/CI secret scanning and fail on key patterns.

2. **P0 — Remove hardcoded internal secret fallback**
   - Enforce env-based secret for Gateway/Grid internal alert path.
   - Fail closed with explicit startup validation.

3. **P1 — Documentation reconciliation sprint**
   - Align `MASTER-TODO`, `PRODUCTION-READINESS-TRACKER`, and `AUDIT_REPORT` to same state model/date.
   - Add “last-verified against code commit” footer in status docs.

4. **P1 — Functional completion hardening**
   - Finish dashboard real telemetry integration and add integration tests.
   - Replace remaining demo/mock logic in education runtime with policy/attestation-backed path.

---

## 7) Proposed Definition of “Complete and Robust” for this repo

A task should only be marked complete when all are true:

1. **Code implemented** in non-test runtime path.
2. **Security constraints enforced** (fail-closed, no weak fallback).
3. **Tests present** for success + failure + abuse cases.
4. **Docs updated** with implementation-accurate language.
5. **Evidence artifact linked** (command + file + expected result).

---

## 8) Commands Used During This Analysis

- `rg --files -g 'AGENTS.md'`
- `find . -maxdepth 2 -type f | sed 's#^./##' | head -n 200`
- `rg -n "TODO|FIXME|HACK|XXX|mock|placeholder|pass #|raise NotImplementedError" --glob '!node_modules/**' --glob '!*.lock'`
- `rg -n "PRIVATE KEY|BEGIN .*PRIVATE KEY|password\s*=|secret|api[_-]?key|token\s*=|ca.key|gateway.key|grid.key" --glob '!node_modules/**' --glob '!*.lock'`
- `git ls-files certs`
- `python -m pytest -q tests/test_mock_elimination.py -q`

