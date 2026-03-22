const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  // 1. Deploy AXM token if not exists (placeholder)
  const AXM = await hre.ethers.deployContract("AXMToken"); // your ERC20
  await AXM.waitForDeployment();

  // 2. Deploy contracts
  // Note: FounderShareManager requires _founder and _treasury
  // Deploying stubs for those if needed, or assuming already exists.
  // For script we'll just deploy the new ones and wire them
  const FounderCommitment = await hre.ethers.deployContract("FounderCommitment");
  await FounderCommitment.waitForDeployment();

  const ComputeBond = await hre.ethers.deployContract("ComputeBond", [AXM.target, deployer.address]);
  await ComputeBond.waitForDeployment();

  const FounderShareManager = await hre.ethers.deployContract("FounderShareManager", [FounderCommitment.target, ComputeBond.target]);
  await FounderShareManager.waitForDeployment();

  const CognitiveVerifier = await hre.ethers.deployContract("CognitiveFrictionVerifier");
  await CognitiveVerifier.waitForDeployment();

  const PulseAdapter = await hre.ethers.deployContract("PulseAdapter", [AXM.target]);
  await PulseAdapter.waitForDeployment();

  const ProveXWrapper = await hre.ethers.deployContract("ProveXVerifierWrapper", [CognitiveVerifier.target]);
  await ProveXWrapper.waitForDeployment();

  // 3. Wire them
  await FounderShareManager.setPulseAdapter(PulseAdapter.target);
  await FounderShareManager.setProveXWrapper(ProveXWrapper.target);

  console.log("✅ Deployed!");
  console.log("FounderShareManager:", FounderShareManager.target);
  console.log("PulseAdapter:", PulseAdapter.target);
  console.log("ProveXWrapper:", ProveXWrapper.target);
}

main().catch(console.error);
