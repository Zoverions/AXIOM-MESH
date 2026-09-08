# AXIOM-MESH Master TODO — Epistemic Fabric

**Status:** subordinate Stage 5B queue; no implementation authority inherited from Stage 5A

**Date:** 2026-09-07

**Parent design:** `docs/superpowers/specs/2026-09-07-epistemic-fabric-stage5b-design.md`

**Roadmap:** `docs/ROADMAP-EXTENSION-EPISTEMIC-FABRIC.md`

## Priority 0 — Protect current authority truth

- [x] Keep `mesh/config/capabilities.json` unchanged for documentation-only work.
- [x] Do not add production policy actions for epistemic ingestion, canonical promotion, federation, discovery, or experiment execution.
- [x] Preserve Gateway -> Hypervisor -> Sandbox -> Grid as the only ordinary privileged effect path.
- [x] Preserve deny-dominant composition, exact-effect binding, current-head validation, replay protection, consume-before-execute, and burn-on-uncertainty.
- [x] Enforce the doctrine: knowledge may inform authority; knowledge must never silently become authority.

The Stage 5B documentation PR changed only documentation, the canonical-document verifier, and focused documentation-registration coverage. It did not modify capability or production-policy files.

## Priority 1 — Register the Stage 5B documentation set

Before any implementation candidate is accepted:

- [x] register the design gate in `CANONICAL_DOCUMENTS`;
- [x] register the roadmap extension;
- [x] register this queue;
- [x] register the epistemic threat model;
- [x] register the E0/E1 implementation plan;
- [x] add focused documentation-registration coverage;
- [x] run the repository documentation verifier on supported platforms and record protected-check completion.

Verification evidence: PR #1560 head `f6b71a5dbe10a086bd4d4fa91be7d9ea45488a0b` passed Clean Kernel run `34174907304` and Windows Compatibility run `34174907306`, including Windows and both macOS compatibility jobs. The documentation-only gate merged to `main` as `344ad17b0e4781c66a5103a4df67c72b93bde4ca`.

## Priority 2 — E0 schema proposal only

Prepare a fresh implementation proposal for inert schemas covering:

- [ ] common epistemic record envelope;
- [ ] `Source`;
- [ ] `Claim`;
- [ ] `Evidence`;
- [ ] exact source anchors;
- [ ] provenance references;
- [ ] immutable object/revision digests;
- [ ] explicit authority-neutral semantics;
- [ ] bounded collection/cardinality fields;
- [ ] canonical serialization profile.

E0 must have no runtime activation.

A fresh E0/E1 implementation-gate proposal is being prepared on `docs/epistemic-fabric-e0-e1-gate` from exact merged base `344ad17b0e4781c66a5103a4df67c72b93bde4ca`. Proposal preparation grants no implementation authority.

## Priority 3 — E0 negative fixtures

Design tests before implementation for:

- [ ] malformed source anchors;
- [ ] missing required source bytes;
- [ ] empty-byte substitution attempts;
- [ ] stale prior revision;
- [ ] post-signature field widening;
- [ ] unsupported restriction dimensions;
- [ ] malformed optional evidence;
- [ ] model output trying to claim authority;
- [ ] evidence object trying to mint a capability.

## Priority 4 — E1 local proposal graph

Only after E0 approval:

- [ ] bounded local proposal store;
- [ ] `Source -> Claim -> Evidence` construction;
- [ ] no federation;
- [ ] no public route;
- [ ] no canonical write by models;
- [ ] no external effect;
- [ ] explicit storage/traversal/model-call budgets;
- [ ] deterministic local replay tests;
- [ ] exact model/agent/run attribution where machine generation is used.

## Priority 5 — Re-establish implementation authority

E0/E1 code work requires a fresh gate that names:

- [ ] exact candidate head;
- [ ] exact changed files;
- [ ] exact schema bytes;
- [ ] affected capability/policy surfaces;
- [ ] resource ceilings;
- [ ] rollback/recovery behavior;
- [ ] threat-model deltas;
- [ ] focused tests;
- [ ] Clean Kernel verification;
- [ ] supported Windows/Linux verification;
- [ ] independent security review requirement.

No earlier Stage 5A approval may substitute for this gate.

## Priority 6 — Later work remains parked

Do not implement until separately gated:

- [ ] canonical object admission;
- [ ] reassessment propagation;
- [ ] evidence independence clusters;
- [ ] contradiction engine;
- [ ] prediction ledger;
- [ ] federation;
- [ ] continuous feeds;
- [ ] cross-domain discovery;
- [ ] forgotten-hypothesis reconsideration;
- [ ] experiment proposals;
- [ ] autonomous physical/external experiment execution.

## Completion rule

This queue is complete only when the Stage 5B architecture, threat model, schemas, implementation evidence, and promotion state remain mutually consistent and no epistemic object, model, evaluator, Circle, institution, or consensus mechanism can bypass AXIOM-MESH authority boundaries.
