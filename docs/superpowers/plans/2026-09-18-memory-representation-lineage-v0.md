# Memory Representation and Lineage v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pure, fail-closed representation-neutral memory lineage contract with no Grid, network, capability, provider, or authority changes.

**Architecture:** Implement one focused library containing validators for logical memory entities, representations, and representation transitions. The validators operate only on caller-supplied plain records, return deterministic evidence summaries/digests, and enforce fixed inert safety fields. Tests drive the contract first; existing `memory_objects`, actions, storage, exports, and applications remain untouched.

**Tech Stack:** Node.js ESM, `node:test`, existing `mesh/src/lib/canonical.mjs` helpers, zero new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-18-memory-representation-lineage-v0-design.md`

## Global Constraints

- Base revision is `931e9a7a753ce5924c498d022c686d16092c2251`.
- No new Gateway route, Sandbox action, Grid table, provider call, persistence path, network path, credential path, or capability-registry claim.
- Every validated document fixes `authority_effect` to `none`, `network_effect` to `none`, and `runtime_activation` to `false`.
- Existing `memory.put`, `memory.link`, `memory.tombstone`, selective export, Axiom One Vault, Education memory, and semantic-context behavior remain unchanged.
- Formats remain open-ended strings; the v0 contract must not hard-code current storage technologies as the only allowed representations.
- Derived representations cannot claim authoritative purposes without an explicit promotion receipt reference.
- No third-party runtime dependency may be added.

---

### Task 1: Add RED contract tests

**Files:**
- Create: `mesh/test/memory-representation-lineage.test.mjs`

**Interfaces:**
- Consumes: future exports from `../src/lib/memory-representation-lineage.mjs`.
- Produces: executable behavior contract for `validateMemoryEntity`, `validateMemoryRepresentation`, and `validateMemoryTransition`.

- [ ] **Step 1: Write a dynamic loader that fails as an assertion while the production module is absent**

```js
async function loadSubject() {
  try {
    return await import('../src/lib/memory-representation-lineage.mjs');
  } catch {
    return null;
  }
}
```

Each test begins with:

```js
const subject = await loadSubject();
assert.ok(subject, 'memory representation lineage module must exist');
```

This ensures the RED phase is an intentional assertion failure rather than an uncaught module-resolution error.

- [ ] **Step 2: Add a valid entity fixture with more than one representation and no canonical-representation field**

```js
const entity = {
  schema: 'axiom-memory-entity.v0',
  version: 0,
  status: 'inert-lineage-contract',
  memory_id: 'memory.entity.preference.communication',
  owner: 'human:owner',
  provenance_refs: ['event:conversation:1'],
  representation_refs: ['repr:text:1', 'repr:image-compaction:1'],
  created_at: '2026-09-18T14:00:00.000Z',
  authority_effect: 'none',
  network_effect: 'none',
  runtime_activation: false
};
```

Assert validation succeeds and returns a 64-hex `document_digest`.

- [ ] **Step 3: Add entity rejection tests**

Reject:
- duplicate `provenance_refs`;
- duplicate `representation_refs`;
- an unknown field such as `canonical_representation_id`;
- any widened safety field.

- [ ] **Step 4: Add representation fixtures**

Source representation:

```js
{
  schema: 'axiom-memory-representation.v0',
  version: 0,
  status: 'inert-lineage-contract',
  representation_id: 'repr:text:1',
  memory_id: 'memory.entity.preference.communication',
  owner: 'human:owner',
  format: 'text.utf8',
  content_digest: 'a'.repeat(64),
  derived_from: [],
  fidelity: 'exact',
  recoverability: {
    byte: true,
    semantic: true,
    provenance: true,
    relationship: true,
    operational: true,
    identity: true
  },
  created_by: 'human:owner',
  created_at: '2026-09-18T14:00:00.000Z',
  retention_class: 'durable-source',
  authoritative_for: ['history', 'recovery'],
  promotion_receipt_ref: null,
  authority_effect: 'none',
  network_effect: 'none',
  runtime_activation: false
}
```

Derived microfont representation changes `format` to `image.microfont-context`, `derived_from` to `['repr:text:1']`, fidelity to `lossy-source-retained`, and starts with no authoritative scopes.

- [ ] **Step 5: Add representation rejection tests**

Reject:
- duplicate parent refs;
- invalid digest;
- unknown fidelity;
- a derived representation with non-empty `authoritative_for` and null `promotion_receipt_ref`;
- widened safety fields;
- unknown fields.

- [ ] **Step 6: Add transition fixtures**

Valid compression:

```js
{
  schema: 'axiom-memory-transition.v0',
  version: 0,
  status: 'inert-lineage-contract',
  transition_id: 'transition:compress:1',
  memory_id: 'memory.entity.preference.communication',
  owner: 'human:owner',
  operation: 'compress',
  source_representation_ids: ['repr:text:1'],
  destination_representation_ids: ['repr:image-compaction:1'],
  actor: 'agent:local-maintainer',
  purpose: 'Reduce active model-context cost while retaining the source',
  fidelity: 'lossy-source-retained',
  source_retained: true,
  information_discarded: 'surface formatting and tokenization details',
  recoverability_before: {
    byte: true, semantic: true, provenance: true,
    relationship: true, operational: true, identity: true
  },
  recoverability_after: {
    byte: true, semantic: true, provenance: true,
    relationship: true, operational: true, identity: true
  },
  promotion_scopes: [],
  occurred_at: '2026-09-18T14:01:00.000Z',
  authority_effect: 'none',
  network_effect: 'none',
  runtime_activation: false
}
```

- [ ] **Step 7: Add transition rejection tests**

Reject:
- same representation in source and destination;
- `observe` with a source;
- `observe` without a destination;
- ordinary transform without source or destination;
- `promote` without `promotion_scopes`;
- non-`promote` transition with promotion scopes;
- `forget` without source;
- `forget` with fidelity other than `not-applicable`;
- terminal loss with `source_retained=false`, blank discarded-information text, or `recoverability_after.byte=true`;
- widened safety fields;
- unknown fields.

- [ ] **Step 8: Push the RED test-only commit and verify the relevant CI/test job fails because the module does not exist**

Expected failure contains the assertion text:

`memory representation lineage module must exist`

Do not write production code before this failure is observed.

---

### Task 2: Implement the minimal pure validators

**Files:**
- Create: `mesh/src/lib/memory-representation-lineage.mjs`
- Test: `mesh/test/memory-representation-lineage.test.mjs`

**Interfaces:**
- Produces:
  - `MEMORY_ENTITY_SCHEMA`
  - `MEMORY_REPRESENTATION_SCHEMA`
  - `MEMORY_TRANSITION_SCHEMA`
  - `validateMemoryEntity(document)`
  - `validateMemoryRepresentation(document)`
  - `validateMemoryTransition(document)`

All validators return:

```js
Object.freeze({
  valid: true,
  schema: document.schema,
  document_digest: digestObject(document),
  authority_effect: 'none',
  network_effect: 'none',
  runtime_activation: false
})
```

- [ ] **Step 1: Import only existing canonical helpers**

```js
import { digestObject, ValidationError } from './canonical.mjs';
```

No new dependencies.

- [ ] **Step 2: Implement exact-object, identifier, digest, timestamp, unique-array, and recoverability helpers**

Use strict plain-object validation and reject unknown or missing fields.

Identifier pattern:

```js
/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/
```

Digest pattern:

```js
/^[a-f0-9]{64}$/
```

Recoverability must contain exactly the six boolean fields defined by the spec.

- [ ] **Step 3: Implement `validateMemoryEntity`**

Require exact fields:

```text
schema
version
status
memory_id
owner
provenance_refs
representation_refs
created_at
authority_effect
network_effect
runtime_activation
```

Require one or more provenance refs and one or more representation refs, each unique.

- [ ] **Step 4: Implement `validateMemoryRepresentation`**

Require exact fields from the spec.

Allow any `format` matching:

```js
/^[a-z0-9][a-z0-9._:-]{0,127}$/
```

Fidelity set:

```text
exact
semantic
lossy-source-retained
lossy-terminal
```

Authoritative-purpose set:

```text
history
signature-verification
human-display
semantic-retrieval
model-context
export
recovery
```

If `derived_from.length > 0 && authoritative_for.length > 0`, require a non-null valid `promotion_receipt_ref`.

- [ ] **Step 5: Implement `validateMemoryTransition`**

Operation set:

```text
observe derive summarize compress encode project merge split correct
supersede retract archive rehydrate forget redact promote demote
```

Transition fidelity set adds `not-applicable`.

Cardinality rules:
- `observe`: zero sources, at least one destination.
- `forget`: at least one source; destination count may be zero.
- every other operation: at least one source and at least one destination.
- no ID may appear in both source and destination sets.

Promotion rules:
- `promote`: non-empty unique valid `promotion_scopes`.
- every other operation: empty `promotion_scopes`.

Loss rules:
- `forget` requires `fidelity='not-applicable'`.
- `lossy-terminal` plus `source_retained=false` requires non-blank `information_discarded` and `recoverability_after.byte=false`.
- `forget` with no destination requires non-blank `information_discarded`.

- [ ] **Step 6: Enforce inert safety fields in all three validators**

Any value other than:

```js
authority_effect: 'none'
network_effect: 'none'
runtime_activation: false
```

throws `ValidationError`.

- [ ] **Step 7: Run the focused test suite**

Run:

```bash
node --test --test-reporter=spec test/memory-representation-lineage.test.mjs
```

Expected: all focused tests pass.

- [ ] **Step 8: Run the complete kernel test suite**

Run:

```bash
npm test
```

Expected: all tests pass with no warnings introduced by this slice.

---

### Task 3: Register the canonical documentation boundary

**Files:**
- Modify: `mesh/src/check-docs.mjs`

**Interfaces:**
- Consumes the existing `CANONICAL_DOCUMENTS` boundary.
- Produces no runtime behavior.

- [ ] **Step 1: Register the spec**

Add:

```text
docs/superpowers/specs/2026-09-18-memory-representation-lineage-v0-design.md
```

beside the other dated specification documents.

- [ ] **Step 2: Register this plan**

Add:

```text
docs/superpowers/plans/2026-09-18-memory-representation-lineage-v0.md
```

beside the other dated plan documents.

- [ ] **Step 3: Run documentation verification**

Run:

```bash
npm run docs:check
```

Expected: valid canonical documentation boundary.

---

### Task 4: Exact-head verification and PR evidence

**Files:**
- No new production files beyond Tasks 1–3.

- [ ] **Step 1: Run required repository verification**

Run:

```bash
npm run check
npm run release:verify
```

Expected: all required checks pass. If an unrelated lane fails, report it separately and do not misattribute it to this slice.

- [ ] **Step 2: Confirm no authority/capability drift**

Verify the diff contains no changes to:
- `mesh/config/capabilities.json`;
- Gateway routes;
- Sandbox action dispatch;
- Grid migrations/tables;
- service network policy;
- application policy;
- provider credentials or adapters.

- [ ] **Step 3: Open or update the draft PR with exact-head evidence**

PR summary must state:
- exact base and head SHA;
- files changed;
- focused test result;
- full check result;
- release verification result;
- no runtime/persistence/network/authority/capability changes;
- current non-claim: contracts are inert and not yet persisted by Grid.

- [ ] **Step 4: Keep the PR unmerged**

A green PR is evidence of readiness for review; it is not merge authority.
