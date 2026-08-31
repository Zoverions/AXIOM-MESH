# Capability Observation v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `axiom-cognitive-capability-observation.v0` as a strict, content-addressed, evidence-only record of one empirical capability outcome bound to one exact Cognitive Capability Profile and one exact evaluation context.

**Architecture:** Add one pure semantic validator/digest/resolver module, one JSON Schema 2020-12 mirror, focused `node:test` coverage, and canonical documentation registration. The resolver binds an observation to an exact Cognitive Capability Profile by profile ID and canonical digest and verifies capability membership. The slice performs no model invocation, benchmark execution, network access, routing, training, spending, capability promotion, topology mutation, or runtime activation.

**Tech Stack:** Node.js ESM, `node:test`, `node:assert/strict`, JSON Schema 2020-12, existing `mesh/src/lib/canonical.mjs`, existing `mesh/src/lib/cognitive-capability-profile.mjs`.

**Spec:** `docs/superpowers/specs/2026-08-31-capability-observation-v0-design.md`

## Global Constraints

- Schema identifier is exactly `axiom-cognitive-capability-observation.v0`.
- Version is exactly `0`.
- Status is exactly `inert-evidence`.
- Every observation binds to exactly one Cognitive Capability Profile through `profile_id` and canonical `profile_digest`.
- The observed capability must be declared by that exact profile.
- Capability vocabulary is exactly `reasoning | coding | vision | computer-use | research | planning | critique | summarization | embedding | tool-use | agent-orchestration | other`.
- Context exact fields are `context_ref`, `context_digest`, `task_family_ref`, `task_family_digest`, `difficulty_class`, `environment_ref`, `environment_digest`, `toolset_ref`, `toolset_digest`.
- Difficulty vocabulary is exactly `trivial | routine | challenging | expert | adversarial | unknown`.
- Evaluation exact fields are `suite_ref`, `suite_digest`, `metric_set_ref`, `metric_set_digest`, `threshold_ref`, `threshold_digest`, `method_ref`, `method_digest`.
- Result exact fields are `classification`, `confidence`, `observed_metric_ref`, `observed_metric_digest`, `failure_mode_refs`.
- Classification vocabulary is exactly `pass | degraded | fail | indeterminate`.
- `confidence` is finite and bounded to `[0,1]`; it is not a routing weight or probability of general intelligence.
- `failure_mode_refs` contains `0-32` duplicate-free identifiers. Empty means no reviewed failure-mode attribution was recorded; it does not prove absence of failure.
- Evaluator exact fields are `evaluator_kind`, `evaluator_ref`, `evaluator_principal_ref`.
- Evaluator kinds are exactly `local-agent | local-service | remote-service | human-reviewer | provider | external-verifier | synthetic-harness`.
- Evidence exact fields are `evidence_kind`, `evidence_ref`, `evidence_digest`, `verification_ref`, `verification_digest`, `assurance_class`.
- Evidence kinds are exactly `evaluation-run | signed-evaluation-run | human-review | external-observation | provider-report | synthetic-probe-result | other`.
- Assurance classes are exactly `declared | signed | verified-local | corroborated`.
- `declared` assurance requires null verification ref/digest; all stronger assurance classes require both.
- `signed-evaluation-run` cannot use `assurance_class: declared`.
- `resource_observations` contains `0-32` exact resource records.
- Resource classes are exactly `input-tokens | output-tokens | compute-time | wall-time | energy | memory | storage | network-transfer | currency | other`.
- Resource bases are exactly `observed | estimated | unknown`.
- Observed/estimated resource observations require a non-negative safe-integer amount and bounded unit identifier; unknown observations require `amount:null` and `unit:null`.
- Unlike resource units are never implicitly converted or aggregated.
- `valid_until >= observed_at` and `recorded_at >= observed_at`; validator/resolver read no wall clock.
- Every object is an exact plain object and unknown fields fail closed.
- Identifiers use existing AXIOM-compatible bounded identifier syntax; digests are lowercase 64-hex SHA-256 strings; units use the CCLE unit syntax.
- `contains_secret_material = false`.
- `authority_effect = none`.
- `network_effect = none`.
- `training_effect = none`.
- `spend_effect = none`.
- `runtime_activation = false`.
- `selection_effect = evidence-only`.
- No Gateway, Hypervisor, Sandbox, Grid, provider transport, credential broker, routing, training/adaptation engine, capability-registry state, Cognitive Topology, Cognitive Learning Ledger, or runtime activation behavior changes.

---

### Task 1: Semantic validator, digest, and exact profile resolver

**Files:**
- Create: `mesh/test/cognitive-capability-observation.test.mjs`
- Create: `mesh/src/lib/cognitive-capability-observation.mjs`

**Interfaces:**
- Consumes: `digestObject`, `ValidationError` from `./canonical.mjs`.
- Consumes: `validateCognitiveCapabilityProfile(profile)` and `cognitiveCapabilityProfileDigest(profile)` from `./cognitive-capability-profile.mjs`.
- Produces: `COGNITIVE_CAPABILITY_OBSERVATION_SCHEMA`.
- Produces: `validateCognitiveCapabilityObservation(document)`.
- Produces: `cognitiveCapabilityObservationDigest(document)`.
- Produces: `resolveCognitiveCapabilityObservation(document, profile)`.

- [ ] **Step 1: Write the failing behavioral and resolver test**

Create `mesh/test/cognitive-capability-observation.test.mjs` with one valid Cognitive Capability Profile fixture and one valid Capability Observation fixture.

Representative observation fixture:

```js
const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);
const DIGEST_C = 'c'.repeat(64);
const DIGEST_D = 'd'.repeat(64);

function validObservation(profile) {
  return {
    schema: 'axiom-cognitive-capability-observation.v0',
    version: 0,
    status: 'inert-evidence',
    observation_id: 'capobs.reasoning.project.v1',
    profile_id: profile.profile_id,
    profile_digest: cognitiveCapabilityProfileDigest(profile),
    capability: 'reasoning',
    context: {
      context_ref: 'context.reasoning.project.v1',
      context_digest: DIGEST_A,
      task_family_ref: 'task-family.reasoning.project.v1',
      task_family_digest: DIGEST_B,
      difficulty_class: 'challenging',
      environment_ref: 'environment.node22.v1',
      environment_digest: DIGEST_C,
      toolset_ref: 'toolset.none.v1',
      toolset_digest: DIGEST_D
    },
    evaluation: {
      suite_ref: 'suite.reasoning.v1',
      suite_digest: DIGEST_A,
      metric_set_ref: 'metrics.reasoning.v1',
      metric_set_digest: DIGEST_B,
      threshold_ref: 'threshold.reasoning.v1',
      threshold_digest: DIGEST_C,
      method_ref: 'method.deterministic.v1',
      method_digest: DIGEST_D
    },
    result: {
      classification: 'pass',
      confidence: 0.9,
      observed_metric_ref: 'metric-result.reasoning.v1',
      observed_metric_digest: DIGEST_A,
      failure_mode_refs: []
    },
    evaluator: {
      evaluator_kind: 'synthetic-harness',
      evaluator_ref: 'evaluator.reasoning.harness.v1',
      evaluator_principal_ref: null
    },
    evidence: {
      evidence_kind: 'evaluation-run',
      evidence_ref: 'evidence.reasoning.run.v1',
      evidence_digest: DIGEST_B,
      verification_ref: null,
      verification_digest: null,
      assurance_class: 'declared'
    },
    resource_observations: [
      { resource_class: 'input-tokens', basis: 'observed', amount: 2400, unit: 'tokens', source_ref: 'usage.reasoning.v1' },
      { resource_class: 'energy', basis: 'unknown', amount: null, unit: null, source_ref: null }
    ],
    observed_at: '2026-08-31T12:00:00.000Z',
    valid_until: '2026-09-30T12:00:00.000Z',
    recorded_at: '2026-08-31T12:01:00.000Z',
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    training_effect: 'none',
    spend_effect: 'none',
    runtime_activation: false,
    selection_effect: 'evidence-only'
  };
}
```

The test file must prove:

1. valid observation validation returns a frozen descriptive summary and deterministic 64-hex digest;
2. object key order does not change the canonical digest;
3. unknown top-level or nested fields fail closed;
4. invalid schema/version/status, enums, identifiers, digests, units, timestamps, and non-finite/out-of-range confidence fail closed;
5. context/evaluation reference and digest fields are mandatory and exact;
6. `failure_mode_refs` accepts 0-32 unique IDs and rejects duplicates or 33 entries;
7. `resource_observations` accepts 0-32 entries and rejects 33 entries;
8. observed/estimated resource entries require amount+unit; unknown entries require null amount/unit; negative or unsafe amounts fail closed;
9. declared assurance requires null verification fields; signed/verified-local/corroborated require both fields;
10. `signed-evaluation-run` with declared assurance fails closed;
11. `valid_until` and `recorded_at` cannot precede `observed_at`;
12. every hard boundary value fails closed if changed;
13. deeply frozen input is not mutated;
14. resolver accepts exact profile ID+digest and declared capability;
15. resolver rejects profile-ID mismatch, profile-digest mismatch, and capability absent from profile;
16. resolved summary includes exact profile/offering/capability/context/evaluation/evidence identities and repeats zero-effect constants;
17. production module imports only `./canonical.mjs` and `./cognitive-capability-profile.mjs`.

Representative success assertions:

```js
const summary = validateCognitiveCapabilityObservation(observation);
assert.equal(summary.valid, true);
assert.equal(summary.schema, 'axiom-cognitive-capability-observation.v0');
assert.equal(summary.observation_id, observation.observation_id);
assert.equal(summary.profile_id, profile.profile_id);
assert.equal(summary.capability, 'reasoning');
assert.equal(summary.classification, 'pass');
assert.equal(summary.resource_observations, 2);
assert.equal(summary.authority_effect, 'none');
assert.equal(summary.network_effect, 'none');
assert.equal(summary.training_effect, 'none');
assert.equal(summary.spend_effect, 'none');
assert.equal(summary.runtime_activation, false);
assert.equal(summary.selection_effect, 'evidence-only');
assert.match(summary.observation_digest, /^[a-f0-9]{64}$/);
assert.equal(Object.isFrozen(summary), true);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
cd mesh && node --test test/cognitive-capability-observation.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` because `../src/lib/cognitive-capability-observation.mjs` does not yet exist.

- [ ] **Step 3: Implement the minimal strict validator/digest/resolver**

Create `mesh/src/lib/cognitive-capability-observation.mjs`.

Required imports:

```js
import { digestObject, ValidationError } from './canonical.mjs';
import {
  cognitiveCapabilityProfileDigest,
  validateCognitiveCapabilityProfile
} from './cognitive-capability-profile.mjs';
```

Required public API:

```js
export const COGNITIVE_CAPABILITY_OBSERVATION_SCHEMA =
  'axiom-cognitive-capability-observation.v0';

export function validateCognitiveCapabilityObservation(document) {
  validateObservationShape(document);
  return Object.freeze({
    valid: true,
    schema: COGNITIVE_CAPABILITY_OBSERVATION_SCHEMA,
    observation_id: document.observation_id,
    profile_id: document.profile_id,
    capability: document.capability,
    classification: document.result.classification,
    confidence: document.result.confidence,
    resource_observations: document.resource_observations.length,
    observation_digest: digestObject(document),
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    training_effect: 'none',
    spend_effect: 'none',
    runtime_activation: false,
    selection_effect: 'evidence-only'
  });
}

export function cognitiveCapabilityObservationDigest(document) {
  validateObservationShape(document);
  return digestObject(document);
}

export function resolveCognitiveCapabilityObservation(document, profile) {
  const observation = validateCognitiveCapabilityObservation(document);
  const profileSummary = validateCognitiveCapabilityProfile(profile);
  const profileDigest = cognitiveCapabilityProfileDigest(profile);

  if (document.profile_id !== profile.profile_id) {
    throw new ValidationError('Capability observation profile_id does not match supplied Cognitive Capability Profile');
  }
  if (document.profile_digest !== profileDigest) {
    throw new ValidationError('Capability observation profile_digest does not match supplied Cognitive Capability Profile');
  }
  if (!profile.capabilities.includes(document.capability)) {
    throw new ValidationError('Capability observation capability is not declared by supplied Cognitive Capability Profile');
  }

  return deepFreeze({
    valid: true,
    schema: COGNITIVE_CAPABILITY_OBSERVATION_SCHEMA,
    observation_id: document.observation_id,
    observation_digest: observation.observation_digest,
    profile_id: profile.profile_id,
    profile_digest: profileDigest,
    offering_ref: profileSummary.offering_ref,
    capability: document.capability,
    context: { ...document.context },
    evaluation: { ...document.evaluation },
    result: {
      ...document.result,
      failure_mode_refs: [...document.result.failure_mode_refs]
    },
    evaluator: { ...document.evaluator },
    evidence: { ...document.evidence },
    resource_observations: document.resource_observations.map(item => ({ ...item })),
    observed_at: document.observed_at,
    valid_until: document.valid_until,
    recorded_at: document.recorded_at,
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    training_effect: 'none',
    spend_effect: 'none',
    runtime_activation: false,
    selection_effect: 'evidence-only'
  });
}
```

The internal validator must use exact-object checks for every nested object; bounded sets/enums; paired verification rules; safe-integer resource amounts; canonical timestamps; and a recursive `deepFreeze` only for the resolved output. It must read no wall clock and perform no I/O.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
cd mesh && node --test test/cognitive-capability-observation.test.mjs
```

Expected: all Capability Observation behavioral/resolver tests pass with zero failures.

- [ ] **Step 5: Commit Task 1**

```bash
git add mesh/test/cognitive-capability-observation.test.mjs mesh/src/lib/cognitive-capability-observation.mjs
git commit -m "feat: add capability observation v0"
```

---

### Task 2: JSON Schema 2020-12 parity

**Files:**
- Create: `mesh/test/cognitive-capability-observation-schema.test.mjs`
- Create: `mesh/config/cognitive-capability-observation-v0.schema.json`

**Interfaces:**
- Produces a strict JSON Schema mirror for `axiom-cognitive-capability-observation.v0`.
- Schema annotation `x-axiom-semantic-validator` is exactly `mesh/src/lib/cognitive-capability-observation.mjs`.
- Cross-field semantics remain enforced by the semantic validator and explicitly declared in `x-axiom-semantic-rules`.

- [ ] **Step 1: Write the failing schema-parity test**

Create `mesh/test/cognitive-capability-observation-schema.test.mjs`.

Minimum assertions:

```js
assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
assert.equal(schema.properties.schema.const, 'axiom-cognitive-capability-observation.v0');
assert.equal(schema.properties.version.const, 0);
assert.equal(schema.properties.status.const, 'inert-evidence');
assert.equal(schema.properties.result.$ref, '#/$defs/result');
assert.equal(schema.$defs.result.properties.failure_mode_refs.maxItems, 32);
assert.equal(schema.properties.resource_observations.maxItems, 32);
assert.equal(schema.properties.contains_secret_material.const, false);
assert.equal(schema.properties.authority_effect.const, 'none');
assert.equal(schema.properties.network_effect.const, 'none');
assert.equal(schema.properties.training_effect.const, 'none');
assert.equal(schema.properties.spend_effect.const, 'none');
assert.equal(schema.properties.runtime_activation.const, false);
assert.equal(schema.properties.selection_effect.const, 'evidence-only');
assert.equal(
  schema['x-axiom-semantic-validator'],
  'mesh/src/lib/cognitive-capability-observation.mjs'
);
```

Also assert:

- `additionalProperties:false` at top-level and for `$defs.context`, `$defs.evaluation`, `$defs.result`, `$defs.evaluator`, `$defs.evidence`, `$defs.resourceObservation`;
- capability, difficulty, classification, evaluator-kind, evidence-kind, assurance, resource-class, and resource-basis enum domains exactly match the spec;
- confidence minimum/maximum are `0` and `1`;
- semantic-rule annotations explicitly mention exact profile binding, capability membership, paired verification evidence, signed-evaluation assurance rule, unknown resource null semantics, timestamp ordering, no resource aggregation, and no routing/selection authority;
- non-claims explicitly include global intelligence rank, cross-benchmark comparability, availability proof, routing authority, execution authority, training authority, spend authority, capability promotion, and topology mutation.

- [ ] **Step 2: Run the schema test and verify RED**

Run:

```bash
cd mesh && node --test test/cognitive-capability-observation-schema.test.mjs
```

Expected: FAIL with `ENOENT` because `config/cognitive-capability-observation-v0.schema.json` does not yet exist.

- [ ] **Step 3: Add the strict schema mirror**

Create `mesh/config/cognitive-capability-observation-v0.schema.json` with:

- JSON Schema 2020-12 declaration;
- exact top-level required fields;
- `additionalProperties:false` everywhere;
- shared identifier, nullable identifier, digest, nullable digest, unit, nullable unit definitions;
- exact context/evaluation/result/evaluator/evidence/resource object shapes;
- exact enum domains and bounds from Global Constraints;
- hard boundary constants;
- `x-axiom-semantic-validator`;
- `x-axiom-semantic-rules` documenting cross-field rules not expressible cleanly in the mirror;
- `x-axiom-non-claims` documenting the evidence-only scope.

Do not encode a universal metric value, aggregate score, ranking, routing weight, model invocation instruction, provider credential, or benchmark payload.

- [ ] **Step 4: Run semantic and schema tests and verify GREEN**

Run:

```bash
cd mesh && node --test test/cognitive-capability-observation.test.mjs test/cognitive-capability-observation-schema.test.mjs
```

Expected: all tests pass with zero failures.

- [ ] **Step 5: Commit Task 2**

```bash
git add mesh/test/cognitive-capability-observation-schema.test.mjs mesh/config/cognitive-capability-observation-v0.schema.json
git commit -m "feat: add capability observation schema"
```

---

### Task 3: Canonical documentation registration and repository verification

**Files:**
- Modify: `mesh/src/check-docs.mjs`
- Existing spec: `docs/superpowers/specs/2026-08-31-capability-observation-v0-design.md`
- Existing plan: `docs/superpowers/plans/2026-08-31-capability-observation-v0.md`

**Interfaces:**
- Registers the Capability Observation spec and plan inside the canonical-document integrity boundary.
- Does not change runtime capability status or product-readiness claims.

- [ ] **Step 1: Add only the two Capability Observation documentation paths to `CANONICAL_DOCUMENTS`**

Add exactly:

```text
docs/superpowers/specs/2026-08-31-capability-observation-v0-design.md
docs/superpowers/plans/2026-08-31-capability-observation-v0.md
```

Do not alter existing entries, validation logic, capability status, route lists, production claims, or unrelated documentation rules.

- [ ] **Step 2: Run the focused Capability Observation tests**

Run:

```bash
cd mesh && node --test test/cognitive-capability-observation.test.mjs test/cognitive-capability-observation-schema.test.mjs
```

Expected: zero failures.

- [ ] **Step 3: Run full repository verification**

Run:

```bash
cd mesh && npm run check
```

Expected: zero failures attributable to this branch under the repository-supported Node engine.

- [ ] **Step 4: Review branch diff against the approved design base**

Expected new/modified Capability Observation paths only:

```text
docs/superpowers/specs/2026-08-31-capability-observation-v0-design.md
docs/superpowers/plans/2026-08-31-capability-observation-v0.md
mesh/src/lib/cognitive-capability-observation.mjs
mesh/config/cognitive-capability-observation-v0.schema.json
mesh/test/cognitive-capability-observation.test.mjs
mesh/test/cognitive-capability-observation-schema.test.mjs
mesh/src/check-docs.mjs
```

Confirm no changes to:

```text
mesh/config/capabilities.json
Gateway / Hypervisor / Sandbox / Grid effect paths
provider transports or credentials
Cognitive Capability Profile semantics
Cognitive Availability Attestation semantics
Replacement Fidelity Evaluation semantics
Cognitive Learning Ledger promotion semantics
routing activation or candidate ordering
training/adaptation execution
spend authorization
Cognitive Topology
```

- [ ] **Step 5: Commit Task 3**

```bash
git add mesh/src/check-docs.mjs
git commit -m "chore: register capability observation docs"
```

## Self-review result

- **Spec coverage:** Every v0 invariant maps to Task 1 behavioral/resolver tests, Task 2 schema assertions, or Task 3 repository-boundary verification. Capability Topology aggregation, conflict interpretation, regression detection, routing proposals, routing execution, UI, network ingestion, and benchmark execution remain intentionally deferred.
- **Placeholder scan:** No `TBD`, `TODO`, `implement later`, or undefined implementation placeholders remain in this plan.
- **Type consistency:** `COGNITIVE_CAPABILITY_OBSERVATION_SCHEMA`, `validateCognitiveCapabilityObservation`, `cognitiveCapabilityObservationDigest`, and `resolveCognitiveCapabilityObservation` are named identically throughout the plan and spec. Profile binding uses the existing `validateCognitiveCapabilityProfile` and `cognitiveCapabilityProfileDigest` APIs.
- **Authority consistency:** Every output remains evidence-only. No observation, classification, confidence value, evaluator identity, evidence posture, or resource measurement can select, invoke, train, spend, route, activate, promote, or grant authority.
- **Metric integrity:** Measured metrics remain external content-addressed artifacts; v0 never invents a universal numeric intelligence or benchmark score.
- **Cost integrity:** Resource observations retain amount/unit/basis and never collapse unlike units or monetize privacy/sovereignty/quality.
