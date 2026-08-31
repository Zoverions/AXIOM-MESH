# Cognitive Learning Ledger v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement an inert, content-addressed Cognitive Learning Ledger v0 record that preserves learning lineage, placement, reuse, unit-preserving resource-cost observations, separate policy-utility descriptors, evaluation state, and explicit zero-authority boundaries.

**Architecture:** Add one strict semantic validator/digest and one JSON Schema mirror. A learning record binds retained source evidence to one derived artifact, classifies the learning and representation, proposes a cognitive tier, records reuse/cost/utility/evaluation evidence, and remains descriptive only. It performs no model invocation, provider access, network fetch, training, spend authorization, skill activation, routing change, or authority change.

**Tech Stack:** Node.js ESM, `node:test`, `node:assert/strict`, JSON Schema 2020-12, existing `mesh/src/lib/canonical.mjs` primitives.

**Spec:** `docs/superpowers/specs/2026-08-30-cognitive-continuity-learning-economics-design.md`

## Global Constraints

- Schema identifier is exactly `axiom-cognitive-learning-ledger.v0`.
- Version is exactly `0`; status is exactly `inert-contract-laboratory`.
- Every record carries a bounded `learning_record_id`; this per-record validator does not claim global uniqueness across a future persisted collection. A collection/storage layer must enforce uniqueness if and when one is added.
- A record must bind at least one `principal_id` or an exact `composition_id` + `composition_digest` pair.
- Composition identifier and digest are both null or both non-null.
- Source evidence contains `1-64` exact references with 64-hex digests; duplicate evidence refs fail closed.
- A derived artifact is mandatory and contains an exact reference + 64-hex digest.
- Learning classes are exactly `episodic | semantic | procedural | personal | context | adapter | base-model | developmental`.
- Representation classes are exactly `exact-retained | lossy | mixed`.
- `exact-retained` means byte/content identity relative to a retained source artifact, not complete capture of external reality; its derived digest must equal at least one source-evidence digest.
- Cognitive tiers are exactly `active-context | retrievable-memory | semantic-consolidation | skill-workflow | adapter-specialist | identity-kernel | foundation-training`.
- Promotion states are exactly `observed | candidate | evaluated | accepted | rejected | superseded | rolled-back`.
- `evaluated` and `accepted` promotion states require at least one explicit evaluation-evidence reference; evidence may support a promotion decision but does not itself grant authority or perform activation.
- `foundation-training` may be represented as a proposed target for research/economic accounting, but Cognitive Learning Ledger v0 cannot mark that target `accepted`; foundation-training remains outside personal-agent self-promotion authority.
- Expected-reuse class is exactly `one-shot | occasional | recurring | frequent | unknown`; numeric estimates are optional bounded safe integers, but `unknown` cannot carry a numeric estimate.
- Resource costs remain unit-preserving observations. Cost classes are exactly `create | validate | store | maintain | migrate | risk-resource | per-use`; bases are exactly `observed | estimated | unknown`.
- Known cost observations require a non-negative safe-integer `amount` and bounded unit identifier. Unknown cost observations require `amount:null` and `unit:null`.
- Resource cost and policy utility remain separate. No implicit conversion between money/tokens/compute/storage and privacy/sovereignty/latency/quality/resilience is permitted.
- Policy-utility descriptors are exactly `negative | neutral | positive | unknown` for `privacy`, `sovereignty`, `latency`, `quality`, and `resilience`.
- Evaluation evidence uses exact refs + digests. Any `identity-kernel` target requires at least two explicit evaluation-evidence references.
- Predecessor/successor learning-record references are inert identifiers only; duplicate lineage refs fail closed and a record cannot reference itself.
- Timestamps are canonical ISO timestamps and `updated_at` cannot precede `created_at`.
- Documents contain no raw credentials, secrets, provider tokens, cookies, vault keys, model bytes, executable code, or training payloads.
- `contains_secret_material` is exactly `false`.
- `authority_effect`, `network_effect`, `training_effect`, and `spend_effect` are exactly `none`; `runtime_activation` is exactly `false`.
- No Gateway, Hypervisor, Sandbox, Grid, provider transport, routing, capability-registry status, adaptation engine, model loading, skill activation, credential behavior, or spend behavior changes.

---

### Task 1: Cognitive Learning Ledger semantic validator and digest

**Files:**
- Create: `mesh/test/cognitive-learning-ledger.test.mjs`
- Create: `mesh/test/cognitive-learning-ledger-promotion.test.mjs`
- Create: `mesh/src/lib/cognitive-learning-ledger.mjs`

**Interfaces:**
- Consumes: `digestObject`, `ValidationError` from `./canonical.mjs`.
- Produces: `COGNITIVE_LEARNING_LEDGER_SCHEMA`, `validateCognitiveLearningRecord(document)`, `cognitiveLearningRecordDigest(document)`.
- `validateCognitiveLearningRecord` returns a frozen descriptive summary only.

- [ ] **Step 1: Write the failing behavioral tests**

Create `mesh/test/cognitive-learning-ledger.test.mjs` with one valid fixture and prove:

1. a valid record validates and produces a deterministic 64-hex digest;
2. object-key order does not change the record digest;
3. unknown and credential-like fields fail closed at top-level and nested levels;
4. malformed/noncanonical timestamps and invalid enums fail closed;
5. at least one principal or exact composition binding is required, and composition id/digest nullability is paired;
6. source evidence requires `1-64` entries and duplicate evidence refs fail closed;
7. exact-retained representation requires the derived artifact digest to match at least one retained source digest, while lossy/mixed representations may differ;
8. `unknown` expected reuse rejects a numeric estimate and numeric reuse estimates are bounded safe integers;
9. known cost observations require non-negative safe-integer amount + unit while unknown observations require null amount/unit;
10. resource-cost observations and policy utility remain separate fields with no aggregate score;
11. invalid policy-utility descriptors fail closed;
12. identity-kernel target proposals require at least two explicit evaluation evidence refs;
13. duplicate evaluation refs and duplicate lineage refs fail closed;
14. predecessor/successor refs cannot self-reference the current learning record;
15. boundary constants remain exactly no-secret/no-authority/no-network/no-training/no-spend/no-runtime-activation;
16. validator does not mutate a deeply frozen input;
17. production module imports only `./canonical.mjs`.

Create `mesh/test/cognitive-learning-ledger-promotion.test.mjs` and separately prove:

1. `candidate` may remain unevaluated;
2. `evaluated` and `accepted` fail closed without explicit evaluation evidence and validate when evidence is present;
3. `foundation-training` may remain a proposal/candidate but cannot be `accepted` by Ledger v0.

Representative validation summary:

```js
{
  valid: true,
  schema: 'axiom-cognitive-learning-ledger.v0',
  learning_record_id: 'learning.project.context.v1',
  principal_id: 'agent.personal.primary',
  composition_id: 'composition.personal.primary',
  record_digest: '<64 hex>',
  learning_class: 'semantic',
  representation_class: 'lossy',
  current_tier: 'retrievable-memory',
  proposed_target_tier: 'semantic-consolidation',
  promotion_state: 'evaluated',
  source_evidence: 1,
  resource_cost_observations: 2,
  known_resource_cost_observations: 1,
  unknown_resource_cost_observations: 1,
  evaluation_evidence: 1,
  contains_secret_material: false,
  authority_effect: 'none',
  network_effect: 'none',
  training_effect: 'none',
  spend_effect: 'none',
  runtime_activation: false
}
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
cd mesh && node --test test/cognitive-learning-ledger.test.mjs test/cognitive-learning-ledger-promotion.test.mjs
```

Expected during initial construction: FAIL until the production module and promotion semantics exist.

- [ ] **Step 3: Implement the minimal strict validator/digest**

Create `mesh/src/lib/cognitive-learning-ledger.mjs`.

Required public API:

```js
export const COGNITIVE_LEARNING_LEDGER_SCHEMA = 'axiom-cognitive-learning-ledger.v0';
export function validateCognitiveLearningRecord(document) { /* pure strict validation */ }
export function cognitiveLearningRecordDigest(document) { /* validate then digestObject */ }
```

Top-level exact fields:

```text
schema
version
status
learning_record_id
principal_id
composition_id
composition_digest
source_evidence
derived_artifact
learning_class
representation_class
current_tier
proposed_target_tier
proposal_reason
expected_reuse
resource_costs
policy_utility
evaluation_evidence
promotion_state
predecessor_records
successor_records
created_at
updated_at
contains_secret_material
authority_effect
network_effect
training_effect
spend_effect
runtime_activation
```

Source/evaluation evidence exact fields:

```text
ref
digest
evidence_class   # source evidence only
```

Derived artifact exact fields:

```text
ref
digest
```

Expected reuse exact fields:

```text
class
estimated_uses
```

Resource-cost exact fields:

```text
cost_class
basis
amount
unit
source_ref
```

Policy utility exact fields:

```text
privacy
sovereignty
latency
quality
resilience
```

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run:

```bash
cd mesh && node --test test/cognitive-learning-ledger.test.mjs test/cognitive-learning-ledger-promotion.test.mjs
```

Expected: all tests pass with zero failures.

- [ ] **Step 5: Commit Task 1**

```bash
git add mesh/test/cognitive-learning-ledger.test.mjs mesh/test/cognitive-learning-ledger-promotion.test.mjs mesh/src/lib/cognitive-learning-ledger.mjs
git commit -m "feat: add cognitive learning ledger v0"
```

---

### Task 2: JSON Schema parity

**Files:**
- Create: `mesh/test/cognitive-learning-ledger-schema.test.mjs`
- Create: `mesh/config/cognitive-learning-ledger-v0.schema.json`

**Interfaces:**
- Produces a JSON Schema 2020-12 mirror of the semantic validator.
- Schema carries `x-axiom-semantic-validator: "mesh/src/lib/cognitive-learning-ledger.mjs"`.

- [ ] **Step 1: Write the failing schema-parity test**

Assert at minimum:

```js
assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
assert.equal(schema.properties.schema.const, 'axiom-cognitive-learning-ledger.v0');
assert.equal(schema.properties.version.const, 0);
assert.equal(schema.properties.status.const, 'inert-contract-laboratory');
assert.equal(schema.properties.source_evidence.minItems, 1);
assert.equal(schema.properties.source_evidence.maxItems, 64);
assert.equal(schema.properties.contains_secret_material.const, false);
assert.equal(schema.properties.authority_effect.const, 'none');
assert.equal(schema.properties.network_effect.const, 'none');
assert.equal(schema.properties.training_effect.const, 'none');
assert.equal(schema.properties.spend_effect.const, 'none');
assert.equal(schema.properties.runtime_activation.const, false);
assert.equal(schema['x-axiom-semantic-validator'], 'mesh/src/lib/cognitive-learning-ledger.mjs');
```

Also assert `additionalProperties:false` at top-level and in every nested object. Assert semantic-rule annotations cover principal/composition binding, exact-retained digest identity, cost-basis rules, identity-kernel evaluation burden, evaluated/accepted evidence burden, foundation-training non-acceptance, duplicate refs, and self-lineage rejection. Assert non-claims include authority grant, network fetch, provider/model invocation, training/adaptation execution, spend authorization, skill/model activation, routing mutation, and truth/subjective-identity proof.

- [ ] **Step 2: Run schema test and verify RED**

Run:

```bash
cd mesh && node --test test/cognitive-learning-ledger-schema.test.mjs
```

Expected during initial construction: FAIL until `config/cognitive-learning-ledger-v0.schema.json` exists and mirrors the semantic rules.

- [ ] **Step 3: Add the strict JSON Schema mirror**

Create `mesh/config/cognitive-learning-ledger-v0.schema.json` with exact required fields, enum domains, bounds, nullable binding/cost fields, boundary constants, and semantic annotations matching Task 1.

Cross-field and duplicate-reference rules remain enforced by the semantic validator and are declared in `x-axiom-semantic-rules`.

- [ ] **Step 4: Run schema and semantic tests**

```bash
cd mesh && node --test test/cognitive-learning-ledger-schema.test.mjs test/cognitive-learning-ledger.test.mjs test/cognitive-learning-ledger-promotion.test.mjs
```

Expected: all tests pass.

- [ ] **Step 5: Commit Task 2**

```bash
git add mesh/test/cognitive-learning-ledger-schema.test.mjs mesh/config/cognitive-learning-ledger-v0.schema.json
git commit -m "feat: add cognitive learning ledger schema"
```

---

### Task 3: Canonical documentation registration and repository verification

**Files:**
- Modify: `mesh/src/check-docs.mjs`
- Existing new design: `docs/superpowers/specs/2026-08-30-cognitive-continuity-learning-economics-design.md`
- Existing new plan: `docs/superpowers/plans/2026-08-30-cognitive-learning-ledger-v0.md`

**Interfaces:**
- Registers the CCLE design and executable-slice plan in the canonical-document integrity boundary.
- Does not change capability registry status or product/production claims.

- [ ] **Step 1: Add only the two new paths to `CANONICAL_DOCUMENTS`**

Add:

```text
docs/superpowers/specs/2026-08-30-cognitive-continuity-learning-economics-design.md
docs/superpowers/plans/2026-08-30-cognitive-learning-ledger-v0.md
```

Do not alter capability status, production readiness, route lists, or unrelated documentation requirements.

- [ ] **Step 2: Run focused tests**

```bash
cd mesh && node --test test/cognitive-learning-ledger.test.mjs test/cognitive-learning-ledger-promotion.test.mjs test/cognitive-learning-ledger-schema.test.mjs
```

Expected: zero failures.

- [ ] **Step 3: Run full current verification**

Run:

```bash
cd mesh && npm run check
```

Expected: zero failures attributable to this branch under a supported Node engine (`>=22.23.2 <23 || >=24.14.0 <25`).

- [ ] **Step 4: Review diff against `main`**

Expected intended paths only:

```text
docs/superpowers/specs/2026-08-30-cognitive-continuity-learning-economics-design.md
docs/superpowers/plans/2026-08-30-cognitive-learning-ledger-v0.md
mesh/src/lib/cognitive-learning-ledger.mjs
mesh/config/cognitive-learning-ledger-v0.schema.json
mesh/test/cognitive-learning-ledger.test.mjs
mesh/test/cognitive-learning-ledger-promotion.test.mjs
mesh/test/cognitive-learning-ledger-schema.test.mjs
mesh/src/check-docs.mjs
```

Confirm no changes to:

```text
mesh/config/capabilities.json
Gateway / Hypervisor / Sandbox / Grid effect paths
provider transports or credentials
routing activation
training/adaptation execution
spend authorization
production-promotion state
```

- [ ] **Step 5: Commit Task 3**

```bash
git add mesh/src/check-docs.mjs
git commit -m "chore: register cognitive learning docs"
```

## Self-review result

- Spec coverage: Learning Ledger v0 invariants are mapped to behavioral or schema tests; later Capability Observation, Cost Observation, Reuse Report, Placement Recommendation, consolidation, routing, adaptation, TTT, and UI work remain deliberately outside this slice.
- Promotion integrity: evaluation evidence is required before `evaluated` or `accepted`; `foundation-training` cannot be accepted through personal-agent Ledger v0; neither rule grants activation authority.
- Scope: one inert evidence contract; no network, authority, provider, model, training, routing, skill activation, or spend behavior is included.
- Type consistency: field names and enum domains are identical across the spec interpretation, plan, validator target, summary target, and schema target.
- Cost integrity: resource observations retain amount/unit/basis and never silently collapse into policy utility.
- Exactness integrity: `exact-retained` proves only content identity to retained source evidence, not completeness or objective truth.
- Placeholder scan: no TBD/TODO implementation placeholders are required for this slice.
