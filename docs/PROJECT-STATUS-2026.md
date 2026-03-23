# AXIOM-MESH Project Status (March 2026, updated March 23)

This document is the single source of truth for repository health, implementation status, and cleanup posture.

## Repository health snapshot

This status reflects code present in git and staging readiness work; it does not imply live testnet/mainnet deployment.

- **Architecture:** 4-pillar runtime remains intact (Gateway, Hypervisor, Sandbox, Grid).
- **Roadmap authority:** `docs/MASTER-TODO.md` remains the canonical roadmap and priority tracker.
- **Audit authority:** `docs/AUDIT_REPORT.md` remains the canonical cross-service audit report.
- **Production safety principle:** cleanup work must remove redundancy only and must not remove implemented runtime features.

## Implemented and retained in repository (not yet deployed live)

The following are confirmed as implemented and retained:

- Gateway API ingress, auth middleware, WebSocket processing, and channel adapters.
- Hypervisor processing pipeline, memory APIs, orchestration loops, and context integrations.
- Sandbox isolated execution (`--network=none`, security options, resource controls).
- Grid ledger/server endpoints, consensus-related modules, and contract integration scaffolding.
- Contract, schema, and interface control documentation used by active development.

## Cleanup changes in this cycle

### Contract and tokenomics hardening (March 23 update)

The following production-path hardening changes are now implemented:

- `AXM.sol` enforces explicit mint split semantics: 5% founder, 10% network treasury, 85% ecosystem reserve.
- `Genesis.sol` now wires an explicit ecosystem reserve treasury in deployment.
- `ComputeBond.sol` severance requires verifier-backed proof validation for all callers (no human-staker bypass).
- `ComputeBond.sol` storage offers are now persisted and queryable via `getStorageOffer`.
- `ZKMLVerifier.sol` includes approved-proof registration and single-use anti-replay severance verification semantics.

These updates improve implementation accuracy against documented tokenomics and security posture, while broader financial-grade evidence packaging and post-quantum migration remain in progress.

### Documentation consolidation

The following legacy status documents were moved to historical archives to reduce duplication while preserving history:

- `CLEANUP_AUDIT_REPORT.md` → `docs/historical/CLEANUP_AUDIT_REPORT.md`
- `CODEBASE_ACCURACY_ASSESSMENT.md` → `docs/historical/CODEBASE_ACCURACY_ASSESSMENT.md`
- `PROJECT_TODOS.md` → `docs/historical/PROJECT_TODOS.md`

Rationale:
- They overlapped heavily in scope (status + audit + roadmap commentary), creating parallel, conflicting “source-of-truth” risk.
- Their action items are now represented by `docs/MASTER-TODO.md` (roadmap) and `docs/AUDIT_REPORT.md` (audit findings).

### Code/script pruning

Removed obsolete scaffolding/throwaway scripts that are not part of runtime services:

- `init_phase1.sh` (historical bootstrap scaffold for project inception)
- `test_perf.py` (local micro-benchmark scratch script)

Rationale:
- Neither file is referenced by service startup paths, test configuration, or Makefile targets.
- Removing them reduces maintenance burden and ambiguity without impacting production execution.

## What remains canonical

- **Roadmap and delivery sequencing:** `docs/MASTER-TODO.md`
- **Audit findings and technical risk notes:** `docs/AUDIT_REPORT.md`
- **Architecture and service references:** `README.md` + service-level READMEs + docs in `docs/`

## Follow-up cleanup policy

For future pruning:

1. If a file is not on a runtime, CI, or documented developer path, mark it for archival review.
2. Prefer **archive over delete** for strategic documents unless clearly obsolete.
3. Avoid duplicate strategy/audit trackers at repository root.
4. Keep exactly one canonical roadmap and one canonical audit report.
