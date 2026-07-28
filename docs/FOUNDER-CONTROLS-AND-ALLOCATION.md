# Founder Controls and Allocation

This document explains the hardcoded security and tokenomics implemented in the Genesis contract structure for AxiomMesh.

## Overview
The launch layer ensures that anyone can deploy and fund the network genesis contract, but the initial control and resource allocation is mathematically cryptographically locked to the designated Founder address (`0x1c2cbabf75e1938ed2f2c59e734e83aa5fbe1b73`).

### Tokenomics (AXM)
- **Total Supply**: 1,000,000,000 AXM
- **Founder Allocation**: 5% of the total supply is minted immediately to the FounderEntity upon deployment.

### FounderEntity Controls
The `FounderEntity` contract serves as the root of control for the Founder.
- **Resource Limits**: The Founder can dynamically claim up to 5% of network resources (`claimResources`).
- **Network Treasury**: A `NetworkTreasury` is deployed and serves as the primary multi-sig or governance pool.
- **Guilds**: A `GuildTreasuryFactory` is created to easily allow deployment of new internal groups or sub-DAOs.

### Security
By hardcoding the founder address into the `Genesis` contract itself, there are no uninitialized proxy variables to exploit. When a community member (or any public address) deploys `Genesis.sol`, the constructor forces the token generation and authorization to belong exclusively to the hardcoded `FOUNDER`. No one else gets control.

This makes the genesis phase immune to front-running deployment hijacking.