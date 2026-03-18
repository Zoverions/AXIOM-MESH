# AXIOM-MESH Security Reality Check (March 2026)

This document is the implementation-accurate companion to high-level architecture/security claims.
It specifically corrects outdated conclusions and distinguishes **implemented controls** from **hardening backlog**.

## 1) Implemented Security Controls (Current Code)

### Gateway
- Public ingress route is intentionally unauthenticated: `POST /api/v1/intent/process/public`.
- Public route is protected by in-process per-client rate limiting middleware.
- Payload hygiene includes centralized content + metadata sanitization.

### Hypervisor
- `/process` requires bearer API key.
- Policy gate now enforces baseline checks before processing:
  - max input length
  - consent scope validity
  - `/exec` requires `consent_scope=allowed`
- Policy decisions are recorded in `audit_trail.safety_decisions`.

### Grid
- Ledger is no longer only ephemeral in runtime:
  - supports snapshot save/load
  - startup restore + periodic snapshot persistence (`GRID_LEDGER_PATH`)
- `/zkml/verify` includes payload gates:
  - required fields
  - commitment format validation
  - artifact/vector size bounds
- Optional ComputeBond mirroring exists for stake/slash (`GRID_ETH_*`, `GRID_COMPUTE_BOND_ADDRESS`).

### Sandbox
- Execution containers remain restricted by hardened defaults (`--network=none`, cap-drop, seccomp, apparmor, ro rootfs, limits).

## 2) What is NOT Yet Production-Complete

1. **Perimeter-grade ingress security**
   - Current gateway controls are hygiene + local rate limit, not full WAF/DDOS/abuse-defense stack.
2. **Chain-finalized ledger lifecycle**
   - Snapshot durability is an incremental step; full chain-backed, reorg-aware reconciliation remains in progress.
3. **Operator-grade reasoning auditor**
   - Policy gate exists, but immutable event sink + formal review UX + compliance workflows are not complete.
4. **zkML operational trust posture**
   - Payload checks are in place; full operational assurance (attestation, SLOs, long-run adversarial testing) remains backlog.
5. **Full on-chain event listener automation**
   - Contract calls are optionally mirrored; robust listener/replay/finality orchestration is pending.

## 3) Production Readiness Gate (Must Pass)

A deployment should not be labeled “production financial-grade” until all are true:
- [ ] Perimeter WAF + distributed rate limiting + abuse detection in front of Gateway
- [ ] Durable DB-backed ledger + tested recovery + formal reconciliation strategy
- [ ] On-chain event listener/replay with reorg/finality handling
- [ ] Immutable policy/audit event sink + retention + access controls
- [ ] zkML verification operational controls (attestation/integrity/SLOs)
- [ ] Security review of Solidity contracts + release gate policy

## 4) Security Posture Statement

AXIOM-MESH is best described today as:
- **safer-by-design than prototype-only agent stacks**,
- with meaningful controls already implemented,
- but still **hardening-in-progress** for production financial operations.
