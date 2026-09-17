# Canonical Shared Artifact v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement an inert, deterministic Canonical Shared Artifact v0 contract that gives human and agent edits one attributable causal history with explicit conflict and retraction semantics.

**Architecture:** Add one pure validator/digest module beside the existing canonical and Verified Work Graph contracts, plus a strict JSON Schema structural mirror and hostile Node tests. The contract derives current heads and state from topologically ordered revision history and never creates a storage, network, runtime, capability, or authorization path.

**Tech Stack:** Node.js ESM, `node:test`, `node:assert/strict`, existing `mesh/src/lib/canonical.mjs`, JSON Schema Draft 2020-12.

**Spec:** `docs/superpowers/specs/2026-09-17-canonical-shared-artifact-v0-design.md`

## Global Constraints

- Base: `b8a746eace641c1b97ca70163bb030f49ca033f3`.
- `mesh/config/capabilities.json` MUST remain unchanged.
- No Gateway/Hypervisor/Sandbox/Grid route or persistence mutation.
- No automatic conflict winner or last-write-wins rule.
- `authority_effect` and `network_effect` remain `none`; `runtime_activation` remains `false`.
- Human, agent, and service revisions use one revision shape; actor kind never grants authority.
- Authorization evidence is bound as data only; C1 does not verify or grant authorization.
- Optional Verified Work Graph binding is provenance only.
- Unknown fields and unsupported values fail closed.
- Validation is deterministic and must not mutate caller input.

---

### Task 1: Define semantic contract RED-first

**Files:**
- Create: `mesh/test/canonical-shared-artifact.test.mjs`

**Interfaces:**
- Consumes: future `CANONICAL_SHARED_ARTIFACT_SCHEMA`, `canonicalSharedArtifactDigest(document)`, and `validateCanonicalSharedArtifact(document)`.
- Produces: executable behavior requirements for the semantic validator.

- [ ] **Step 1: Write the failing test file**

Create a test fixture with this canonical shape:

```js
function revision(overrides = {}) {
  return {
    revision_id: 'rev:1',
    parents: [],
    operation: 'put',
    actor_principal: 'principal:owner',
    actor_kind: 'human',
    authorization: {
      request_digest: 'a'.repeat(64),
      evidence_ref: 'receipt:1',
      evidence_digest: 'b'.repeat(64)
    },
    payload: 'hello',
    content_digest: digestObject({ content_type: 'text/plain', payload: 'hello' }),
    resolves: [],
    work_graph: null,
    occurred_at: '2026-09-17T16:00:00.000Z',
    ...overrides
  };
}

function validArtifact() {
  return {
    schema: 'axiom-canonical-shared-artifact.v0',
    version: 0,
    status: 'inert-shared-artifact-contract',
    artifact_id: 'artifact:demo',
    owner_ref: 'principal:owner',
    authority_domain: { kind: 'owner', ref: 'principal:owner' },
    content_type: 'text/plain',
    revisions: [revision()],
    current_heads: ['rev:1'],
    state: 'active',
    current_content_digest: digestObject({ content_type: 'text/plain', payload: 'hello' }),
    sharing: { state: 'private', projection_refs: [] },
    created_at: '2026-09-17T16:00:00.000Z',
    updated_at: '2026-09-17T16:00:00.000Z',
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}
```

Import `digestObject` from `../src/lib/canonical.mjs` and the future artifact module.

Required test names:

```text
validates an inert canonical shared artifact
digest is deterministic across object key order
validation does not mutate a deeply frozen artifact
unknown fields fail closed at every contract boundary
content digest must match canonical payload
unsupported content types operations actors and authority domains fail closed
revision identifiers and parent references are bounded and causal
stale-parent edit creates visible concurrent heads
complete resolution names every current head and converges conflict
partial phantom duplicate and unsorted resolution heads fail closed
retraction is a contentless tombstone and remains historical
artifact state and current content digest must match derived heads
sharing projection state is explicit and internally consistent
owner authority domain must match owner reference
authorization evidence is required but grants no authority effect
optional verified-work binding is provenance only
structured JSON payloads are canonical bounded data
timestamps are canonical monotonic and bind artifact boundaries
revision and projection cardinality limits fail closed
validator module imports only canonical helper
```

For stale-parent conflict, use revisions `rev:1 -> rev:2` and then `rev:3` with parent `rev:1`. The declared heads must be `['rev:2', 'rev:3']`, state `conflict`, and current content digest `null`.

For resolution, append `rev:4` with `parents` and `resolves` exactly `['rev:2', 'rev:3']`, `operation: 'resolve'`, and an active payload/digest. The derived sole head becomes `rev:4`.

- [ ] **Step 2: Trigger protected CI and verify RED**

Push only the test plus already-approved design/plan to the isolated branch and open/update a draft PR. Expected failure: `ERR_MODULE_NOT_FOUND` for `../src/lib/canonical-shared-artifact.mjs` in the focused Node test. Record the exact failed workflow/job; do not claim local execution because the current harness has no GitHub DNS.

---

### Task 2: Implement minimal semantic validator

**Files:**
- Create: `mesh/src/lib/canonical-shared-artifact.mjs`
- Test: `mesh/test/canonical-shared-artifact.test.mjs`

**Interfaces:**
- Consumes: `ValidationError`, `assertPlainObject`, `assertString`, `assertStringArray`, `canonicalJson`, and `digestObject` from `./canonical.mjs`.
- Produces:

```js
export const CANONICAL_SHARED_ARTIFACT_SCHEMA = 'axiom-canonical-shared-artifact.v0';
export function validateCanonicalSharedArtifact(document) {}
export function canonicalSharedArtifactDigest(document) {}
```

- [ ] **Step 1: Add exact-shape and scalar helpers**

Use constants:

```js
const VERSION = 0;
const STATUS = 'inert-shared-artifact-contract';
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const CONTENT_TYPES = new Set(['text/plain', 'application/json']);
const OPERATIONS = new Set(['put', 'retract', 'resolve']);
const ACTOR_KINDS = new Set(['human', 'agent', 'service']);
const AUTHORITY_DOMAIN_KINDS = new Set(['owner', 'circle']);
const STATES = new Set(['active', 'conflict', 'retracted']);
const SHARING_STATES = new Set(['private', 'projected']);
```

Implement local helpers for exact fields, identifiers, digests, canonical timestamps, sorted unique identifier arrays, and code-unit comparison.

- [ ] **Step 2: Validate content payloads and deterministic content digests**

For `text/plain`, require a string with at most 65,536 characters.

For `application/json`, require canonical-JSON-compatible plain data by calling `canonicalJson(payload)` and reject if the resulting UTF-8 byte length exceeds 65,536.

For non-retract revisions compute:

```js
const expected = digestObject({ content_type: artifactContentType, payload: revision.payload });
```

Require `revision.content_digest === expected`.

For `retract`, require both `payload` and `content_digest` to be `null`.

- [ ] **Step 3: Validate revision metadata and evidence bindings**

Every revision has exact fields from the spec.

Authorization exact fields:

```js
['request_digest', 'evidence_ref', 'evidence_digest']
```

Require both digests to be 64 lowercase hex and the evidence reference to be a bounded identifier.

Work-graph binding is null or exact fields:

```js
['graph_id', 'graph_digest']
```

Actor kind is descriptive only; do not branch authority behavior on it.

- [ ] **Step 4: Derive causal heads in acceptance order**

Maintain:

```js
const seen = new Set();
const heads = new Set();
```

For each revision in array order:

- reject duplicate IDs;
- every parent must already be in `seen`;
- reject duplicate parents and self-parenting;
- first revision must be `put` with zero parents;
- later non-resolution revisions require exactly one parent and empty `resolves`;
- a normal revision deletes its parent from `heads` only if currently present, then adds itself;
- `resolve` requires at least two current heads and exact sorted equality of `parents`, `resolves`, and the pre-resolution head set; then clear all heads and add the resolution revision;
- add the revision ID to `seen` only after the revision is valid.

This makes an edit from a stale historical parent become a concurrent head instead of silently replacing the newer head.

- [ ] **Step 5: Derive state and artifact boundaries**

Require declared `current_heads` to equal the sorted derived head set.

Derive:

```text
heads > 1 -> conflict/null
one retract head -> retracted/null
one put/resolve head -> active/head content digest
```

Require top-level `state` and `current_content_digest` to match.

Require `created_at` to equal the first revision timestamp and `updated_at` to equal the last revision timestamp. Revision timestamps must be non-decreasing and canonical UTC ISO strings.

- [ ] **Step 6: Validate authority and sharing metadata**

Authority domain exact fields: `kind`, `ref`. `owner` domain must reference `owner_ref`.

Sharing exact fields: `state`, `projection_refs`. Projection refs are sorted, unique, max 64. Private means zero refs; projected means at least one.

Require fixed inert effects:

```js
document.authority_effect === 'none'
document.network_effect === 'none'
document.runtime_activation === false
```

- [ ] **Step 7: Return frozen normalized summary and deterministic digest**

`validateCanonicalSharedArtifact` returns a frozen summary with:

```js
{
  valid: true,
  schema: CANONICAL_SHARED_ARTIFACT_SCHEMA,
  artifact_id,
  owner_ref,
  authority_domain: Object.freeze({ ... }),
  state,
  current_heads: Object.freeze([...]),
  current_content_digest,
  revision_count,
  artifact_digest: digestObject(document),
  authority_effect: 'none',
  network_effect: 'none',
  runtime_activation: false
}
```

`canonicalSharedArtifactDigest(document)` calls validation and returns `digestObject(document)`.

- [ ] **Step 8: Push implementation and verify GREEN**

Expected focused CI result: all `canonical-shared-artifact.test.mjs` semantic tests pass. If unrelated checks fail, separate checker/doc-registration problems from semantic failures and make only the smallest necessary correction.

---

### Task 3: Add strict JSON Schema mirror RED-first

**Files:**
- Create: `mesh/test/canonical-shared-artifact-schema.test.mjs`
- Create: `mesh/config/canonical-shared-artifact-v0.schema.json`

**Interfaces:**
- Consumes: C1 semantic contract.
- Produces: machine-readable structural mirror. The JavaScript validator remains authoritative for causal and digest invariants.

- [ ] **Step 1: Add schema test before schema file**

Test must load:

```js
const schemaUrl = new URL('../config/canonical-shared-artifact-v0.schema.json', import.meta.url);
```

Assert at minimum:

```js
schema.$schema === 'https://json-schema.org/draft/2020-12/schema'
schema.properties.schema.const === 'axiom-canonical-shared-artifact.v0'
schema.properties.version.const === 0
schema.properties.status.const === 'inert-shared-artifact-contract'
schema.properties.authority_effect.const === 'none'
schema.properties.network_effect.const === 'none'
schema.properties.runtime_activation.const === false
schema.properties.revisions.minItems === 1
schema.properties.revisions.maxItems === 256
schema.additionalProperties === false
```

Also verify nested `additionalProperties: false` for revision, authorization, work-graph, authority-domain, and sharing definitions.

- [ ] **Step 2: Trigger CI and verify schema RED**

Expected failure: `ENOENT` for `mesh/config/canonical-shared-artifact-v0.schema.json`.

- [ ] **Step 3: Add Draft 2020-12 structural schema**

Mirror exact field requirements, enums/constants, identifier/digest patterns, array bounds, payload alternatives, and nullability. Use `$defs` for authority domain, authorization evidence, work-graph binding, revision, and sharing.

Do not attempt to express complete-head derivation, stale-parent concurrency, digest recomputation, timestamp monotonicity, or complete conflict resolution in JSON Schema; those remain semantic-validator invariants.

- [ ] **Step 4: Verify schema GREEN**

Expected focused result: schema test passes alongside semantic test.

---

### Task 4: Register docs and run exact-head verification

**Files:**
- Modify: `mesh/src/check-docs.mjs`
- Existing: design, plan, module, schema, and tests from Tasks 1-3.

**Interfaces:**
- Consumes: repository canonical-document checker.
- Produces: exact-head branch suitable for protected CI review.

- [ ] **Step 1: Register C1 design and plan**

Add these exact paths to `CANONICAL_DOCUMENTS` in their matching spec/plan sections:

```text
docs/superpowers/specs/2026-09-17-canonical-shared-artifact-v0-design.md
docs/superpowers/plans/2026-09-17-canonical-shared-artifact-v0.md
```

Do not alter unrelated document registrations.

- [ ] **Step 2: Inspect the exact diff**

Confirm only C1 design/plan/module/schema/tests plus the two documentation-registration lines are changed. Confirm `mesh/config/capabilities.json` is byte-for-byte unchanged.

- [ ] **Step 3: Run protected CI on exact head**

Require the strongest available branch/PR checks, including the repository verify workflow, cross-platform lanes, container/clean-kernel checks, and CodeQL where triggered.

Record exact head SHA and distinguish:

- semantic C1 regressions;
- JSON-schema/check-docs failures;
- platform-specific regressions;
- unrelated pre-existing or infrastructure failures.

- [ ] **Step 4: Complete the draft PR state**

Keep the PR draft until exact-head required checks are green. Update the PR body with actual RED/GREEN evidence, exact head, authority non-claims, and any test limitation. Do not claim a test ran unless GitHub CI or another observed execution actually ran it.

## Plan self-review

- Spec coverage: every C1 requirement is assigned to Tasks 1-4.
- Placeholders: none.
- Type/interface consistency: module, schema, and tests use the same artifact/revision field names and constants.
- Scope: one inert C1 contract only; Axiom One UI, persistence, runtime authorization, sync transport, specialist harnesses, and Circle activation are excluded.
