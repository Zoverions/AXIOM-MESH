# AXIOM-MESH

<img src="logo.png" alt="Axiom Mesh Logo" width="150" align="right">

AXIOM-MESH is a multi-service agent runtime with four core pillars:
- **Gateway** (TypeScript/Node): ingress APIs, channels, dashboard delivery.
- **Hypervisor** (Python/FastAPI): orchestration, context engine, policy and routing logic.
- **Sandbox** (TypeScript/Node + Docker): isolated code execution.
- **Grid** (Go): ledger, verification, governance-aligned coordination.

> Status (2026-03-22): repository/staging hardening. Not declared live on mainnet. PulseChain Integration (PulseAdapter, ProveXVerifierWrapper) ready for testnet.

---

## Quick Start

### 1) Automated install (interactive)
```bash
./install.sh
```

### 2) Automated install (non-interactive / agent mode)
```bash
AUTO_INSTALL=1 \
MACHINE_ROLE=shared-machine \
MESHSTORE_QUOTA_GB=50 \
./install.sh
```

This installer now:
- detects hardware and writes `config/machine_profile.json`,
- runs blockchain launch preflight (`local-mesh` / `single-node` / `launch-testnet` / `launch-network`) and estimates required bootstrap funding,
- persists `.env` defaults for machine role, launch mode, profile path, and funding estimate,
- sets storage quota safely against available disk,
- can run fully unattended for digital-agent onboarding.

Use `docs/README.md` as the canonical documentation index.


## Lightweight Engagement Protocol

First-run setup now asks only a minimal secure set of user choices:
- machine role (`dedicated-mesh`, `shared-machine`, `minimal-edge`, `education-node`),
- launch mode (`local-mesh`, `single-node`, `launch-testnet`, `launch-network`),
- priority (`performance`, `security`, `cost`, `autonomy`).

If `launch-network` or `launch-testnet` is selected, preflight estimates bootstrap ETH required and surfaces whether wallet funding is needed before broadcast. If you skip funding, installer can fall back to local mesh mode.

---

## Runtime Resource-Aware Routing

The ResourceBalancer (Hypervisor) uses machine profile + live host pressure to decide `local`, `p2p`, or `grid` execution:
- shared machines bias away from local work when host pressure is high,
- dedicated mesh machines keep more execution local,
- critical or consensus tasks route to grid.

Primary implementation points:
- `hypervisor/src/graph/resource_balancer.py`
- `scripts/generate_machine_profile.py`
- `scripts/network_launch_preflight.py`
- `install.sh`

---

## Documentation (Consolidated)

Use `docs/README.md` as the canonical documentation index.

### Canonical execution queue
- **`docs/MASTER-TODO.md`** is the single queue for active agent work.
- Detailed task breakdowns live under `docs/subtasks/`.

### Execution references
- `docs/PARALLEL-DELIVERY-PLAN-2026.md`
- `docs/PRODUCTION-EXECUTION-BACKLOG.md`
- `docs/PRODUCTION-READINESS-TRACKER.md`

### Core references
- `docs/ARCHITECTURE.md`
- `docs/TECHNICAL-SPECIFICATION.md`
- `docs/INTERFACE-CONTROL-DOCUMENT.md`
- `docs/SECURITY-HARDENING.md`
- `docs/AUDIT_REPORT.md`

---

## Consolidation & Pruning Rules

To keep the repository organized and reduce list sprawl:
1. Add new actionable work to `docs/MASTER-TODO.md` only.
2. Keep detailed steps in linked subtask files, not parallel top-level lists.
3. Archive duplicate/legacy planning docs to `docs/historical/` after migration.
4. Keep service-level READMEs focused on implementation, not parallel strategy queues.

---

## Service Readmes

- `gateway/README.md`
- `hypervisor/README.md`
- `sandbox/README.md`
- `grid/README.md`

---

## Roadmap & Architecture

### Current Foundation
- Attention-Indexed State Machine (transformer proposer + symbolic verification + 2nd/3rd-order consequence awareness)

### Execution Model
- AICP tensor routing (off-chain)
- Optimistic Stigmergic State Channels (challengeable settlement windows)
- PulseChain PoER final settlement

### Multi-Chain Strategy
- Simultaneous deployment on Ethereum, Base, and Arbitrum
- Dynamic rating/polling/quorum-sensing for bridge-path selection
- Final token redemption/claim on PulseChain

### Multi-Chain
- Simultaneous deployment + dynamic bridge selection; final claims on PulseChain.

### Gas Target
- 99.9% of operations at $0.00 through off-chain cognition and optimistic channels

### Top-Level To Do
- Transformer Foundation (this package) – IN PROGRESS
- Axiom Vault Network
- Axiom Symbiosis Engine + Monetization Layer
- Multi-Chain Bridging & Rating System
- Consequence Forecasting Module (2nd/3rd-order awareness)
- Mainnet Genesis + Bug Bounty
- Full Security Audit
- **NEW**: Comprehensive Education Skill Capsules (Knowledge Bookcase)
- **NEW**: Native Stablecoin Payroll Integrations
- **NEW**: Credentialed Submission Structures (Governance)
- **NEW**: Information Dashboards & Data Pipelines

### Sub-Tasks for Monetization, Funding Campaign, & Vaults
- Implement `SymbiosisEngine.sol` with built-in fee routing
- Implement `VaultManager.sol` for NFT-keyed secure vaults
- Implement `DonationCampaign.sol`
- Add HorizonForecast integration for fee eligibility
- Wire fee logic into StigmergicStateChannel, SkillCapsuleLauncher, and UniversalDistributionPool
- Update deployment_manifest.json with fee schedule and vault features
- Test monetization flows on PulseChain testnet (symbiosis bundles with UBI + liquidity)
- Launch automated marketing agents for funding + vaults

### Transformer Foundation Sub-Tasks
- Create `docs/whitepaper-attention-blockchains.md` with locked v1.0 semantics.
- Implement StigmergicStateChannel v4 + transformer wiring.
- Add Consequence Forecasting module to transformer proposer.
- Wire `MODEL_RUN` outcomes into Cognitive Friction + PoER validation.
- Run toy MDP simulation and attach phase plots.
- Deploy full testnet via `scripts/deploy-full-testnet.js`.
- Update service READMEs with transformer-foundation roadmap.

### Multi-Chain Sub-Tasks
- Deploy core contracts simultaneously on Ethereum/Base/Arbitrum.
- Implement bridge contracts + PulseX/1inch aggregator hooks.
- Build rating/polling oracle for bridge selection.
- Enforce PulseChain-only final redemption/claim destination.
- Extend deployment scripts/manifests for multi-chain pathing.
