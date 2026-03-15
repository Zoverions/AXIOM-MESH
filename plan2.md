1. **Implement `DualLedgerIdentity.sol` in `grid/contracts/contracts/`**
   - Stores node registrations with two distinct types: Human (Proof of Personhood) and Agent (Proof of Compute).
   - Use custom errors like `NodeAlreadyRegistered()`, `InvalidIdentityType()`, etc.

2. **Implement `WeightOracle.sol` in `grid/contracts/contracts/`**
   - Maintains PoER (Agent compute score) and PoSig (Human signal score) balances.
   - Calculates moving average or just store the 30-day verified compute/signals. We can store raw values and increment them via an authorized oracle/owner.

3. **Implement `DialecticArbitration.sol` in `grid/contracts/contracts/`**
   - Needs to track proposals that can have votes from both Human and Agent domains.
   - Contains a mechanism to detect a deadlock (e.g. votes from Anthropic chamber contradict votes from Algorithmic chamber on overlapping domain).
   - "Intercepts" the deadlock and sets state to `AwaitingSynthesis`.
   - Has a function for the Hypervisor (or authorized oracle) to submit the `Geometric Synthesis` and trigger a re-vote.

4. **Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.**
   - Run linter/compiler for smart contracts using hardhat (`npx hardhat compile` inside `grid/contracts`).
   - Add simple unit tests in `grid/contracts/test` for these 3 contracts to ensure they compile and work as expected.

5. **Submit**
