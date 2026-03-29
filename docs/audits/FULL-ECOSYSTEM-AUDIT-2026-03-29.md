# AXIOM-MESH Full Ecosystem Audit
**Date:** 2026-03-29  
**Scope:** Codebase, Tokenomics, Blockchain Features, Entropy Fight, Sustainability  
**Status:** Pre-launch hardening — not yet financial-grade production

---

## 1. Ecosystem Overview

AXIOM-MESH is a four-pillar decentralized AI compute network:

| Pillar | Language | Role |
|---|---|---|
| Gateway | TypeScript/Node | Ingress, auth, intent routing, channel adapters |
| Hypervisor | Python/FastAPI | AI orchestration, LangGraph workflows, policy decisions |
| Sandbox | TypeScript + Docker | Isolated code execution, seccomp/AppArmor hardening |
| Grid | Go | Ledger, P2P consensus, PoER, zkML, smart contracts |

The design goal is 99.9% of operations at near-zero cost via off-chain cognition and optimistic state channels, with final settlement on PulseChain.

---

## 2. Tokenomics Audit

### 2.1 Supply Structure

| Allocation | % | Amount | Vesting |
|---|---|---|---|
| Founder | 5% | 50M AXM | 4-year linear (TeamVesting.sol) |
| Network Treasury | 10% | 100M AXM | 4-year linear (TeamVesting.sol) |
| Ecosystem Reserve | 85% | 850M AXM | Dynamic emission |

**Implemented in:** `AXM.sol` — supply split is enforced at constructor with a compile-time invariant check.

### 2.2 Fee Distribution (UniversalDistributionPool.sol)

Current split:
- 60% → Network Security Fund (zkML proofs, PoER consensus, audits)
- 40% → Wealth Generation Pool (node operators, delegators)

**Gap identified:** `networkSharePercentage` defaults to `10` in `initialize()` but documentation states 60%. This is a critical discrepancy — the contract's default does not match the published policy.

### 2.3 Deflationary Mechanics

| Mechanism | Implementation | Status |
|---|---|---|
| Bond slashing | `ComputeBond.slash()` — 85% to `totalSlashed`, 15% to `collectiveInvestmentPool` | Implemented |
| Withdrawal tax | `ComputeBond.withdraw()` — 15% retained in `collectiveInvestmentPool` | Implemented |
| Fee burning | Governance proposal via `ZoverionsDAO.sol` | Planned only |
| Challenge resolution burn | 50% to challengers, 50% burned/treasury (PoT protocol) | Design only |
| State channel tax | `StigmergicStateChannel` — 5% (500 BPS) of locked stake to `UniversalDistributionPool` | Implemented |

### 2.4 FDBA (Founder Decaying Bootstrap Allocation)

The FDBA is a novel mechanism that decays founder compute share from 5% to 0% as the network grows to 10,000 nodes:

```
share = 500 - (gridSwarmSize * 500 / 10000)
```

**Strengths:** Prevents permanent rent extraction. Mathematically enforced in `getCurrentFounderShare()`.  
**Gap:** `gridSwarmSize` is only incremented/decremented internally via `_incrementSwarmSize()` / `_decrementSwarmSize()`. There is no external oracle or cross-contract verification that `gridSwarmSize` accurately reflects real network state. A compromised owner could manipulate this.

### 2.5 Staking Mechanics

- Minimum validator stake: `10,000 ether` (native tokens) in `ComputeBond.sol`
- PoER score boosts: +300 for valid zkML proof, reset to 0 for invalid
- Storage offering bonus: `capacityGB * 100` added to PoER score
- Quadratic voting cost in `ZoverionsDAO.sol`: `cost = newTotalVotes²`

### 2.6 Revenue Streams

From `RevenueModel.sol`:
- Developer API tier: 100 AXM
- Enterprise API tier: 1,000 AXM
- Premium sandbox: 500 AXM
- Bridge fee: 10 AXM
- Dataset marketplace: provider-set pricing

**Gap:** Revenue from `RevenueModel.sol` flows to the contract owner via `withdrawFees()` — it does not automatically route to `UniversalDistributionPool`. This breaks the treasury accounting model.

---

## 3. Blockchain Features Audit

### 3.1 Smart Contract Architecture

**Core economic loop:**
1. Agent stakes AXM → `ComputeBond.sol`
2. User funds task → `TaskRequestMarket.sol`
3. Agent executes off-chain, opens `StigmergicStateChannel.sol`
4. Channel calls `CognitiveFrictionVerifier.sol` → zkML proof verified
5. After challenge window, channel settles → 5% tax to `UniversalDistributionPool`
6. Pool distributes 60/40 split

### 3.2 StigmergicStateChannel v4 — Critical Findings

| Finding | Severity | Status |
|---|---|---|
| `challengeSettlement` accepts any caller (now fixed to agentA/agentB/guardian) | High | Fixed in v4 |
| `fraudProof.length > 0` is not semantic verification | High | Open |
| Single-sided stake in `openChannel`, symmetric payout in settlement | High | Open |
| `founderManager` immutable but unused | Medium | Open |
| Channel ID uses `block.timestamp` — weak replay hygiene | Medium | Partially fixed (channelNonce added) |

**Positive:** Reputation-weighted challenge windows (3 days for rep ≥ 800, 14 days + 2x stake for rep < 500) are a strong design.

### 3.3 Consensus — PoER + Entropy Fight

The entropy fight is implemented in `grid/consensus/poer.go`:

```go
func MineEntropyReduction(taskID string) string {
    // Find nonce where SHA256(taskID+nonce) has >= 8 leading zero bits
}
```

**What it does:** Nodes must perform computational work (PoW-style) to participate in consensus. This:
- Prevents Sybil attacks
- Creates fair lottery for consensus participation
- Ties rewards to real computational contribution

**Attention-weighted scoring:**
```go
score = baseScore × attentionWeight × (0.5 + 0.5×priorReliability)
```

This prevents high-reputation nodes from dominating unrelated task domains — a strong anti-cartelization design.

**Gap:** The entropy fight difficulty is hardcoded at 8 bits. There is no adaptive difficulty adjustment based on network size or hash rate. As the network grows, this becomes trivially easy.

### 3.4 Cross-Chain Bridge

- Simultaneous deployment: Ethereum, Base, Arbitrum, PulseChain
- 1-hour fail-closed finality invariant before PulseChain redemption
- Dynamic bridge-path selection via rating/polling/quorum oracle

**Gap:** `CrossChainBridge.sol` has no documented MEV protection or ordering assumptions. Bridge hot wallet key rotation cadence is not defined.

### 3.5 Governance (ZoverionsDAO.sol)

- Quadratic voting: cost = votes²
- Truth-weighted: `effectiveVotes = votesToCast × truthScore` (from WeightOracle)
- Council of Guardians: multi-sig veto on strategic proposals
- FDBA decay: founder control decays to 0 at 10k nodes

**Gap:** `isProposalPassed()` is called in `UniversalDistributionPool.setNetworkShare()` but `ZoverionsDAO` has no `isProposalPassed()` function — this is a broken interface that would revert at runtime.

### 3.6 zkML Verification

- Groth16 proof verification via `ZKMLVerifier.sol`
- PoER boost (+300) for valid proofs, slash to 0 for invalid
- Multi-level proof caching: L1 in-memory, L2 Redis, L3 BadgerDB

**Gap:** `submitZKMLProof` in `ComputeBond.sol` uses a fire-and-forget oracle call pattern with `require(successAdd, "Oracle call failed")` — this means a WeightOracle failure will revert a valid proof submission, creating a denial-of-service vector.

---

## 4. Security Posture Summary

| Domain | Grade | Key Gap |
|---|---|---|
| Gateway edge security | B- | Public ingress needs external perimeter |
| Hypervisor policy | B+ | Some placeholder semantics in non-test paths |
| Sandbox isolation | A- | Needs full inter-service identity hardening |
| Grid API security | C | mTLS not uniformly enforced |
| Inter-service auth | C | Mixed trust, mostly HTTP/internal |
| Auditability | B- | Evidence packaging not consistently release-bound |
| Post-quantum crypto | D | Not yet implemented end-to-end |

---

## 5. Tokenomics Sustainability Analysis

### 5.1 Current Sustainability Risks

1. **No burn mechanism is live.** Fee burning is governance-planned only. Without active deflation, token value depends entirely on demand growth.

2. **Emission schedule is undefined.** The 85% ecosystem reserve is "dynamically emitted based on network utilization" but no emission curve, cap, or halving schedule is specified or enforced in code.

3. **Revenue leakage.** `RevenueModel.sol` fees go to contract owner, not the treasury. This is a significant accounting gap.

4. **networkSharePercentage default mismatch.** Contract initializes to 10%, docs say 60%. Whichever is deployed, one is wrong.

5. **Staking rewards are externally funded.** `StakingRewards.sol` uses `notifyRewardAmount()` — rewards must be manually topped up by the owner. There is no protocol-native emission to this contract.

6. **collectiveInvestmentPool has no routing.** The 15% withdrawal/slash tax accumulates in `ComputeBond` but has no automatic routing to the distribution pool or burn address.

7. **Quadratic voting tokens are locked, not burned.** Governance participation locks tokens in `ZoverionsDAO` but they are never burned or redistributed, creating a governance token sink with no release mechanism.

### 5.2 Entropy Fight Sustainability

The entropy fight (PoER mining) is currently:
- Fixed difficulty (8 bits)
- No adaptive adjustment
- No halving or difficulty curve

As the network scales, fixed difficulty means the computational barrier to consensus participation drops in relative terms, weakening the Sybil resistance over time.

---

## 6. Tokenomics Improvement Recommendations

See `docs/TOKENOMICS-IMPROVEMENTS-2026-03-29.md` for the full improvement plan.

---

## 7. Critical Action Items (Prioritized)

### P0 — Blockers before any mainnet claim

1. ~~Fix `networkSharePercentage` default: align contract initialization with documented 60/40 split~~ **FIXED 2026-03-29** — `UniversalDistributionPool.initialize()` now defaults to 60; `__UUPSUpgradeable_init()` uncommented.
2. Fix broken `isProposalPassed()` interface in `UniversalDistributionPool` — **ASSESSED 2026-03-29**: `allocator.governance()` returns `DialecticArbitration` which has `isProposalPassed` as a public mapping (auto-getter). Interface is valid. No fix required.
3. ~~Route `RevenueModel.sol` fees to `UniversalDistributionPool` instead of owner wallet~~ **FIXED 2026-03-29** — `RevenueModel.sol` rewritten with `_routeToPool()`, `withdrawFees()` removed.
4. ~~Replace `fraudProof.length > 0` with semantic fraud proof verification in `StigmergicStateChannel`~~ **FIXED 2026-03-29** — `IFraudProofVerifier` interface added; `challengeSettlement()` now calls `verifyFraudProof()`.
5. Fix single-sided stake / symmetric payout mismatch in state channels — **ASSESSED 2026-03-29**: `openChannel` collects agentA stake, `joinChannel` collects agentB stake, settlement pays proportionally. Structurally correct. Needs property test to confirm no edge case.
6. Define and enforce ecosystem reserve emission schedule in code — **OPEN**

### P1 — High priority

7. ~~Implement adaptive difficulty for entropy fight (PoER mining)~~ **FIXED 2026-03-29** — `poer.go` rewritten with `AdaptiveDifficulty()`, `SetNetworkNodeCount()`, and `MineEntropyReduction()` using live difficulty. `chain.go` `JoinSwarm` now calls `SetNetworkNodeCount()`.
8. Add burn mechanism — activate fee burning via governance or protocol-native — **OPEN**
9. ~~Route `collectiveInvestmentPool` to distribution pool automatically~~ **FIXED 2026-03-29** — `ComputeBond.flushCollectiveInvestmentPool()` added; called on slash and withdraw.
10. Add `gridSwarmSize` oracle verification to prevent FDBA manipulation — **OPEN**
11. Fix WeightOracle fire-and-forget DoS vector in `submitZKMLProof` — **OPEN**
12. Add MEV protection and key rotation policy for bridge — **OPEN**

### P2 — Medium priority

13. Define emission curve for 85% ecosystem reserve — **OPEN**
14. Add release mechanism for governance-locked quadratic voting tokens — **OPEN**
15. Implement adaptive staking rewards tied to protocol revenue (not manual top-up) — **OPEN**
16. Add post-quantum hybrid signatures for high-trust paths — **OPEN**
17. Enforce mTLS across all inter-service boundaries — **OPEN**
