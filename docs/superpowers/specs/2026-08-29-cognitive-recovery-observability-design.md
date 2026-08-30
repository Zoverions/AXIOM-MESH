# Cognitive Recovery Observability and Replacement Fidelity — Design

**Status:** approved architecture; written-spec review pending

**Date:** 2026-08-29

**Scope:** independent model/runtime availability evidence, cognitive artifact lineage, replacement-fidelity evaluation, and inert recovery assessment for Cognitive Topology dependencies

**Builds on:**

- `docs/superpowers/specs/2026-08-29-cognitive-topology-identity-kernel-design.md`
- `mesh/src/lib/cognitive-topology.mjs`
- `mesh/src/lib/model-acquisition-manifest.mjs`
- `mesh/src/lib/persistence-attestation.mjs`
- `mesh/src/lib/cognitive-continuity-report.mjs`
- existing principal/Self Bundle continuity contracts

**Authority boundary:** This design adds evidence and interpretation contracts only. It does not call providers, probe endpoints, load models, acquire weights, synchronize or restore persistence, route cognition, execute replacement, mutate Cognitive Topology, train/distill/adapt models, grant credentials, grant capabilities, change Gateway/Hypervisor/Sandbox/Grid authority behavior, prove AXIOM principal continuity, or claim subjective identity continuity.

## 1. Core decision

The next Cognitive Topology slice must improve what AXIOM can know about a changing cognitive substrate before AXIOM is allowed to act on that knowledge.

The current Cognitive Continuity Report v0 accepts compact model observations containing only node/model identity, availability, and an optional observed artifact digest. That is sufficient for a first evidence-relative report, but not sufficient to establish:

- who or what made an availability observation;
- how that observation was produced;
- what exact evidence supports it;
- whether the observation is fresh enough to rely on;
- whether a replacement is related to the former cognitive component;
- whether a replacement preserves expected capabilities, preferences, behavior, memory use, relationships, and robustness;
- whether a recovery is acceptable despite measurable cognitive degradation.

AXIOM therefore adds four separable, inert concepts:

1. **Cognitive Availability Attestation v0**;
2. **Cognitive Lineage Manifest v0**;
3. **Replacement Fidelity Evaluation v0**;
4. **Cognitive Recovery Assessment v0**.

The governing sequencing principle is:

> **Knowledge before agency. Observe, bind, compare, and report before authorizing replacement or migration.**

## 2. Why these remain separate contracts

Availability, lineage, fidelity, and recovery interpretation are different evidence questions.

Combining them into one document would create several problems:

- provider reachability evidence would become entangled with model-lineage claims;
- fidelity evaluators would implicitly become recovery-policy authorities;
- a single stale observation could make an otherwise reusable evaluation unusable;
- replacement comparisons would be difficult to reuse across multiple recovery decisions;
- future active observers would be harder to sandbox because observation semantics and decision semantics would share one contract.

Each contract therefore has one purpose and one explicit authority boundary.

## 3. Identity boundary

This design preserves the existing separation among:

- principal continuity;
- principal/Self Bundle lineage continuity;
- cognitive lineage;
- cognitive continuity;
- cognitive fidelity;
- cognitive sovereignty.

**Cognitive lineage is not principal lineage.**

A fine-tuned descendant, quantized derivative, distilled kernel, or provider-version successor may have strong cognitive lineage while belonging to a different AXIOM principal.

Conversely, the same continuing AXIOM principal may intentionally replace one cognitive component with a functionally unrelated model after a governed transition.

No artifact defined here may state or imply that model similarity proves principal continuity or subjective identity.

### 3.1 Common contract envelope

The first executable slice uses exact identifiers and statuses:

| Contract | Schema | Version | Status |
| --- | --- | ---: | --- |
| Cognitive Availability Attestation | `axiom-cognitive-availability-attestation.v0` | `0` | `inert-evidence` |
| Cognitive Lineage Manifest | `axiom-cognitive-lineage-manifest.v0` | `0` | `inert-evidence` |
| Replacement Fidelity Evaluation | `axiom-replacement-fidelity-evaluation.v0` | `0` | `inert-evidence` |
| Cognitive Recovery Assessment | `axiom-cognitive-recovery-assessment.v0` | `0` | `inert-evidence-report` |

Persistent evidence documents are content-addressed and closed-world. Where consistent with existing repository contracts they carry explicit boundary fields requiring no secrets, no authority effect, no network effect, and no runtime activation.

The recovery assessment is a deterministic derived report over supplied evidence. It carries an equivalent explicit authority-boundary object and a deterministic report digest.

## 4. Cognitive Availability Attestation v0

### 4.1 Purpose

`axiom-cognitive-availability-attestation.v0` is a content-addressed observation about the availability of one Cognitive Topology node at a specific time.

It replaces ad-hoc availability assertions with provenance-bearing evidence that can later be consumed by a recovery or continuity report.

### 4.2 Required binding

An attestation binds:

- exact `topology_id`;
- exact `topology_digest`;
- exact `node_id`;
- exact `model_id`;
- the topology-declared access/custody/weight facts relevant to the observation;
- observer/evidence provenance;
- observation time;
- validity/freshness horizon.

A resolver must reject an attestation that does not match the exact topology declaration.

### 4.3 Availability states

The observed state is exactly one of:

- `available`;
- `unavailable`;
- `indeterminate`.

`indeterminate` is not silently promoted to available.

### 4.4 Observation modes

The observation mode is exactly one of:

- `local-artifact`;
- `local-runtime`;
- `provider-api`;
- `remote-runtime`;
- `provider-statement`;
- `synthetic-probe`.

These classify evidence; they do not authorize the observation mechanism itself.

For example, a future provider observer may separately hold policy-authorized network capability. The resulting attestation remains a zero-authority evidence artifact.

### 4.5 Evidence classes

The attestation distinguishes evidence strength without pretending every observation mode is equivalent. Initial evidence classes are:

- `direct-local`;
- `direct-remote`;
- `provider-asserted`;
- `synthetic-observed`;
- `indirect`.

The evidence class is descriptive. It does not create trust by itself.

### 4.6 Observer provenance

The contract records:

- `observer_ref` — opaque identity/principal/worker reference;
- `evidence_ref`;
- `evidence_digest`;
- `observed_at`;
- `valid_until`.

The contract does not embed raw credentials, provider tokens, cookies, session material, or probe secrets.

### 4.7 Artifact identity

When the topology declares an owner-addressable acquired artifact and the observation claims that artifact is available, the attestation requires an exact observed artifact digest.

A digest mismatch must be visible as evidence of a different artifact, not rewritten as simple availability.

For provider-controlled or otherwise non-owner-addressable models, the artifact digest remains nullable unless a future topology contract explicitly exposes a verifiable artifact identity.

### 4.8 Freshness

An availability attestation is structurally valid according to its own immutable timestamps. A consumer evaluates whether it is fresh enough to rely on by comparing explicit `assessment_at` with `valid_until`.

If `assessment_at` is later than `valid_until`, the recovery assessment treats the observation as stale and therefore operationally `indeterminate`. It does not reject the historical attestation as malformed and does not silently continue treating it as available.

Malformed timestamps, `valid_until < observed_at`, or non-canonical timestamps fail validation.

## 5. Cognitive Lineage Manifest v0

### 5.1 Purpose

`axiom-cognitive-lineage-manifest.v0` describes one provenance or transformation relationship between two cognitive components or artifacts.

It is not a principal lineage contract and does not replace Self Bundle lineage.

### 5.2 One explicit edge per manifest

v0 deliberately uses one exact source/reference and one exact destination/candidate per manifest. This keeps lineage evidence content-addressable, independently verifiable, and conflict-visible without introducing graph-reconciliation behavior into the first slice.

Relationship class is exactly one of:

- `successor`;
- `replacement`;
- `fine-tuned-descendant`;
- `distilled-descendant`;
- `quantized-derivative`;
- `adapter-derived`;
- `provider-version-successor`;
- `functionally-unrelated`.

v0 must not infer hidden ancestry from naming conventions or provider marketing labels. More complex lineage graphs are constructed by composing multiple exact manifests outside an individual document.

### 5.3 Evidence

The manifest records:

- source/reference identity;
- destination/candidate identity;
- relationship class;
- transformation/evidence reference;
- evidence digest;
- optional exact source artifact digest;
- optional exact destination artifact digest;
- recorded timestamp.

### 5.4 Non-claims

A Cognitive Lineage Manifest does not prove:

- behavioral equivalence;
- capability equivalence;
- memory equivalence;
- principal continuity;
- subjective identity;
- policy approval for replacement;
- runtime compatibility.

Those remain separate questions.

## 6. Replacement Fidelity Evaluation v0

### 6.1 Purpose

`axiom-replacement-fidelity-evaluation.v0` compares one candidate cognitive component against a reference component or accepted baseline using explicit evaluation dimensions.

The contract is evidence of comparison, not permission to substitute the candidate.

### 6.2 Reference and candidate binding

An evaluation binds:

- exact reference model/component identity;
- exact candidate model/component identity;
- exact reference/candidate artifact digests where owner-addressable artifacts exist;
- optional Cognitive Lineage Manifest ID/digest;
- exact evaluation-suite ID/digest;
- evaluator provenance;
- evaluation time.

Changing the evaluation suite requires a new suite digest. Results from different suite digests are not silently merged as if they were directly equivalent.

### 6.3 Fidelity dimensions

v0 supports these independent dimensions:

1. `capability-fidelity` — expected task/capability retention;
2. `preference-fidelity` — stable preference/choice retention;
3. `behavioral-fidelity` — decision tendency and interaction-pattern retention;
4. `epistemic-fidelity` — calibration, uncertainty, evidence handling, and correction behavior;
5. `safety-policy-fidelity` — preservation of required safety/policy constraints;
6. `style-personality-fidelity` — expected interaction character and style;
7. `memory-use-fidelity` — ability to correctly use expected persistent/portable state;
8. `relationship-fidelity` — preservation of expected relational context and commitments;
9. `robustness-fidelity` — stability under adversarial, perturbation, or regression testing.

The evaluation suite declares which supported dimensions are required for that comparison. Every suite-required dimension must appear explicitly in the evaluation. A required dimension lacking usable evidence appears as `indeterminate`; it is not omitted.

Dimensions outside the suite's required set may be absent, but an aggregate cannot claim evidence about a dimension that was not evaluated.

### 6.4 Per-dimension evidence

Each included dimension records:

- dimension identifier;
- metric or rubric identifier;
- metric/rubric version or digest;
- measured result;
- acceptance/degradation threshold(s);
- sample count where meaningful;
- confidence/evidence reference;
- evidence digest;
- status: `pass | degraded | fail | indeterminate`.

Numeric metrics may be included, but no numeric value is interpreted as a percentage of personal identity.

### 6.5 Aggregate fidelity classes

The evaluation derives one of:

- `high-fidelity`;
- `acceptable-with-degradation`;
- `materially-degraded`;
- `insufficient-evidence`;
- `incompatible`.

The aggregate is subordinate to the visible dimension results and exact evaluation-suite rules.

Aggregation must be deterministic and fail closed:

- `high-fidelity` requires every suite-required dimension to be `pass`;
- any suite-required `indeterminate` result prevents `high-fidelity` and yields at best `insufficient-evidence` unless another required dimension independently forces a lower class;
- suite-required `degraded` or `fail` states map only through explicit rules bound into the exact evaluation-suite digest;
- the evaluation must reject a supplied aggregate that is stronger than the suite rules and dimension evidence permit.

### 6.6 No universal identity score

The system must not produce or advertise a universal “same self” percentage.

A result such as “97% behavioral similarity” may be one metric inside one dimension. It must never be surfaced as “97% the same person/agent.”

## 7. Cognitive Recovery Assessment v0

### 7.1 Purpose

`axiom-cognitive-recovery-assessment.v0` combines the available evidence into a deterministic, zero-authority answer to a narrower question:

> Given this declared Cognitive Topology and this evidence set, what cognitive recovery options are presently supported, and with what observed degradation or uncertainty?

It does not perform the recovery.

### 7.2 Inputs

The assessment consumes exactly:

- one exact Cognitive Topology;
- zero or more Cognitive Availability Attestations;
- zero or more Persistence Attestations;
- zero or more Model Acquisition Manifests;
- zero or more Cognitive Lineage Manifests;
- zero or more Replacement Fidelity Evaluations;
- explicit `assessment_at` time.

The v0 assessment derives dependency/replacement conclusions from these underlying exact evidence documents rather than accepting another aggregate continuity report as authoritative input.

### 7.3 Output dimensions

The assessment reports separately:

- current dependency availability posture;
- stale/indeterminate evidence posture;
- replacement candidates with lineage relationship;
- replacement fidelity class;
- candidate sovereignty/custody posture;
- persistence portability/recovery posture;
- recovery readiness;
- blockers;
- warnings.

### 7.4 Recovery readiness classes

Recovery readiness is exactly one of:

- `no-recovery-needed`;
- `recoverable-high-fidelity`;
- `recoverable-with-degradation`;
- `candidate-available-insufficient-evidence`;
- `blocked-no-acceptable-candidate`;
- `indeterminate`.

This class is descriptive only.

### 7.5 Example interpretation

The assessment may truthfully report:

> Primary embodiment A is unavailable. Candidate B is currently available and is declared as a replacement rather than a descendant. Capability and safety-policy fidelity pass; preference and interaction fidelity are degraded; memory-use fidelity is indeterminate. Recovery is supported with degradation, subject to a separate governed transition decision. No principal-continuity or subjective-identity conclusion is made.

The assessment cannot execute that transition.

## 8. Data flow

The intended evidence flow is:

```text
Cognitive Topology declaration
        |
        +--> Cognitive Availability Attestations
        |
        +--> Persistence Attestations
        |
        +--> Model Acquisition Manifests
        |
        +--> Cognitive Lineage Manifests
        |
        +--> Replacement Fidelity Evaluations
                         |
                         v
             Cognitive Recovery Assessment
                         |
                         v
              future governed transition policy
                         |
                         v
              future separately authorized effect
```

Observation does not become authorization. Evaluation does not become authorization. Recovery assessment does not become authorization.

## 9. Fail-closed rules

The v0 contracts fail closed when applicable if:

1. a topology identifier/digest does not match;
2. a node/model identity does not match the topology;
3. a required artifact digest is malformed or mismatched;
4. evidence provenance or evidence digest is absent;
5. availability timestamps are malformed or internally inconsistent;
6. observer provenance is missing;
7. a lineage manifest uses an unsupported relationship class;
8. lineage source/destination identity is ambiguous;
9. an evaluation-suite digest is absent or changed without a new evaluation identity;
10. a suite-required fidelity dimension is omitted instead of represented as `indeterminate`;
11. a per-dimension status conflicts with its metric/rubric thresholds or exact suite rules;
12. an aggregate fidelity class is stronger than the dimensions permit;
13. duplicate evidence for the same exact observation/evaluation identity conflicts;
14. a contract contains unknown fields where the schema is closed-world;
15. raw credentials, tokens, cookies, vault keys, or provider session material appear;
16. an artifact attempts to grant capabilities, credentials, runtime activation, provider access, substitution authority, or topology mutation authority;
17. any artifact claims to prove principal continuity or subjective identity.

A structurally valid but stale availability attestation is not discarded. At assessment time it becomes stale/indeterminate evidence. Conflicting evidence is preserved as conflict/indeterminate state rather than resolved by “newest wins” unless a future policy explicitly defines a governed reconciliation rule.

## 10. Freshness and conflicting evidence

### 10.1 Freshness

Availability is time-sensitive; lineage and some fidelity evidence may be relatively durable.

Each evidence class therefore keeps its own temporal semantics:

- availability requires `observed_at` and `valid_until`;
- persistence attestation retains its existing observation timestamp semantics;
- lineage is immutable provenance unless superseded by another manifest;
- fidelity evaluation records the evaluation time and exact suite digest but does not automatically expire unless a consuming policy supplies a maximum age.

### 10.2 Conflict handling

If two valid, fresh availability attestations for the same node conflict, v0 recovery assessment reports the node as `indeterminate` and surfaces both evidence references.

It does not select the newest attestation merely because it is newer.

If two fidelity evaluations disagree, the assessment preserves both results and applies only an explicit deterministic suite/policy rule. Without such a rule, the candidate remains insufficiently evidenced.

## 11. Observer and evaluator trust

This slice records observer/evaluator references and evidence. It does not create a new universal trust hierarchy.

Future policy may distinguish:

- owner-local observers;
- provider observers;
- independent external observers;
- synthetic conformance workers;
- approved evaluator ensembles.

v0 consumers must not infer trust solely from a self-declared observer label.

## 12. Compatibility strategy

Existing contracts remain intact:

- Cognitive Topology v0 is unchanged;
- Model Acquisition Manifest v0 is unchanged;
- Persistence Attestation v0 is unchanged;
- Cognitive Continuity Report v0 is unchanged.

The new availability contract does **not** retroactively mutate the compact `model_observations` input accepted by Cognitive Continuity Report v0.

A future Cognitive Continuity Report v1 may consume Cognitive Availability Attestations directly. That is a separate compatibility decision and is outside this slice.

Cognitive Recovery Assessment v0 consumes the richer evidence contracts without breaking v0 report consumers.

## 13. Threat model considerations

The new evidence layer introduces threats distinct from execution authority:

- forged availability to trigger unnecessary migration;
- stale evidence replay;
- malicious provider assertions of availability;
- substitution of a different artifact under the same model label;
- poisoned fidelity evaluation suites;
- benchmark gaming against known evaluation cases;
- gradual behavioral drift hidden behind acceptable aggregate metrics;
- evaluator collusion;
- lineage laundering that relabels an unrelated model as a descendant;
- selective omission of failed fidelity dimensions;
- relationship/memory regression hidden by capability-only benchmarks.

Mitigations in this slice are evidence binding, content addressing, exact suite identity, explicit dimensions, freshness, conflict visibility, and zero-authority outputs.

Active probe sandboxing, evaluator independence policy, secret handling, anti-benchmark-gaming strategies, and transition authorization belong to later slices.

## 14. Testing requirements

Implementation must use RED -> GREEN TDD and keep the four contracts independently testable.

### 14.1 Cognitive Availability Attestation tests

Must cover:

- deterministic digesting;
- exact topology binding;
- unknown-field rejection;
- malformed time/freshness rejection;
- stale-evidence interpretation;
- observer/evidence provenance requirements;
- availability/observation-mode/evidence-class enums;
- owner-artifact digest requirements;
- mismatched artifact detection;
- credential-like field injection rejection;
- frozen input/non-mutation;
- explicit zero-authority boundary.

### 14.2 Cognitive Lineage Manifest tests

Must cover:

- deterministic digesting;
- exact source/destination identities;
- relationship enum;
- artifact digest validation;
- evidence requirements;
- ambiguous identity rejection;
- exactly one relationship edge per manifest;
- explicit non-claim of principal lineage;
- unknown-field/secret injection rejection;
- frozen input/non-mutation.

### 14.3 Replacement Fidelity Evaluation tests

Must cover:

- reference/candidate binding;
- suite ID/digest binding;
- suite-required dimensions;
- metric/rubric identity;
- threshold/result/status consistency;
- omitted required dimension rejection;
- indeterminate required dimensions preventing high-fidelity;
- deterministic aggregate classification;
- aggregate-overclaim rejection;
- explicit prohibition on identity-percentage semantics;
- evidence provenance;
- unknown-field/secret injection rejection;
- frozen input/non-mutation.

### 14.4 Cognitive Recovery Assessment tests

Must cover:

- exact topology/evidence binding;
- stale availability becoming indeterminate;
- conflicting fresh availability becoming indeterminate;
- unavailable primary dependency plus high-fidelity candidate -> `recoverable-high-fidelity`;
- acceptable degraded candidate -> `recoverable-with-degradation`;
- candidate with insufficient fidelity evidence -> `candidate-available-insufficient-evidence`;
- no acceptable candidate -> `blocked-no-acceptable-candidate`;
- no recovery needed when required dependencies are available;
- persistence/acquisition/sovereignty evidence remaining visible;
- lineage relationship remaining separate from fidelity;
- principal continuity and subjective identity always unassessed/not-proven;
- no runtime, network, credential, substitution, or topology mutation effect.

### 14.5 Schema parity

Each persistent evidence document gets a JSON Schema 2020-12 mirror with closed-world objects and a pointer to its semantic validator where repository convention supports it.

Semantic cross-document rules remain enforced by code rather than pretending JSON Schema alone proves topology binding or aggregate correctness.

## 15. Initial implementation boundary

The first executable slice should implement only:

- strict semantic validators/resolvers/digests for Cognitive Availability Attestation v0, Cognitive Lineage Manifest v0, and Replacement Fidelity Evaluation v0;
- deterministic Cognitive Recovery Assessment v0;
- JSON Schema mirrors for persistent evidence documents;
- tests;
- canonical design documentation updates.

It must not implement:

- live network probes;
- provider clients;
- provider API authentication;
- local runtime inspection outside supplied evidence;
- benchmark execution;
- automated evaluator execution;
- model invocation;
- model download/acquisition;
- persistence export/restore/synchronization;
- model replacement;
- topology mutation;
- transition-policy execution;
- autonomous self-revision;
- capability or credential promotion.

## 16. Future activation sequence

Once the inert evidence layer is proven, later slices may independently add:

1. policy-bound local availability observers;
2. sandboxed provider/remote observers;
3. governed fidelity-evaluation runners;
4. provider-retirement and recovery drills;
5. transition-policy artifacts;
6. shadow/canary replacement execution;
7. governed topology revision;
8. rollback and post-transition fidelity monitoring;
9. multi-persistence reconciliation;
10. Axiom One visualization and operator workflows.

Each activation step requires its own threat/authority review and cannot inherit execution authority merely because the inert evidence contracts exist.

## 17. Invariants

1. Evidence is not authority.
2. Observation is not authorization.
3. Cognitive lineage is not principal lineage.
4. Replacement fidelity is multidimensional and never a universal identity score.
5. Availability claims are freshness-bounded.
6. Stale evidence is preserved historically but becomes indeterminate for a current assessment.
7. Conflicting fresh evidence remains visible and indeterminate unless governed reconciliation exists.
8. Exact acquired-artifact identity requires digest equality.
9. Provider assertions remain provider assertions, not independent proof of reachability.
10. Evaluation-suite identity is content-bound; changed suites are not silently comparable.
11. Missing suite-required fidelity evidence cannot yield `high-fidelity` and must be represented explicitly as indeterminate or rejected if omitted.
12. Aggregate fidelity cannot overclaim relative to dimension evidence and exact suite rules.
13. A recovery assessment cannot execute, authorize, or schedule a replacement.
14. A recovery assessment cannot mutate Cognitive Topology.
15. None of these contracts can prove principal continuity or subjective identity.
16. Existing Cognitive Continuity Report v0 behavior remains compatible and unchanged.

## 18. Success criteria

After this slice, AXIOM should be able to answer, from supplied evidence and without performing effects:

- Is this declared cognitive dependency observed as available, unavailable, indeterminate, or stale?
- Who/what produced that observation, using what evidence class and exact evidence digest?
- Is the observed owner-controlled artifact the exact artifact the topology declares?
- How is a proposed replacement related to the reference cognitive component?
- Which fidelity dimensions have actually been measured?
- Which dimensions pass, degrade, fail, or remain indeterminate?
- Does the aggregate fidelity class follow deterministically from the evaluation suite rules?
- Is a recovery presently supported at high fidelity, with degradation, insufficient evidence, or not at all?
- Which sovereignty and persistence dependencies remain after the proposed recovery?
- Which conclusions remain explicitly outside this layer: principal continuity and subjective identity?

The intended product outcome is a trustworthy bridge from **cognitive dependency evidence** to **future governed migration** without allowing evidence-producing or evidence-interpreting components to become execution authorities.