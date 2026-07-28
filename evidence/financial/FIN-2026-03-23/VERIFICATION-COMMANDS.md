# Financial Evidence Bundle: Verification Commands

Run these commands from repository root and capture output artifacts in the RC package.

## Contract and policy checks

- `cd grid/contracts && npm test`
- `python3 scripts/verify_evidence_bundles.py`
- `python3 scripts/validate_release_evidence.py <RC_PATH>`

## Documentation/control coherence checks

- `rg -n "5%|10%|85%|Founder|Treasury|Ecosystem" docs/TOKENOMICS.md grid/contracts/contracts/AXM.sol`
- `rg -n "Treasury|multisig|governance" docs/GOVERNANCE.md grid/contracts/contracts/Treasury.sol`
- `rg -n "ComputeBond|getStorageOffer|severance" grid/contracts/contracts/ComputeBond.sol docs/FINANCIAL-CONTROLS-EVIDENCE.md`
