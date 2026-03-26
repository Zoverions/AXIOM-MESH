const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StablecoinPayroll", function () {
  let payroll;
  let mockStablecoin;
  let owner;
  let employee1;
  let employee2;

  beforeEach(async function () {
    [owner, employee1, employee2] = await ethers.getSigners();

    // Deploy mock ERC20 stablecoin
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockStablecoin = await MockERC20.deploy("Mock USDC", "mUSDC", ethers.parseUnits("1000000", 6));

    // Give owner some tokens
    await mockStablecoin.mint(owner.address, ethers.parseEther("1000000"));

    // Deploy the Payroll contract
    const StablecoinPayroll = await ethers.getContractFactory("StablecoinPayroll");
    payroll = await StablecoinPayroll.deploy(await mockStablecoin.getAddress());
  });

  it("should initialize correctly", async function () {
    expect(await payroll.stablecoin()).to.equal(await mockStablecoin.getAddress());
  });

  it("should allow owner to add an employee", async function () {
    const salary = ethers.parseEther("5000"); // 5000 tokens per 30 days
    await expect(payroll.addEmployee(employee1.address, salary))
      .to.emit(payroll, "EmployeeAdded")
      .withArgs(employee1.address, salary);

    const emp = await payroll.employees(employee1.address);
    expect(emp.isActive).to.be.true;
    expect(emp.salaryPerInterval).to.equal(salary);
  });

  it("should accept deposits from the owner", async function () {
    const depositAmount = ethers.parseEther("10000");
    await mockStablecoin.approve(await payroll.getAddress(), depositAmount);

    await expect(payroll.deposit(depositAmount))
      .to.emit(payroll, "FundsDeposited")
      .withArgs(owner.address, depositAmount);

    const contractBalance = await mockStablecoin.balanceOf(await payroll.getAddress());
    expect(contractBalance).to.equal(depositAmount);
  });

  it("should allow an active employee to claim a partial salary", async function () {
    const salary = ethers.parseEther("5000"); // 5000 per 30 days (interval)
    const depositAmount = ethers.parseEther("10000");

    // Add employee
    await payroll.addEmployee(employee1.address, salary);

    // Deposit funds
    await mockStablecoin.approve(await payroll.getAddress(), depositAmount);
    await payroll.deposit(depositAmount);

    // Fast-forward time by 15 days (half the 30-day interval)
    const FIFTEEN_DAYS = 15 * 24 * 60 * 60;
    await ethers.provider.send("evm_increaseTime", [FIFTEEN_DAYS]);
    await ethers.provider.send("evm_mine");

    const empBalBefore = await mockStablecoin.balanceOf(employee1.address);

    // Claim salary
    await expect(payroll.connect(employee1).claimSalary())
      .to.emit(payroll, "SalaryClaimed");

    const empBalAfter = await mockStablecoin.balanceOf(employee1.address);
    const claimed = empBalAfter - empBalBefore;

    // We fast-forwarded 15 days, expected claim is roughly 2500 (half of 5000).
    const expectedApprox = ethers.parseEther("2500");
    const tolerance = ethers.parseEther("10"); // small tolerance for block timestamp variance

    expect(claimed).to.be.closeTo(expectedApprox, tolerance);
  });

  it("should not allow inactive employees to claim", async function () {
    await expect(payroll.connect(employee1).claimSalary()).to.be.revertedWith("Not an active employee");
  });

  it("should allow owner to emergency withdraw", async function () {
    const depositAmount = ethers.parseEther("10000");
    await mockStablecoin.approve(await payroll.getAddress(), depositAmount);
    await payroll.deposit(depositAmount);

    const withdrawAmount = ethers.parseEther("5000");
    await expect(payroll.emergencyWithdraw(withdrawAmount)).to.not.be.reverted;

    const contractBalance = await mockStablecoin.balanceOf(await payroll.getAddress());
    expect(contractBalance).to.equal(ethers.parseEther("5000"));
  });
});
