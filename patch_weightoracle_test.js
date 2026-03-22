const fs = require('fs');
let code = fs.readFileSync('grid/contracts/test/WeightOracle.cjs', 'utf8');

const newTests = `
  it("should fail to add PoER bonus if not ComputeBond", async function () {
    await weightOracle.queueOperation(ethers.keccak256(ethers.solidityPacked(["string", "address"], ["setComputeBondContract", owner.address])));
    await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60 + 1]);
    await ethers.provider.send("evm_mine");
    await weightOracle.setComputeBondContract(owner.address);

    await expect(weightOracle.connect(agentNode).addPoERBonus(humanNode.address, 100))
      .to.be.revertedWith("Unauthorized: Only ComputeBond can add PoER bonus");
  });

  it("should fail to slash PoER bonus if not ComputeBond", async function () {
    await weightOracle.queueOperation(ethers.keccak256(ethers.solidityPacked(["string", "address"], ["setComputeBondContract", owner.address])));
    await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60 + 1]);
    await ethers.provider.send("evm_mine");
    await weightOracle.setComputeBondContract(owner.address);

    await expect(weightOracle.connect(agentNode).slashPoERBonus(humanNode.address))
      .to.be.revertedWith("Unauthorized: Only ComputeBond can slash PoER bonus");
  });

  it("should calculate merit weight correctly with verified skill points", async function () {
    await weightOracle.queueOperation(ethers.keccak256(ethers.solidityPacked(["string", "address", "uint256"], ["updateWeight", humanNode.address, 100])));
    await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60 + 1]);
    await ethers.provider.send("evm_mine");
    await weightOracle.updateWeight(humanNode.address, 100);

    await weightOracle.queueOperation(ethers.keccak256(ethers.solidityPacked(["string", "address"], ["setComputeBondContract", owner.address])));
    await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60 + 1]);
    await ethers.provider.send("evm_mine");
    await weightOracle.setComputeBondContract(owner.address);

    await weightOracle.addPoERBonus(humanNode.address, 50);

    await weightOracle.queueOperation(ethers.keccak256(ethers.solidityPacked(["string", "address", "uint256"], ["addVerifiedSkillPoints", humanNode.address, 8])));
    await ethers.provider.send("evm_increaseTime", [2 * 24 * 60 * 60 + 1]);
    await ethers.provider.send("evm_mine");
    await weightOracle.addVerifiedSkillPoints(humanNode.address, 8);

    // base = 100 + 50 = 150
    // pts = 8
    // logPts = 3 (since 8 > 1: 4, 1; 4 > 1: 2, 2; 2 > 1: 1, 3)
    // base + logPts = 153
    expect(await weightOracle.getWeight(humanNode.address)).to.equal(153);
  });
});
`;

code = code.replace(/}\);\n$/, newTests);
fs.writeFileSync('grid/contracts/test/WeightOracle.cjs', code);
