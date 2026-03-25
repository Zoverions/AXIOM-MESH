# Sovereign v3 Gap Audit (Spec vs Current Code)

Date: 2026-03-25  
Scope: Alignment review between `docs/AXIOM-SOVEREIGN-OPERATING-MODEL-v3.md` and current contract/runtime implementation.

## Executive Result

**Status: Partial alignment, major governance-tokenomics deltas open.**

## Confirmed Alignments

1. Founder allocation at token mint level is already 5%.【F:grid/contracts/contracts/token/AXM.sol†L8-L23】
2. Pulse/settlement architecture already supports optimistic channel finality concepts for selective on-chain writes.【F:grid/contracts/contracts/StigmergicStateChannel.sol†L86-L152】
3. Resource-balancing and off-chain orchestration layers exist in Hypervisor for policy-aware execution routing.【F:hypervisor/src/evolution/resource_balancer.py†L1-L45】

## Material Gaps to v3 Spec

### G1 — Decay model still exists in core contracts (High)
The new v3 spec supersedes decaying founder-control assumptions, but current contracts still encode decay semantics.

- `FounderShareManager.sol` comments and logic preserve founder share decay behavior.【F:grid/contracts/contracts/FounderShareManager.sol†L13-L16】
- `ComputeBond.sol` also references linear founder-share decay to zero at 10k nodes.【F:grid/contracts/contracts/ComputeBond.sol†L99-L104】

### G2 — No hardcoded DAO compute partition contract (High)
No explicit contract currently enforces a fixed DAO-only compute reservation with governance-proof-only triggering as described in v3.

### G3 — Guild compute partitions not protocol-hardcoded (Medium)
Dynamic resource allocation exists, but not yet as immutable fractioned partitions with explicit on-chain enforcement and audit schema.

### G4 — Vesting schedule semantics need explicit contract evidence (Medium)
v3 requires 10% of founder allocation at genesis and 90% over 8 years. This needs explicit vesting contract linkage/evidence in the active deployment set.

## Required Remediation Backlog

1. Introduce `FounderReserveController` enforcing fixed 5% compute/storage partition with immutable event logs.
2. Introduce `DAOComputeReserve` with governance-proof-gated execution calls.
3. Add guild partition policy contract + runtime adapter for local/faction allocations.
4. Replace or version-gate decay logic in `FounderShareManager` / `ComputeBond` to match v3 governance model.
5. Add explicit `FounderVestingVault` evidence for 10% TGE unlock + 8-year streaming vesting.

## Recommended Sequencing

- **Phase A (M10/M11):** spec locking + contract interfaces + policy schema.
- **Phase B:** contract implementation + migration tooling.
- **Phase C:** audit pack (invariant/property tests + economic simulation + external review package).
