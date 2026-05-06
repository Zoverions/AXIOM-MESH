const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("HermesAgentRegistry", function () {
  let HermesAgentRegistry;
  let registry;
  let owner;
  let addr1;

  beforeEach(async function () {
    HermesAgentRegistry = await ethers.getContractFactory("HermesAgentRegistry");
    [owner, addr1] = await ethers.getSigners();
    registry = await HermesAgentRegistry.deploy();
  });

  describe("Capabilities", function () {
    it("Should return a capability token", async function () {
      const agentId = ethers.encodeBytes32String("agent1");
      const actionHash = ethers.encodeBytes32String("action1");
      const token = await registry.requestCapability(agentId, actionHash);
      expect(token).to.not.equal(ethers.ZeroHash);
    });
  });
});
