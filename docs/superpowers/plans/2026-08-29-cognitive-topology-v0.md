# Cognitive Topology v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement an inert, content-addressed Cognitive Topology v0 contract that binds model relationships and persistence dependencies to one exact Agent Composition without activating models or widening authority.

**Architecture:** Add one strict semantic validator/digest/resolver and one JSON Schema mirror. The topology references only models already declared in Agent Composition v0, records orthogonal engagement/custody/access/weight/persistence/importance fields, and returns a descriptive dependency summary. Existing Agent Composition v0 and Self Bundle v0 remain unchanged.

**Tech Stack:** Node.js ESM, `node:test`, `node:assert/strict`, JSON Schema 2020-12, existing `mesh/src/lib/canonical.mjs` and `mesh/src/lib/agent-composition.mjs` primitives.

**Spec:** `docs/superpowers/specs/2026-08-29-cognitive-topology-identity-kernel-design.md`

## Global Constraints

- Schema identifier is exactly `axiom-cognitive-topology.v0`.
- Version is exactly `0`; status is exactly `inert-contract-laboratory`.
- The topology binds exact `composition_id` + `composition_digest`.
- Every topology node must reference a model already declared in the bound Agent Composition.
- Duplicate `node_id` or duplicate `model_id` entries fail closed.
- Engagement values are exactly `ephemeral | session | persistent | primary`.
- Topology roles are exactly `augmentation | primary-embodiment | identity-kernel | router | evaluator`.
- Access modes are exactly `api | local-runtime | remote-runtime | hybrid`.
- Custody values are exactly `provider-controlled | owner-local | owner-remote | shared`.
- Weight states are exactly `closed | open-remote | open-acquired | local-proprietary | not-applicable`.
- `open-acquired` and `local-proprietary` require a 64-hex artifact digest; all other weight states require `artifact_digest: null`.
- Persistence modes are exactly `none | local | provider-bound | mirrored`.
- Provider-bound/mirrored persistence requires non-null `provider_id` and `state_ref`; none/local requires `provider_id: null`; none requires `state_ref: null`.
- Persistence exportability is exactly `none | partial | full | unknown`.
- Continuity/fidelity importance is exactly `optional | important | critical`.
- An `identity-kernel` node cannot use `engagement: ephemeral`.
- Adaptation/lineage/transition references are inert identifiers only.
- Topology documents contain no raw credentials, secrets, provider tokens, cookies, vault keys, model bytes, or executable runtime code.
- `contains_secret_material` is exactly `false`.
- `authority_effect` and `network_effect` are exactly `none`; `runtime_activation` is exactly `false`.
- No Gateway, Hypervisor, Sandbox, Grid, capability-registry, provider transport, model loading, training, or credential behavior changes.

---

### Task 1: Cognitive Topology semantic validator, digest, and composition resolver

**Files:**
- Create: `mesh/test/cognitive-topology.test.mjs`
- Create: `mesh/src/lib/cognitive-topology.mjs`

**Interfaces:**
- Consumes: `digestObject`, `ValidationError` from `./canonical.mjs`; `validateAgentComposition`, `agentCompositionDigest` from `./agent-composition.mjs`.
- Produces: `COGNITIVE_TOPOLOGY_SCHEMA`, `validateCognitiveTopology(document)`, `cognitiveTopologyDigest(document)`, `resolveCognitiveTopology(document, composition)`.
- `validateCognitiveTopology` returns a frozen validation summary with no authority/runtime effect.
- `resolveCognitiveTopology` returns a frozen descriptive dependency summary only.

- [ ] **Step 1: Write the failing behavioral test**

Create `mesh/test/cognitive-topology.test.mjs` with an existing-style valid Agent Composition fixture and a valid topology fixture. Tests must prove:

1. a valid topology validates and produces a deterministic digest;
2. object-key order does not change the topology digest;
3. unknown fields, credential-like injected fields, malformed timestamps, invalid enums, duplicate `node_id`, and duplicate `model_id` fail closed;
4. `open-acquired` and `local-proprietary` require a digest while closed/open-remote/not-applicable reject a non-null digest;
5. provider-bound and mirrored persistence require `provider_id` + `state_ref`;
6. none/local persistence reject a provider identifier and none rejects a state reference;
7. `identity-kernel + ephemeral` fails closed while persistent/primary identity-kernel declarations are allowed;
8. resolver rejects a composition identifier mismatch;
9. resolver rejects a composition digest mismatch;
10. resolver rejects a topology model absent from the composition;
11. resolver returns deterministic counts for total nodes, engagement classes, provider-bound persistence, owner-controlled custody, identity kernels, primary embodiments, critical continuity dependencies, and critical fidelity dependencies;
12. validator/resolver do not mutate deeply frozen input;
13. production module imports only `./canonical.mjs` and `./agent-composition.mjs`;
14. authority boundary remains exactly no-secret/no-authority/no-network/no-runtime-activation.

Representative expected resolver summary:

```js
{
  valid: true,
  schema: 'axiom-cognitive-topology.v0',
  topology_id: 'topology.personal.primary',
  composition_id: 'composition.personal.primary',
  composition_digest: '<64 hex>',
  topology_digest: '<64 hex>',
  models: 3,
  engagements: {
    ephemeral: 1,
    session: 0,
    persistent: 1,
    primary: 1
  },
  provider_bound_persistence: 1,
  owner_controlled_custody: 2,
  identity_kernels: 1,
  primary_embodiments: 1,
  critical_continuity_dependencies: 1,
  critical_fidelity_dependencies: 2,
  contains_secret_material: false,
  authority_effect: 'none',
  network_effect: 'none',
  runtime_activation: false
}
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
cd mesh && node --test test/cognitive-topology.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` because `../src/lib/cognitive-topology.mjs` does not exist.

- [ ] **Step 3: Implement the minimal strict validator/resolver**

Create `mesh/src/lib/cognitive-topology.mjs`.

Use exact-object validation, bounded arrays, canonical timestamps, identifier/digest helpers, and deterministic frozen summaries consistent with `agent-composition.mjs`.

Required public API:

```js
export const COGNITIVE_TOPOLOGY_SCHEMA = 'axiom-cognitive-topology.v0';
export function validateCognitiveTopology(document) { /* pure strict validation */ }
export function cognitiveTopologyDigest(document) { /* validate then digestObject */ }
export function resolveCognitiveTopology(document, composition) { /* validate exact binding + summarize */ }
```

Top-level exact fields:

```text
schema
version
status
topology_id
composition_id
composition_digest
nodes
created_at
updated_at
contains_secret_material
authority_effect
network_effect
runtime_activation
```

Each node exact fields:

```text
node_id
model_id
engagement
topology_role
access_mode
custody
weights
persistence
continuity_importance
fidelity_importance
adaptation_authorization_ref
lineage_ref
transition_policy_ref
```

`weights` exact fields:

```text
state
artifact_digest
licence_ref
```

`persistence` exact fields:

```text
mode
provider_id
state_ref
exportability
```

Array bound: `nodes` contains `0-64` entries.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
cd mesh && node --test test/cognitive-topology.test.mjs
```

Expected: all tests pass with zero failures.

- [ ] **Step 5: Commit Task 1**

```bash
git add mesh/test/cognitive-topology.test.mjs mesh/src/lib/cognitive-topology.mjs
git commit -m "feat: add cognitive topology v0 validator"
```

---

### Task 2: JSON Schema parity

**Files:**
- Create: `mesh/test/cognitive-topology-schema.test.mjs`
- Create: `mesh/config/cognitive-topology-v0.schema.json`

**Interfaces:**
- Produces a JSON Schema 2020-12 mirror of the semantic validator.
- Schema carries `x-axiom-semantic-validator: "mesh/src/lib/cognitive-topology.mjs"`.

- [ ] **Step 1: Write the failing schema-parity test**

Create `mesh/test/cognitive-topology-schema.test.mjs` and assert:

```js
assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
assert.equal(schema.properties.schema.const, 'axiom-cognitive-topology.v0');
assert.equal(schema.properties.version.const, 0);
assert.equal(schema.properties.status.const, 'inert-contract-laboratory');
assert.equal(schema.properties.nodes.maxItems, 64);
assert.equal(schema.properties.contains_secret_material.const, false);
assert.equal(schema.properties.authority_effect.const, 'none');
assert.equal(schema.properties.network_effect.const, 'none');
assert.equal(schema.properties.runtime_activation.const, false);
assert.equal(schema['x-axiom-semantic-validator'], 'mesh/src/lib/cognitive-topology.mjs');
```

Also assert `additionalProperties:false` at top-level and in node/weights/persistence objects, and assert the schema non-claims include authority grant, runtime activation, model invocation, training/adaptation execution, provider persistence availability, and subjective identity proof.

- [ ] **Step 2: Run schema test and verify RED**

Run:

```bash
cd mesh && node --test test/cognitive-topology-schema.test.mjs
```

Expected: FAIL because `config/cognitive-topology-v0.schema.json` does not exist.

- [ ] **Step 3: Add the strict JSON Schema mirror**

Create `mesh/config/cognitive-topology-v0.schema.json` with exact required fields, enum domains, nullable refs/digests, array bounds, and boundary constants matching Task 1.

Cross-field weight/persistence and identity-kernel rules remain enforced by the semantic validator and are described in the schema's `x-axiom-semantic-rules` list.

- [ ] **Step 4: Run schema and semantic tests**

Run:

```bash
cd mesh && node --test test/cognitive-topology-schema.test.mjs test/cognitive-topology.test.mjs
```

Expected: all tests pass.

- [ ] **Step 5: Commit Task 2**

```bash
git add mesh/test/cognitive-topology-schema.test.mjs mesh/config/cognitive-topology-v0.schema.json
git commit -m "feat: add cognitive topology v0 schema"
```

---

### Task 3: Canonical documentation registration and exact verification

**Files:**
- Modify: `mesh/src/check-docs.mjs`
- Existing new docs: `docs/superpowers/specs/2026-08-29-cognitive-topology-identity-kernel-design.md`
- Existing new docs: `docs/superpowers/plans/2026-08-29-cognitive-topology-v0.md`

**Interfaces:**
- Registers the approved design/plan in the repository's canonical-document integrity boundary.
- Does not change any capability status or product/production claim.

- [ ] **Step 1: Run the current documentation/full verification before changing the docs guard**

Run the repository's normal `verify` command from `mesh` after Tasks 1-2.

Expected: documentation integrity fails only because the two new normative Markdown files are not yet registered, while the focused topology tests remain green.

- [ ] **Step 2: Add only the two new paths to `CANONICAL_DOCUMENTS`**

Add:

```text
docs/superpowers/specs/2026-08-29-cognitive-topology-identity-kernel-design.md
docs/superpowers/plans/2026-08-29-cognitive-topology-v0.md
```

Do not alter capability registry, status claims, route lists, production readiness, or unrelated canonical-document requirements.

- [ ] **Step 3: Run focused tests**

```bash
cd mesh && node --test test/cognitive-topology.test.mjs test/cognitive-topology-schema.test.mjs
```

Expected: zero failures.

- [ ] **Step 4: Run full current verification**

Run the same `verify` command used by protected CI.

Expected: zero failures attributable to this branch.

- [ ] **Step 5: Review diff against `main`**

Expected intended paths only:

```text
docs/superpowers/specs/2026-08-29-cognitive-topology-identity-kernel-design.md
docs/superpowers/plans/2026-08-29-cognitive-topology-v0.md
mesh/src/lib/cognitive-topology.mjs
mesh/config/cognitive-topology-v0.schema.json
mesh/test/cognitive-topology.test.mjs
mesh/test/cognitive-topology-schema.test.mjs
mesh/src/check-docs.mjs
```

Confirm no changes to:

```text
mesh/config/capabilities.json
Gateway / Hypervisor / Sandbox / Grid effect path
principal / credential stores
service-network policy
production-promotion state
```

- [ ] **Step 6: Commit Task 3**

```bash
git add mesh/src/check-docs.mjs
git commit -m "chore: register cognitive topology docs"
```

## Self-review result

- Spec coverage: all Cognitive Topology v0 invariants are mapped to behavioral or schema tests.
- Scope: one inert contract/resolver slice; no model runtime, adaptation engine, provider persistence synchronization, or UI work is included.
- Type consistency: field names and enums are identical across spec, plan, validator target, resolver target, and schema target.
- Placeholder scan: no TBD/TODO implementation placeholders are required for this slice.
