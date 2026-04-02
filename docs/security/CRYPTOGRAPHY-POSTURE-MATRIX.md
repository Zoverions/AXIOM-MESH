# AXIOM-MESH Cryptography Posture Matrix

**Version:** 2026-03-24
**Purpose:** Maps cryptographic claims to implementation reality across the repository, separating implemented primitives from planned or experimental post-quantum features.

## 1) Overview

AXIOM-MESH currently relies on strong, industry-standard classical cryptography for all core operations, including identity, signatures, and hashing. Post-quantum cryptography (PQC) is planned for future phases via a hybrid migration strategy but is not currently active in production paths.

| Posture | Definition |
| :--- | :--- |
| **Implemented** | Active in production code paths today. |
| **Planned** | Approved for future implementation (e.g., hybrid PQC). |
| **Experimental** | Under research or available in test/mock branches only. |

---

## 2) Cryptography Posture Matrix

| Component / Function | Primitive / Algorithm | Posture | Code Reference(s) | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Mesh Identity & Signatures** | ECDSA (secp256k1) | **Implemented** | `grid/contracts/contracts/` (Solidity), `sandbox/src/broker/Broker.ts` | Standard Ethereum-compatible signing for transactions and agent orchestration. |
| **Data Hashing & Commitments** | SHA-256 / Keccak256 | **Implemented** | `grid/p2p/node.go`, `hypervisor/src/api/server.py`, `grid/contracts/` | Used for state commitments, payload hashing, and smart contract state. |
| **API Authentication (Gateway)** | HMAC-SHA256, JWT (RSA/ECDSA) | **Implemented** | `gateway/src/security/`, `hypervisor/src/api/` | Secures ingress routing and inter-service authentication. |
| **Inter-Service Encryption** | TLS 1.2+ / mTLS | **Implemented** | `certs/`, `install.sh` | Secures transport between Gateway, Hypervisor, and Grid. |
| **Universal Consent Protocol (UCP)** | Hybrid Post-Quantum Signatures | **Planned** | `docs/ARCHITECTURE.md` | Planned to combine classical (ECDSA/Ed25519) with PQC (e.g., CRYSTALS-Dilithium). |
| **ZKML / ZK-Proofs** | PLONK / Groth16 (via external provers) | **Planned / Experimental** | `hypervisor/src/engine/inference_orchestrator.py` | Orchestration logic exists, but underlying cryptographic proof generation relies on external or placeholder logic. |
| **Post-Quantum Key Exchange** | Kyber (ML-KEM) | **Planned** | `docs/SECURITY-REALITY-2026.md` | Planned for future P2P and Gateway transport hardening. |
| **Agent Skill Attestations**   | ECDSA (secp256k1) / HMAC     | **Implemented** | `hypervisor/src/decision/verifiers/`               | Classical verification of agent module execution boundaries. |

---

## 3) Post-Quantum Migration Strategy

As defined in `docs/AUDIT_REPORT.md` and `docs/SECURITY-REALITY-2026.md`, our public and internal posture regarding quantum readiness is:

1. **Current State:** We use strong, efficient, industry-standard classical primitives.
2. **Transition State (Planned):** We are designing a staged migration to hybrid signatures (classical + PQ).
3. **End State:** We will not claim full quantum-safe operation until signatures, key exchange, verification tooling, and operational key lifecycle are all migrated and audited.

---

## 4) Document Verification

This document is bound to the CI pipeline via `make verify-crypto-matrix` to assert its structural integrity and ensure no required control areas are dropped.
