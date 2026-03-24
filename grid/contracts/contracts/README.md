# AXIOM-MESH Contracts (Attention-Indexed VM)

All contracts in this package now align to the Attention-Indexed VM architecture.

- Transformer proposals are treated as proposers only.
- Settlement requires PoER and Cognitive Friction verification.
- Optimistic sliding settlement finalizes through PulseChain windows.
- All contracts now use the Attention-Indexed VM. Transformer proposals gated by PoER + Cognitive Friction + consequence forecasting.

Core transformer-foundation contracts:
- `StigmergicStateChannel.sol`
- `CognitiveFrictionVerifier.sol`
- `ProveXVerifierWrapper.sol`
- `PulseAdapter.sol`
- `FounderShareManager.sol`
- `UniversalDistributionPool.sol`
