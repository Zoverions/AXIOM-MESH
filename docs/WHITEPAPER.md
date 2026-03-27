# AXIOM-MESH Whitepaper

## 1. Executive Summary

AXIOM-MESH is a multi-service agent runtime featuring a four-pillar structure for autonomous agent orchestration, secure sandbox execution, and deterministic governance. It combines cryptographic verification pathways (zkML + contract-level verification hooks) with explicit governance controls and deterministic accounting.

**Latest Features (March 2026):**
- **Universal Auto-Installer:** Zero-friction installation across Windows/macOS/Linux/Android-Termux with automatic dependency detection
- **Live USB/ISO Builder:** Bootable Ubuntu-based distribution that auto-installs on first boot
- **Custom Node GUIs:** Dedicated dashboard skins for Education, Validator, Storage, and Compute nodes
- **Sovereign Governance Guilds:** Hierarchical DAO structures with SSI-first identity
- **Causal Proof-of-Reasoning (CPoR):** Verifiable causal reasoning lineage and coalition safety
- **Transformer Foundation:** Multi-chain deployment with PulseChain integration and optimistic challenge windows

## 2. Architecture: The Four Pillars

AxiomMesh relies on a four-pillar runtime structure to ensure scalable, secure, and verifiable execution:
- **Gateway (TypeScript):** Handles ingress APIs, channels, and dashboard delivery including custom node-type-specific GUIs
- **Hypervisor (Python):** Manages orchestration, context engines, policy, routing logic, and CPoR attestation validation
- **Sandbox (TypeScript + Docker):** Provides isolated code execution for true sandbox isolation and network safety
- **Grid (Go):** Functions as the ledger and verification layer, ensuring governance-aligned coordination and causal DAG tracking

## 3. Enterprise-Grade zkML Infrastructure

Every high-stakes inference in AXIOM-MESH is verifiable on-chain, ensuring trustless execution and privacy-first agent meshes.
- **Hybrid Proving:** Utilizes EZKL, Halo2, and RISC Zero
- **NemoClaw Routing:** Integrated for enhanced isolation
- **On-chain Verification:** Handled via `ZKMLVerifier.sol`
- **Proof of Execution & Reliability (PoER):** Boosts rewards for valid zkML proofs
- **Causal Proof-of-Reasoning (CPoR):** Extends verification to include causal reasoning lineage, attention-weighted consensus scoring, and federated memory contribution attestation

## 4. Tokenomics & Treasury Mechanics (Implemented vs Policy)

The economic model is designed for long-term sustainability and deterministic accounting.

**Core Parameters:**
- **Token Symbol:** AXM
- **Target Total Supply:** 1,000,000,000 AXM (Fixed)
- **Implemented in code (`AXM.sol`):**
  - Founder allocation mint: **5%** (linear 4-year vesting via `TeamVesting.sol`)
  - Network treasury mint: **10%** (linear 4-year vesting via `TeamVesting.sol`)
  - Ecosystem reserve mint: **85%** (dynamically emitted based on network utilization)
- **Fee Distribution (`UniversalDistributionPool.sol`):**
  - Network Security Fund: **60%** of all execution fees
  - Wealth Generation Pool: **40%** allocated to performing nodes and delegators
- **Policy-governed (not fully operationally locked):**
  - Treasury inflow-class routing details
  - Release evidence packaging and control attestations
  - Targeted fee burning mechanisms (subject to bicameral governance proposals)

Token/economic flows are deterministic, traceable, and support full reconciliation between off-chain ledgers and on-chain state, covering protocol inflows, distribution outflows (payroll, incentives), staker reward flows, and cross-chain transfer-related fee flows.

**Deflationary Mechanics:**
- Slashed bonds from misbehaving nodes are seized
- Protocol reserves right to implement targeted fee burning via `ZoverionsDAO.sol` governance proposals

## 5. Ecosystem & Integration

AXIOM-MESH is deeply integrated with the broader ecosystem, ensuring robust interconnectivity and automation:

**PulseChain Integration:**
- Core infrastructure leverages PulseChain (chain IDs 369, 943) via `PulseAdapter` and `ProveXVerifierWrapper` contracts
- Uses PLS for execution gas, PulseX for native liquidity
- Pump.tires integration for permissionless skill capsule token launches
- ProveX for guarded P2P fiat-crypto settlements

**Multi-Chain Bridge:**
- Cross-chain bridge supporting Ethereum, Base, Arbitrum with oracle hooks
- PulseChain-only final redemption path for bridged assets
- 1-hour finality invariant with fail-closed mechanisms
- Bridge-path rating/polling/quorum oracle system

**Agentic Repository Management:**
- Repository managed by human and digital entities
- Agents capable of approving/denying changes via bicameral governance
- Automated CI/CD with Live ISO builds on every release

**Skill Capsules:**
- Physics research (gpd adapter with production-ready runtime)
- Mathematical computation (SymPy integration)
- Web search and information retrieval
- Code analysis, debugging, and generation
- Data analysis and visualization (pandas, sklearn, matplotlib)
- Cryptographic operations and security proofs
- Localized gamified education with psychology, NFT badges, and DAO capabilities

**Roadmap & Hardening:**
- Transparent tracking in `docs/MASTER-TODO.md`
- Central authority for roadmap execution, audit findings, and technical risk management
- Clear visibility into project trajectory for all ecosystem participants

## 6. Decentralized Storage as Core Network Infrastructure

Storage is a first-class network primitive in AXIOM-MESH, not an accessory service:

- **On-chain storage commitments:** `ComputeBond.offerStorage(...)` records stake-backed storage offers and `getStorageOffer(...)` returns persisted offer state
- **Decentralized data plane:** MeshStore/IPFS for CID-addressed persistence and recovery payload pinning
- **Multi-provider continuity backups:** Supports MeshStore/IPFS, AWS S3 (presigned URLs), Google Drive, and OneDrive
- **No placeholder storage returns:** All storage offer reads are persisted and queryable

## 7. Custom Node-Type-Specific GUIs

Each node type automatically receives a dedicated GUI skin served at `http://localhost:8080`:

**Education Nodes:**
- Interactive learning dashboard with student progress tracking
- Regional curriculum alignment metrics
- NFT badge display and gamification statistics
- Psychology-driven engagement analytics

**Validator Nodes:**
- Real-time validation metrics and consensus participation
- Slashing protection alerts
- Validator performance and uptime statistics
- Multi-chain validation status (PulseChain, Ethereum, Base, Arbitrum)

**Storage Nodes:**
- Capacity monitoring and utilization graphs
- Retrieval performance analytics
- IPFS/MeshStore pinning status
- Multi-provider backup health indicators

**Compute Nodes:**
- GPU utilization graphs and workload queue
- zkML proof generation status
- Hardware temperature and power metrics
- Proving task priority and estimated completion times

The GUI is automatically detected and served based on the node's configured role during installation.

## 8. Universal Installation System

**Zero-Friction Cross-Platform Installer:**
- **Windows:** Auto-installs Chocolatey → Docker Desktop → Make → Node.js v20 LTS → Python dependencies
- **macOS:** Auto-installs Homebrew → Docker Desktop → Make → Node.js v20 LTS → Python dependencies
- **Linux:** Auto-installs Docker Engine → Make → Node.js via apt-get/dnf
- **Android/Termux:** Minimal-edge mode with pkg package manager

**Live USB/ISO Builder:**
- Full Ubuntu 24.04 Desktop environment with pre-configured AXIOM-MESH
- Auto-detection of existing installations on internal drives
- Smart boot logic: runs automated installer only if no installation found
- Build command: `cd live-installer && ./build-axiom-live.sh`
- GitHub Actions workflow for automatic ISO builds on every release

## 9. Sovereign Governance Guild Framework

**Hierarchical DAO Structure:**
- Federal/Provincial/Municipal/Citizen guild templates
- Canonical parent-child policy inheritance
- SSI technical implementation with DID registry and consent receipts
- Citizen vault interface with ZK selective disclosure

**Governance Transition Mechanism:**
- Phase transitions: Founder control → Founders Council → Subcommittees → Nation State Guilds
- Implemented in `GovernanceTransition.sol` with comprehensive tests

**Specialized Governance Structures:**
- **Defense Fund (DoD):** Defensive technologies allocation to neutralize global threats
- **Scarcity-as-a-Service:** Opt-in extreme experience contracts with instant revocation
- **Ontario Health Guild:** Pilot migration demo with testnet evidence and fail-closed mechanisms

## 10. Trust, Control, Governance, and Security Principles

AXIOM-MESH adheres to strict principles to ensure the integrity of the network:
- **Least Privilege:** Privileged actions are authenticated, authorized, and auditable
- **Deterministic Interfaces:** Contracts, APIs, and schemas are strictly versioned
- **Recovery-First Reliability:** Every stateful subsystem implements replay/recovery drills
- **Evidence-Backed Promotion:** All release decisions require auditable gate evidence
- **Multi-Sig Governance:** Repository changes require 2+ reviewer approvals
- **Timelock Protection:** All smart contract upgrades governed by timelock + voting

**Security Posture:**
- Ingress hardening with Cloudflare WAF
- Strict sandbox isolation with deny-profile verification
- Inter-service authentication via mTLS/JWT
- Immutable WORM audit trails for all state changes
- Persistent nonce layers preventing replay attacks
- Formal verification of EAP quarantine+antibody flow logic
- Immunefi-style bug bounty program with tiered rewards

Governance utilizes layered artifacts, supporting explicit approval trails, emergency rollback mechanisms, and parameter change logging to ensure the network remains adaptable yet secure.

## 11. March 27, 2026 Implementation Addendum

The following hardening changes are now implemented in repository code:

**Installation & Deployment:**
- Universal auto-installer with platform detection (Windows/macOS/Linux/Android)
- Live USB/ISO builder with smart boot detection
- Custom node-type-specific GUI system
- GitHub Actions workflow for automated ISO builds

**Governance & Tokenomics:**
- Bicameral governance with skill staking implemented in Grid
- Tokenomics split lock: 5/10/85 mint allocation enforced in `AXM.sol`
- Governance transition mechanism from Founder to Nation State Guilds
- Defense Fund and Scarcity-as-a-Service contracts deployed

**Security Hardening:**
- mTLS certificates moved to secret management (env variable injection)
- Persistent nonce manager preventing replay attacks
- Timelock + governance voting for all UUPS proxy upgrades
- Multi-sig repository protection with CODEOWNERS enforcement
- WORM immutable audit trails for all logs and state changes

**Causal Proof-of-Reasoning:**
- CPoR attestation schema frozen with CI validation
- Grid causal DAG builder with bounded-depth controls
- Hypervisor `/verify/reasoning` endpoint in dry-run mode
- Attention-weighted consensus scoring integrated with slashing policy
- EMERGENCE_ALERT event generation for coalition anomaly signatures

**Multi-Chain Integration:**
- Transformer Foundation contracts deployed on PulseChain testnet (mock evidence bundle generated)
- Cross-chain bridge with oracle hooks for Ethereum/Base/Arbitrum
- PulseChain-only final redemption path with 1-hour finality invariant
- StigmergicStateChannel v4 with authorized challengers and dual-stake funding

**Audit Response:**
- All High/Critical static analysis findings resolved
- SlowAPI rate limiting on public routes
- OpenZeppelin guards (ReentrancyGuard, Pausable) added to contracts
- Inter-service authZ with mTLS/JWT implemented
- Finality-aware chain replay safety verified
- Chaos engineering baseline with RIKER hallucination probes
- STRIDE threat model documented per component

These implementation upgrades improve auditability and operational resilience, but AXIOM-MESH still does **not** claim full post-quantum, financial-grade finality at this time.
