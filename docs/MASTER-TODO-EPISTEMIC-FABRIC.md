# AXIOM-MESH Master TODO — Epistemic Fabric

**Status:** subordinate Stage 5B queue; E0/E1 gate and schema-composition amendment A owner-approved; implementation awaits approval-record verification/merge

**Date:** 2026-09-08

**Parent design:** `docs/superpowers/specs/2026-09-07-epistemic-fabric-stage5b-design.md`

**Roadmap:** `docs/ROADMAP-EXTENSION-EPISTEMIC-FABRIC.md`

## Priority 0 — Protect current authority truth

- [x] Keep `mesh/config/capabilities.json` unchanged for documentation-only work.
- [x] Do not add production policy actions for epistemic ingestion, canonical promotion, federation, discovery, or experiment execution.
- [x] Preserve Gateway -> Hypervisor -> Sandbox -> Grid as the only ordinary privileged effect path.
- [x] Preserve deny-dominant composition, exact-effect binding, current-head validation, replay protection, consume-before-execute, and burn-on-uncertainty.
- [x] Enforce the doctrine: knowledge may inform authority; knowledge must never silently become authority.

## Priority 1 — Register the Stage 5B documentation set

- [x] design gate registered;
- [x] roadmap registered;
- [x] queue registered;
- [x] threat model registered;
- [x] E0/E1 plan registered;
- [x] focused documentation-registration coverage added;
- [x] Stage 5B documentation package verified and merged through PR #1560.

Verification evidence: PR #1560 head `f6b71a5dbe10a086bd4d4fa91be7d9ea45488a0b` passed Clean Kernel run `34174907304` and Windows Compatibility run `34174907306`; it merged to `main` as `344ad17b0e4781c66a5103a4df67c72b93bde4ca`.

## Priority 2 — E0 schema contract

Original gate proposal `9fec5a449811e343c4723dfb5598d860b59841dc` was owner-approved. Pre-implementation review then found a JSON Schema composition defect: the base schema's `additionalProperties:false` was incompatible with specialized `allOf` extension under standard JSON Schema 2020-12 semantics.

Amendment A was explicitly owner-approved on 2026-09-08 against amendment proposal head `e3bcd9230309159c63017f893ba8b56dc79915e7`:

- [x] common epistemic record envelope preserved;
- [x] `Source`, `Claim`, and `Evidence` fields preserved;
- [x] exact source anchors preserved;
- [x] provenance references preserved;
- [x] immutable object/revision semantics preserved;
- [x] authority-neutral semantics preserved;
- [x] cardinality/resource ceilings preserved;
- [x] canonical serialization profile preserved;
- [x] base changed to extensible composition form;
- [x] specialized schemas closed with `unevaluatedProperties:false`;
- [x] **owner approval of amendment A exact schema bytes/digests**.

Approved amended schema SHA-256 digests:

- record: `d647878abe6912d580ac60122b4a15a2ae845b411d4236630ce19a62deb0c7ae`
- source: `d359eb1238eb44d573ff273aa8b89780b42b85b7e67f0f80f2a47f3eae6a3868`
- claim: `a7c6b20afcb223a2e48db9543d5e332bb8de9b752110d68b80582e63f02f2c87`
- evidence: `207ab9477334eb6654869abc9e688a7cbe40ba5065c72f349f22ede8d944d628`

E0 remains inert: no runtime activation, capability registration, production policy, network path, or external effect is authorized.

## Priority 3 — E0 negative fixtures

After the approval record passes protected checks and merges, use test-first development and prove:

- [ ] specialized schemas accept common + specialized declared fields and reject unevaluated fields;
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

After approval-record verification/merge, implementation may cover only:

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

- [x] exact proposal head;
- [x] exact changed-file envelope;
- [x] resource ceilings;
- [x] rollback/recovery behavior;
- [x] threat-model boundary;
- [x] focused acceptance-test matrix;
- [x] original protected verification;
- [x] explicit owner approval independent of Stage 5A;
- [x] narrow amendment A exact replacement schema bytes/digests;
- [x] explicit owner approval of amendment A.

Before `feat/epistemic-fabric-e0-e1` is created:

- [ ] approval-record head must pass fresh Clean Kernel verification;
- [ ] approval-record head must pass supported Windows/macOS compatibility verification;
- [ ] PR #1562 must merge to `main`.

No earlier Stage 5A approval substitutes for this gate, and no part of this work grants E2+ authority.

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

E0/E1 is complete only when the amendment-approved bounded local proposal-only substrate passes all predeclared acceptance tests and protected checks on the exact implementation head, with no authority widening.
