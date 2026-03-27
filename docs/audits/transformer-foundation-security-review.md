# Transformer Foundation Security Review Scope

## Overview
This document outlines the scope for the external security review of the Transformer Foundation components of AXIOM-MESH, specifically tailored for the handoff to Zellic / Trail of Bits (ToB).

## Scope
The primary focus of this review is on the core validation and optimistic settlement mechanisms:

1. **Proof of Execution & Reasoning (PoER)**
   - Mechanism: zkML integration and recursive SNARK proof aggregation.
   - Files in scope:
     - `grid/contracts/contracts/ZKMLVerifier.sol`
     - `grid/contracts/contracts/ZkMLCrossChainVerifier.sol`
   - Key Questions: Are the circuit constraints sound? Is the trusted setup provenance verifiable? Are L1/L2 L3 proof caches susceptible to replay attacks?

2. **Cognitive Friction**
   - Mechanism: Friction verification ensuring intent alignment before execution is approved.
   - Files in scope:
     - `grid/contracts/contracts/CognitiveFrictionVerifier.sol`
     - `grid/contracts/contracts/ProveXVerifierWrapper.sol`
   - Key Questions: Can the friction validation be bypassed? Is the `ProveXVerifierWrapper` accurately mapping dynamic amounts to proofs?

3. **Optimistic Challenge Windows (Stigmergic State Channel v4)**
   - Mechanism: Consequence-forecasting and reputation-weighted challenge periods.
   - Files in scope:
     - `grid/contracts/contracts/StigmergicStateChannel.sol`
   - Key Questions: Are the dynamic challenge windows securely calculated based on reputation? Is the stake symmetry policy enforced correctly to prevent griefing? Are fraud proofs validated strictly?

## Additional Documentation
- `docs/ARCHITECTURE.md`
- `docs/CAUSAL-PROOF-OF-REASONING.md`
- `docs/runbooks/pulsechain-redemption.md`
