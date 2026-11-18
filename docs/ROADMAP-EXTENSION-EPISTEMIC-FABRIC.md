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

---

## Amendment B — future-compatible epistemic research substrate

**Approved:** 2026-09-08 as a documentation/design amendment only.

Amendment B adds the following compatibility commitments without widening E0/E1:

11. epistemic state must preserve materially distinct dimensions rather than require a scalar truth/confidence score;
12. failed routes, falsifications, counterexamples, and inconclusive attempts must be representable with provenance;
13. verification/reproduction claims must expose the dependency closure and replay scope actually checked;
14. unresolved work must be exportable as bounded continuation evidence without transferring authority;
15. research-frontier state must remain a derived, scoped, recomputable proposal view rather than canonical truth, priority, or execution authority.

The owner-approved E0/E1 schemas, schema digests, implementation envelope, and PR #1563 authority boundary remain unchanged.

### Amendment B mapping onto existing workstreams

#### E2 extension — reproducibility closure

A separately gated E2+ implementation may add structured verification/reproduction records that bind:

- exact target/statement digest;
- verifier/checker identity, version, and profile;
- execution-environment digest;
- dependency-closure digest;
- dependencies freshly checked/rebuilt;
- dependencies reused without independent rebuild;
- independent replay identity/status;
- result, limitations, and scope.

A verification claim may never be stronger than the closure actually replayed.

#### E4 extension — evidence-state vectors and failure provenance

A separately gated E4 implementation should preserve independent dimensions for formal checking, source/formalization alignment, provenance, independence, empirical support, reproducibility, review status, applicability, and unresolved limitations.

E4 should also make negative search information first-class through attributable failure-provenance records. Failure classes must distinguish at least logical refutation/falsification, inconclusive search, resource exhaustion, tool failure, unsupported method, scope mismatch, and duplicate search.

No aggregate or policy-specific score may overwrite the underlying dimensions.

#### Evidence-independence extension

Independence analysis should compose with reproducibility closure and failure provenance so that:

- many replays of the same dependency chain are not mistaken for independent evidence;
- reused dependencies remain visible;
- derivative failed routes are not counted as independent falsifications;
- unknown independence remains unknown.

#### E6 extension — continuous verification-aware ingestion

Continuous feeds may ingest formalizations, proofs, reproductions, failed replications, benchmark results, and other verification artifacts only when provenance and dimensional state are preserved.

Continuous ingestion still stops before external effects.

#### E7 extension — continuation packets

A separately gated E7 implementation may define a bounded, content-addressed continuation packet carrying:

- unresolved target/question and scope;
- exact graph/snapshot references;
- evidence-state references;
- attempted/failed routes;
- counterexamples or falsifiers;
- open dependencies and obligations;
- promising unexplored routes and rationale;
- exact model/agent/run provenance;
- resource expenditure and declared remaining search budget;
- packet digest and creation time.

Continuation import is evidence/proposal import only. Packets must not carry capabilities, credentials, grants, consent, repository authority, network authority, spending authority, experiment authority, or other external-effect permission.

#### E7 extension — computed frontier

A future frontier engine may derive proposal state from an exact graph snapshot and explicit methodology/profile. It may surface:

- unresolved obligations;
- contradictions and discriminating observations;
- missing dependency edges;
- viable unexplored routes;
- incomplete verification closures;
- assumptions whose weakening/replacement could unlock progress;
- high-information candidate formal searches or experiments.

Frontier output must bind its source snapshot, derivation/profile, resource horizon, and digest. Different nodes may legitimately compute different frontier views.

Frontier rank, novelty, expected information gain, or model preference does not establish truth, canonicality, funding authority, or execution permission.

### Separate future implementation decomposition

The following slices are deliberately separated from the active E0/E1 implementation and require new gates in this order unless a future design explicitly changes the dependency structure:

1. **E2-RC — Reproducibility Closure Contract**
   - inert verification/reproduction schema and deterministic validation;
   - exact dependency/replay scope;
   - no canonical promotion or external effect.

2. **E4-EV — Evidence-State Vector Contract**
   - multidimensional assessment state;
   - no universal scalar truth/confidence primitive;
   - explicit unknown dimensions.

3. **E4-FP — Failure Provenance Contract**
   - attributable attempted routes and failure classes;
   - append-only negative-search history;
   - no claim that every failed route falsifies a target.

4. **E7-CP — Continuation Packet Contract**
   - bounded graph slice and research handoff;
   - content-addressed and replayable;
   - authority-neutral import/export.

5. **E7-CF — Computed Frontier Contract**
   - derived unresolved/frontier state over exact snapshots;
   - deterministic where the selected methodology claims determinism;
   - multiple scoped frontier views allowed;
   - proposal-only output.

Each slice requires its own design/authority review, threat-model delta, exact file/schema envelope, resource ceilings, negative tests, and protected exact-head verification. None is authorized by Amendment B itself.

## Amendment B non-claims

This amendment does not claim or authorize:

- E2+ implementation;
- changes to the current E0/E1 schema bytes or approved digests;
- changes to PR #1563 authority or file envelope;
- an implemented verification-closure engine;
- implemented failure-provenance storage;
- portable continuation packets;
- an implemented frontier engine;
- continuous MAP/Lean/Prove2Me ingestion;
- autonomous theorem proving as an AXIOM capability;
- autonomous research or experiment execution.
