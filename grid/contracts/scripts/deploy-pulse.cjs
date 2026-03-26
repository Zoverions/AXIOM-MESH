const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  let signers = [];
  try {
    signers = await hre.ethers.getSigners();
  } catch (e) {
  }

  if (signers.length === 0 || !process.env.PRIVATE_KEY) {
    console.log("No funded deployer key provided.");
    console.log("Generating a new wallet for PulseChain Testnet deployment...");
    const wallet = hre.ethers.Wallet.createRandom();
    console.log("\nNew Wallet Generated:");
    console.log(`Address: ${wallet.address}`);
    console.log(`Private Key: ${wallet.privateKey}`);
    console.log("\nPlease fund this wallet with testnet PLS using the PulseChain testnet v4 faucet.");
    console.log("Once funded, set PRIVATE_KEY in your environment and re-run the deployment.\n");
    return;
  }

  const [deployer] = signers;
  let balance = 0n;
  try {
    balance = await hre.ethers.provider.getBalance(deployer.address);
  } catch (e) {
    console.log("\nCould not connect to the network to check balance. Proceeding to prompt for funding...");
  }

  if (balance === 0n) {
    console.log(`\nAccount ${deployer.address} has 0 testnet PLS.`);
    console.log("Please fund this wallet with testnet PLS using the PulseChain testnet v4 faucet.");
    console.log("Once funded, re-run the deployment.\n");
    return;
  }

  console.log("Deploying with:", deployer.address);

  // Predict FounderShareManager address
  const nonce = await hre.ethers.provider.getTransactionCount(deployer.address);
  // AXM deploys at nonce
  // FounderCommitment deploys at nonce + 1
  // ComputeBond deploys at nonce + 2
  // FounderShareManager deploys at nonce + 3
  const founderShareManagerAddress = hre.ethers.getCreateAddress({
    from: deployer.address,
    nonce: nonce + 3
  });

  const founderHash = hre.ethers.keccak256(hre.ethers.solidityPacked(["address"], [founderShareManagerAddress]));

  // 1. Deploy AXM token if not exists (placeholder)
  const AXM = await hre.ethers.deployContract("AXMToken", [hre.ethers.parseUnits("1000000000", 18)]);
  await AXM.waitForDeployment();
  const axmTarget = await AXM.getAddress();

  // 2. Deploy contracts
  const FounderCommitment = await hre.ethers.deployContract("FounderCommitment", [founderHash]);
  await FounderCommitment.waitForDeployment();
  const founderCommitmentTarget = await FounderCommitment.getAddress();

  const ComputeBond = await hre.ethers.deployContract("ComputeBond", [axmTarget, deployer.address]);
  await ComputeBond.waitForDeployment();
  const computeBondTarget = await ComputeBond.getAddress();

  const FounderShareManager = await hre.ethers.deployContract("FounderShareManager", [founderCommitmentTarget, computeBondTarget]);
  await FounderShareManager.waitForDeployment();
  const founderShareManagerTarget = await FounderShareManager.getAddress();

  const CognitiveVerifier = await hre.ethers.deployContract("CognitiveFrictionVerifier");
  await CognitiveVerifier.waitForDeployment();
  const cognitiveVerifierTarget = await CognitiveVerifier.getAddress();

  const PulseAdapter = await hre.ethers.deployContract("PulseAdapter", [axmTarget]);
  await PulseAdapter.waitForDeployment();
  const pulseAdapterTarget = await PulseAdapter.getAddress();

  const ProveXWrapper = await hre.ethers.deployContract("ProveXVerifierWrapper", [cognitiveVerifierTarget]);
  await ProveXWrapper.waitForDeployment();
  const proveXWrapperTarget = await ProveXWrapper.getAddress();

  // 3. Wire them
  await FounderCommitment.initialize(deployer.address);
  await FounderShareManager.setPulseAdapter(pulseAdapterTarget);
  await FounderShareManager.setProveXWrapper(proveXWrapperTarget);

  console.log("✅ Deployed!");
  console.log("FounderShareManager:", founderShareManagerTarget);
  console.log("PulseAdapter:", pulseAdapterTarget);
  console.log("ProveXWrapper:", proveXWrapperTarget);

  const output = {
    network: hre.network.name,
    chainId: Number((await hre.ethers.provider.getNetwork()).chainId),
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    contracts: {
      AXMToken: axmTarget,
      FounderCommitment: founderCommitmentTarget,
      ComputeBond: computeBondTarget,
      FounderShareManager: founderShareManagerTarget,
      CognitiveFrictionVerifier: cognitiveVerifierTarget,
      PulseAdapter: pulseAdapterTarget,
      ProveXVerifierWrapper: proveXWrapperTarget
    }
  };

  const outPath = path.resolve("deployments", `${hre.network.name}-pulse.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

  console.log(`Saved deployment manifest: ${outPath}`);
}

main().catch(console.error);
