# AXIOM-MESH Bug Bounty Policy

## 1. Introduction
The AXIOM-MESH project takes security very seriously. This bug bounty program, modeled after Immunefi structures, aims to incentivize security researchers to discover and disclose vulnerabilities in our smart contracts, off-chain systems, and hybrid cryptographic components.

## 2. Scope
The following components are strictly within scope for this bounty program:
- **Smart Contracts (`grid/contracts/contracts/`)**: Especially high-value contracts like `ComputeBond.sol`, `WeightOracle.sol`, `StigmergicStateChannel.sol`, and the governance suite.
- **Hypervisor (`hypervisor/`)**: Intent routing, execution bounds, and inter-service authentication (mTLS).
- **Sandbox (`sandbox/`)**: Isolation controls, resource throttling, and deterministic execution wrappers.
- **Grid Node (`grid/`)**: P2P networking, zero-knowledge proofs (cpor), and cryptographic implementations.

*Out of Scope:*
- UI/UX issues.
- Missing HTTP security headers (unless they lead directly to a vulnerability).
- Brute-forcing / DDoS against production infrastructure (please test locally).
- Third-party library bugs (unless our integration specifically causes the vulnerability).

## 3. Severity & Payouts
Payouts are determined by the AXIOM-MESH Security Council based on the severity of the disclosed vulnerability. Our severity classifications follow standard Immunefi guidelines (Critical, High, Medium, Low).

| Severity | Target Payout | Description |
|----------|--------------|-------------|
| **Critical** | Up to $100,000 | Vulnerabilities that lead to direct loss of user funds, catastrophic consensus failure, or full system compromise. |
| **High** | Up to $25,000 | Vulnerabilities that lead to temporary freezing of funds, severe logic errors, or unauthorized access to sensitive data. |
| **Medium** | Up to $5,000 | Vulnerabilities that result in griefing, significant degradation of service, or logic errors that don't directly lose funds but break invariants. |
| **Low** | Up to $1,000 | Minor contract flaws, non-critical parameter misconfigurations, or edge cases with minimal impact. |

*Note: All payouts are denominated in stablecoins (e.g., USDC) and are distributed via the on-chain `BugBounty.sol` smart contract.*

## 4. Reporting Process
1. **On-Chain Submission:** Security researchers can formally establish the timestamp of their discovery by calling the `submitReport(string referenceUrl)` function on the `BugBounty.sol` smart contract. The `referenceUrl` should point to an encrypted IPFS payload or a secure off-chain link containing the disclosure details.
2. **Private Disclosure:** Alternatively, or in conjunction with the on-chain submission, researchers must provide the full technical details (Proof of Concept, steps to reproduce) securely via email to `security@axiom-mesh.network` (PGP key provided upon request).
3. **Triage:** The AXIOM-MESH Security Council will triage the report within 48 hours.
4. **Resolution & Payout:** If validated, the Council will invoke `resolveReport` with the determined severity and process the payout via `payBounty`.

## 5. Safe Harbor
Any activities conducted in a manner consistent with this policy will be considered authorized conduct, and we will not initiate legal action against you. Please act in good faith, avoid privacy violations, destruction of data, and interruption or degradation of our service.

## 6. Known Issues
Any issues previously identified in the `docs/MASTER-TODO.md`, past audit reports, or documented in our public GitHub issues are not eligible for a bounty.
