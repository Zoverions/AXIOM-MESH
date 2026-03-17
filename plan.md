# AXIOM-MESH Roadmap – 2026 Edition (Updated March 2026)

## Q1 2026 – Agent Orchestration Layer (In Progress)
- [ ] LangGraph integration in Hypervisor (checkpointed workflows)
- [ ] MCP + A2A servers (interoperability)
- [ ] Dynamic skill registry (AgentZero/OpenClaw style)
- [ ] AutoResearch v2 with zkML quality gate

## Q2 2026 – Production Readiness
- [ ] CrewAI + Guardrails safety layer
- [ ] Full LangSmith observability + Grid audit sync
- [ ] LlamaIndex long-term memory
- [ ] Gateway UI enhancements (OpenClaw-style dashboard)

## Q3 2026 – Decentralized Scaling
- [ ] Multi-peer Grid skill staking with A2A
- [ ] Self-improving autonomous loops
- [ ] Public MCP registry for community skills

# Roadmap Status Snapshot (Audit-Verified)

This roadmap note tracks the Bicameral Cognitive Syndicate smart-contract milestone and is now audit-updated.

## Milestone: Bicameral Governance Contracts

- ✅ `DualLedgerIdentity.sol` implemented (human/agent identity registry with custom errors).
- ✅ `WeightOracle.sol` implemented (owner-managed weight updates for registered identities).
- ✅ `DialecticArbitration.sol` implemented (deadlock detection, synthesis state, revote flow).
- ✅ Contract test suites are present in `grid/contracts/test/` for all three contracts.

## Remaining follow-up

- ✅ Run Hardhat compile/test in a network-enabled environment where Solidity compiler downloads are permitted.
- ✅ Wire these contracts into runtime Grid API workflows (stake/slash/chain event reconciliation) for production usage.

## Detailed Contract Worklog (Completed)

1. ✅ Implemented `grid/contracts/contracts/DualLedgerIdentity.sol`
   - Owner-controlled identity registration and deregistration.
   - Distinct Human/Agent identity types.
   - Custom error-based revert model.

2. ✅ Implemented `grid/contracts/contracts/WeightOracle.sol`
   - Stores per-node voting weights.
   - Supports single and batch updates.
   - Restricts updates to owner and validates node registration.

3. ✅ Implemented `grid/contracts/contracts/DialecticArbitration.sol`
   - Tracks proposals and bicameral votes.
   - Detects deadlock state and transitions to `AwaitingSynthesis`.
   - Allows Hypervisor/owner synthesis submission and re-vote reset.

4. ✅ Added contract tests under `grid/contracts/test/`
   - `DualLedgerIdentity.cjs`
   - `WeightOracle.cjs`
   - `DialecticArbitration.cjs`

## Validation notes

- The repository contains the full source + test scaffolding.
- Hardhat compile and tests have been successfully run in a network-enabled environment.
- The contracts are now wired into the runtime Grid API workflows (`/proposals` and `/proposals/events`).
