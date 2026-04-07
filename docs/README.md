# AXIOM-MESH Documentation Hub (Canonical Index)

<img src="../logo.png" alt="Axiom Mesh Logo" width="150" align="right">

**Status Date:** 2026-03-27  
**Reality Statement:** AXIOM-MESH is currently in repository/staging hardening and is not live on testnet/mainnet.

This index consolidates documentation ownership, reduces overlap, and defines which documents are canonical for each domain.

---

## Pillar Model (Canonical Clarification)
- **Runtime Pillars (4):** Gateway, Hypervisor, Sandbox, Grid.
- **Sovereignty Capability Pillars (8):** program-level autonomy/economic pillars listed in `docs/MASTER-INTEGRATION.md`.

Use runtime pillars for architecture/execution docs and 8-pillar framing for sovereignty roadmap and capability communications.

---

## 🚀 New Users Start Here

### Quick Installation
- **📖 Comprehensive Installation Guide:** [`docs/INSTALLATION-GUIDE.md`](INSTALLATION-GUIDE.md) — Step-by-step installation with auto-detected platform support
- **💿 Live USB/ISO Builder:** [`live-installer/README.md`](../live-installer/README.md) — Create bootable AXIOM-MESH USB drives
- **🎨 Custom Node GUIs:** Each node type gets a dedicated dashboard at `http://localhost:8080`

### One-Command Install
```bash
# Windows
.\install.bat

# macOS/Linux
./install.sh
```

The installer automatically detects your platform and installs all dependencies (Docker, Node.js, Python packages, etc.).

---

## 1) Canonical Documents by Domain

## Foundations
- **Architecture:** `docs/architecture/ARCHITECTURE.md`
- **Technical Specification:** `docs/TECHNICAL-SPECIFICATION.md`
- **Interface Contracts:** `docs/architecture/INTERFACE-CONTROL-DOCUMENT.md`
- **Foundations Summary:** `docs/architecture/FOUNDATIONS.md`
- **Causal Proof-of-Reasoning blueprint:** `docs/whitepapers_and_research/CAUSAL-PROOF-OF-REASONING.md`
- **RADM (Requirements, Architecture, Design, Methodology):** `docs/whitepapers_and_research/RADM.md`

## Security & Reliability
- **Security posture and controls:** `docs/security/SECURITY-HARDENING.md`
- **Operational playbooks:** `docs/operations/OPERATIONS.md`
- **Testing and quality gates:** `docs/developer_guides/TEST-STRATEGY.md`
- **Cryptography posture matrix:** `docs/security/CRYPTOGRAPHY-POSTURE-MATRIX.md`
- **Threat models:** `docs/security/COORDINATED-BEHAVIOR-THREAT-MODEL.md`

## Governance & Economics
- **Governance model:** `docs/governance/GOVERNANCE.md`
- **Control map:** `docs/governance/GOVERNANCE-CONTROL-MAP.md`
- **Tokenomics (canonical):** `docs/tokenomics/TOKENOMICS.md`
- **Treasury split details:** `docs/tokenomics/TREASURY-SPLIT.md`
- **ERC20 compatibility:** `docs/tokenomics/ERC20-COMPATIBILITY.md`
- **Financial controls evidence:** `docs/tokenomics/FINANCIAL-CONTROLS-EVIDENCE.md`

## Execution Program
- **Master to-do queue (canonical):** `docs/MASTER-TODO.md`
- **Canonical roadmap:** `docs/ROADMAP.md`
- **Execution plan (supporting reference):** `docs/PARALLEL-DELIVERY-PLAN-2026.md`
- **Task-level backlog (supporting reference):** `docs/PRODUCTION-EXECUTION-BACKLOG.md`
- **Live readiness board (supporting reference):** `docs/PRODUCTION-READINESS-TRACKER.md`
- **Current status snapshot:** `docs/PROJECT-STATUS-2026.md`
- **Strategic assessment response:** `docs/STRATEGIC-AUDIT-RESPONSE.md`

## Deployment & Operations
- **Deployment cost analysis:** `docs/tokenomics/DEPLOYMENT_COST_ANALYSIS.md`
- **Hardware profile matrix:** `docs/operations/HARDWARE-PROFILE-MATRIX.md`
- **Resource balancer policy:** `docs/operations/RESOURCE-BALANCER-POLICY.md`
- **Network efficiency strategy backlog:** `docs/subtasks/NETWORK-EFFICIENCY-NOVEL-STRATEGIES.md`
- **Mainnet contract addresses:** `docs/MAINNET_ADDRESSES.md`
- **Skill capsule specification:** `docs/SKILL-CAPSULE-SPEC.md`
- **SSI technical implementation:** `docs/whitepapers_and_research/SSI-TECHNICAL-IMPLEMENTATION.md`

## Audit Reports
See `docs/audits/` directory for comprehensive security audits:
- **External audit report:** `docs/audits/AUDIT_REPORT_EXTERNAL.md`
- **Smart contract audit:** `docs/audits/smart-contract-audit-report.md`
- **Transformer Foundation review:** `docs/audits/transformer-foundation-security-review.md`
- **State channel deep dive:** `docs/audits/stigmergic-state-channel-v4-deep-dive.md`
- **Remediation plan:** `docs/audits/remediation-plan.md`

## Assessments & Integration Plans
See `docs/assessments/` for non-audit strategic assessments and integration planning:
- **Ontario education capsule integration plan:** `docs/assessments/ONTARIO_EDUCATION_CAPSULE_INTEGRATION_PLAN.md`
- **Repository automation + vetting + dashboard plan:** `docs/assessments/REPOSITORY_AUTOMATION_VETTING_AND_DASHBOARD_PLAN.md`

---

## 2) HOWTO Coverage

See `docs/HOWTO/README.md` for the full operational runbook index.

**New Users Start Here:** [`docs/INSTALLATION-GUIDE.md`](INSTALLATION-GUIDE.md) — comprehensive step-by-step installation instructions.

Minimum operational HOWTO set now includes:
- Local stack bring-up and health checks
- Intent submission and tracing
- Local contract compile/test/deploy loop
- Swarm join and zkML inference
- 2FA recovery, founder claims, policy update flow
- Release-gate evidence assembly and validation
- Secret management and rotation
- Emergency bridge procedures

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


## 5) Continuous Documentation Assurance
- **Documentation coverage assessment (2026-04-07):** `docs/assessments/DOCS-COVERAGE-ASSESSMENT-2026-04-07.md`
- Every operator-facing feature must have a linked HOWTO from `docs/HOWTO/index.md`.
- Execution status remains canonical in `docs/MASTER-TODO.md` with pending tasks listed first.
