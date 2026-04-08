# AXIOM-MESH Cross-Network Execution Tokenomics Model (M20.7)

**Date:** 2026-04-08  
**Status:** Draft for governance review  
**Owner Track:** Tokenomics + Crosschain + Hypervisor/Grid economics

---

## 1) Purpose

This model extends existing AXIOM tokenomics to explicitly price and settle execution that spans multiple networks (AXIOM-native, Ethereum L2/L1 rails, Render-sourced compute, and Polkadot/XCM-connected environments).

Focus areas required by M20.7:
- Burn/mint flows.
- Staking/slashing behavior across domains.
- External compute settlement that remains evidence-first and fail-closed.

---

## 2) Scope and Non-Goals

### In scope
1. Canonical accounting states for cross-network jobs.
2. Deterministic fee split and burn policy across settlement domains.
3. Staking/slashing treatment for participants that broker or verify remote execution.
4. Settlement lifecycle and reconciliation controls.

### Out of scope (handled elsewhere)
1. Chain-specific bridge contract implementation details.
2. Legal/tax treatment of cross-border token flows.
3. Market-making or treasury hedging strategy.

---

## 3) Core Principles

1. **Evidence before value transfer:** no payout without attestation envelope + policy checks.
2. **Fail-closed accounting:** uncertain provenance routes value to escrow, never to discretionary wallets.
3. **Single job, multi-ledger traceability:** each job has one global settlement ID with per-chain receipts.
4. **Risk-weighted economics:** higher-risk routes require higher bond and incur stricter slash multipliers.
5. **Supply discipline:** burn/mint actions are bounded by governance-approved corridors and epoch limits.

---

## 4) Cross-Network Job Classes

| Class | Description | Typical route | Economic profile |
|---|---|---|---|
| CN-1 | Intra-AXIOM execution | Local/Grid only | Low bridge risk, standard burn |
| CN-2 | AXIOM + one external compute rail | AXIOM + Render/GPU rail | Medium settlement risk |
| CN-3 | AXIOM + bridge + external verifier | AXIOM + EVM + verifier | High bridge/oracle exposure |
| CN-4 | Multi-hop settlement | AXIOM + EVM + Polkadot path | Highest complexity/risk |

Risk class affects:
- Required validator bond.
- Escrow holdback percentage.
- Slash multiplier in fault cases.

---

## 5) Burn/Mint Flow Model

## 5.1 Fee decomposition
For each settled job `J`, total payable amount is decomposed as:

`F_total = F_exec + F_verif + F_bridge + F_risk + F_treasury`

Where:
- `F_exec`: base execution fee (provider compensation).
- `F_verif`: verification/attestation costs.
- `F_bridge`: bridge + messaging path costs.
- `F_risk`: risk premium based on class (CN-1..CN-4).
- `F_treasury`: protocol sustainability margin.

## 5.2 Burn allocation
Burn amount:

`B = F_total * burn_bps(route_class, congestion_state)`

Governance policy:
- CN-1 burn corridor: **40–80 bps**.
- CN-2/CN-3 corridor: **60–120 bps**.
- CN-4 corridor: **80–180 bps**.
- Daily burn cap: no more than **0.15%** of circulating supply equivalent.

If cap is hit, excess burn amount is redirected to time-locked reserve and tagged `burn_deferred` for next epoch handling.

## 5.3 Mint policy for cross-network liquidity balancing
Mint is disallowed for ordinary fee settlement. Controlled mint is only permitted when all conditions pass:
1. Bridge inventory imbalance exceeds governance threshold for 3 consecutive epochs.
2. Treasury buffer is below minimum solvency floor.
3. Governance quorum approves emergency rebalancing proposal.

Mint ceiling:
- Epoch mint cap: **<= 0.05%** of circulating supply.
- Quarterly mint cap: **<= 0.20%** of circulating supply.

All minted units are emitted to a restricted settlement buffer contract, never directly to operators.

---

## 6) Staking and Slashing for Cross-Network Roles

Roles covered:
1. **Execution Provider** (compute node / external adapter).
2. **Bridge Relayer** (message/value passage).
3. **Verifier Set** (attestation + fraud detection).
4. **Settlement Orchestrator** (job-level accounting finalizer).

## 6.1 Bond requirements
`Bond_required = BaseBond(role) * RiskMultiplier(class) * VolumeFactor(epoch)`

Suggested risk multipliers:
- CN-1: 1.0x
- CN-2: 1.3x
- CN-3: 1.7x
- CN-4: 2.2x

## 6.2 Slash taxonomy
| Event | Slash range | Notes |
|---|---|---|
| Invalid attestation submitted | 5%–15% of bond | escalates with recurrence |
| Settlement mismatch unresolved in SLA | 10%–25% | partial if corrected within grace window |
| Fraudulent proof/material tampering | 40%–100% | includes immediate suspension |
| Bridge replay/double-execution behavior | 30%–80% | per incident + risk-class multiplier |

Slash proceeds routing order:
1. User restitution pool.
2. Collective insurance reserve.
3. Protocol treasury (last priority).

---

## 7) External Compute Settlement Lifecycle

1. **Quote phase:** route class + risk score + projected fees are frozen into preflight quote.
2. **Execution phase:** provider executes and emits evidence envelope.
3. **Verification phase:** verifier quorum signs accept/reject verdict.
4. **Escrow phase:** payout split computed, holdback retained for challenge window.
5. **Finalization phase:** burn action + payout release + ledger closure.

Mandatory settlement outputs:
- Global settlement ID.
- Per-network transaction references.
- Fee and burn decomposition record.
- Slashing outcomes (if any).
- Challenge-window expiry stamp.

---

## 8) Accounting and Reconciliation Controls

Each settlement epoch must produce:
1. **Cross-network trial balance** (expected vs observed deltas per domain).
2. **Unreconciled variance register** with owner, severity, and remediation ETA.
3. **Evidence completeness report** (% of jobs with full receipt chain).
4. **Deferred burn/mint register** with governance references.

Release gate recommendation:
- Block promotions if any of the following is true:
  - High-severity unresolved variance > 24h.
  - Evidence completeness < 99.5%.
  - Mint/burn cap policy violation in current epoch.

---

## 9) Governance Parameters to Add (Proposed)

- `cross_network.burn.corridor.cn1_bps`
- `cross_network.burn.corridor.cn2_cn3_bps`
- `cross_network.burn.corridor.cn4_bps`
- `cross_network.burn.daily_cap_bps_supply`
- `cross_network.mint.epoch_cap_bps_supply`
- `cross_network.mint.quarterly_cap_bps_supply`
- `cross_network.settlement.min_evidence_completeness_bps`
- `cross_network.staking.risk_multiplier.cn{1,2,3,4}`
- `cross_network.slash.challenge_window_seconds`

---

## 10) Implementation Tasks for Follow-On PRs

1. Add config schema + policy validation for cross-network mint/burn caps.
2. Extend settlement ledger schema with per-domain fee decomposition fields.
3. Emit canonical `burn_deferred` and `mint_emergency` governance events.
4. Add reconciliation CLI report for epoch-level drift.
5. Add simulation harness for CN-1..CN-4 stress cases.

---

## 11) Acceptance Criteria (M20.7)

- Burn/mint policy corridors and caps are documented and governance-addressable.
- Staking/slashing model is explicitly risk-classed for cross-network execution.
- External compute settlement lifecycle is documented with fail-closed checkpoints.
- Follow-on engineering tasks are enumerated for code implementation.
