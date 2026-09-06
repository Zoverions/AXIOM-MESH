# Verified Work and Harness Provenance v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three inert, fail-closed evidence contracts for exact AI execution provenance, verified work DAGs, and physical-effect consequence classification without adding runtime authority or capability promotion.

**Architecture:** Keep the existing AI provider invoke v0 stable. Add three standalone pure validators/digest helpers plus JSON Schema mirrors. Bind AI execution provenance to exact existing invoke/receipt digests; make verified work a DAG-only evidence primitive; make effect consequence classification descriptive only. No Gateway routes, persistence, egress, device actions, or capability-registry changes.

**Tech Stack:** Node.js ESM, `node:test`, existing `mesh/src/lib/canonical.mjs` helpers, JSON Schema draft 2020-12, repository Clean Kernel verification.

**Spec:** `docs/superpowers/specs/2026-09-05-verified-work-harness-provenance-design.md`

## Global Constraints

- `mesh/config/capabilities.json` MUST remain unchanged.
- Every new artifact MUST be evidence-only and production-unreachable.
- Unknown fields MUST fail closed.
- Raw secrets, tokens, credentials, cookies, private keys, and session material MUST not be accepted.
- No new Gateway route, database table, network egress, model invocation, dynamic spawn path, or device command may be added.
- Test-first RED must be observed before production implementation.

---

### Task 1: AI Execution Provenance v0

**Files:**
- Create: `mesh/test/ai-execution-provenance.test.mjs`
- Create: `mesh/src/lib/ai-execution-provenance.mjs`
- Create: `mesh/config/ai-execution-provenance-v0.schema.json`

**Interfaces:**
- Consumes: `validateAiProviderInvoke()`, `aiProviderInvokeDigest()`, `buildAiProviderReceipt()` and `digestObject()`.
- Produces: `AI_EXECUTION_PROVENANCE_SCHEMA`, `validateAiExecutionProvenance(value)`, `aiExecutionProvenanceDigest(value)`, `bindAiExecutionProvenance({ invoke, receipt, provenance })`.

- [ ] **Step 1: Write the failing contract test**

Create `mesh/test/ai-execution-provenance.test.mjs` importing the not-yet-created module. Cover:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { digestObject, sha256, ValidationError } from '../src/lib/canonical.mjs';
import {
  buildAiProviderReceipt,
  aiProviderInvokeDigest,
  LOCAL_ORGANIZE_MODEL,
  LOCAL_ORGANIZE_PROVIDER_ID
} from '../src/lib/ai-provider-invoke.mjs';
import {
  AI_EXECUTION_PROVENANCE_SCHEMA,
  aiExecutionProvenanceDigest,
  bindAiExecutionProvenance,
  validateAiExecutionProvenance
} from '../src/lib/ai-execution-provenance.mjs';
```

Use the existing valid local-organizer invoke/receipt shape and a provenance fixture containing exact adapter/orchestrator/runtime/context/tools/environment objects. Assert:

- valid provenance passes;
- schema/status/no-authority fields are exact;
- unknown fields fail closed;
- malformed digests fail;
- provider/model mismatch with the receipt fails;
- request digest mismatch fails;
- receipt digest mismatch fails;
- binding returns only evidence fields and `authority_effect === 'none'`;
- deterministic digest is stable;
- JSON Schema mirror parses and requires the same top-level fields.

- [ ] **Step 2: Verify RED**

Run:

```bash
cd mesh
node --test test/ai-execution-provenance.test.mjs
```

Expected: FAIL because `../src/lib/ai-execution-provenance.mjs` does not exist.

- [ ] **Step 3: Implement minimal validator/resolver**

Create `mesh/src/lib/ai-execution-provenance.mjs` using existing canonical helpers. Enforce exact keys and these constants:

```js
export const AI_EXECUTION_PROVENANCE_SCHEMA = 'axiom-ai-execution-provenance.v0';
const STATUS = 'inert-evidence';
```

Implement strict validation for:

```text
schema/version/status/provenance_id/provider_id/model/request_digest/receipt_digest/
adapter/orchestrator/runtime/context/tools/environment/recorded_at/
contains_secret_material/authority_effect/network_effect/runtime_activation
```

Require:

```text
contains_secret_material = false
authority_effect = none
network_effect = none
runtime_activation = false
```

`bindAiExecutionProvenance()` must:

1. normalize the invoke with `validateAiProviderInvoke()`;
2. validate the provenance;
3. require `provenance.request_digest === aiProviderInvokeDigest(invoke)`;
4. require `provenance.receipt_digest === digestObject(receipt)`;
5. require provider/model equality across invoke, receipt, and provenance;
6. return a frozen evidence-only binding object.

- [ ] **Step 4: Add JSON Schema mirror**

Create `mesh/config/ai-execution-provenance-v0.schema.json` with `additionalProperties:false`, exact required fields, digest patterns, allowed `state_mode` values, and exact zero-authority constants.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
cd mesh
node --test test/ai-execution-provenance.test.mjs test/ai-provider-invoke.test.mjs
```

Expected: PASS.

---

### Task 2: Verified Work Graph v0

**Files:**
- Create: `mesh/test/verified-work-graph.test.mjs`
- Create: `mesh/src/lib/verified-work-graph.mjs`
- Create: `mesh/config/verified-work-graph-v0.schema.json`

**Interfaces:**
- Produces: `VERIFIED_WORK_GRAPH_SCHEMA`, `validateVerifiedWorkGraph(graph)`, `verifiedWorkGraphDigest(graph)`, `verifiedWorkGraphTopologicalOrder(graph)`.

- [ ] **Step 1: Write the failing DAG contract test**

Create a graph fixture with one goal, two tasks, one artifact, and one verification node. Assert:

- valid DAG passes and produces deterministic topological order;
- exactly one goal is required;
- goal dependencies fail;
- missing dependency references fail;
- self-dependencies fail;
- duplicate dependencies fail;
- cycles fail;
- artifact nodes require 64-hex artifact digest;
- non-artifact nodes require null artifact digest;
- verification nodes require verifier/evidence/result;
- non-verification nodes require `verification_result:'not-applicable'` and null verifier fields;
- unknown fields fail closed;
- authority/network/execution fields are fixed to no effect;
- JSON Schema mirror uses `additionalProperties:false`.

- [ ] **Step 2: Verify RED**

Run:

```bash
cd mesh
node --test test/verified-work-graph.test.mjs
```

Expected: FAIL because `../src/lib/verified-work-graph.mjs` does not exist.

- [ ] **Step 3: Implement minimal DAG validator and topological order**

Use strict exact-key validation. Validate node enums and digest/null relationships. Build an ID map, validate dependencies, then use Kahn's algorithm to reject cycles and return deterministic lexical-ID order among currently ready nodes.

Constants:

```js
export const VERIFIED_WORK_GRAPH_SCHEMA = 'axiom-verified-work-graph.v0';
const STATUS = 'inert-evidence';
```

The helper MUST NOT schedule, spawn, delegate, execute, or mutate graph state.

- [ ] **Step 4: Add JSON Schema mirror**

Create `mesh/config/verified-work-graph-v0.schema.json` with exact top-level/node fields and enums. Structural DAG rules remain enforced by the JS validator because JSON Schema alone does not express graph acyclicity.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
cd mesh
node --test test/verified-work-graph.test.mjs
```

Expected: PASS.

---

### Task 3: Effect Consequence Classification v0

**Files:**
- Create: `mesh/test/effect-consequence-classification.test.mjs`
- Create: `mesh/src/lib/effect-consequence-classification.mjs`
- Create: `mesh/config/effect-consequence-classification-v0.schema.json`

**Interfaces:**
- Produces: `EFFECT_CONSEQUENCE_CLASSIFICATION_SCHEMA`, `EFFECT_CONSEQUENCE_CLASSES`, `validateEffectConsequenceClassification(value)`, `effectConsequenceClassificationDigest(value)`.

- [ ] **Step 1: Write failing classification tests**

Cover all six classes:

```text
informational
digital-reversible
digital-consequential
physical-reversible
physical-safety-relevant
physical-potentially-irreversible
```

Assert:

- valid informational and physical classifications pass;
- unknown class fails;
- unknown fields fail closed;
- `authority_effect` and `execution_effect` must be `none`;
- physical safety relevant cannot declare `physical_safety_impact:'none'`;
- physical potentially irreversible cannot declare `reversibility:'reversible'`;
- classifier/rationale/effect refs are bounded identifiers/text;
- digest is deterministic;
- JSON Schema mirror exposes the same class enum.

- [ ] **Step 2: Verify RED**

Run:

```bash
cd mesh
node --test test/effect-consequence-classification.test.mjs
```

Expected: FAIL because `../src/lib/effect-consequence-classification.mjs` does not exist.

- [ ] **Step 3: Implement minimal classifier evidence validator**

Implement exact-key validation and constants only. Do not return allow/deny, scrutiny score, capability, mandate, or execution plan.

- [ ] **Step 4: Add JSON Schema mirror**

Create `mesh/config/effect-consequence-classification-v0.schema.json` using the same enums and zero-effect constants.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
cd mesh
node --test test/effect-consequence-classification.test.mjs
```

Expected: PASS.

---

### Task 4: Canonical documentation and roadmap integration

**Files:**
- Modify: `mesh/src/check-docs.mjs`
- Modify: `docs/MASTER-TODO.md`
- Modify: `docs/operations/AXIOM-ONE-PROVIDER-WEDGE.md`
- Modify: `docs/superpowers/specs/2026-08-29-cognitive-topology-identity-kernel-design.md`
- Modify: `docs/superpowers/specs/2026-09-03-sovereign-information-evidence-authority-design.md`

**Interfaces:**
- Consumes: the three executable contracts from Tasks 1–3.
- Produces: canonical discoverability and explicit future integration boundaries.

- [ ] **Step 1: Register this spec and plan in `CANONICAL_DOCUMENTS`**

Add:

```text
docs/superpowers/specs/2026-09-05-verified-work-harness-provenance-design.md
docs/superpowers/plans/2026-09-05-verified-work-harness-provenance-v0.md
```

- [ ] **Step 2: Update the master TODO without promoting capabilities**

Update `AI-001` acceptance evidence to mention the execution-provenance adjunct. Add a bounded evidence-only work item for Verified Work Graph v0 and an inert effect-classification item, both explicitly no runtime authority. Update `LAB-004`/`LAB-007` language to consume these contracts in later autonomous/embodied experiments rather than invent parallel semantics.

- [ ] **Step 3: Link AI provider and recursive improvement docs**

In `AXIOM-ONE-PROVIDER-WEDGE.md`, state that provider capability/evaluation claims must bind model + adapter + orchestrator + runtime + context/tool policy + environment through the new adjunct once a real adapter is introduced.

In the cognitive-topology design, extend bounded self-improvement with a verified-work-graph evidence step before governed acceptance.

- [ ] **Step 4: Link physical consequence taxonomy to sovereign authority design**

Add a short subsection stating that the v0 classifier is descriptive evidence only and a future exact-effect admission integration must combine it with existing consequence/authority policy, never replace that policy.

- [ ] **Step 5: Verify docs**

Run:

```bash
cd mesh
npm run docs:check
```

Expected: PASS.

---

### Task 5: Full verification and PR state

**Files:** no new files.

- [ ] **Step 1: Run focused tests**

```bash
cd mesh
node --test \
  test/ai-provider-invoke.test.mjs \
  test/ai-execution-provenance.test.mjs \
  test/verified-work-graph.test.mjs \
  test/effect-consequence-classification.test.mjs
```

Expected: PASS with zero failures.

- [ ] **Step 2: Run full kernel check**

```bash
cd mesh
npm run check
```

Expected: exit 0.

- [ ] **Step 3: Inspect repository diff**

Confirm:

- `mesh/config/capabilities.json` unchanged;
- no Gateway/runtime route added;
- no network/device code added;
- all new artifacts hard-code zero authority/effect semantics;
- schema mirrors match JS contracts;
- docs do not claim production provider, recursive authority, or physical execution.

- [ ] **Step 4: Keep PR draft until protected CI is green**

The PR description must state the RED→GREEN evidence, exact head SHA, non-claims, relationship to #1451/#1455, and that future production integration requires a separate authority review.
