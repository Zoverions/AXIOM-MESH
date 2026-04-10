# Genesis Handoff Migration Runbook (April 10, 2026)

1. Deploy `GenesisDecayGovernance.sol` on PulseChain testnet/mainnet with:
   - halfLifeBlocks ≈ 2,628,000 (≈1 month half-life)
   - initialFounderCoefficient = 1000e18
   - founders = core team addresses

2. Deploy `ProposalRegistry.sol` passing the GenesisDecayGovernance address.

3. Update Hypervisor config with new ProposalRegistry address.

4. Run `make validate-sovereign-queue` (new CI target).

5. Merge this PR → Hypervisor now pulls tasks exclusively from on-chain SEQ.

6. (Optional) Timelock transfer of SENATE_ROLE after first 30 days of decay.

Evidence bundle will be published immediately after deployment.