# AXIOM-MESH Tokenomics (Canonical Reference)

**Status:** Pre-launch draft under implementation hardening and governance review.

This file consolidates tokenomics references that were previously spread across multiple docs.

## 1) Scope

This document defines the intended token economic model and links to implementation constraints:
- Treasury flow mechanics (`docs/TREASURY-SPLIT.md`)
- ERC20 compatibility and transfer semantics (`docs/ERC20-COMPATIBILITY.md`)
- Governance controls over economic parameters (`docs/GOVERNANCE.md`)

## 2) Core Parameters (Current Targets)

- **Token symbol:** AXM
- **Target total supply:** 1,000,000,000 AXM (fixed policy target)
- **Founder allocation policy target:** 5%
- **Network treasury policy target:** 10% on defined inflow classes (as specified by governance)

These values are policy targets until finalized by governance and contract-level controls.

## 3) Flow Categories

Token/economic flows are organized by category:
1. **Protocol/treasury inflows** (network share routing)
2. **Distribution outflows** (payroll, UBI, incentives)
3. **Validator/staker reward flows**
4. **Cross-chain transfer-related fee flows**

Each category must have:
- deterministic accounting treatment,
- traceable event records,
- reconciliation path between off-chain ledger and on-chain state.

## 4) Control Requirements Before Launch

- Parameter changes require governance approval and audit trail.
- Treasury-affecting actions must be reproducible from logs/evidence.
- Reconciliation variance threshold must be explicitly monitored and enforced.
- Exception handling must be time-bounded and owner-assigned.

## 5) Non-Negotiable Transparency Rules

- No “live mainnet/testnet tokenomics” claims without verified deployment evidence.
- Public messaging must distinguish policy target vs implemented contract behavior.
- Any economic model update must include:
  - change rationale,
  - migration/impact notes,
  - updated runbooks and evidence requirements.

## 6) Related Docs

- `docs/TREASURY-SPLIT.md`
- `docs/ERC20-COMPATIBILITY.md`
- `docs/GOVERNANCE.md`
- `docs/PRODUCTION-EXECUTION-BACKLOG.md`
- `docs/HOWTO/release-gate-evidence.md`
