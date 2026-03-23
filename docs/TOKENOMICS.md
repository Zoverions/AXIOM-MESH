# AXIOM-MESH Tokenomics (Canonical Reference)

**Status:** Pre-launch hardening with partially locked on-chain parameters (updated March 23, 2026).

This document is the canonical tokenomics reference for external/internal stakeholders.

---

## 1) Scope

This document defines:
- policy targets,
- control boundaries,
- change-control rules,
- evidence requirements for any public tokenomics claim.

Related specs:
- `docs/TREASURY-SPLIT.md`
- `docs/ERC20-COMPATIBILITY.md`
- `docs/GOVERNANCE.md`

---

## 2) Core Parameters (Policy Targets)

- **Token symbol:** AXM
- **Target total supply:** 1,000,000,000 AXM
- **Founder allocation:** 5% (implemented in `AXM.sol`)
- **Network treasury allocation:** 10% (implemented in `AXM.sol`)
- **Ecosystem reserve allocation:** 85% (implemented in `AXM.sol`)

> Supply split is now codified in `grid/contracts/contracts/token/AXM.sol`; treasury inflow classes and release controls still require governance finalization.

---

## 3) Financial Control Framework

All token and treasury flows must satisfy:

1. **Deterministic accounting**
   - The same inputs produce the same ledger/accounting outputs.
2. **Traceability**
   - Every material inflow/outflow has an attributable event path.
3. **Reconciliation**
   - Off-chain and on-chain state differences are detectable and triaged.
4. **Change governance**
   - Parameter updates require explicit governance authorization.

---

## 4) Tokenomics Claim Rules (Public Communications)

Public statements must separate these classes:

- **Implemented now:** backed by deployed code/contract state and evidence.
- **Policy target:** intended configuration pending governance/deployment finalization.
- **Planned roadmap:** not yet enforceable in production.

No post, launch deck, or announcement should merge these classes into a single “already live” claim.

---

## 5) Parameter Change Control (Mandatory)

Any parameter change must include:
1. Governance proposal/reference.
2. Reason for change.
3. Impact analysis (holder, treasury, and network operations).
4. Effective date and rollback conditions.
5. Updated release evidence bundle and docs references.

---

## 6) Audit Evidence Checklist (Release Gate)

Before declaring tokenomics “final” for a release:
- [ ] Deployed contract addresses and chain IDs are published.
- [ ] Contract parameters match declared policy values.
- [ ] Treasury/distribution events are reconciled for the release period.
- [ ] Exception/variance log is attached with owners and expiry.
- [ ] Governance records for all parameter changes are linked.

If any item is unchecked, release messaging must use “provisional / in-hardening” wording.

---

## 7) Versioning and Accountability

- This file is canonical and must be updated in the same PR as any tokenomics-impacting code or governance change.
- Historical snapshots should be retained in git history and release notes.
