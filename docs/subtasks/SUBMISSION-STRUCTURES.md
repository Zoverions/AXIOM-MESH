# Credentialed Submission Structures

**Status**: In Progress — Primary tasks moved to MASTER-TODO.md Lane M13
**Owner**: @agent+governance+gateway
**Date**: 2026-03-25 (Updated: 2026-03-28)

## Overview
We need to implement structures where documents and pertinent files/resources can be submitted on a topic, restricted to those who have the necessary abilities, credentials, or education to do so. This introduces credential-gated governance and knowledge submission mechanisms.

## Completed Work
- [x] **M13.3**: Implemented `CredentialedSubmission.sol` smart contract
  - Gates submissions to users passing credential thresholds
  - Integrates with existing credential contracts:
    - `FounderCommitment`
    - `CitizenshipNFT`
    - `WeightOracle`
    - `TrustScore` contract
- [x] Basic whitelist/interface check mechanism

## Remaining Tasks (Tracked in MASTER-TODO.md)
- [ ] **M13.9** Complete SUBMISSION-STRUCTURES
  - Implement Gateway/Hypervisor endpoints for:
    - Signing credentialed transactions
    - Routing high-value submissions
  - Design and implement review system:
    - Define review workflow for submissions
    - Establish merge process into canonical repository
    - Integrate with on-chain IPFS registry
  - Build UI for submission management

## Related Documents
- **Master TODO:** `docs/MASTER-TODO.md` (Lane M13.9)
- **Smart Contract:** `grid/contracts/contracts/CredentialedSubmission.sol`
- **Credential Contracts:** `grid/contracts/contracts/` (FounderCommitment, CitizenshipNFT, etc.)
- **Gateway Routes:** `gateway/src/routes/` (pending submission endpoints)
