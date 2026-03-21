# AXIOM-MESH Foundations (Canonical Summary)

This document is the foundation-level orientation for how AXIOM-MESH is designed and what must be true before testnet launch.

## 1) System Pillars

AXIOM-MESH is organized into four runtime pillars and supporting contracts/tooling:
- **Gateway (TypeScript):** ingress, auth, routing, channel adapters.
- **Hypervisor (Python):** orchestration, context synthesis, policy decisions, agent loops.
- **Sandbox (TypeScript + Docker):** constrained execution and runtime isolation.
- **Grid (Go):** ledger/state movement, p2p synchronization, chain integrations.

## 2) Trust and Control Principles

- **Least privilege:** privileged actions must be authenticated, authorized, and auditable.
- **Deterministic interfaces:** contracts/APIs/schemas must be versioned and compatibility-checked.
- **Recovery-first reliability:** every stateful subsystem must have replay/recovery drills.
- **Evidence-backed promotion:** release decisions require auditable gate evidence.

## 3) Governance Foundation

AXIOM-MESH uses layered governance artifacts:
- `docs/GOVERNANCE.md` for policy and voting model.
- `docs/GOVERNANCE-CONTROL-MAP.md` for control ownership and decision points.

Before launch, governance-critical operations must support:
- explicit approval trails,
- emergency rollback mechanisms,
- parameter change logging.

## 4) Security Foundation

Security posture depends on coordinated controls across all pillars:
- ingress hardening and abuse controls,
- sandbox isolation and execution constraints,
- inter-service authentication controls,
- immutable/replayable audit trails.

See `docs/SECURITY-HARDENING.md` and `docs/OPERATIONS.md` for execution details.

## 5) Economic Foundation

Tokenomics and treasury controls are defined across:
- `docs/TOKENOMICS.md` (canonical economics summary),
- `docs/TREASURY-SPLIT.md` (allocation mechanics),
- `docs/ERC20-COMPATIBILITY.md` (token flow constraints).

Before launch, economics must meet:
- reconciliation accuracy thresholds,
- governance-controlled parameter updates,
- transparent distribution logic and audit evidence.

## 6) Launch Reality Constraint

As of March 21, 2026, AXIOM-MESH is in pre-launch hardening.  
No document should imply live testnet/mainnet status unless backed by verified deployment artifacts.
