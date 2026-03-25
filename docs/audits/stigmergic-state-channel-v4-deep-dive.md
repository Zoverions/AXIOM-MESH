# StigmergicStateChannel v4 Deep-Dive Review

Date: 2026-03-25  
Scope: `grid/contracts/contracts/StigmergicStateChannel.sol` and current interface-level tests.

## Executive Summary

This review confirms that v4 is materially safer than earlier scaffolds (constructor dependency checks, guardian wiring, settlement gatekeeping), but still has **high-priority production blockers** before mainnet-grade governance integration.

**Top blockers**:
1. `challengeSettlement` can be called by any address and does not verify fraud proof semantics.
2. Funding model is asymmetric (single-sided stake lock) while payout is symmetric.
3. `founderManager` is immutable but unused, which is a governance/accounting drift signal.
4. No explicit replay/uniqueness policy beyond `block.timestamp` in channel IDs.

## Findings (Code-Referenced)

### 1) Open challenge griefing risk (**High**)
- `challengeSettlement` currently accepts challenges from any caller and only requires non-empty bytes in `fraudProof`.
- This enables low-cost griefing by permanently setting `isChallenged = true` during window.

Reference: `challengeSettlement` checks and mutation path.【F:grid/contracts/contracts/StigmergicStateChannel.sol†L154-L162】

**Recommendation**:
- Require challenger authorization (`agentA`, `agentB`, `guardianSentinel`, or allowlisted adjudicator).
- Replace `fraudProof.length > 0` with explicit verifier callback (or enqueue adjudication in a separate dispute contract).

### 2) Settlement economics mismatch (**High**)
- Only `agentA` stake is transferred in `openChannel`.
- Settlement later splits payout to both agents (after tax), which is an implicit subsidy path unless intended.

References: single-sided funding in `openChannel` and two-sided payout in `optimisticSettle`.【F:grid/contracts/contracts/StigmergicStateChannel.sol†L99-L103】【F:grid/contracts/contracts/StigmergicStateChannel.sol†L143-L149】

**Recommendation**:
- Either enforce dual-sided staking at open, or rename semantics to sponsored task channel and encode payout policy explicitly.

### 3) Unused immutable governance dependency (**Medium**)
- `founderManager` is required in constructor and stored immutable but not read later.
- This creates operator confusion and can break evidence assumptions for treasury/founder routing.

References: declaration + constructor assignment with no runtime use.【F:grid/contracts/contracts/StigmergicStateChannel.sol†L39-L40】【F:grid/contracts/contracts/StigmergicStateChannel.sol†L79-L82】

**Recommendation**:
- Remove if unnecessary, or consume it in explicit accounting path with emitted evidence.

### 4) Channel identity/replay hygiene (**Medium**)
- `channelId` uses `(msg.sender, agentB, taskHash, block.timestamp)`.
- Timestamp-based entropy works in practice but is weak for deterministic replay-proofing and off-chain traceability.

Reference: channel ID derivation in `openChannel`.【F:grid/contracts/contracts/StigmergicStateChannel.sol†L89-L90】

**Recommendation**:
- Introduce participant nonce or signed session salt from both parties.
- Emit a deterministic session commitment to make off-chain evidence reproducible.

### 5) Positive controls already present (**Strengths**)
- Constructor rejects zero addresses and enforces `PulseAdapter.guardianSentinel()` match.
- Settlement is restricted to participants/guardian and blocked when challenge exists.

References: constructor guards + settlement auth/challenge checks.【F:grid/contracts/contracts/StigmergicStateChannel.sol†L70-L84】【F:grid/contracts/contracts/StigmergicStateChannel.sol†L120-L126】

## Recommended M8.2 Acceptance Criteria

1. Challenge authorization + fraud proof verification implemented and tested.
2. Economic model clarified (dual-stake or sponsored) with explicit invariant tests.
3. Replay-safe channel nonce strategy implemented.
4. Formal property tests:
   - No unauthorized freeze.
   - No payout without verified PoER.
   - Conservation of locked stake minus tax.

## Test Expansion Plan

Extend `grid/contracts/test/StigmergicStateChannel.test.cjs` with:
- Unauthorized challenger revert case.
- Invalid fraud proof revert case.
- Dual-sided stake or sponsored-mode invariant tests.
- Channel ID uniqueness over repeated task hashes with nonce sequencing.

Reference: existing v4 interface audit test harness file.【F:grid/contracts/test/StigmergicStateChannel.test.cjs†L1-L101】
