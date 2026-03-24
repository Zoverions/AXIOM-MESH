require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.28",
        settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true }
      },
      {
        version: "0.8.24",
        settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true }
      }
    ]
  },
  paths: {
    sources: "grid/contracts/contracts",
    tests: "grid/contracts/test",
    cache: "grid/contracts/cache",
    artifacts: "grid/contracts/artifacts"
  }
};
