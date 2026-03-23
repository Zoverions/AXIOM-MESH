# AXIOM-MESH Financial Controls Evidence Index

**Version:** 2026-03-24
**Purpose:** Links financial control policies to concrete implementation artifacts, tests, and verification commands. This fulfills the `M5.3` post-audit requirement.

## 1) Overview

AXIOM-MESH integrates on-chain smart contracts with off-chain governance and hypervisor validation. This index maps the financial controls defined in `docs/TOKENOMICS.md` and `docs/TREASURY-SPLIT.md` to verifiable codebase implementation.

---

## 2) Control Mapping

| Control Name | Policy Reference | Implementation Artifact | Verification Command / Proof |
| :--- | :--- | :--- | :--- |
| **Genesis Mint Split** | `docs/TOKENOMICS.md` | `grid/contracts/contracts/AXM.sol` (5% Founder, 10% Treasury, 85% Ecosystem) | `grep -A 5 "mintSplit" grid/contracts/contracts/AXM.sol` |
| **Compute Bond Severance** | `docs/SECURITY-REALITY-2026.md` | `grid/contracts/contracts/ComputeBond.sol` | Verified in CI via `npx hardhat test` for ComputeBond. |
| **Treasury Multi-Sig Governance** | `docs/GOVERNANCE.md` | `grid/contracts/contracts/Treasury.sol` | Mapped in `GOVERNANCE-CONTROL-MAP.md`. |
| **Storage Offer Persistence** | `docs/AUDIT_REPORT.md` | `grid/contracts/contracts/ComputeBond.sol` | Test `getStorageOffer` returns persisted data. |
| **PoER Payouts** | `docs/TOKENOMICS.md` | `grid/contracts/contracts/ProveXVerifierWrapper.sol` | Verified dynamic allocation calculation based on score. |

---

## 3) Future Governance Locks

As noted in `docs/AUDIT_REPORT.md`, any future modifications to tokenomics parameters or financial controls require:
1. A governance decision record.
2. An update to this index mapping the new control.
3. Verification of the updated implementation code.
