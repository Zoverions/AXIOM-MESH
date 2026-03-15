The goal is to implement three smart contracts for the AxiomMesh P2P Grid as requested in the "Bicameral Cognitive Syndicate" RFC:

1. **DualLedgerIdentity.sol**: A registry that separates Proof of Personhood (Human Keys) from Proof of Compute (Agent Keys).
2. **WeightOracle.sol**: Calculates voting weights based on PoER (Proof of Entropy Reduction - Algorithmic) or PoSig (Proof of Signal - Anthropic).
3. **DialecticArbitration.sol**: A specialized smart contract that handles deadlocked overlapping votes, routes them to a "Hypervisor" for synthesis, and triggers a re-vote.

All contracts must use custom errors for gas efficiency.
