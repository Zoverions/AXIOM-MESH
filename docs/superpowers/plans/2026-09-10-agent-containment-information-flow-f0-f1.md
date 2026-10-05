# Agent Containment & Information-Flow F0/F1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the inert language-neutral containment contracts and a deterministic, zero-egress user-space evaluator that proves private-data restrictions accumulate across task lineage and can only further deny an already-authorized external action.

**Architecture:** F0 defines four closed draft contracts (`FlowContext`, `CredentialSurrogate`, `TrustedApprovalChallenge`, `FlowReceipt`) under `docs/architecture/contracts/` and validates their safety-critical semantics with the existing zero-dependency canonicalization discipline. F1 adds a pure evaluator and monotonic flow-context composer under `mesh/src/lib/`; they consume synthetic plain objects only, open no network connections, read no credentials, invoke no provider/runtime, mutate no Grid state, and create no capability or effect authority.

**Tech Stack:** Node.js ESM on the repository-supported Node ranges (`>=22.23.2 <23 || >=24.14.0 <25`), built-in `node:test`, JSON Schema 2020-12 documents as language-neutral contract descriptions, existing `mesh/src/lib/canonical.mjs`, zero third-party runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-09-10-agent-containment-information-flow-stage5b-design.md`

## Global Constraints

- Preserve `Gateway -> Hypervisor -> Sandbox -> Grid`; F0/F1 must not add an alternate authority path.
- Preserve the existing candidate-container deny-egress boundary; F0/F1 adds no live egress.
- Do not modify `mesh/config/capabilities.json`.
- Do not add provider/runtime activation, live credentials, browser automation, payment/recovery actions, autonomous delegation, privileged host hooks, eBPF/LSM attachment, or production deployment changes.
- Reuse `canonicalJson`, `digestObject`, and `ValidationError` from `mesh/src/lib/canonical.mjs`; do not introduce a second canonicalization engine.
- Contract objects must be ordinary JSON-compatible plain data, closed to unknown fields, bounded, and digest-bound where the contract contains its own digest.
- Unknown data class, authority class, malformed digest, duplicate set member, over-limit array/string, stale/invalid time window, or unrepresentable required restriction fails closed.
- No model-produced summarization, redaction, translation, encryption, embedding, compression, or format conversion declassifies input in F0/F1.
- Any non-empty `observed_authority_classes` makes ordinary F1 protected egress ineligible; F0/F1 provides no policy switch that allows authority-bearing secret disclosure.
- Flow restrictions combine by set union, never least-restrictive-parent selection.
- Maximum parent contexts joined in one derivation: 8. Maximum lineage depth: 16.
- Maximum `owner_or_domain_scopes`: 16. Maximum `purpose_scopes`: 16. Maximum `source_commitments`: 64.
- Maximum canonical serialized contract object: 65,536 bytes. Maximum evaluator policy/request object: 32,768 bytes each.
- Credential surrogate lifetime: greater than 0 and at most 15 minutes. Trusted approval challenge lifetime: greater than 0 and at most 10 minutes.
- F0/F1 has zero live credential reads, zero network requests, zero external effects, zero browser actions, and zero production state migrations.
- Implementation branch must be created from current `main` only after the Stage 5B documentation gate is merged; branch name: `feat/agent-containment-flow-f0-f1`.

## Exact changed-file envelope

The F0/F1 implementation may create or modify only:

```text
docs/architecture/contracts/flow-context.v0.schema.json
docs/architecture/contracts/credential-surrogate.v0.schema.json
docs/architecture/contracts/trusted-approval-challenge.v0.schema.json
docs/architecture/contracts/flow-receipt.v0.schema.json
mesh/src/lib/agent-containment-contracts.mjs
mesh/src/lib/flow-policy-evaluator.mjs
mesh/fixtures/agent-containment/flow-evaluator-v0.vectors.json
mesh/test/agent-containment-contracts.test.mjs
mesh/test/flow-policy-evaluator.test.mjs
mesh/test/agent-containment-authority-boundary.test.mjs
docs/security/AGENT-CONTAINMENT-INFORMATION-FLOW-THREAT-MODEL.md
docs/MASTER-TODO-RUNTIME-CONNECTOR-FABRIC.md
docs/MASTER-TODO-SOVEREIGN-HOST-DEPLOYMENT.md
docs/README.md
mesh/src/check-docs.mjs
docs/superpowers/plans/2026-09-10-agent-containment-information-flow-f0-f1.md
```

If implementation requires any other production policy, Gateway, Hypervisor, Sandbox, Grid, service-network, credential, runtime-launcher, provider, browser, host, or capability-registry file, stop and reopen the Stage 5B gate.

---

### Task 1: F0 closed contract schemas and semantic verifier

**Files:**
- Create: `docs/architecture/contracts/flow-context.v0.schema.json`
- Create: `docs/architecture/contracts/credential-surrogate.v0.schema.json`
- Create: `docs/architecture/contracts/trusted-approval-challenge.v0.schema.json`
- Create: `docs/architecture/contracts/flow-receipt.v0.schema.json`
- Create: `mesh/src/lib/agent-containment-contracts.mjs`
- Test: `mesh/test/agent-containment-contracts.test.mjs`

**Interfaces:**
- Consumes: `canonicalJson(value)`, `digestObject(value)`, `ValidationError` from `mesh/src/lib/canonical.mjs`.
- Produces:
  - `FLOW_CONTEXT_SCHEMA = 'axiom-flow-context.v0'`
  - `CREDENTIAL_SURROGATE_SCHEMA = 'axiom-credential-surrogate.v0'`
  - `TRUSTED_APPROVAL_CHALLENGE_SCHEMA = 'axiom-trusted-approval-challenge.v0'`
  - `FLOW_RECEIPT_SCHEMA = 'axiom-flow-receipt.v0'`
  - `DATA_CLASSES = Object.freeze(['public','owner_private','shared_private','regulated_or_restricted','secret','authority_bearing_secret'])`
  - `AUTHORITY_CLASSES = Object.freeze(['credential','authentication_factor','recovery_material','signing_key','session_authority','payment_authority','device_enrollment','other_authority_bearing'])`
  - `verifyFlowContext(value)` -> canonical verified object
  - `verifyCredentialSurrogate(value, { now })` -> canonical verified object
  - `verifyTrustedApprovalChallenge(value, { now })` -> canonical verified object
  - `verifyFlowReceipt(value)` -> canonical verified object
  - `contractDigest(value, digestField)` -> `sha256:<64 lowercase hex>` over the canonical object with `digestField` omitted.

- [ ] **Step 1: Write the failing contract tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  verifyFlowContext,
  verifyCredentialSurrogate,
  verifyTrustedApprovalChallenge,
  verifyFlowReceipt,
  contractDigest
} from '../src/lib/agent-containment-contracts.mjs';

const NOW = '2026-09-10T18:00:00.000Z';
const POLICY = `sha256:${'1'.repeat(64)}`;

function withDigest(value, field) {
  return { ...value, [field]: contractDigest(value, field) };
}

test('FlowContext is closed, bounded, and self-digesting', () => {
  const raw = {
    schema: 'axiom-flow-context.v0',
    flow_context_id: 'flow:root',
    principal: 'principal:agent',
    runtime_identity: 'runtime:fixture',
    root_task_id: 'task:1',
    parent_flow_contexts: [],
    lineage_depth: 0,
    observed_data_classes: ['public'],
    observed_authority_classes: [],
    owner_or_domain_scopes: ['owner:fixture'],
    purpose_scopes: ['research'],
    source_commitments: [`sha256:${'2'.repeat(64)}`],
    created_at: NOW,
    updated_at: NOW,
    policy_profile_digest: POLICY
  };
  const value = withDigest(raw, 'flow_digest');
  assert.equal(verifyFlowContext(value).flow_digest, value.flow_digest);
  assert.throws(() => verifyFlowContext({ ...value, surprise: true }), /unsupported field/);
});
```

Add equivalent concrete fixtures for the other three contracts. `CredentialSurrogate` must have `single_use === true`, `expires_at > issued_at`, and `expires_at - issued_at <= 900_000`. `TrustedApprovalChallenge` must have `expires_at > issued_at` and a window `<= 600_000`. `FlowReceipt` is closed and therefore rejects raw-content additions such as `raw_payload`, `credential`, `token`, `otp`, or `prompt`.

- [ ] **Step 2: Run the focused test and verify RED**

```bash
cd mesh
node --test test/agent-containment-contracts.test.mjs
```

Expected: FAIL because `agent-containment-contracts.mjs` and the four contract files do not exist.

- [ ] **Step 3: Add the four exact contract shapes**

Use JSON Schema 2020-12, `additionalProperties: false`, and exactly these required fields:

```text
FlowContext:
  schema, flow_context_id, principal, runtime_identity, root_task_id,
  parent_flow_contexts, lineage_depth, observed_data_classes,
  observed_authority_classes, owner_or_domain_scopes, purpose_scopes,
  source_commitments, created_at, updated_at, policy_profile_digest, flow_digest

CredentialSurrogate:
  schema, surrogate_id, credential_class, principal, provider_or_connector,
  exact_action, purpose, exact_destination, allowed_data_classes,
  issued_at, expires_at, single_use, prepared_effect_digest,
  policy_profile_digest, surrogate_digest

TrustedApprovalChallenge:
  schema, challenge_id, principal, requested_action, provider_or_connector,
  exact_destination, observed_data_classes, purpose, external_transfer,
  reversibility, request_digest, policy_profile_digest, issued_at,
  expires_at, challenge_digest

FlowReceipt:
  schema, receipt_id, flow_context_digest, principal, runtime_identity,
  data_class_summary, authority_class_summary, purpose, destination,
  provider_or_connector, action, policy_profile_digest, decision,
  reason_codes, evaluated_at, receipt_digest
```

`parent_flow_contexts` items are closed objects with exactly `flow_context_id` and `flow_digest`. Digests use `^sha256:[0-9a-f]{64}$`. `reversibility` is one of `reversible`, `compensating-only`, `irreversible`, `unknown`. `decision` is `allow` or `deny`. Set-like arrays use `uniqueItems: true` and the ceilings in Global Constraints.

- [ ] **Step 4: Implement the minimal zero-dependency semantic verifier**

```js
import { canonicalJson, digestObject, ValidationError } from './canonical.mjs';

const MAX_OBJECT_BYTES = 65_536;

export function contractDigest(value, digestField) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError('contract must be a plain object');
  }
  const copy = { ...value };
  delete copy[digestField];
  return `sha256:${digestObject(copy)}`;
}

function boundedCanonical(value, name) {
  const encoded = canonicalJson(value);
  if (Buffer.byteLength(encoded, 'utf8') > MAX_OBJECT_BYTES) {
    throw new ValidationError(`${name} exceeds 65536 bytes`);
  }
  return JSON.parse(encoded);
}
```

Each verifier rejects unknown fields, validates required fields/enums/cardinality/time ordering, recomputes its digest, and returns the canonical verified object. `verifyFlowContext` also requires `updated_at >= created_at`, `lineage_depth <= 16`, and parent count `<= 8`.

- [ ] **Step 5: Run contract tests and canonicalization regressions**

```bash
cd mesh
node --test test/agent-containment-contracts.test.mjs test/canonical-domain.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add docs/architecture/contracts/flow-context.v0.schema.json \
  docs/architecture/contracts/credential-surrogate.v0.schema.json \
  docs/architecture/contracts/trusted-approval-challenge.v0.schema.json \
  docs/architecture/contracts/flow-receipt.v0.schema.json \
  mesh/src/lib/agent-containment-contracts.mjs \
  mesh/test/agent-containment-contracts.test.mjs
git commit -m "feat: add inert agent containment contracts"
```

---

### Task 2: F1 monotonic flow-context composition

**Files:**
- Create: `mesh/src/lib/flow-policy-evaluator.mjs`
- Test: `mesh/test/flow-policy-evaluator.test.mjs`

**Interfaces:**
- Consumes: `verifyFlowContext`, `contractDigest` from Task 1.
- Produces `deriveFlowContext({ id, principal, runtime_identity, root_task_id, parents, observed_data_classes, observed_authority_classes, owner_or_domain_scopes, purpose_scopes, source_commitments, created_at, updated_at, policy_profile_digest })` -> verified `FlowContext`.
- Parent restriction combination is set union sorted lexicographically for deterministic output.
- `lineage_depth = 0` when `parents.length === 0`; otherwise `1 + max(parent.lineage_depth)` and values above 16 are rejected.

- [ ] **Step 1: Write failing monotonic-composition tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveFlowContext } from '../src/lib/flow-policy-evaluator.mjs';

const POLICY = `sha256:${'1'.repeat(64)}`;
const NOW = '2026-09-10T18:00:00.000Z';

test('child context cannot shed private parent restrictions', () => {
  const parent = deriveFlowContext({
    id: 'flow:parent', principal: 'principal:agent', runtime_identity: 'runtime:a',
    root_task_id: 'task:1', parents: [], observed_data_classes: ['owner_private'],
    observed_authority_classes: [], owner_or_domain_scopes: ['owner:fixture'],
    purpose_scopes: ['research'], source_commitments: [`sha256:${'2'.repeat(64)}`],
    created_at: NOW, updated_at: NOW, policy_profile_digest: POLICY
  });
  const child = deriveFlowContext({
    id: 'flow:child', principal: 'principal:agent', runtime_identity: 'runtime:b',
    root_task_id: 'task:1', parents: [parent], observed_data_classes: ['public'],
    observed_authority_classes: [], owner_or_domain_scopes: [], purpose_scopes: [],
    source_commitments: [], created_at: NOW, updated_at: NOW, policy_profile_digest: POLICY
  });
  assert.deepEqual(child.observed_data_classes, ['owner_private', 'public']);
  assert.equal(child.lineage_depth, 1);
  assert.equal(child.parent_flow_contexts[0].flow_digest, parent.flow_digest);
});
```

Add tests for two-parent union, authority-class inheritance, owner/purpose/source union, duplicate elimination, deterministic sorting, root-task mismatch denial, policy-digest mismatch denial, parent count 9 denial, and lineage depth 17 denial.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
cd mesh
node --test test/flow-policy-evaluator.test.mjs
```

Expected: FAIL because `deriveFlowContext` does not exist.

- [ ] **Step 3: Implement minimal composition**

Parent contexts share the same `root_task_id` and `policy_profile_digest` as the child request. Runtime identity may change; that change cannot erase restrictions.

```js
import { ValidationError } from './canonical.mjs';
import { verifyFlowContext, contractDigest } from './agent-containment-contracts.mjs';

function unionSorted(...groups) {
  return [...new Set(groups.flat(2))].sort();
}

export function deriveFlowContext(input) {
  const parents = input.parents.map(verifyFlowContext);
  if (parents.length > 8) throw new ValidationError('flow parent count exceeds 8');
  for (const parent of parents) {
    if (parent.root_task_id !== input.root_task_id) throw new ValidationError('flow parent root task mismatch');
    if (parent.policy_profile_digest !== input.policy_profile_digest) throw new ValidationError('flow parent policy digest mismatch');
  }
  const lineageDepth = parents.length === 0 ? 0 : 1 + Math.max(...parents.map(item => item.lineage_depth));
  if (lineageDepth > 16) throw new ValidationError('flow lineage depth exceeds 16');
  const raw = {
    schema: 'axiom-flow-context.v0',
    flow_context_id: input.id,
    principal: input.principal,
    runtime_identity: input.runtime_identity,
    root_task_id: input.root_task_id,
    parent_flow_contexts: parents.map(item => ({ flow_context_id: item.flow_context_id, flow_digest: item.flow_digest })),
    lineage_depth: lineageDepth,
    observed_data_classes: unionSorted(parents.map(item => item.observed_data_classes), input.observed_data_classes),
    observed_authority_classes: unionSorted(parents.map(item => item.observed_authority_classes), input.observed_authority_classes),
    owner_or_domain_scopes: unionSorted(parents.map(item => item.owner_or_domain_scopes), input.owner_or_domain_scopes),
    purpose_scopes: unionSorted(parents.map(item => item.purpose_scopes), input.purpose_scopes),
    source_commitments: unionSorted(parents.map(item => item.source_commitments), input.source_commitments),
    created_at: input.created_at,
    updated_at: input.updated_at,
    policy_profile_digest: input.policy_profile_digest
  };
  raw.flow_digest = contractDigest(raw, 'flow_digest');
  return verifyFlowContext(raw);
}
```

- [ ] **Step 4: Run focused tests**

```bash
cd mesh
node --test test/flow-policy-evaluator.test.mjs
```

Expected: PASS for composition tests.

- [ ] **Step 5: Commit Task 2**

```bash
git add mesh/src/lib/flow-policy-evaluator.mjs mesh/test/flow-policy-evaluator.test.mjs
git commit -m "feat: add monotonic flow context composition"
```

---

### Task 3: F1 deterministic protected-egress evaluator

**Files:**
- Modify: `mesh/src/lib/flow-policy-evaluator.mjs`
- Modify: `mesh/test/flow-policy-evaluator.test.mjs`
- Create: `mesh/fixtures/agent-containment/flow-evaluator-v0.vectors.json`

**Interfaces:**
- Consumes: verified `FlowContext` from Task 1/2.
- Produces `evaluateProtectedEgress({ flow_context, request, policy })` -> frozen plain result:

```js
{
  schema: 'axiom-flow-evaluation.v0',
  decision: 'allow' | 'deny',
  reason_codes: string[],
  flow_context_digest: 'sha256:...',
  policy_profile_digest: 'sha256:...',
  request_digest: 'sha256:...'
}
```

`request` exact fields are `schema='axiom-flow-egress-request.v0'`, `action`, `provider_or_connector`, `destination`, `purpose`, `requires_credential`, optional `credential_surrogate_digest`, and optional `approval_challenge_digest`.

`policy` exact fields are `schema='axiom-flow-egress-policy.v0'`, `policy_profile_digest`, `allowed_actions[]`, `allowed_providers_or_connectors[]`, `allowed_destinations[]`, `allowed_purposes[]`, `allowed_data_classes[]`, `approval_required_for_data_classes[]`, and `credential_surrogate_required`.

Set ceilings: actions 64, providers 32, destinations 32, purposes 32, data classes 6. Matching is exact only; glob, wildcard, prefix, regex, redirect, and fallback semantics are rejected.

- [ ] **Step 1: Add the failing allow/deny matrix**

```text
public flow + exact public policy -> allow
owner_private flow + public-only policy -> deny:data_class_not_allowed
owner_private flow + owner_private-enabled exact policy -> allow
any authority class present -> deny:authority_bearing_material_observed
wrong action -> deny:action_not_allowed
wrong provider -> deny:provider_not_allowed
wrong destination -> deny:destination_not_allowed
wrong purpose -> deny:purpose_not_allowed
requires credential but no surrogate digest and policy requires surrogate -> deny:credential_surrogate_required
private class requiring approval but no approval digest -> deny:approval_required
policy profile digest != FlowContext policy digest -> deny:policy_profile_mismatch
```

Reason-code precedence is exactly:

```text
policy_profile_mismatch
authority_bearing_material_observed
action_not_allowed
provider_not_allowed
destination_not_allowed
purpose_not_allowed
data_class_not_allowed
credential_surrogate_required
approval_required
```

No denial reason returns `['allow']`.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
cd mesh
node --test test/flow-policy-evaluator.test.mjs
```

Expected: FAIL because `evaluateProtectedEgress` is not implemented.

- [ ] **Step 3: Implement exact validation and deny-only evaluation**

Validate request/policy as closed ordinary plain objects. Reject `*`, glob metacharacters, empty allow sets, duplicate entries, unknown fields, unknown data classes, or canonical serialized size above 32,768 bytes. Compute `request_digest` from the canonical verified request.

```js
import { digestObject } from './canonical.mjs';

const REASON_ORDER = Object.freeze([
  'policy_profile_mismatch',
  'authority_bearing_material_observed',
  'action_not_allowed',
  'provider_not_allowed',
  'destination_not_allowed',
  'purpose_not_allowed',
  'data_class_not_allowed',
  'credential_surrogate_required',
  'approval_required'
]);

export function evaluateProtectedEgress({ flow_context, request, policy }) {
  const flow = verifyFlowContext(flow_context);
  const req = verifyEvaluationRequest(request);
  const rule = verifyEvaluationPolicy(policy);
  const reasons = new Set();
  if (rule.policy_profile_digest !== flow.policy_profile_digest) reasons.add('policy_profile_mismatch');
  if (flow.observed_authority_classes.length > 0) reasons.add('authority_bearing_material_observed');
  if (!rule.allowed_actions.includes(req.action)) reasons.add('action_not_allowed');
  if (!rule.allowed_providers_or_connectors.includes(req.provider_or_connector)) reasons.add('provider_not_allowed');
  if (!rule.allowed_destinations.includes(req.destination)) reasons.add('destination_not_allowed');
  if (!rule.allowed_purposes.includes(req.purpose)) reasons.add('purpose_not_allowed');
  if (flow.observed_data_classes.some(value => !rule.allowed_data_classes.includes(value))) reasons.add('data_class_not_allowed');
  if (req.requires_credential && rule.credential_surrogate_required && !req.credential_surrogate_digest) reasons.add('credential_surrogate_required');
  if (flow.observed_data_classes.some(value => rule.approval_required_for_data_classes.includes(value)) && !req.approval_challenge_digest) reasons.add('approval_required');
  const reasonCodes = REASON_ORDER.filter(code => reasons.has(code));
  return Object.freeze({
    schema: 'axiom-flow-evaluation.v0',
    decision: reasonCodes.length ? 'deny' : 'allow',
    reason_codes: reasonCodes.length ? reasonCodes : ['allow'],
    flow_context_digest: flow.flow_digest,
    policy_profile_digest: rule.policy_profile_digest,
    request_digest: `sha256:${digestObject(req)}`
  });
}
```

The result is policy evidence only. It creates no grant, approval, prepared effect, network request, credential redemption, or Grid receipt.

- [ ] **Step 4: Add language-neutral conformance vectors**

Create at least 12 named vectors covering all nine denial reasons, one exact allow, one private allow under an explicitly compatible policy, one two-parent restriction-union case, and one runtime-replacement case showing restrictions survive a changed `runtime_identity`. Use only synthetic identifiers and fake digests.

Each evaluator vector uses this exact outer shape:

```json
{
  "name": "public-exact-allow",
  "flow_context": {},
  "request": {},
  "policy": {},
  "expected": {"decision":"allow","reason_codes":["allow"]}
}
```

- [ ] **Step 5: Run evaluator tests twice for determinism**

```bash
cd mesh
node --test test/flow-policy-evaluator.test.mjs
node --test test/flow-policy-evaluator.test.mjs
```

Expected: both PASS. Tests must also assert `canonicalJson(result)` is byte-identical across repeated evaluation of the same vector.

- [ ] **Step 6: Commit Task 3**

```bash
git add mesh/src/lib/flow-policy-evaluator.mjs \
  mesh/test/flow-policy-evaluator.test.mjs \
  mesh/fixtures/agent-containment/flow-evaluator-v0.vectors.json
git commit -m "feat: add deterministic protected egress evaluator"
```

---

### Task 4: F0/F1 authority-boundary and adversarial regression suite

**Files:**
- Create: `mesh/test/agent-containment-authority-boundary.test.mjs`
- Modify: `mesh/test/agent-containment-contracts.test.mjs`
- Modify: `mesh/test/flow-policy-evaluator.test.mjs`

**Interfaces:**
- Consumes: all Task 1-3 public functions and the committed vector file.
- Produces: executable evidence that F0/F1 is inert and deny-only with respect to current runtime authority.

- [ ] **Step 1: Write the boundary tests**

Tests must prove all of these concrete cases:

```text
1. private parent + public child => private remains present;
2. authority-bearing parent + clean child => authority class remains present;
3. runtime/model identity replacement does not reset restrictions;
4. no exported API named declassify, redactAndClear, summarizeAndClear, or equivalent exists;
5. allowed destination cannot override disallowed data class;
6. credential-surrogate digest presence cannot override destination/action/purpose/data denial;
7. approval-challenge digest presence cannot override destination/action/purpose/data denial;
8. unknown data/authority classes reject before evaluation;
9. malformed/missing flow digest rejects before evaluation;
10. parent count and lineage ceilings fail closed;
11. contract/evaluator production modules import no Gateway, Hypervisor, Sandbox, Grid, provider, repository operator, browser, networking, or subprocess module;
12. capability registry is absent from the implementation diff;
13. fixtures contain no strings matching `ghp_`, `github_pat_`, `sk-`, `Bearer `, or PEM private-key headers;
14. FlowReceipt rejects raw protected-content fields;
15. policy wildcard/glob values are rejected;
16. evaluator results contain no capability, grant, approval, prepared-effect, credential, token, or network-operation field.
```

For source-import isolation, inspect only the two production module import declarations. The only permitted production imports are `./canonical.mjs` and `./agent-containment-contracts.mjs`.

- [ ] **Step 2: Run boundary tests and verify RED where invariants are missing**

```bash
cd mesh
node --test test/agent-containment-authority-boundary.test.mjs
```

Expected: FAIL until all required Task 1-3 invariants are enforced.

- [ ] **Step 3: Make minimal corrections only**

Do not add a declassification function, broker, credential reader, network mock, provider mock, browser mock, or production adapter. Unsupported states resolve to validation failure or `deny`.

- [ ] **Step 4: Run all F0/F1 tests together**

```bash
cd mesh
node --test \
  test/agent-containment-contracts.test.mjs \
  test/flow-policy-evaluator.test.mjs \
  test/agent-containment-authority-boundary.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

```bash
git add mesh/test/agent-containment-authority-boundary.test.mjs \
  mesh/test/agent-containment-contracts.test.mjs \
  mesh/test/flow-policy-evaluator.test.mjs
git commit -m "test: harden agent containment authority boundaries"
```

---

### Task 5: Threat model, queues, and canonical documentation registration

**Files:**
- Create: `docs/security/AGENT-CONTAINMENT-INFORMATION-FLOW-THREAT-MODEL.md`
- Modify: `docs/MASTER-TODO-RUNTIME-CONNECTOR-FABRIC.md`
- Modify: `docs/MASTER-TODO-SOVEREIGN-HOST-DEPLOYMENT.md`
- Modify: `docs/README.md`
- Modify: `mesh/src/check-docs.mjs`

**Interfaces:**
- Consumes: Stage 5B design and exact F0/F1 implementation/non-claims.
- Produces: canonical docs that describe F0/F1 truthfully without claiming live containment.

- [ ] **Step 1: Add the dedicated F0/F1 threat model**

The document must explicitly state:

```text
Status: F0/F1 candidate only; no live containment claim.
Trust: evaluator trusts its supplied FlowContext because F0/F1 has no live observer.
Threats covered: label dropping in pure composition, least-restrictive-parent selection,
unknown class handling, policy mismatch, authority-bearing material, wildcard widening,
resource exhaustion, digest substitution, runtime-identity reset, receipt leakage.
Threats not yet solved: uninstrumented subprocess/native escape, actual secret extraction,
live credential redemption, network redirect/DNS substitution, browser prompt injection,
OS/kernel observer bypass, covert channels, real-world credential/broker compromise.
Future phases: F2-F8 remain independently gated.
```

Also state: passing F0/F1 proves deterministic contract/evaluator semantics over supplied synthetic state; it does not prove a real process cannot bypass information-flow controls.

- [ ] **Step 2: Update the two existing execution queues**

Under Runtime & Connector Fabric P0/P2/P7, add that future runtime/catalog entries must declare flow support and brokered credential strategy. Mark F0/F1 as an inert compatibility/evaluator slice only after the tests pass.

Under Sovereign Host Priority 8/14, add the future host-assisted flow-observation dependency and state that F5 is separately gated. Do not mark host enforcement complete.

- [ ] **Step 3: Register the design, plan, threat model, and four contracts**

Add these paths to `CANONICAL_DOCUMENTS` in `mesh/src/check-docs.mjs`:

```text
docs/architecture/contracts/flow-context.v0.schema.json
docs/architecture/contracts/credential-surrogate.v0.schema.json
docs/architecture/contracts/trusted-approval-challenge.v0.schema.json
docs/architecture/contracts/flow-receipt.v0.schema.json
docs/security/AGENT-CONTAINMENT-INFORMATION-FLOW-THREAT-MODEL.md
docs/superpowers/specs/2026-09-10-agent-containment-information-flow-stage5b-design.md
docs/superpowers/plans/2026-09-10-agent-containment-information-flow-f0-f1.md
```

Add `REQUIRED_CONTENT` checks for these exact phrases:

```text
Design: "Intelligence may request authority"
Plan: "F0/F1"
Threat model: "no live containment claim"
FlowContext schema: "axiom-flow-context.v0"
CredentialSurrogate schema: "axiom-credential-surrogate.v0"
TrustedApprovalChallenge schema: "axiom-trusted-approval-challenge.v0"
FlowReceipt schema: "axiom-flow-receipt.v0"
```

Add the design and threat-model links to `docs/README.md` in the existing canonical-documentation sections.

- [ ] **Step 4: Run documentation verification**

```bash
cd mesh
node src/check-docs.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit Task 5**

```bash
git add docs/security/AGENT-CONTAINMENT-INFORMATION-FLOW-THREAT-MODEL.md \
  docs/MASTER-TODO-RUNTIME-CONNECTOR-FABRIC.md \
  docs/MASTER-TODO-SOVEREIGN-HOST-DEPLOYMENT.md \
  docs/README.md mesh/src/check-docs.mjs
git commit -m "docs: register agent containment F0 F1 boundary"
```

---

### Task 6: Full verification and immutable candidate evidence

**Files:**
- Modify only when verification exposes an F0/F1 defect within the approved envelope.
- No capability-registry or production-authority file change is permitted.

**Interfaces:**
- Consumes: complete F0/F1 candidate.
- Produces: exact candidate head suitable for independent review and PR review.

- [ ] **Step 1: Determine and record the implementation base**

Immediately after creating `feat/agent-containment-flow-f0-f1` from merged `main`, run:

```bash
BASE="$(git rev-parse HEAD)"
printf '%s\n' "$BASE"
```

Record that SHA in the implementation PR description before the first implementation commit. Reuse that recorded SHA as `BASE` for every later diff/envelope check on the branch.

- [ ] **Step 2: Verify the changed-file envelope**

```bash
git diff --name-only "$BASE"...HEAD
```

Expected: every path is in the exact changed-file envelope above. Any extra production path stops implementation and reopens the gate.

- [ ] **Step 3: Search the candidate diff for prohibited live-authority material**

```bash
git diff "$BASE"...HEAD -- . \
  | grep -E "(capabilities\.json|github_pat_|ghp_|BEGIN .*PRIVATE KEY|child_process|node:http|node:https|node:net|node:tls|node:dns|eBPF|LSM attach)" || true
```

Expected: only documentation references to prohibited concepts; no live credential values, network imports, host attachment code, or capability-registry modifications.

- [ ] **Step 4: Run focused F0/F1 verification**

```bash
cd mesh
node --test \
  test/agent-containment-contracts.test.mjs \
  test/flow-policy-evaluator.test.mjs \
  test/agent-containment-authority-boundary.test.mjs
node src/check-docs.mjs
```

Expected: PASS.

- [ ] **Step 5: Run Clean Kernel / full repository check**

```bash
cd mesh
npm run check
```

Expected: PASS on a repository-supported Node version.

- [ ] **Step 6: Run supported-platform CI on the exact immutable head**

Push the candidate head and require the repository's protected Linux, Windows, Intel macOS, and Apple Silicon macOS checks that apply to pull requests. Record the exact commit SHA and workflow-run URLs in the implementation PR description. A local PASS is not a cross-platform claim.

- [ ] **Step 7: Verify all non-claims at the same head**

```text
capability_promoted = false
live_credential_read = false
live_egress = false
external_runtime_activated = false
browser_automation = false
host_enforcement = false
payment_or_recovery_effect = false
autonomous_delegation = false
production_state_migration = false
```

If no correction is needed, do not create a verification-only commit. The final PR description names the exact candidate SHA and states that F2+ requires a fresh gate.

---

## F0/F1 acceptance matrix

| Requirement | Evidence |
|---|---|
| Four closed inert contracts | `agent-containment-contracts.test.mjs` |
| Contract digests canonical and mutation-sensitive | contract tests |
| Unknown/overflow state fails closed | contract + evaluator tests |
| Parent restrictions accumulate monotonically | evaluator tests |
| Runtime replacement does not clear restrictions | evaluator + boundary tests |
| Authority-bearing material blocks ordinary protected egress | evaluator tests |
| Exact action/provider/destination/purpose/data intersection | evaluator vectors |
| Surrogate/approval references cannot override other denials | boundary tests |
| No self-declassification API exists | boundary tests |
| No network/credential/provider/browser/host imports | boundary source scan |
| Receipts cannot carry raw protected payload fields | contract tests |
| F0/F1 claims remain synthetic/user-space only | threat model + docs check |
| Capability registry unchanged | diff/envelope verification |
| Full clean-kernel check passes | `npm run check` |
| Supported-platform checks pass | immutable CI evidence |

## Rollback

F0/F1 adds only inert contracts, pure evaluator code, tests, fixtures, and documentation. Rollback is source rollback: revert the F0/F1 commits as a unit or restore the previous release revision. No Grid migration, credential rotation, network-policy migration, external side effect, or durable user-state conversion is introduced by this slice. Historical PR/test evidence remains append-only and must not be rewritten to imply later F2+ capabilities existed.

## Explicit non-claims

F0/F1 does **not** claim live process tainting, kernel-enforced information flow, credential brokering, credential secrecy against a compromised host, live network egress control beyond the existing deny-egress system, browser isolation, OTP filtering in a real connector, payment safety, DNS/redirect safety, subprocess containment, remote-agent flow propagation, or production support for any external runtime.

The exact claim is:

> Given a valid supplied `FlowContext`, the F1 evaluator deterministically intersects its accumulated restrictions with an exact synthetic egress policy and can only deny or report eligibility; it cannot grant AXIOM authority or perform the effect.
