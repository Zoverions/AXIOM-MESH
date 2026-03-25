# Proof of Truth (PoT) Protocol — AXIOM-MESH Blueprint

**Status:** Proposed (Design Candidate)  
**Date:** 2026-03-25

## 1) Objective

PoT extends proof-of-computation into proof-of-truth. Instead of only proving an inference ran correctly, PoT introduces source provenance anchoring, challengeable truth claims, and cryptographic attestation over validation outcomes.

## 2) Three-Layer Model

1. **Source Provenance Layer**
   - hash and register source material for each claim,
   - track lineage of derived claims.
2. **Consensus Validation Layer**
   - multi-agent dispute window and challenge flow,
   - weighted consensus over evidence paths.
3. **Cryptographic Attestation Layer**
   - verifiable proof that validation checks executed,
   - immutable truth verdict artifact for audit and replay.

## 3) Core Protocol Objects

- `TruthClaim`: claim hash, claimant, source hashes, bond, challenge deadline.
- `TruthChallenge`: challenger evidence hash, challenge bond, resolution outcome.
- `TruthVerdict`: confirmed/refuted status with verification metadata.

## 4) Contract/Service Targets (Planned)

- `TruthAnchor.sol` — source anchoring and claim registration.
- `TruthBond.sol` — bond escrow + slashing/reward mechanics.
- `TruthChallenge.sol` — challenge market and resolution flow.
- `grid/src/truth/provenance_tracker.go` — lineage + ledger events.
- Hypervisor endpoints: `/truth/anchor`, `/truth/challenge`, `/truth/verdict`.

## 5) Safety and Economics

- False claims are slashable.
- Successful challengers are rewarded.
- Unchallenged claims release bond after deadline.
- Claim classes can enforce minimum bond size by risk tier.

## 6) Relationship to CPoR and EAP

- **CPoR** proves causal reasoning lineage.
- **EAP** creates mesh-wide immune response artifacts against adversarial prompt vectors.
- **PoT** governs truth claims and economic settlement of disputed assertions.

Together they form a layered trust stack: **Reasoning Integrity + Attack Immunity + Truth Finality**.
