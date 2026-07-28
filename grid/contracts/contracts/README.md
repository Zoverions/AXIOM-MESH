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

## Contract Categories

### Education Contracts
Located in `education-contracts/`:
- **AccreditationAttestor.sol**: Attests to educational credentials and achievements
- **CompetencyOracle.sol**: Oracle for competency assessments
- **CredentialBond.sol**: Bonded credential verification system
- **CurriculumRegistry.sol**: Registry for curriculum standards
- **EducationalNode.sol**: Educational node management
- **GuidancePolicy.sol**: Policy enforcement for guidance systems

Regional education implementations are located in `/sandbox/capsules/education/ontario/contracts/`:
- **OntarioEducationAttestor.sol**: Ontario-specific educational achievement attestation
- **EducationTomeRegistry.sol**: Multi-agent education session tracking (childhood psychologist, guidance counselor, expert agents)
