# EU GDPR Compliance Models for AXIOM-MESH

Date: 2026-03-25

## Purpose

Compare practical GDPR operating models and map each to AXIOM-MESH governance + SSI architecture decisions.

## Model 1: Centralized Controller Model (Traditional SaaS)

### Characteristics
- A single organization acts as primary controller.
- Processors are contractually bound via DPAs.
- Data residency and retention managed centrally.

### Pros
- Clear accountability chain.
- Easier one-stop authority engagement.
- Mature tooling and legal precedent.

### Cons (for AXIOM goals)
- Weak citizen sovereignty; platform can become de facto data custodian.
- Higher breach blast radius due to centralized storage.
- Less aligned with decentralized guild governance.

### Fit for AXIOM
Useful for bootstrap/internal operations only (e.g., managed pilot), but not ideal as terminal architecture for user-controlled data.

---

## Model 2: Federated Joint-Controller Model (Public Sector/Consortium)

### Characteristics
- Multiple entities determine purposes/means together.
- Requires transparent allocation of responsibilities (Art. 26 style governance posture).
- Shared incident response and rights-handling procedures.

### Pros
- Aligns with federal/provincial/municipal multi-tier governance.
- Supports jurisdictional specialization.
- Better mirrors public-service delivery chains.

### Cons
- Accountability can blur without strong governance contracts.
- Complex rights handling and legal coordination.
- Cross-border transfer rules become operationally heavy.

### Fit for AXIOM
Strong candidate for government guild templates if responsibility matrix is codified in contracts + policy engine (who responds to access, deletion, rectification, portability).

---

## Model 3: Self-Sovereign Identity + Selective Disclosure Model (Citizen-Centric)

### Characteristics
- Citizen controls keys, consent, and disclosure scope.
- Data minimized by design (attribute proofs over raw records).
- On-chain layer stores commitments, consent receipts, and audit trails—not plaintext PII.

### Pros
- Strongest alignment with GDPR principles: data minimization, purpose limitation, storage limitation.
- Smaller centralized attack surface.
- Native auditability and revocation traceability.

### Cons
- Higher cryptographic UX burden (key recovery, consent UX).
- Requires robust anti-replay and revocation propagation.
- Demands strict policy-engine fail-closed behavior.

### Fit for AXIOM
Best long-term model. Should be implemented with staged rollout:
1. SSI registry + consent receipts,
2. selective disclosure for high-sensitivity domains (health),
3. full citizen digital entity controls.

---

## Recommended Hybrid for AXIOM (Pragmatic Path)

1. **Short term**: centralized-controller wrapper for pilot operability.
2. **Mid term**: federated joint-controller governance between guild tiers.
3. **Target state**: SSI-first citizen-controlled selective disclosure.

This phased approach enables compliance continuity while preserving final-state sovereignty.

## Control Mapping to Existing AXIOM Components

- Purpose limitation + deny-by-default policy: Hypervisor policy engine + privacy router gates.【F:hypervisor/src/core/policy_engine.py†L1-L147】【F:hypervisor/src/engine/privacy_router.py†L1-L51】
- Immutable accountability records: audit retention lane in master roadmap and blockchain eventing paths.【F:docs/MASTER-TODO.md†L194-L195】
- Data minimization through proof workflows: zk/zkML verification lanes and bounded payload checks.【F:grid/consensus/zkml.go†L36-L67】【F:grid/api/server.go†L244-L258】
- Storage separation and user vault pattern: Hypervisor private vault module.【F:hypervisor/src/memory/PrivateVault.py†L1-L165】

## Compliance Gaps to Close Next

1. Data-subject rights orchestration playbooks (access/erasure/rectification/portability objections).
2. Processor/controller role matrix per Guild template.
3. Breach notification automations (authority + data subject timelines).
4. Cross-border transfer policy pack and SCC handling for non-EU counterparties.
5. DPIA templates for high-risk AI-agent services.

## External Reference Set (Primary Sources)

- Regulation (EU) 2016/679 (GDPR) official EUR-Lex text.
- EDPB Guidelines 07/2020 (controller and processor concepts).
- EDPB Guidelines 4/2019 (data protection by design and by default).
- CNIL GDPR toolkit (implementation-oriented compliance controls).
