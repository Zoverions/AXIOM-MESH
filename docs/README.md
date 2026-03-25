# AXIOM-MESH Documentation Hub (Canonical Index)

<img src="../logo.png" alt="Axiom Mesh Logo" width="150" align="right">

**Status Date:** 2026-03-23  
**Reality Statement:** AXIOM-MESH is currently in repository/staging hardening and is not live on testnet/mainnet.

This index consolidates documentation ownership, reduces overlap, and defines which documents are canonical for each domain.

---

## 1) Canonical Documents by Domain

## Foundations
- **Architecture:** `docs/ARCHITECTURE.md`
- **Technical Specification:** `docs/TECHNICAL-SPECIFICATION.md`
- **Interface Contracts:** `docs/INTERFACE-CONTROL-DOCUMENT.md`
- **Foundations Summary:** `docs/FOUNDATIONS.md`
- **Causal Proof-of-Reasoning blueprint:** `docs/CAUSAL-PROOF-OF-REASONING.md`

## Security & Reliability
- **Security posture and controls:** `docs/SECURITY-HARDENING.md`
- **Operational playbooks:** `docs/OPERATIONS.md`
- **Testing and quality gates:** `docs/TEST-STRATEGY.md`

## Governance & Economics
- **Governance model:** `docs/GOVERNANCE.md`
- **Control map:** `docs/GOVERNANCE-CONTROL-MAP.md`
- **Tokenomics (canonical):** `docs/TOKENOMICS.md`
- **Treasury split details:** `docs/TREASURY-SPLIT.md`
- **ERC20 compatibility:** `docs/ERC20-COMPATIBILITY.md`

## Execution Program
- **Master to-do queue (canonical):** `docs/MASTER-TODO.md`
- **Execution plan (reference):** `docs/PARALLEL-DELIVERY-PLAN-2026.md`
- **Task-level backlog (reference):** `docs/PRODUCTION-EXECUTION-BACKLOG.md`
- **Live readiness board (reference):** `docs/PRODUCTION-READINESS-TRACKER.md`
- **Current status snapshot:** `docs/PROJECT-STATUS-2026.md`
- **Strategic assessment response:** `docs/STRATEGIC-AUDIT-RESPONSE.md`

## 2) HOWTO Coverage

See `docs/HOWTO/README.md` for the full operational runbook index.

Minimum operational HOWTO set now includes:
- Local stack bring-up and health checks
- Intent submission and tracing
- Local contract compile/test/deploy loop
- Swarm join and zkML inference
- 2FA recovery, founder claims, policy update flow
- Release-gate evidence assembly and validation

---

## 3) Overlap Resolution Rules

1. If multiple docs discuss the same topic, prefer the canonical document listed above.
2. Strategy docs may coexist, but active execution is governed by `docs/MASTER-TODO.md` and supported by:
   - `docs/PARALLEL-DELIVERY-PLAN-2026.md`
   - `docs/PRODUCTION-EXECUTION-BACKLOG.md`
   - `docs/PRODUCTION-READINESS-TRACKER.md`
3. Launch messaging docs are draft-only until official testnet/mainnet deployment.
4. Any new document must declare its domain and link back to this index.

---

## 4) Documentation Quality Standard

Every production-impacting PR must update:
- affected technical/interface docs,
- relevant HOWTO/runbook,
- testing/validation evidence references.

A documentation change is incomplete if the corresponding HOWTO steps are not executable.
