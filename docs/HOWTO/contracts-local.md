# HOWTO: Compile, Test, and Deploy Contracts Locally

## Prerequisites
- Node.js and npm installed
- Local chain target available (for deploy step)

## 1) Compile contracts
```bash
make contracts-compile
```

## 2) Run contract tests
```bash
make contracts-test
```

## 3) Deploy to local target
```bash
make contracts-deploy
```

## 4) Verify artifacts
After deploy, capture:
- deployed addresses
- tx hashes
- commit SHA

Record these in deployment evidence and update `docs/MAINNET_ADDRESSES.md` only for verified live networks.
