# Gas Target Audit — 99.9% of Operations at $0.00 via Off-Chain Cognition + Optimistic Channels

Date: 2026-03-25  
Scope: AXIOM intent execution and settlement pathways across Gateway → Hypervisor → Grid → Contracts.

## Audit Verdict (Current)

**Status: NOT YET PROVEN**.

The architecture is directionally aligned with the target (off-chain processing + selective on-chain finality), but the repository did not yet include a single KPI gate that proves:

`(on-chain charged operations / total operations) <= 0.1%`

or equivalently

`$0.00 operation ratio >= 99.9%`.

This patch adds first-class gas instrumentation hooks and a repeatable contract gas audit command to close that observability gap.【F:grid/contracts/hardhat.config.js†L1-L69】【F:grid/contracts/package.json†L8-L15】【F:Makefile†L1-L93】

## What Was Added in This Audit Pass

1. Enabled Hardhat gas reporter wiring in `grid/contracts/hardhat.config.js` (toggle via `REPORT_GAS=true`).【F:grid/contracts/hardhat.config.js†L1-L69】
2. Added `npm run test:gas` contract suite command to emit `gas-report.txt`.【F:grid/contracts/package.json†L8-L15】
3. Added `make verify-gas-target` root entrypoint to standardize execution in CI/release gates.【F:Makefile†L1-L93】

## Target Definition (Operational)

For each rolling 24h window, define:

- `N_total`: total accepted operations at Gateway ingress.
- `N_onchain`: operations that submit a state-changing on-chain transaction.
- `N_offchain`: operations completed off-chain (local/p2p/grid compute) with no state-changing tx.
- `R_zero_gas = N_offchain / N_total`.

**Target passes if:**
- `R_zero_gas >= 0.999` (99.9%), and
- all `N_onchain` are in allowlisted categories:
  - dispute/challenge,
  - settlement finality,
  - governance checkpoints,
  - treasury/accounting-required actions.

## Pathway Audit (Design Reality)

### Likely $0.00 Candidate Paths
- Intent normalization and channel handling at Gateway (no direct chain write by default).【F:gateway/src/routes/rest.ts†L112-L391】
- Hypervisor policy/routing/inference orchestration paths (off-chain compute first).【F:hypervisor/src/engine/inference_orchestrator.py†L1-L118】【F:hypervisor/src/evolution/resource_balancer.py†L1-L45】

### Gas-Charged Allowlisted Paths
- `StigmergicStateChannel.openChannel` and `optimisticSettle` (stake lock/finality settlement).【F:grid/contracts/contracts/StigmergicStateChannel.sol†L86-L152】
- Contract deployment and treasury-funded deployment flows where chain writes are explicit by design.【F:grid/contracts/contracts/DeploymentFactory.sol†L22-L53】

## Key Risk to 99.9% Target

Without end-to-end counters proving which operations actually hit state-changing txs, teams may overestimate off-chain completion and undercount hidden chain writes (retries, fallback submits, or governance side-effects).

## Required Next Controls (to actually certify 99.9%)

1. **Ingress counter:** Add deterministic operation IDs and total-op counter at Gateway.
2. **Settlement counter:** Emit/record state-changing tx count by operation class in Grid.
3. **Join logic:** Correlate operation IDs across Gateway/Hypervisor/Grid for exact `N_onchain` attribution.
4. **Daily audit artifact:** publish `gas_target_report.json` with:
   - `N_total`, `N_onchain`, `R_zero_gas`,
   - top gas-consuming methods,
   - failed/ retried settlement counts.
5. **Fail-closed SLO:** if rolling window `<99.9%`, auto-enable stricter off-chain routing policy and block non-essential on-chain writes.

## Immediate Runbook

```bash
make verify-gas-target
```

Produces contract-level gas profile baseline (`grid/contracts/gas-report.txt`) for optimization and budget control, but this is only one part of the full 99.9% operations KPI.

## Conclusion

AXIOM can realistically target 99.9% `$0.00` operations if on-chain writes remain exceptional and strictly allowlisted. This audit pass establishes missing instrumentation entry points; final certification still requires cross-pillar operation counters and daily KPI evidence publication.
