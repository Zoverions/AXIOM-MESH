# StigmergicStateChannel v4 Interface Audit

Date: 2026-03-24
Scope: `StigmergicStateChannel.sol` compatibility against AXM token transfer semantics, `CognitiveFrictionVerifier.verifyPoER`, and `PulseAdapter.guardianSentinel` wiring.

## Summary

- Migrated direct contract imports to explicit interfaces to lock the channel to minimal, audited cross-contract touchpoints.
- Added constructor guardrails for all critical dependency addresses and a `guardianSentinel` consistency check with `PulseAdapter`.
- Added settlement authorization and challenge-state gating to prevent third-party settlement and challenged-channel payout.
- Added settlement funding split event for deterministic accounting evidence.

## Interface Compatibility Matrix

| Dependency | Interface Method | Usage in Channel | Result |
|---|---|---|---|
| AXM | `transferFrom(address,address,uint256)` | Stake lock on open | Compatible |
| AXM | `transfer(address,uint256)` | Tax + payout split on settlement | Compatible |
| CognitiveFrictionVerifier | `verifyPoER(...)` | Validates optimistic settlement | Compatible |
| PulseAdapter | `guardianSentinel()` | Constructor invariant check | Compatible |

## New Invariants

1. Constructor rejects zero-value dependencies for all critical addresses.
2. Constructor rejects deployments where `PulseAdapter.guardianSentinel()` does not match the configured guardian.
3. Only channel participants or guardian can execute optimistic settlement.
4. Challenged channels cannot settle via optimistic path.
5. Challenges are only accepted while challenge window is open.

## Test Coverage Added

`grid/contracts/test/StigmergicStateChannel.test.cjs` includes:
- Guardian mismatch deployment revert.
- Challenge freeze on settlement.
- Funding split + event emission on successful settlement.
