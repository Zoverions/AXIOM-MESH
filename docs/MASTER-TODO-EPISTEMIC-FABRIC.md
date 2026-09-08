# AXIOM-MESH Master TODO — Epistemic Fabric

**Status:** subordinate Stage 5B queue; E0/E1 implementation gate approved; no authority inherited from Stage 5A

**Date:** 2026-09-08

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

## Priority 2 — E0 schema contract

The fresh implementation gate is approved against proposal head `9fec5a449811e343c4723dfb5598d860b59841dc`.

- [x] common epistemic record envelope specified;
- [x] `Source` schema bytes/digest specified;
- [x] `Claim` schema bytes/digest specified;
- [x] `Evidence` schema bytes/digest specified;
- [x] exact source anchors specified;
- [x] provenance references specified;
- [x] immutable object/revision digests specified;
- [x] explicit authority-neutral semantics specified;
- [x] bounded collection/cardinality fields specified;
- [x] canonical serialization profile specified.

E0 remains inert: no runtime activation, capability registration, production policy, network path, or external effect is authorized.

## Priority 3 — E0 negative fixtures

Implementation must use test-first development and prove:

- [ ] malformed source anchors fail;
- [ ] missing required source bytes do not become empty bytes;
- [ ] empty-byte substitution attempts fail;
- [ ] stale prior revision fails;
- [ ] post-signature/digest field widening changes identity or fails;
- [ ] unsupported restriction/authority dimensions fail closed;
- [ ] malformed optional evidence fails rather than disappearing;
- [ ] model output cannot claim authority;
- [ ] evidence objects cannot mint or substitute for capabilities/grants.

## Priority 4 — E1 local proposal graph

Authorized only within the approved gate:

- [ ] bounded local proposal store;
- [ ] `Source -> Claim -> Evidence` construction;
- [ ] no federation;
- [ ] no public route;
- [ ] no canonical write by models;
- [ ] no external effect;
- [ ] explicit storage/traversal/model-call budgets;
- [ ] deterministic local replay/export tests;
- [ ] exact model/agent/run attribution where machine generation is used.

## Priority 5 — E0/E1 implementation authority

The fresh gate now records:

- [x] exact approved proposal head;
- [x] exact changed-file envelope;
- [x] exact schema bytes and SHA-256 digests;
- [x] affected capability/policy surfaces explicitly excluded;
- [x] resource ceilings;
- [x] rollback/recovery behavior;
- [x] threat-model boundary;
- [x] focused acceptance-test matrix;
- [x] Clean Kernel verification of the approved proposal head;
- [x] supported platform compatibility verification of the approved proposal head;
- [x] explicit owner approval independent of Stage 5A.

Implementation branch authorized by this gate: `feat/epistemic-fabric-e0-e1`.

No earlier Stage 5A approval substitutes for this gate, and no part of this approval grants E2+ authority.

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

E0/E1 is complete only when the repository demonstrates the approved bounded local proposal-only substrate, all predeclared acceptance tests pass, protected checks are green on the exact implementation head, and no epistemic object, model, evaluator, Circle, institution, or consensus mechanism can bypass AXIOM-MESH authority boundaries.
