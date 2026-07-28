import { expect } from "chai";
import hre from "hardhat";

describe("TaskRequestMarket", function () {
  let token;
  let market;
  let owner;
  let requester;
  let performer;
  let treasury;

  const initialSupply = hre.ethers.parseEther("1000000");
  const reward = hre.ethers.parseEther("1000");

  beforeEach(async function () {
    [owner, requester, performer, treasury] = await hre.ethers.getSigners();

    const Token = await hre.ethers.getContractFactory("AXMToken");
    token = await Token.connect(owner).deploy(initialSupply);

    await token.connect(owner).transfer(requester.address, reward);

    const Market = await hre.ethers.getContractFactory("TaskRequestMarket");
    market = await Market.connect(owner).deploy(token.target, treasury.address);
  });

  it("escrows reward, pays performer, and sends public-goods split", async function () {
    const now = (await hre.ethers.provider.getBlock("latest")).timestamp;
    const deadline = now + 3600;

    await token.connect(requester).approve(market.target, reward);

    await expect(
      market.connect(requester).createTask(
        reward,
        deadline,
        1000,
        2,
        "ipfs://task/spec/1"
      )
    ).to.emit(market, "TaskCreated");

    await expect(market.connect(performer).acceptTask(1))
      .to.emit(market, "TaskAccepted")
      .withArgs(1, performer.address);

    await expect(market.connect(performer).submitTask(1, "ipfs://task/submission/1"))
      .to.emit(market, "TaskSubmitted");

    await expect(market.connect(requester).finalizeTask(1, true, 92, "ipfs://task/feedback/1"))
      .to.emit(market, "TaskFinalized");

    const performerExpected = hre.ethers.parseEther("900");
    const treasuryExpected = hre.ethers.parseEther("100");

    expect(await token.balanceOf(performer.address)).to.equal(performerExpected);
    expect(await token.balanceOf(treasury.address)).to.equal(treasuryExpected);

    const task = await market.tasks(1);
    expect(task.status).to.equal(3n); // Completed
    expect(task.feedbackScore).to.equal(92n);
  });

  it("refunds requester when not approved", async function () {
    const now = (await hre.ethers.provider.getBlock("latest")).timestamp;
    const deadline = now + 3600;

    await token.connect(requester).approve(market.target, reward);
    await market.connect(requester).createTask(reward, deadline, 500, 0, "ipfs://task/spec/2");
    await market.connect(performer).acceptTask(1);
    await market.connect(performer).submitTask(1, "ipfs://task/submission/2");

    const before = await token.balanceOf(requester.address);
    await market.connect(requester).finalizeTask(1, false, 40, "ipfs://task/feedback/2");
    const after = await token.balanceOf(requester.address);

    expect(after).to.equal(before + reward);
  });
});
