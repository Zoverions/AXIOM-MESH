# HOWTO: Deploy Transformer Foundation to PulseChain Testnet

## Purpose
Deploy the transformer foundation package to PulseChain testnet (`chainId=943`) and generate a verifiable evidence bundle.

## Prerequisites
- Funded deployer private key exported as `PRIVATE_KEY`
- PulseChain testnet RPC exported as `PULSECHAIN_TESTNET_RPC_URL` (default: `https://rpc.v4.testnet.pulsechain.com`)
- Node dependencies available in `grid/contracts`

## 1) Deploy contracts and generate evidence bundle
```bash
make deploy-transformer-pulsechain-testnet \
  PRIVATE_KEY=0x... \
  PULSECHAIN_TESTNET_RPC_URL=https://rpc.v4.testnet.pulsechain.com
```

This runs `scripts/deploy-full-testnet.js` against `pulsechainTestnet` and writes:

- `evidence/deployments/PULSECHAIN-TESTNET-<timestamp>/transformer-foundation-deployment.json`

Bundle includes:
- commit SHA
- network metadata (name, chainId, RPC URL)
- deployer address
- deployed contract addresses + tx hashes + block numbers

## 2) Verify the deployment evidence bundle
```bash
make verify-transformer-deployment \
  BUNDLE_PATH=evidence/deployments/PULSECHAIN-TESTNET-<timestamp>/transformer-foundation-deployment.json
```

This validates required fields and performs on-chain code checks (`eth_getCode`) for all deployed contracts.

## 3) Publish evidence
- Commit the generated bundle under `evidence/deployments/`.
- Reference the bundle path and commit SHA in release notes / gate reviews.
- Keep `docs/MAINNET_ADDRESSES.md` unchanged until mainnet deployment is verified.

## Notes
- `StigmergicStateChannel` remains intentionally excluded from this generic script because it requires external dependency addresses (`FounderShareManager`, `UniversalDistributionPool`) managed by governance/release pipelines.
