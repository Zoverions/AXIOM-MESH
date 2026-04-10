# AXIOM-MESH Roadmap (Canonical)

**Document role:** Canonical strategic roadmap.
**Last updated:** 2026-03-30.
**Scope:** Strategic phases and milestone outcomes. For day-to-day task execution, use `docs/MASTER-TODO.md`.

---

## 1) Roadmap Usage Rules

1. This file defines **strategic direction and milestone outcomes**.
2. `docs/MASTER-TODO.md` defines **active executable tasks**.
3. If conflicts exist, execute according to `docs/MASTER-TODO.md` and update this roadmap on next planning pass.

---

## 2) Strategic Phases

### Phase 1: Deep Hardening (COMPLETE — April 10, 2026)
- [x] Genesis Decay Governance v2 deployed (exponential thermodynamic decay)
- [x] Sovereign Execution Queue live on-chain (ProposalRegistry)
- [x] MASTER-TODO.md and Founder Multi-Sig fully abolished
- [x] Network now governed by math and thermodynamics from Genesis block 0
→ Constitutional maturation achieved. The Mesh belongs to the Mesh.

## Phase B — Governance & Economic Integrity (In Progress)

**Outcome target:** Controlled, auditable protocol/economic change management.

Focus areas:
- Governance decision-right clarity and control map alignment.
- Tokenomics parameter governance and evidence trails.
- Upgrade-path safeguards (timelock/proposal controls).

Exit signals:
- Parameter provenance and approval trails complete.
- Governance-critical changes demonstrably fail closed.

## Phase C — Multi-Chain and Settlement Resilience (In Progress)

**Outcome target:** Robust cross-chain behavior with explicit finality and redemption safety.

Focus areas:
- Bridge-path invariants and finality-aware flows.
- Deployment evidence quality and reproducibility.
- Incident runbooks for chain/RPC degradation.

Exit signals:
- Verified cross-chain runbooks and replay safety checks.
- Repeatable deployment evidence artifacts for supported networks.

### XION Integration Steps (4-Week Plan)

**Environment Setup (Week 1)**
- Install xiond daemon + CosmWasm toolchain (official guide: docs.burnt.com/xion/developers/computation/local-development).
- Run local XION testnet node.

**Port Core Contracts (Week 1–2)**
- Translate GenesisDecayGovernance.sol + ProposalRegistry.sol into CosmWasm (Rust) smart contracts.
- Use XION’s native ZK Module if you want to add zero-knowledge verification later.

**Hypervisor Adapter (Week 2–3)**
- Add XION ChainAdapter in hypervisor/src/blockchain/ (similar to your existing PulseChain adapter).
- Wire SovereignExecutionQueue to poll XION’s ProposalRegistry via xiond or the JS/Go SDK.

**Cross-Chain + Testnet Launch (Week 3–4)**
- Leverage XION’s Package Forwarding Middleware + IBC for native PulseChain ↔ XION flows.
- Deploy a parallel Grid instance on XION testnet.
- Run end-to-end capability execution (Gateway → Hypervisor → XION Sandbox).
- Publish evidence bundle + update CONSTITUTION.md.

## Phase D — Sovereign Service/Guild Expansion (Design→Pilot)

**Outcome target:** Deployable governance guild and public-service capsule patterns.

Focus areas:
- Template governance structures.
- Consent/identity and policy encoding flows.
- Pilot integrations with strict fail-closed controls.

Exit signals:
- Pilot evidence bundles with revocation/recovery tests.
- Governance transition rules documented and exercised.

## Phase E — Mainnet Promotion Readiness (Open)

**Outcome target:** Promotion gate based on measurable evidence, not narrative claims.

Focus areas:
- Security and reliability gate closure.
- Financial/economic reconciliation confidence.
- Release governance sign-off.
- Documentation parity and operator readiness.

Exit signals:
- Complete gate dossier and approval logs.
- No unresolved blocker in canonical execution queue.

---

## 3) Milestone Anchors

The following milestone anchors should remain synchronized with `docs/MASTER-TODO.md` lanes:

- **M6/M8:** Transformer foundation and cross-chain integration closure.
- **M9:** Mainnet hardening and governance safeguards.
- **M10:** Sovereign governance guild framework delivery.
- **M11:** Causal proof-of-reasoning architecture maturity.

---

## 4) Non-Canonical Historical Plans

Historical plans are retained for traceability only and do not override this roadmap:
- None. Legacy roadmap artifacts were consolidated into this file and `docs/MASTER-TODO.md`.

---

## 5) Canonical Cross-References

- Architecture: `docs/ARCHITECTURE.md`
- Governance: `docs/GOVERNANCE.md`
- Operations: `docs/OPERATIONS.md`
- Execution queue: `docs/MASTER-TODO.md`
