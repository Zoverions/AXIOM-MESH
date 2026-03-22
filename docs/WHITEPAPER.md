# AXIOM-MESH Whitepaper

## 1. Executive Summary

AXIOM-MESH is a multi-service agent runtime featuring a unique architectural approach that integrates a four-pillar structure for autonomous agent orchestration, secure sandbox execution, and deterministic governance. It establishes a novel paradigm by combining decaying founder control with Zero-Knowledge Machine Learning (zkML) as a self-regulating bootstrap primitive, scaling back securely to 0% reliance by 10k nodes.

## 2. Architecture: The Four Pillars

AxiomMesh relies on a four-pillar runtime structure to ensure scalable, secure, and verifiable execution:
- **Gateway (TypeScript):** Handles ingress APIs, channels, and dashboard delivery.
- **Hypervisor (Python):** Manages orchestration, context engines, policy, and routing logic.
- **Sandbox (TypeScript + Docker):** Provides isolated code execution for true sandbox isolation and network safety.
- **Grid (Go):** Functions as the ledger and verification layer, ensuring governance-aligned coordination.

## 3. Enterprise-Grade zkML Infrastructure

Every high-stakes inference in AXIOM-MESH is verifiable on-chain, ensuring trustless execution and privacy-first agent meshes.
- **Hybrid Proving:** Utilizes EZKL, Halo2, and RISC Zero.
- **NemoClaw Routing:** Integrated for enhanced isolation.
- **On-chain Verification:** Handled via `ZKMLVerifier.sol`.
- **Proof of Execution & Reliability (PoER):** Boosts rewards for valid zkML proofs.

## 4. Tokenomics & Treasury Mechanics

The economic model is designed for long-term sustainability and deterministic accounting.

**Core Parameters:**
- **Token Symbol:** AXM
- **Target Total Supply:** 1,000,000,000 AXM
- **Founder Allocation:** Permanently set to 5% with claims up to 5% dynamic resources (superseding decaying models as per recent genesis locking constraints).
- **Network Treasury:** 10% on defined inflow classes as specified by governance.

Token/economic flows are deterministic, traceable, and support full reconciliation between off-chain ledgers and on-chain state, covering protocol inflows, distribution outflows (payroll, incentives), staker reward flows, and cross-chain transfer-related fee flows.

## 5. Ecosystem & Integration

AXIOM-MESH is deeply integrated with the broader ecosystem, ensuring robust interconnectivity and automation:
- **PulseChain Integration:** Core infrastructure leverages PulseChain (chain IDs 369, 943) via the `PulseAdapter` and `ProveXVerifierWrapper` contracts. This integration utilizes PLS for execution gas, PulseX for native liquidity, Pump.tires for permissionless skill capsule token launches, and ProveX for guarded P2P fiat-crypto settlements.
- **Agentic Repository Management:** The repository itself is designed to be managed by human and digital entities. Agents and the mesh are capable of managing the repository, including approving and denying changes, streamlining the continuous integration and delivery processes.
- **Roadmap & Hardening:** The roadmap for what is to be built and hardened is transparently tracked in `docs/plan.md`. This canonical document serves as the central authority for roadmap execution, audit findings, and technical risk management, ensuring all ecosystem participants have clear visibility into the project's trajectory.

## 6. Trust, Control, Governance, and Security Principles

AXIOM-MESH adheres to strict principles to ensure the integrity of the network:
- **Least Privilege:** Privileged actions are authenticated, authorized, and auditable.
- **Deterministic Interfaces:** Contracts, APIs, and schemas are strictly versioned.
- **Recovery-First Reliability:** Every stateful subsystem implements replay/recovery drills.
- **Evidence-Backed Promotion:** All release decisions require auditable gate evidence.

Governance utilizes layered artifacts, supporting explicit approval trails, emergency rollback mechanisms, and parameter change logging to ensure the network remains adaptable yet secure. Security posture spans from ingress hardening to strict sandbox isolation, inter-service authentication (mTLS), and immutable audit trails.
