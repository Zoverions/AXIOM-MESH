# AXIOM-MESH Roadmap Extension — Epistemic Fabric

**Status:** approved future-compatible direction; documentation-only; no capability promotion

**Date:** 2026-09-07

**Normative design gate:** `docs/superpowers/specs/2026-09-07-epistemic-fabric-stage5b-design.md`

## Compatibility commitments effective immediately

Future AXIOM-MESH work must preserve these compatibility commitments even before the epistemic fabric is implemented:

1. provenance must remain separable from truth;
2. evidence/assessment must remain separable from authority;
3. agent/model output must not gain ambient canonical-write authority;
4. corrections/retractions must remain append-only and historically reconstructable;
5. future federation must tolerate legitimate assessment disagreement;
6. effect-bearing transitions remain on the ordinary Mesh authority path;
7. evidence lineage must be representable without requiring a universal truth score;
8. private evidence must not require global raw-data centralization;
9. continuous observation/analysis must not imply continuous effect permission;
10. Stage 5B implementation authority must be granted independently of Stage 5A.

## Workstream A — E0 inert contracts

Goal: define exact documentation/schema contracts without runtime activation.

Required outputs:

- bounded `Source`, `Claim`, and `Evidence` object schemas;
- common immutable record envelope;
- explicit `authority_effect: none` semantics;
- revision/content digest fields;
- source-anchor and provenance fields;
- resource/cardinality ceilings in schema or accompanying normative validation contract;
- canonical serialization rules;
- negative fixtures for malformed, widened, stale, and missing-byte cases.

Promotion gate: documentation registration, deterministic schema validation, no runtime reachability, and proof that no capability registry or production policy surface is changed.

## Workstream B — E1 local proposal graph

Goal: allow bounded local proposal objects only.

Required properties:

```text
Source -> Claim -> Evidence
```

- proposal plane only;
- local/offline test harness first;
- no federation;
- no public ingestion route;
- no autonomous canonical promotion;
- no external model/provider requirement;
- explicit resource ceilings;
- deterministic replay of local proposal construction;
- every machine-generated object attributable to exact model/agent/run inputs where applicable.

Promotion gate: Stage 5B E1 implementation review and authority-boundary negative tests.

## Workstream C — E2 deterministic validation

Goal: make object admission independently reproducible.

Required:

- exact object digest/canonicalization;
- source-byte/source-anchor validation;
- current-head checking;
- replay denial;
- semantic scope validation for evidence edges;
- evidence-lineage representation;
- malformed optional evidence fails rather than disappearing;
- unsupported restriction dimensions fail closed.

## Workstream D — E3 canonical object admission

Goal: permit exact validated object promotion using existing AXIOM authority mechanisms.

Non-negotiable:

```text
canonical object != true claim
canonical object != effect authority
```

No second policy engine, capability engine, or governance root may be introduced.

## Workstream E — E4 reassessment substrate

Add:

- `Assessment`;
- `Unknown`;
- `Relationship`;
- bounded reassessment events.

The reassessment engine must operate against explicit affected-set and resource ceilings. One source must not create unbounded recursive mutation authority.

## Workstream F — evidence independence and contradiction support

Add explicit evidence-lineage and `IndependenceCluster` semantics, then `Contradiction` support.

Required behavior:

- derivative citations cannot masquerade as independent evidence;
- definition/scope/measurement conflicts remain distinguishable from logical contradiction;
- disagreement is preserved rather than averaged away;
- unknown independence remains unknown.

## Workstream G — prediction ledger

Add immutable/preregistered `Prediction` objects and outcome evaluation.

Required properties:

- exact prediction bytes/timestamp before outcome availability;
- no post-outcome replacement;
- new prediction required for correction;
- outcome evidence remains separately attributable;
- prediction success/failure is evidence, not authority.

## Workstream H — E5 federation

Federate signed objects/provenance without requiring global agreement.

Nodes may share:

- object identity;
- exact digests;
- provenance;
- evidence references;
- revision/retraction events.

Nodes may legitimately differ on:

- assessments;
- explanatory models;
- confidence vectors;
- unresolved status;
- preferred hypotheses.

Federation requires a fresh protocol/security gate and must not be inferred from local E0-E4 work.

## Workstream I — E6 continuous feeds

Add bounded source feeds only after local/federated object semantics are stable.

Required controls:

- rate/size/cardinality budgets;
- duplicate suppression;
- parser isolation;
- provenance preservation;
- materiality filtering;
- no automatic external effect from newly ingested information.

## Workstream J — E7 discovery

Discovery agents may propose:

- contradictions;
- cross-domain analogies;
- forgotten-hypothesis reconsideration;
- hypotheses;
- candidate discriminating observations.

All discovery output remains proposal-only until independently admitted.

## Workstream K — E8 unknown-to-experiment planning

The Stack may eventually derive candidate experiments from unresolved unknowns.

The boundary remains:

```text
unknown -> candidate experiment -> safety/resource/policy review -> ordinary Mesh authorization -> execution -> evidence
```

No autonomous physical/external experiment authority is created by epistemic confidence.

## Documentation and claims maintenance

When implementing any workstream:

- update the Stage 5B design if an invariant changes;
- update the epistemic threat model with new attack surfaces;
- add the implementation plan and tests to the supported documentation corpus;
- update current-build threat/status docs only when runtime behavior actually changes;
- keep `mesh/config/capabilities.json` authoritative for runnable capability status;
- never describe documentation-only or test-only work as implemented capability.

## Current non-claims

AXIOM-MESH does not currently claim:

- an implemented epistemic fabric;
- continuous scientific ingestion;
- global knowledge federation;
- autonomous truth determination;
- global reputation scoring;
- autonomous experiment execution;
- production ZK/private evidence proofs;
- runtime exposure of the Stage 5B object vocabulary.

The next permissible proposal is E0/E1 only and still requires an independent implementation gate.
