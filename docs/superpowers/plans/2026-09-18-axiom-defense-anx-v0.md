# Axiom Defense / ANX v0 — D0/D1 implementation plan

**Programme:** #1699  
**Design:** `docs/superpowers/specs/2026-09-18-axiom-defense-anx-v0-design.md`

## Goal

Land the smallest repository-native proof that AXIOM can describe a physical defensive envelope and reject authority inheritance without creating physical execution capability.

## Exact changed-file envelope for the first slice

Expected first slice:

- add the design document;
- add this plan;
- register both documents in `mesh/src/check-docs.mjs`;
- extend `docs/security/CURRENT-BUILD-THREAT-MODEL.md` with the cross-substrate physical-defense boundary;
- follow-on D1 may add one inert contract schema plus deterministic validator/negative fixtures only after contract fields are reconciled with existing authority/currentness primitives.

The first docs slice must not modify:

- `mesh/config/capabilities.json`;
- Gateway routes;
- Hypervisor effect selection;
- Sandbox execution;
- Grid mutation surfaces;
- device adapters;
- network listeners;
- production manifests;
- credentials or keys.

## Task 1 — canonicalize the design boundary

Register:

`docs/superpowers/specs/2026-09-18-axiom-defense-anx-v0-design.md`

`docs/superpowers/plans/2026-09-18-axiom-defense-anx-v0.md`

in `CANONICAL_DOCUMENTS`.

Acceptance:

- `node mesh/src/check-docs.mjs` accepts both paths;
- no canonical-document registration is omitted;
- documentation describes v0 as non-authorizing and non-physical.

## Task 2 — extend the current-build threat model

Add a cross-substrate physical-defense section that states:

- physical-device evidence does not create authority;
- ANX is not an alternate authority root;
- Mesh policy/coordination is not a generic remote actuator;
- local interlocks remain below AI/Mesh policy;
- connectivity/provider/model loss cannot widen physical authority;
- restart/recovery cannot resume stale physical effects;
- any future physical effect still requires exact current local authority.

Acceptance:

- the canonical threat model remains accurate about the current build;
- it explicitly states that the current build does not expose production physical actuation;
- no speculative future capability is described as present.

## Task 3 — reconcile the D1 contract before implementation

Before adding `axiom-defense-envelope.v0`, compare proposed fields against existing objects for:

- authority snapshot/currentness;
- exact-effect admission;
- machine principal;
- resource/effect budgets;
- shutdown/quarantine;
- embodiment capabilities;
- provenance/evidence receipts.

Reuse references/digests instead of copying those semantics into a second protocol.

The envelope should contain only domain semantics that remain genuinely missing.

## Task 4 — D1 inert schema and validator

Only after Task 3 reconciliation, add a closed inert contract and pure validation.

Required validator properties:

- closed object shape;
- explicit version;
- explicit purpose;
- nonempty protected-scope reference;
- finite permitted/prohibited effect-class sets;
- finite consequence ceiling;
- valid time interval;
- explicit termination conditions;
- explicit degraded-mode policy;
- explicit local-interlock profile reference;
- exact policy/digest bindings where applicable;
- no embedded credential, grant, token, executable, URI-to-actuator, or arbitrary command surface.

The validator must not contact hardware, the network, Grid, or any provider.

## Task 5 — D1 hostile fixtures

At minimum deny or mark insufficient:

1. classification presented as authority;
2. observation receipt presented as authority;
3. expired envelope;
4. stale/revoked authority reference;
5. effect class outside permit set;
6. consequence above ceiling;
7. spatial/logical scope mismatch;
8. missing termination conditions;
9. offline mode requesting broader authority;
10. restart/recovery attempting to resume stale effect;
11. UI request presented as permission;
12. governance result presented as immediate physical authority;
13. ANX node self-authorizing;
14. multiple peer nodes claiming consensus as pooled authority;
15. model confidence used to raise an authority ceiling.

Positive fixtures prove only valid inert description/eligibility structure. They do not prove physical authority.

## Task 6 — D2 simulator gate

Do not begin D2 until D1 is deterministic and green.

The simulator must:

- be offline and deterministic;
- use synthetic sensors and synthetic effects;
- exercise evidence conflict, spoofing, timing, scope exit, stop/quarantine, connectivity loss, node compromise and recovery;
- never bind to real hardware;
- never expose a generic actuator API;
- preserve exact event/effect provenance.

Simulator success is conformance evidence only.

## Landing gate

For the docs-only first slice:

- exact head recorded;
- changed files limited to the declared documentation/checker envelope;
- `node mesh/src/check-docs.mjs`;
- repository-required docs/clean-kernel checks;
- no capability-registry diff;
- no production/deployment diff;
- no physical I/O;
- draft PR until protected CI is green and review confirms the non-authority boundary.

For later D1 code:

- positive + hostile contract tests;
- no provider/network/process/hardware imports;
- no authority/capability promotion;
- exact current-base verification;
- independent authority-boundary review.

## Explicit non-claims

Completion of D0/D1 does not establish:

- physical protection effectiveness;
- physical safety certification;
- live ANX actuation;
- autonomous defense;
- autonomous targeting;
- real-world sensor trust;
- production readiness;
- capability promotion;
- deployment authority.

It establishes only that the repository has a coherent, testable and fail-closed language for reasoning about cross-substrate defense without authority inheritance.
