const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MemoryLattice", function () {
  let owner;
  let poerVerifier;
  let horizon;
  let lattice;

  beforeEach(async function () {
    [owner] = await ethers.getSigners();

    const CognitiveFrictionVerifier = await ethers.getContractFactory("CognitiveFrictionVerifier");
    poerVerifier = await CognitiveFrictionVerifier.deploy();
    await poerVerifier.waitForDeployment();

    const MockZKMLVerifier = await ethers.getContractFactory("MockZKMLVerifier");
    const zkVerifier = await MockZKMLVerifier.deploy();
    await zkVerifier.waitForDeployment();
    await poerVerifier.setZkVerifier(await zkVerifier.getAddress());

    const HorizonForecast = await ethers.getContractFactory("HorizonForecast");
    // Deploying HorizonForecast with itself as channel address since channel isn't relevant to memory lattice tests
    horizon = await HorizonForecast.deploy(await poerVerifier.getAddress(), owner.address);
    await horizon.waitForDeployment();

    const MemoryLattice = await ethers.getContractFactory("MemoryLattice");
    lattice = await MemoryLattice.deploy(await poerVerifier.getAddress(), await horizon.getAddress());
    await lattice.waitForDeployment();
  });

  it("Should add an attention node successfully", async function () {
    const domain = ethers.keccak256(ethers.toUtf8Bytes("DEFi_LIQUIDITY"));
    const contextHash = ethers.keccak256(ethers.toUtf8Bytes("context"));

    // We need a valid poerProof to pass the poerVerifier
    const coder = ethers.AbiCoder.defaultAbiCoder();
    const zkProof = coder.encode(
      ["uint256[2]", "uint256[2][2]", "uint256[2]"],
      [
        [1, 2],
        [[3, 4], [5, 6]],
        [7, 8]
      ]
    );

    await expect(lattice.addAttentionNode(domain, contextHash, zkProof))
      .to.emit(lattice, "LatticeNodeAdded")
      .withArgs(ethers.keccak256(ethers.solidityPacked(["bytes32", "bytes32"], [domain, contextHash])), domain);

    const nodeId = ethers.keccak256(ethers.solidityPacked(["bytes32", "bytes32"], [domain, contextHash]));
    const node = await lattice.nodes(nodeId);
    expect(node.domain).to.equal(domain);
    expect(node.contextHash).to.equal(contextHash);
  });

  it("Should add an attention edge successfully", async function () {
    const fromNode = ethers.keccak256(ethers.toUtf8Bytes("from"));
    const toNode = ethers.keccak256(ethers.toUtf8Bytes("to"));
    const weight = 100;
    const horizonProof = "0x";

    await expect(lattice.addAttentionEdge(fromNode, toNode, weight, horizonProof))
      .to.emit(lattice, "LatticeEdgeAdded")
      .withArgs(fromNode, toNode, weight);

    const path = await lattice.getLatticePath(fromNode, toNode);
    expect(path.length).to.equal(1);
    expect(path[0].fromNode).to.equal(fromNode);
    expect(path[0].toNode).to.equal(toNode);
    expect(path[0].weight).to.equal(weight);
  });
});
