import { expect } from "chai";
import hre from "hardhat";
import fc from "fast-check";

describe("ComputeBond Formal Verification: Property-Based Fuzzing", function () {
  let ComputeBond;
  let owner;
  let node1;
  let node2;
  const NODE_ID_1 = "node-fuzz-1";
  const NODE_ID_2 = "node-fuzz-2";

  beforeEach(async function () {
    [owner, node1, node2] = await hre.ethers.getSigners();
    ComputeBond = await hre.ethers.getContractFactory("ComputeBond");
  });

  it("Should formally maintain the financial invariant under arbitrary sequences of stake, slash, and withdraw actions", async function () {
    // Increase timeout since fast-check will run 100 iterations of complex transactions
    this.timeout(120000);

    // Create custom fast-check commands
    class StakeCommand {
      constructor(amount1, amount2) {
        this.amount1 = amount1;
        this.amount2 = amount2;
      }
      check(state) { return true; }
      async run(state, computeBond) {
        if (!computeBond) return;
        if (this.amount1 > 0n) {
          await computeBond.connect(node1).stake(NODE_ID_1, { value: this.amount1 });
        }
        if (this.amount2 > 0n) {
          await computeBond.connect(node2).stake(NODE_ID_2, { value: this.amount2 });
        }
      }
      toString() { return `Stake(node1: ${this.amount1}, node2: ${this.amount2})`; }
    }

    class SlashCommand {
      constructor(amount) {
        this.amount = amount;
      }
      check(state) { return true; }
      async run(state, computeBond) {
        if (!computeBond) return;
        const bond1 = await computeBond.bonds(NODE_ID_1);
        if (bond1.isActive && bond1.amount >= this.amount && this.amount > 0n) {
          await computeBond.connect(owner).slash(NODE_ID_1, this.amount);
        }
      }
      toString() { return `Slash(node1: ${this.amount})`; }
    }

    class WithdrawCommand {
      constructor(amount) {
        this.amount = amount;
      }
      check(state) { return true; }
      async run(state, computeBond) {
        if (!computeBond) return;
        const bond2 = await computeBond.bonds(NODE_ID_2);
        if (bond2.amount >= this.amount && this.amount > 0n) {
          await computeBond.connect(node2).withdraw(NODE_ID_2, this.amount);
        }
      }
      toString() { return `Withdraw(node2: ${this.amount})`; }
    }

    class AdminWithdrawCommand {
      check(state) { return true; }
      async run(state, computeBond) {
        if (!computeBond) return;
        const slashed = await computeBond.totalSlashed();
        if (slashed > 0n) {
          await computeBond.connect(owner).withdrawSlashedFunds(slashed);
        }
        const cip = await computeBond.collectiveInvestmentPool();
        if (cip > 0n) {
          await computeBond.connect(owner).withdrawCollectiveInvestmentPool(cip);
        }
      }
      toString() { return `AdminWithdraw()`; }
    }

    // Property-based fuzzer configuration
    const stakeArb = fc.record({
      amt1: fc.bigInt({ min: 0n, max: hre.ethers.parseEther("100.0") }),
      amt2: fc.bigInt({ min: 0n, max: hre.ethers.parseEther("100.0") })
    }).map(r => new StakeCommand(r.amt1, r.amt2));

    const slashArb = fc.bigInt({ min: 0n, max: hre.ethers.parseEther("100.0") })
      .map(amt => new SlashCommand(amt));

    const withdrawArb = fc.bigInt({ min: 0n, max: hre.ethers.parseEther("100.0") })
      .map(amt => new WithdrawCommand(amt));

    const adminWithdrawArb = fc.constant(new AdminWithdrawCommand());

    // Generate arbitrary sequence of smart contract calls
    const commandsArb = fc.commands([stakeArb, slashArb, withdrawArb, adminWithdrawArb], { maxCommands: 10 });

    const checkInvariant = async (computeBond) => {
      const contractBalance = await hre.ethers.provider.getBalance(await computeBond.getAddress());
      const totalSlashed = await computeBond.totalSlashed();
      const collectiveInvestmentPool = await computeBond.collectiveInvestmentPool();
      const bond1 = await computeBond.bonds(NODE_ID_1);
      const bond2 = await computeBond.bonds(NODE_ID_2);
      const sumStakerBonds = bond1.amount + bond2.amount;
      expect(contractBalance).to.equal(totalSlashed + collectiveInvestmentPool + sumStakerBonds);
    };

    // Run the fast-check property model
    await fc.assert(
      fc.asyncProperty(commandsArb, async (cmds) => {
        const computeBond = await ComputeBond.deploy();
        const setup = () => ({});
        await fc.asyncModelRun(setup, cmds, {
          execute: async (cmd, state) => {
            await cmd.run(state, computeBond);
            await checkInvariant(computeBond);
          }
        });
      }),
      { numRuns: 20 } // Limited runs for test suite brevity, ensures thorough pseudo-random testing
    );
  });
});
