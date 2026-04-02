# RADM: Requirements, Architecture, Design, Methodology

## 1. Requirements

### Functional Requirements
*   **Intent Resolution:** The system must accept high-level user intents and deterministically map them to execution plans.
*   **Isolated Execution:** Code and digital entity actions must run in securely isolated sandboxes (Docker/WASM) with strict capability bounds (memory, CPU, network).
*   **Verifiable Operations:** All material outcomes must be cryptographically provable via zkML or classical proofs before state mutation.
*   **Governance:** The network must support parameter and upgrade management via bicameral DAO structures, avoiding unilateral control.
*   **Settlement:** Financial and state settlements must occur on-chain (PulseChain primary, Ethereum/Base secondary) or via Layer 2 optimistic state channels.

### Non-Functional Requirements
*   **Security (Fail-Closed):** Any fault in policy evaluation, attestation, or execution must halt the operation rather than proceeding in an unknown state.
*   **Performance:** Must support rapid localized execution (Sandbox) while maintaining eventual consistency across the P2P Grid.
*   **Decentralization:** No single point of failure; relies on mTLS-secured P2P communication and multi-sig/timelocked smart contracts.
*   **Replayability:** The ledger must provide a WORM (Write Once, Read Many) history that allows deterministic replay of the network state.

## 2. Architecture

AXIOM-MESH utilizes a **Four-Pillar Service Architecture** connected to an **On-Chain Governance & Settlement Layer**:

1.  **Gateway:** Edge ingress. Handles rate limiting (SlowAPI), request shaping, JWT auth, and dashboard delivery.
2.  **Hypervisor:** The coordination brain. Evaluates intents against policy, constructs Causal DAGs (Proof-of-Reasoning), and delegates execution.
3.  **Sandbox:** The execution muscle. Runs untrusted code or LLM agents in tight WASM/Docker bounds. Emits signed capability manifests.
4.  **Grid:** The P2P ledger. Handles attestations, consensus via Proof of Entropy Reduction (PoER), and synchronizes state with the blockchain.
5.  **Smart Contracts:** Settlement layer deployed on PulseChain. Manages tokens (AXM), staking (ComputeBond), voting (ZoverionsDAO), and liquidity.

**Trust Boundaries:**
*   `Public -> Gateway`: Zero trust, strict WAF.
*   `Gateway -> Hypervisor`: mTLS authenticated.
*   `Hypervisor -> Sandbox`: Least privilege via manifests.
*   `Grid -> Blockchain`: Cryptographic proof verification.

## 3. Design

### Data Structures & State Management
*   **Capability Manifests:** JSON/Cap'n Proto structures defining strict bounds for any Sandbox execution.
*   **Causal DAG:** A directed acyclic graph linking intents to plans to execution results, forming the basis of Causal Proof-of-Reasoning (CPoR).
*   **State Channels:** Optimistic L2 channels (`StigmergicStateChannel.sol`) for high-throughput entity-to-entity transactions, settling to L1.

### Modules & Interfaces
*   **NemoClaw:** The routing interface within the Hypervisor that selects the appropriate Sandbox based on hardware availability and trust score.
*   **AutomatedV3LiquidityManager:** Smart contract module handling dynamic liquidity provisioning to DEXes based on protocol revenue.
*   **WeightOracle:** A smart contract integrating off-chain truth/reputation scores into on-chain voting power.

## 4. Methodology

### Development & Testing
*   **Test-Driven:** All core components must maintain high coverage (>80%). Python components use `pytest`; Go components use `go test`; Contracts use Hardhat/Foundry.
*   **Mock Elimination:** No production paths may rely on placeholder or mock execution (audited and enforced in March 2026).
*   **Continuous Integration:** PRs trigger automated tests, contract compilation checks, and security scans (Mythril/Slither).

### Deployment
*   **Infrastructure as Code:** Local deployments use `docker-compose`. Production targets Kubernetes.
*   **Cross-Platform Installers:** `install.sh`/`install.bat` provide zero-friction bootstrap across all major OSes.
*   **Contract Upgrades:** Managed strictly via UUPS proxies protected by `TimelockedOwnable` to prevent sudden rug-pulls.

### Governance & Change Management
*   **Codebase:** Requires 2+ approvals via `.github/CODEOWNERS`.
*   **Protocol Parameters:** Changed only via on-chain `ZoverionsDAO` proposals.
*   **Operational Readiness:** Driven by `docs/MASTER-TODO.md` and explicit gate-evidence checklists before testnet/mainnet promotion.