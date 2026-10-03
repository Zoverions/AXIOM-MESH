# Consequential MCP State Composition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an experimental, protocol-neutral Agent Commons conformance surface that proves a consequential effect can be individually authorized yet still be denied when its resulting aggregate state violates current invariant, causal-scope, replay, or serializable-admission constraints.

**Architecture:** Add one machine-readable profile, one portable A-J fixture corpus, and one pure laboratory evaluator that consumes an already-verified exact local-grant evaluation rather than creating a second authorization engine. The evaluator computes a bounded `S0 + E -> S1` fact projection, checks exact grant/currentness/state bindings and aggregate invariants, and returns only `permit_candidate` or `deny`; a small receipt helper keeps request, admission, invocation attempt, remote acknowledgement, and independently observed state distinct. Nothing is wired to Gateway, Hypervisor, Sandbox, Grid, MCP/A2A transports, providers, credentials, policy, or the capability registry.

**Tech Stack:** Node.js ESM; Node built-ins (`node:test`, `node:assert/strict`, `node:fs/promises` in tests only); existing `mesh/src/lib/canonical.mjs` (`ValidationError`, `assertPlainObject`, `assertString`, `canonicalJson`, `digestObject`); JSON Agent Commons fixtures; existing Clean Kernel and platform compatibility workflows.

**Spec:** `docs/superpowers/specs/2026-09-08-consequential-mcp-state-composition-design.md`

## Global Constraints

- Node compatibility remains `>=22.23.2 <23 || >=24.14.0 <25`.
- This plan implements only the first experimental Agent Commons slice approved in the spec; it is not production-path authority.
- `mesh/config/capabilities.json` MUST NOT change.
- No Gateway, Hypervisor, Sandbox, Grid, MCP/A2A transport, provider adapter, deployment path, credential, production policy, network executor, filesystem effect, or subprocess executor may be imported or invoked.
- The new evaluator MUST consume an already-verified local-grant evaluation; it MUST NOT reimplement grant issuance, policy resolution, identity authentication, delegation issuance, or capability promotion.
- `permit_candidate` is laboratory evaluation only. Every evaluator result MUST carry `authority_effect: 'none'`, `production_authorization: false`, and `effect_invoked: false`.
- MCP metadata, tool discovery, server authentication, OAuth credentials, protocol identity, provider identity, and remote acknowledgement MUST NOT mint or widen AXIOM authority.
- State composition is distinct from root/subtree budget accounting. Passing one MUST NOT imply passing the other.
- Composition follows `causal_scope_id` and `authority_root_id`, not a transport session, server identity, protocol, provider, retry, or deputy identity.
- Rollback/remediation is represented as an ordinary consequential transition with `transition_kind: 'rollback'`; it receives no historical-authority shortcut.
- Required state/currentness/admission inputs fail closed when missing, stale, contradictory, structurally invalid, or bound to a different exact effect/state/root/scope/policy.
- For the experimental state model, adapters project only bounded canonical string facts. There is no universal world-state or network-topology model.
- Fact arrays and committed-effect arrays MUST be sorted and unique; the evaluator rejects rather than silently normalizing caller order or duplicates.
- The state projection is content-addressed with existing `digestObject()`; do not add a second canonicalizer or digest algorithm.
- The exact proposed effect is content-addressed with `digestObject()` after strict normalization.
- The first slice supports aggregate invariants of the form `forbidden_all_of`: if every named fact would be true in projected `S1`, the candidate is denied.
- A consequential effect that declares `requires_serializable_admission: true` requires separately supplied, verified experimental admission evidence bound to the exact current state id/version/digest and one of `compare-and-commit`, `serialized`, or `single-authoritative-admitter`.
- That experimental admission evidence is not itself a production concurrency proof; the result remains non-authorizing.
- Replay/duplicate protection in this slice is evidence-level: if the same exact `effect_id` already appears in `committed_effect_ids`, deny rather than retrying or compounding the effect.
- A remote acknowledgement is never treated as observed external state or task satisfaction.
- An independently observed state mismatch must be recorded as a discrepancy and MUST NOT be converted into success.
- The design spec and this plan must be added to `CANONICAL_DOCUMENTS` during implementation because current `check-docs.mjs` explicitly registers superpowers specs/plans.
- If implementation requires a new production effect class, persistent state authority, multi-replica service, real MCP adapter, real provider deputy, root-budget ledger, or capability-registry entry, STOP and reopen the fresh Stage 5B gate rather than widening this plan.

---

## Planned File Structure

```text
agent-commons/consequential-state-composition-profile.v1.json
agent-commons/consequential-state-composition-fixtures.v1.json
mesh/src/lib/consequential-state-composition-guard.mjs
mesh/test/consequential-state-composition.test.mjs
mesh/test/consequential-state-composition-boundary.test.mjs
mesh/test/consequential-state-composition-doc-registration.test.mjs
mesh/src/check-docs.mjs
docs/superpowers/specs/2026-09-08-consequential-mcp-state-composition-design.md
docs/superpowers/plans/2026-09-08-consequential-mcp-state-composition.md
```

No other file belongs in the first implementation slice unless a focused RED proves a repository-boundary requirement. In particular, do not modify `mesh/config/capabilities.json`, production policy, Gateway, Hypervisor, Sandbox, Grid, runtime-adapter, provider, credential, deployment, or network-policy files.

## Public Laboratory Interface

`mesh/src/lib/consequential-state-composition-guard.mjs` exposes exactly:

```js
export const CONSEQUENTIAL_EFFECT_SCHEMA = 'axiom-consequential-effect.v1';
export const CONSEQUENTIAL_STATE_SCHEMA = 'axiom-consequential-state-projection.v1';
export const CONSEQUENTIAL_STATE_EVIDENCE_SCHEMA = 'axiom-consequential-state-evidence-receipt.v1';

export function digestConsequentialEffect(effect) {}
export function digestConsequentialState(state) {}
export function evaluateConsequentialStateComposition({
  effect,
  grantEvaluation,
  state,
  invariants,
  admissionEvidence,
  now
}) {}
export function buildConsequentialStateEvidenceReceipt({
  effect,
  evaluation,
  invocation,
  remoteAcknowledgement,
  observedState
}) {}
```

No public function invokes, commits, persists, retries, rolls back, or authorizes an external effect.

---

### Task 1: Agent Commons profile and portable A-J corpus

**Files:**
- Create: `mesh/test/consequential-state-composition.test.mjs`
- Create after RED: `agent-commons/consequential-state-composition-profile.v1.json`
- Create after RED: `agent-commons/consequential-state-composition-fixtures.v1.json`

**Interfaces:**
- Produces a portable profile with `schema: 'axiom-consequential-state-composition-profile.v1'` and a fixture corpus with `schema: 'axiom-consequential-state-composition-fixtures.v1'`.
- The corpus uses an exact baseline plus RFC 7396-style merge patches so cases remain compact and independently reproducible.
- Later tasks consume the profile/corpus but do not rename case IDs or expected reason codes.

- [ ] **Step 1: Write the fixture/profile absence RED**

Start `mesh/test/consequential-state-composition.test.mjs` with:

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const profileUrl = new URL(
  '../../agent-commons/consequential-state-composition-profile.v1.json',
  import.meta.url
);
const fixturesUrl = new URL(
  '../../agent-commons/consequential-state-composition-fixtures.v1.json',
  import.meta.url
);

async function loadJson(url) {
  return JSON.parse(await readFile(url, 'utf8'));
}

test('consequential state composition profile is experimental and non-authorizing', async () => {
  const profile = await loadJson(profileUrl);
  assert.equal(profile.schema, 'axiom-consequential-state-composition-profile.v1');
  assert.equal(profile.portable, true);
  assert.equal(profile.production_conformance_claimed, false);
  assert.equal(profile.authority_granted, false);
  assert.equal(profile.guard_output_authority_effect, 'none');
});

test('portable corpus contains exact A-J cases plus one positive control', async () => {
  const fixtures = await loadJson(fixturesUrl);
  assert.equal(fixtures.schema, 'axiom-consequential-state-composition-fixtures.v1');
  assert.deepEqual(fixtures.cases.map(({ id }) => id), [
    'authenticated-but-unauthorized-network-modification',
    'destination-substitution-after-authorization',
    'stale-state-after-topology-policy-change',
    'individually-permitted-pair-creates-forbidden-state',
    'concurrent-stale-state-race',
    'protocol-switch-does-not-reset-composition',
    'provider-deputy-does-not-widen-origin-authority',
    'rollback-requires-current-authority',
    'requested-state-differs-from-observed-state',
    'retry-does-not-duplicate-committed-effect',
    'compatible-transition-positive-control'
  ]);
  assert.equal(new Set(fixtures.cases.map(({ id }) => id)).size, fixtures.cases.length);
});
```

- [ ] **Step 2: Run the focused test and witness RED**

```bash
node --test mesh/test/consequential-state-composition.test.mjs
```

Expected: FAIL with `ENOENT` for the deliberately absent profile/fixture files. No production source has changed.

- [ ] **Step 3: Create the machine-readable profile**

Use these exact top-level semantics:

```json
{
  "schema": "axiom-consequential-state-composition-profile.v1",
  "target": "RT-AUTH-001-adjacent-state-composition",
  "portable": true,
  "production_conformance_claimed": false,
  "authority_granted": false,
  "status": "experimental Agent Commons conformance profile; no runtime promotion",
  "core_invariant": "An individually authorized consequential transition MUST still be denied when its projected aggregate state violates a current invariant or when exact state/currentness/serializable-admission requirements are not established.",
  "composition_scope": ["authority_root_id", "causal_scope_id"],
  "state_model": "bounded canonical fact projection: S0 + E -> S1",
  "invariant_form": "forbidden_all_of",
  "grant_input": "already-verified exact local-grant evaluation only",
  "guard_decisions": ["permit_candidate", "deny"],
  "guard_output_authority_effect": "none",
  "required_properties": [
    "tool reachability, authentication, schema validity, or protocol identity do not create effect authority",
    "exact proposed effects are bound independently from transport sessions",
    "projected resulting state is evaluated before a consequential effect",
    "composition follows authority root and causal scope across protocol and deputy transitions",
    "state/currentness mismatch fails closed",
    "serializable admission is required when the effect declares a concurrency-sensitive boundary",
    "rollback is a new consequential effect requiring current authority",
    "remote acknowledgement is not observed external state",
    "replay or duplicate effect identity cannot silently compound state",
    "state composition does not replace root/subtree budget accounting"
  ],
  "nonclaims": [
    "This profile does not claim MCP, A2A, REST, providers, or network controllers are insecure.",
    "This profile does not provide a production state service, lock manager, network controller, or consensus system.",
    "This profile does not make permit_candidate an authorization or execution decision.",
    "This profile does not claim remote acknowledgement proves effect completion or external satisfaction.",
    "This profile does not define a universal world-state model."
  ]
}
```

- [ ] **Step 4: Create the portable baseline/case corpus**

Use one deterministic baseline with full-length 64-hex digests. The corpus contract is:

```json
{
  "schema": "axiom-consequential-state-composition-fixtures.v1",
  "profile_schema": "axiom-consequential-state-composition-profile.v1",
  "portable": true,
  "production_conformance_claimed": false,
  "authority_granted": false,
  "patch_semantics": "RFC7396-json-merge-patch",
  "baseline": {
    "authorized_effect": {
      "schema": "axiom-consequential-effect.v1",
      "effect_id": "effect:route-app-db",
      "effect_class": "network-control",
      "transition_kind": "forward",
      "action": "route.add",
      "target": "route:app-db",
      "destination": "network:internal",
      "protocol": "mcp",
      "origin_principal_id": "principal:agent-1",
      "executor_principal_id": "principal:agent-1",
      "authority_root_id": "authority-root:alpha",
      "causal_scope_id": "causal:change-42",
      "policy_digest": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "currentness_evidence_digest": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "expected_state_id": "state:network-prod",
      "expected_state_version": 7,
      "max_state_age_ms": 60000,
      "add_facts": ["link:app-db"],
      "remove_facts": [],
      "requires_serializable_admission": true
    },
    "proposed_effect": {
      "schema": "axiom-consequential-effect.v1",
      "effect_id": "effect:route-app-db",
      "effect_class": "network-control",
      "transition_kind": "forward",
      "action": "route.add",
      "target": "route:app-db",
      "destination": "network:internal",
      "protocol": "mcp",
      "origin_principal_id": "principal:agent-1",
      "executor_principal_id": "principal:agent-1",
      "authority_root_id": "authority-root:alpha",
      "causal_scope_id": "causal:change-42",
      "policy_digest": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "currentness_evidence_digest": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "expected_state_id": "state:network-prod",
      "expected_state_version": 7,
      "max_state_age_ms": 60000,
      "add_facts": ["link:app-db"],
      "remove_facts": [],
      "requires_serializable_admission": true
    },
    "grant_evaluation": {
      "verified": true,
      "allow": true,
      "grant_id": "grant:network-change",
      "authority_root_id": "authority-root:alpha",
      "causal_scope_id": "causal:change-42",
      "policy_digest": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "currentness_evidence_digest": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "evaluated_at": "2026-09-08T16:30:00.000Z",
      "expires_at": "2026-09-08T16:35:00.000Z"
    },
    "state": {
      "schema": "axiom-consequential-state-projection.v1",
      "state_id": "state:network-prod",
      "state_version": 7,
      "captured_at": "2026-09-08T16:30:00.000Z",
      "facts": ["link:user-app"],
      "committed_effect_ids": []
    },
    "invariants": [
      {
        "id": "no-user-public-route",
        "forbidden_all_of": ["link:app-public", "link:user-app"]
      }
    ],
    "admission_evidence": {
      "verified": true,
      "mode": "compare-and-commit",
      "state_id": "state:network-prod",
      "state_version": 7
    },
    "now": "2026-09-08T16:30:30.000Z"
  },
  "cases": []
}
```

Populate `cases` with the exact IDs from Step 1 and these exact expected primary outcomes/reasons:

```text
authenticated-but-unauthorized-network-modification
  patch: grant_evaluation.allow = false
  expect: deny / grant-not-allowing

destination-substitution-after-authorization
  patch: proposed_effect.destination = network:external
  expect: deny / effect-binding-mismatch

stale-state-after-topology-policy-change
  patch: state.captured_at = 2026-09-08T16:20:00.000Z
  expect: deny / state-stale

individually-permitted-pair-creates-forbidden-state
  patch: state.facts = [link:user-app, link:user-core]; proposed_effect/authorized_effect add_facts = [link:core-public]; invariant forbidden_all_of = [link:core-public, link:user-core]
  expect: deny / invariant-violated:no-public-route

concurrent-stale-state-race
  patch: admission_evidence.state_version = 6
  expect: deny / admission-state-version-mismatch

protocol-switch-does-not-reset-composition
  patch: proposed_effect/authorized_effect protocol = rest; state.facts = [link:user-app, link:user-core]; proposed_effect/authorized_effect add_facts = [link:core-public]; same causal/root; invariant forbids [link:core-public, link:user-core]
  expect: deny / invariant-violated:no-public-route

provider-deputy-does-not-widen-origin-authority
  patch: proposed_effect/authorized_effect executor_principal_id = principal:provider-1; grant_evaluation.authority_root_id = authority-root:provider
  expect: deny / authority-root-mismatch

rollback-requires-current-authority
  patch: proposed_effect/authorized_effect transition_kind = rollback; grant_evaluation.allow = false
  expect: deny / grant-not-allowing

requested-state-differs-from-observed-state
  patch: keep admission valid; receipt remoteAcknowledgement acknowledged=true; observed state facts differ from projected facts
  expect: permit_candidate; receipt external_outcome = discrepancy; external_satisfaction_claimed=false

retry-does-not-duplicate-committed-effect
  patch: state.committed_effect_ids = [effect:route-app-db]
  expect: deny / effect-already-committed

compatible-transition-positive-control
  patch: baseline unchanged
  expect: permit_candidate / no reasons
```

Represent those patches as JSON objects, not prose strings, in the actual fixture file. Use sorted/unique fact arrays and full deterministic values only; no shortened hashes or placeholder tokens.

- [ ] **Step 5: Run the structural test and verify GREEN**

```bash
node --test mesh/test/consequential-state-composition.test.mjs
```

Expected: both profile/corpus structural tests pass. There is still no evaluator import or production code.

- [ ] **Step 6: Commit Task 1**

```bash
git add \
  agent-commons/consequential-state-composition-profile.v1.json \
  agent-commons/consequential-state-composition-fixtures.v1.json \
  mesh/test/consequential-state-composition.test.mjs
git commit -m "test: add consequential state composition fixtures"
```

---

### Task 2: Exact effect/state binding and aggregate invariant guard

**Files:**
- Create after RED: `mesh/src/lib/consequential-state-composition-guard.mjs`
- Modify: `mesh/test/consequential-state-composition.test.mjs`

**Interfaces:**
- Produces `digestConsequentialEffect()`, `digestConsequentialState()`, and `evaluateConsequentialStateComposition()`.
- Consumes only canonical helpers from `./canonical.mjs`.
- The evaluator consumes an already-verified local-grant result and never issues or broadens a grant.

- [ ] **Step 1: Add the missing-module RED and core behavior tests**

Add imports:

```js
import {
  digestConsequentialEffect,
  digestConsequentialState,
  evaluateConsequentialStateComposition
} from '../src/lib/consequential-state-composition-guard.mjs';
```

Add deterministic helpers:

```js
const POLICY = 'a'.repeat(64);
const CURRENTNESS = 'b'.repeat(64);
const NOW = new Date('2026-09-08T16:30:30.000Z');

function effect(overrides = {}) {
  return {
    schema: 'axiom-consequential-effect.v1',
    effect_id: 'effect:route-app-db',
    effect_class: 'network-control',
    transition_kind: 'forward',
    action: 'route.add',
    target: 'route:app-db',
    destination: 'network:internal',
    protocol: 'mcp',
    origin_principal_id: 'principal:agent-1',
    executor_principal_id: 'principal:agent-1',
    authority_root_id: 'authority-root:alpha',
    causal_scope_id: 'causal:change-42',
    policy_digest: POLICY,
    currentness_evidence_digest: CURRENTNESS,
    expected_state_id: 'state:network-prod',
    expected_state_version: 7,
    max_state_age_ms: 60000,
    add_facts: ['link:app-db'],
    remove_facts: [],
    requires_serializable_admission: true,
    ...overrides
  };
}

function state(overrides = {}) {
  return {
    schema: 'axiom-consequential-state-projection.v1',
    state_id: 'state:network-prod',
    state_version: 7,
    captured_at: '2026-09-08T16:30:00.000Z',
    facts: ['link:user-app'],
    committed_effect_ids: [],
    ...overrides
  };
}

function grantEvaluation(authorizedEffect = effect(), overrides = {}) {
  return {
    verified: true,
    allow: true,
    grant_id: 'grant:network-change',
    effect_id: authorizedEffect.effect_id,
    effect_digest: digestConsequentialEffect(authorizedEffect),
    authority_root_id: authorizedEffect.authority_root_id,
    causal_scope_id: authorizedEffect.causal_scope_id,
    policy_digest: authorizedEffect.policy_digest,
    currentness_evidence_digest: authorizedEffect.currentness_evidence_digest,
    evaluated_at: '2026-09-08T16:30:00.000Z',
    expires_at: '2026-09-08T16:35:00.000Z',
    ...overrides
  };
}

function admission(currentState = state(), overrides = {}) {
  return {
    verified: true,
    mode: 'compare-and-commit',
    state_id: currentState.state_id,
    state_version: currentState.state_version,
    state_digest: digestConsequentialState(currentState),
    ...overrides
  };
}
```

Add core RED tests:

```js
test('individually authorized transition is denied when projected state violates aggregate invariant', () => {
  const current = state({ facts: ['link:user-app', 'link:user-core'] });
  const proposed = effect({ add_facts: ['link:core-public'], target: 'route:core-public' });
  const result = evaluateConsequentialStateComposition({
    effect: proposed,
    grantEvaluation: grantEvaluation(proposed),
    state: current,
    invariants: [{ id: 'no-public-route', forbidden_all_of: ['link:core-public', 'link:user-core'] }],
    admissionEvidence: admission(current),
    now: NOW
  });
  assert.equal(result.decision, 'deny');
  assert.ok(result.reasons.includes('invariant-violated:no-public-route'));
  assert.equal(result.effect_invoked, false);
  assert.equal(result.authority_effect, 'none');
});

test('compatible transition remains only a non-authorizing permit candidate', () => {
  const current = state();
  const proposed = effect();
  const result = evaluateConsequentialStateComposition({
    effect: proposed,
    grantEvaluation: grantEvaluation(proposed),
    state: current,
    invariants: [{ id: 'no-public-route', forbidden_all_of: ['link:app-public', 'link:user-app'] }],
    admissionEvidence: admission(current),
    now: NOW
  });
  assert.equal(result.decision, 'permit_candidate');
  assert.deepEqual(result.reasons, []);
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.production_authorization, false);
  assert.equal(result.effect_invoked, false);
});
```

- [ ] **Step 2: Run focused test and witness RED**

```bash
node --test mesh/test/consequential-state-composition.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `consequential-state-composition-guard.mjs`. Existing fixture-structure tests remain conceptually satisfied.

- [ ] **Step 3: Implement strict normalization helpers**

Create `mesh/src/lib/consequential-state-composition-guard.mjs` importing only:

```js
import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject
} from './canonical.mjs';
```

Define:

```js
export const CONSEQUENTIAL_EFFECT_SCHEMA = 'axiom-consequential-effect.v1';
export const CONSEQUENTIAL_STATE_SCHEMA = 'axiom-consequential-state-projection.v1';
export const CONSEQUENTIAL_STATE_EVIDENCE_SCHEMA = 'axiom-consequential-state-evidence-receipt.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,191}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const ADMISSION_MODES = new Set([
  'compare-and-commit',
  'serialized',
  'single-authoritative-admitter'
]);
const TRANSITION_KINDS = new Set(['forward', 'rollback', 'remediation', 'recovery']);
```

Use local `exactObject()`, `id()`, `digest()`, `timestamp()`, `boundedInteger()`, and `sortedUniqueIds()` helpers matching the strict style in `authority-composition-guard.mjs`. `sortedUniqueIds()` must compare input with `[...new Set(values)].sort()` using `canonicalJson()` and reject if not already sorted/unique.

Effect required fields are exactly:

```text
schema
effect_id
effect_class
transition_kind
action
target
destination
protocol
origin_principal_id
executor_principal_id
authority_root_id
causal_scope_id
policy_digest
currentness_evidence_digest
expected_state_id
expected_state_version
max_state_age_ms
add_facts
remove_facts
requires_serializable_admission
```

Reject overlap between `add_facts` and `remove_facts`. `expected_state_version` is a non-negative safe integer. `max_state_age_ms` is an integer in `0..86400000`. `requires_serializable_admission` must be boolean.

State required fields are exactly:

```text
schema
state_id
state_version
captured_at
facts
committed_effect_ids
```

Grant-evaluation required fields are exactly:

```text
verified
allow
grant_id
effect_id
effect_digest
authority_root_id
causal_scope_id
policy_digest
currentness_evidence_digest
evaluated_at
expires_at
```

`verified` must be exactly `true`; otherwise throw `ValidationError` because an unverified object is not eligible as input evidence. `allow` may be true or false.

Admission evidence required fields are exactly:

```text
verified
mode
state_id
state_version
state_digest
```

If supplied, `verified` must be exactly true and `mode` must be one of the three accepted experimental modes.

Invariant entries are exactly:

```text
id
forbidden_all_of
```

Require `forbidden_all_of.length >= 1`, at most 64 facts per invariant, and at most 256 invariants.

- [ ] **Step 4: Implement exact digests and the projected state**

```js
export function digestConsequentialEffect(effect) {
  return digestObject(normalizeEffect(effect));
}

export function digestConsequentialState(state) {
  return digestObject(normalizeState(state));
}

function projectState(current, proposed) {
  const facts = new Set(current.facts);
  for (const fact of proposed.remove_facts) facts.delete(fact);
  for (const fact of proposed.add_facts) facts.add(fact);
  return Object.freeze({
    schema: CONSEQUENTIAL_STATE_SCHEMA,
    state_id: current.state_id,
    state_version: current.state_version + 1,
    captured_at: current.captured_at,
    facts: Object.freeze([...facts].sort()),
    committed_effect_ids: Object.freeze(
      [...new Set([...current.committed_effect_ids, proposed.effect_id])].sort()
    )
  });
}
```

The projected `captured_at` is descriptive only. The evaluator does not claim that `S1` has actually been observed or committed.

- [ ] **Step 5: Implement deny-dominant evaluation**

Implement the decision in this order so tests get stable reason codes:

```js
export function evaluateConsequentialStateComposition({
  effect,
  grantEvaluation,
  state,
  invariants = [],
  admissionEvidence,
  now = new Date()
}) {
  const proposed = normalizeEffect(effect);
  const grant = normalizeGrantEvaluation(grantEvaluation);
  const current = normalizeState(state);
  const normalizedInvariants = normalizeInvariants(invariants);
  const admission = admissionEvidence === undefined
    ? null
    : normalizeAdmissionEvidence(admissionEvidence);

  const nowMs = now instanceof Date ? now.valueOf() : new Date(now).valueOf();
  if (!Number.isFinite(nowMs)) throw new ValidationError('consequential evaluation now is invalid');

  const reasons = [];
  const proposedDigest = digestObject(proposed);
  const currentDigest = digestObject(current);

  if (grant.allow !== true) reasons.push('grant-not-allowing');
  if (grant.effect_id !== proposed.effect_id || grant.effect_digest !== proposedDigest) {
    reasons.push('effect-binding-mismatch');
  }
  if (grant.authority_root_id !== proposed.authority_root_id) reasons.push('authority-root-mismatch');
  if (grant.causal_scope_id !== proposed.causal_scope_id) reasons.push('causal-scope-mismatch');
  if (grant.policy_digest !== proposed.policy_digest) reasons.push('policy-mismatch');
  if (grant.currentness_evidence_digest !== proposed.currentness_evidence_digest) {
    reasons.push('currentness-binding-mismatch');
  }
  if (new Date(grant.expires_at).valueOf() <= nowMs) reasons.push('grant-evaluation-expired');

  if (current.state_id !== proposed.expected_state_id) reasons.push('state-id-mismatch');
  if (current.state_version !== proposed.expected_state_version) reasons.push('state-version-mismatch');
  const stateAge = nowMs - new Date(current.captured_at).valueOf();
  if (stateAge < 0 || stateAge > proposed.max_state_age_ms) reasons.push('state-stale');
  if (current.committed_effect_ids.includes(proposed.effect_id)) reasons.push('effect-already-committed');

  if (proposed.requires_serializable_admission) {
    if (!admission) {
      reasons.push('serializable-admission-required');
    } else {
      if (admission.state_id !== current.state_id) reasons.push('admission-state-id-mismatch');
      if (admission.state_version !== current.state_version) reasons.push('admission-state-version-mismatch');
      if (admission.state_digest !== currentDigest) reasons.push('admission-state-digest-mismatch');
    }
  }

  const projected = projectState(current, proposed);
  const projectedFacts = new Set(projected.facts);
  for (const invariant of normalizedInvariants) {
    if (invariant.forbidden_all_of.every((fact) => projectedFacts.has(fact))) {
      reasons.push(`invariant-violated:${invariant.id}`);
    }
  }

  const uniqueReasons = Object.freeze([...new Set(reasons)]);
  return Object.freeze({
    decision: uniqueReasons.length === 0 ? 'permit_candidate' : 'deny',
    reasons: uniqueReasons,
    effect_id: proposed.effect_id,
    effect_digest: proposedDigest,
    authority_root_id: proposed.authority_root_id,
    causal_scope_id: proposed.causal_scope_id,
    evaluated_protocol: proposed.protocol,
    transition_kind: proposed.transition_kind,
    state_id: current.state_id,
    state_version: current.state_version,
    state_digest: currentDigest,
    projected_state: projected,
    projected_state_digest: digestObject(projected),
    serializable_admission_required: proposed.requires_serializable_admission,
    authority_effect: 'none',
    production_authorization: false,
    effect_invoked: false,
    protocol_is_authority: false,
    deputy_identity_is_authority: false,
    root_budget_compliance_claimed: false,
    external_satisfaction_claimed: false
  });
}
```

Do not change `authority-composition-guard.mjs`; this new guard consumes its conceptual output boundary rather than replacing it.

- [ ] **Step 6: Run focused tests and verify GREEN**

```bash
node --test mesh/test/consequential-state-composition.test.mjs
```

Expected: aggregate-invariant denial and compatible permit-candidate tests pass, along with Task 1 structural tests.

- [ ] **Step 7: Commit Task 2**

```bash
git add \
  mesh/src/lib/consequential-state-composition-guard.mjs \
  mesh/test/consequential-state-composition.test.mjs
git commit -m "feat: add consequential state composition guard"
```

---

### Task 3: Currentness, protocol/deputy, rollback, replay, and concurrency semantics

**Files:**
- Modify: `mesh/test/consequential-state-composition.test.mjs`
- Modify only for test-discovered defect: `mesh/src/lib/consequential-state-composition-guard.mjs`

**Interfaces:**
- Uses the Task 2 public interface unchanged.
- Adds no protocol-specific adapter or production transport.

- [ ] **Step 1: Add RED adversarial tests for exact bindings/currentness**

Add:

```js
test('destination substitution cannot reuse an exact authorized effect binding', () => {
  const authorized = effect();
  const proposed = effect({ destination: 'network:external' });
  const current = state();
  const result = evaluateConsequentialStateComposition({
    effect: proposed,
    grantEvaluation: grantEvaluation(authorized),
    state: current,
    invariants: [],
    admissionEvidence: admission(current),
    now: NOW
  });
  assert.equal(result.decision, 'deny');
  assert.ok(result.reasons.includes('effect-binding-mismatch'));
});

test('stale state is denied at the late composition boundary', () => {
  const proposed = effect();
  const current = state({ captured_at: '2026-09-08T16:20:00.000Z' });
  const result = evaluateConsequentialStateComposition({
    effect: proposed,
    grantEvaluation: grantEvaluation(proposed),
    state: current,
    invariants: [],
    admissionEvidence: admission(current),
    now: NOW
  });
  assert.equal(result.decision, 'deny');
  assert.ok(result.reasons.includes('state-stale'));
});
```

Also add tests for `grant-evaluation-expired`, `policy-mismatch`, `currentness-binding-mismatch`, `state-id-mismatch`, and `state-version-mismatch`.

- [ ] **Step 2: Add protocol-switch composition test**

```js
test('protocol switching does not reset aggregate state composition', () => {
  const current = state({ facts: ['link:user-app', 'link:user-core'] });
  const proposed = effect({
    protocol: 'rest',
    target: 'route:core-public',
    add_facts: ['link:core-public']
  });
  const result = evaluateConsequentialStateComposition({
    effect: proposed,
    grantEvaluation: grantEvaluation(proposed),
    state: current,
    invariants: [{ id: 'no-public-route', forbidden_all_of: ['link:core-public', 'link:user-core'] }],
    admissionEvidence: admission(current),
    now: NOW
  });
  assert.equal(result.decision, 'deny');
  assert.ok(result.reasons.includes('invariant-violated:no-public-route'));
  assert.equal(result.evaluated_protocol, 'rest');
  assert.equal(result.protocol_is_authority, false);
});
```

This test must deny because of aggregate state, not merely because the protocol changed.

- [ ] **Step 3: Add deputy-root attribution test**

```js
test('provider deputy identity cannot replace the originating authority root', () => {
  const proposed = effect({ executor_principal_id: 'principal:provider-1' });
  const current = state();
  const result = evaluateConsequentialStateComposition({
    effect: proposed,
    grantEvaluation: grantEvaluation(proposed, { authority_root_id: 'authority-root:provider' }),
    state: current,
    invariants: [],
    admissionEvidence: admission(current),
    now: NOW
  });
  assert.equal(result.decision, 'deny');
  assert.ok(result.reasons.includes('authority-root-mismatch'));
  assert.equal(result.deputy_identity_is_authority, false);
});
```

- [ ] **Step 4: Add rollback and duplicate/retry tests**

```js
test('rollback receives no authority shortcut', () => {
  const proposed = effect({ transition_kind: 'rollback', action: 'route.remove' });
  const current = state();
  const result = evaluateConsequentialStateComposition({
    effect: proposed,
    grantEvaluation: grantEvaluation(proposed, { allow: false }),
    state: current,
    invariants: [],
    admissionEvidence: admission(current),
    now: NOW
  });
  assert.equal(result.decision, 'deny');
  assert.ok(result.reasons.includes('grant-not-allowing'));
  assert.equal(result.transition_kind, 'rollback');
});

test('a committed exact effect id cannot be retried as a second state change', () => {
  const proposed = effect();
  const current = state({ committed_effect_ids: ['effect:route-app-db'] });
  const result = evaluateConsequentialStateComposition({
    effect: proposed,
    grantEvaluation: grantEvaluation(proposed),
    state: current,
    invariants: [],
    admissionEvidence: admission(current),
    now: NOW
  });
  assert.equal(result.decision, 'deny');
  assert.ok(result.reasons.includes('effect-already-committed'));
});
```

- [ ] **Step 5: Add stale-concurrency and admission-proof tests**

```js
test('concurrency-sensitive effect fails closed without serializable admission evidence', () => {
  const proposed = effect({ requires_serializable_admission: true });
  const current = state();
  const result = evaluateConsequentialStateComposition({
    effect: proposed,
    grantEvaluation: grantEvaluation(proposed),
    state: current,
    invariants: [],
    admissionEvidence: undefined,
    now: NOW
  });
  assert.equal(result.decision, 'deny');
  assert.ok(result.reasons.includes('serializable-admission-required'));
});

test('stale admission version cannot authorize both sides of a race', () => {
  const proposed = effect();
  const current = state();
  const result = evaluateConsequentialStateComposition({
    effect: proposed,
    grantEvaluation: grantEvaluation(proposed),
    state: current,
    invariants: [],
    admissionEvidence: admission(current, { state_version: 6 }),
    now: NOW
  });
  assert.equal(result.decision, 'deny');
  assert.ok(result.reasons.includes('admission-state-version-mismatch'));
});
```

Also cover wrong `state_digest` and unsupported admission mode.

- [ ] **Step 6: Run focused test and repair only genuine guard defects**

```bash
node --test mesh/test/consequential-state-composition.test.mjs
```

Expected: all Task 1–3 tests pass. If any new assertion fails, correct only the smallest pure evaluator defect. Do not introduce storage/locking/network code to make a laboratory concurrency test pass.

- [ ] **Step 7: Commit Task 3**

```bash
git add mesh/test/consequential-state-composition.test.mjs \
  mesh/src/lib/consequential-state-composition-guard.mjs
git commit -m "test: harden consequential state composition boundaries"
```

If the source module did not change, commit only the test file.

---

### Task 4: Requested/admitted/invoked/acknowledged/observed evidence separation

**Files:**
- Modify: `mesh/src/lib/consequential-state-composition-guard.mjs`
- Modify: `mesh/test/consequential-state-composition.test.mjs`

**Interfaces:**
- Produces `buildConsequentialStateEvidenceReceipt()` without adding an executor.
- The receipt is descriptive evidence only and cannot claim execution authority or external satisfaction.

- [ ] **Step 1: Write the receipt RED**

Add:

```js
import { buildConsequentialStateEvidenceReceipt } from '../src/lib/consequential-state-composition-guard.mjs';

test('remote acknowledgement does not prove observed state or satisfaction', () => {
  const proposed = effect();
  const current = state();
  const evaluation = evaluateConsequentialStateComposition({
    effect: proposed,
    grantEvaluation: grantEvaluation(proposed),
    state: current,
    invariants: [],
    admissionEvidence: admission(current),
    now: NOW
  });

  const observed = state({
    state_version: 8,
    captured_at: '2026-09-08T16:31:00.000Z',
    facts: ['link:user-app', 'link:unexpected-target']
  });

  const receipt = buildConsequentialStateEvidenceReceipt({
    effect: proposed,
    evaluation,
    invocation: { attempted: true, executor_evidence_ref: 'evidence:executor:123' },
    remoteAcknowledgement: { acknowledged: true, acknowledgement_ref: 'remote:ack:123' },
    observedState: { independently_verified: true, state: observed, evidence_ref: 'observer:state:123' }
  });

  assert.equal(receipt.schema, 'axiom-consequential-state-evidence-receipt.v1');
  assert.equal(receipt.invocation_attempted, true);
  assert.equal(receipt.remote_acknowledged, true);
  assert.equal(receipt.observed_state_present, true);
  assert.equal(receipt.external_outcome, 'discrepancy');
  assert.equal(receipt.external_satisfaction_claimed, false);
  assert.equal(receipt.execution_authority, false);
  assert.equal(receipt.authority_effect, 'none');
});
```

- [ ] **Step 2: Run focused test and witness RED**

```bash
node --test mesh/test/consequential-state-composition.test.mjs
```

Expected: FAIL because `buildConsequentialStateEvidenceReceipt` is not yet exported/implemented. Existing evaluator tests remain green.

- [ ] **Step 3: Implement a strict inert receipt builder**

Use closed optional input shapes:

```js
function normalizeInvocation(raw) {
  if (raw === undefined) return null;
  const value = exactObject(raw, ['attempted', 'executor_evidence_ref'], 'invocation evidence');
  if (value.attempted !== true) throw new ValidationError('invocation evidence attempted must be true');
  return Object.freeze({
    attempted: true,
    executor_evidence_ref: id(value.executor_evidence_ref, 'invocation executor_evidence_ref')
  });
}

function normalizeRemoteAcknowledgement(raw) {
  if (raw === undefined) return null;
  const value = exactObject(raw, ['acknowledged', 'acknowledgement_ref'], 'remote acknowledgement');
  if (value.acknowledged !== true) throw new ValidationError('remote acknowledgement acknowledged must be true');
  return Object.freeze({
    acknowledged: true,
    acknowledgement_ref: id(value.acknowledgement_ref, 'remote acknowledgement_ref')
  });
}
```

Observed-state input is exactly:

```text
independently_verified
evidence_ref
state
```

Require `independently_verified === true`; otherwise reject it as insufficient to populate the independent-observation lane. Normalize the nested state with the same state validator.

Implement:

```js
export function buildConsequentialStateEvidenceReceipt({
  effect,
  evaluation,
  invocation,
  remoteAcknowledgement,
  observedState
}) {
  const proposed = normalizeEffect(effect);
  if (!evaluation || typeof evaluation !== 'object') {
    throw new ValidationError('evaluation must be an object');
  }
  if (evaluation.effect_digest !== digestObject(proposed)) {
    throw new ValidationError('evaluation is bound to a different effect');
  }

  const invocationEvidence = normalizeInvocation(invocation);
  const acknowledgement = normalizeRemoteAcknowledgement(remoteAcknowledgement);
  const observed = normalizeObservedState(observedState);

  let externalOutcome = 'unobserved';
  let observedDigest = null;
  let observedMatchesProjected = null;
  if (observed) {
    observedDigest = digestObject(observed.state);
    observedMatchesProjected = canonicalJson(observed.state.facts) ===
      canonicalJson(evaluation.projected_state.facts);
    externalOutcome = observedMatchesProjected ? 'matches-projection' : 'discrepancy';
  }

  return Object.freeze({
    schema: CONSEQUENTIAL_STATE_EVIDENCE_SCHEMA,
    effect_id: proposed.effect_id,
    effect_digest: evaluation.effect_digest,
    admission_decision: evaluation.decision,
    admission_reasons: evaluation.reasons,
    admission_state_digest: evaluation.state_digest,
    projected_state_digest: evaluation.projected_state_digest,
    invocation_attempted: invocationEvidence !== null,
    invocation_evidence_ref: invocationEvidence?.executor_evidence_ref ?? null,
    remote_acknowledged: acknowledgement !== null,
    remote_acknowledgement_ref: acknowledgement?.acknowledgement_ref ?? null,
    observed_state_present: observed !== null,
    observed_state_digest: observedDigest,
    observed_state_evidence_ref: observed?.evidence_ref ?? null,
    observed_matches_projected: observedMatchesProjected,
    external_outcome: externalOutcome,
    effect_execution_claimed: false,
    external_satisfaction_claimed: false,
    execution_authority: false,
    authority_effect: 'none'
  });
}
```

The receipt deliberately says `effect_execution_claimed: false` even when an invocation attempt exists. A future executor-specific receipt may separately prove actual invocation/effect under its own gate.

- [ ] **Step 4: Add no-observation and matching-observation controls**

Prove:

```text
remote acknowledgement + no observed state -> external_outcome = unobserved
independently verified matching facts -> external_outcome = matches-projection
independently verified differing facts -> external_outcome = discrepancy
unverified observed-state input -> ValidationError
```

None of those cases may set `external_satisfaction_claimed`, `effect_execution_claimed`, `execution_authority`, or `authority_effect` to a positive value.

- [ ] **Step 5: Run focused tests and verify GREEN**

```bash
node --test mesh/test/consequential-state-composition.test.mjs
```

- [ ] **Step 6: Commit Task 4**

```bash
git add mesh/src/lib/consequential-state-composition-guard.mjs \
  mesh/test/consequential-state-composition.test.mjs
git commit -m "feat: separate consequential state evidence lanes"
```

---

### Task 5: Drive the portable A-J corpus through the evaluator

**Files:**
- Modify: `mesh/test/consequential-state-composition.test.mjs`
- Modify only for test-discovered defect: the two Agent Commons JSON files or the pure guard.

**Interfaces:**
- Establishes that the machine-readable corpus and executable laboratory semantics agree.
- Does not create a generic fixture runner in production source.

- [ ] **Step 1: Add a test-only RFC 7396 merge-patch helper**

```js
function mergePatch(target, patch) {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return structuredClone(patch);
  const output = target && typeof target === 'object' && !Array.isArray(target)
    ? structuredClone(target)
    : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete output[key];
    else output[key] = mergePatch(output[key], value);
  }
  return output;
}
```

This helper lives only in the test. Do not make merge-patch semantics part of runtime authority code.

- [ ] **Step 2: Add a fixture materializer that binds exact digests**

```js
function materializeCase(fixtures, entry) {
  const input = mergePatch(fixtures.baseline, entry.patch ?? {});
  const authorizedEffect = input.authorized_effect;
  const proposedEffect = input.proposed_effect;
  const currentState = input.state;

  input.grant_evaluation = {
    ...input.grant_evaluation,
    effect_id: authorizedEffect.effect_id,
    effect_digest: digestConsequentialEffect(authorizedEffect)
  };
  input.admission_evidence = {
    ...input.admission_evidence,
    state_digest: digestConsequentialState(currentState)
  };

  return { input, authorizedEffect, proposedEffect, currentState };
}
```

For the `concurrent-stale-state-race` case, apply the case patch to `admission_evidence.state_version` after the helper fills the state digest so only the intended stale-version dimension changes.

- [ ] **Step 3: Add one loop covering all evaluator decision cases**

```js
test('portable A-J corpus agrees with the laboratory evaluator', async () => {
  const fixtures = await loadJson(fixturesUrl);

  for (const entry of fixtures.cases) {
    if (entry.id === 'requested-state-differs-from-observed-state') continue;

    const { input, proposedEffect, currentState } = materializeCase(fixtures, entry);
    const result = evaluateConsequentialStateComposition({
      effect: proposedEffect,
      grantEvaluation: input.grant_evaluation,
      state: currentState,
      invariants: input.invariants,
      admissionEvidence: input.admission_evidence,
      now: new Date(input.now)
    });

    assert.equal(result.decision, entry.expect.decision, entry.id);
    if (entry.expect.primary_reason) {
      assert.ok(result.reasons.includes(entry.expect.primary_reason), entry.id);
    }
    assert.equal(result.effect_invoked, false, entry.id);
    assert.equal(result.authority_effect, 'none', entry.id);
    assert.equal(result.production_authorization, false, entry.id);
  }
});
```

- [ ] **Step 4: Add the requested-vs-observed fixture receipt test**

Materialize the `requested-state-differs-from-observed-state` case, run the evaluator, then call `buildConsequentialStateEvidenceReceipt()` using the exact receipt inputs stored in the fixture. Assert:

```js
assert.equal(evaluation.decision, 'permit_candidate');
assert.equal(receipt.remote_acknowledged, true);
assert.equal(receipt.external_outcome, 'discrepancy');
assert.equal(receipt.external_satisfaction_claimed, false);
assert.equal(receipt.effect_execution_claimed, false);
assert.equal(receipt.authority_effect, 'none');
```

- [ ] **Step 5: Run focused tests and verify GREEN**

```bash
node --test mesh/test/consequential-state-composition.test.mjs
```

Expected: all structural, unit, adversarial, receipt, and corpus-driven cases pass.

- [ ] **Step 6: Commit Task 5**

```bash
git add \
  agent-commons/consequential-state-composition-profile.v1.json \
  agent-commons/consequential-state-composition-fixtures.v1.json \
  mesh/src/lib/consequential-state-composition-guard.mjs \
  mesh/test/consequential-state-composition.test.mjs
git commit -m "test: verify consequential state corpus conformance"
```

Only include files that actually changed during the corpus alignment.

---

### Task 6: Static authority/effect boundary and canonical documentation registration

**Files:**
- Create: `mesh/test/consequential-state-composition-boundary.test.mjs`
- Create: `mesh/test/consequential-state-composition-doc-registration.test.mjs`
- Modify: `mesh/src/check-docs.mjs`
- Existing: `docs/superpowers/specs/2026-09-08-consequential-mcp-state-composition-design.md`
- Existing: `docs/superpowers/plans/2026-09-08-consequential-mcp-state-composition.md`

**Interfaces:**
- Proves the laboratory guard is not reachable as a production effect/authority path.
- Registers only the spec and plan Markdown documents in the canonical documentation boundary.

- [ ] **Step 1: Write static forbidden-import/effect tests**

Create:

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const guardUrl = new URL('../src/lib/consequential-state-composition-guard.mjs', import.meta.url);
const registryUrl = new URL('../config/capabilities.json', import.meta.url);

function importsFrom(source) {
  return [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);
}

test('consequential state guard is a pure canonical-data evaluator only', async () => {
  const source = await readFile(guardUrl, 'utf8');
  assert.deepEqual(importsFrom(source), ['./canonical.mjs']);

  for (const forbidden of [
    'node:fs', 'node:http', 'node:https', 'node:net', 'node:tls', 'node:dns',
    'node:dgram', 'node:child_process', 'gateway', 'hypervisor', 'sandbox', 'grid',
    'provider-supervisor', 'runtime-adapter', 'credential', 'wallet', 'payment'
  ]) {
    assert.equal(source.toLowerCase().includes(`from '${forbidden}`), false, forbidden);
    assert.equal(source.toLowerCase().includes(`from "${forbidden}`), false, forbidden);
  }

  for (const executableToken of [
    /\bfetch\s*\(/,
    /\bspawn\s*\(/,
    /\bexec(?:File)?\s*\(/,
    /\bwriteFile\s*\(/,
    /\bcreateConnection\s*\(/,
    /\bgrantCapability\s*\(/,
    /\binvokeEffect\s*\(/
  ]) {
    assert.equal(executableToken.test(source), false, String(executableToken));
  }
});

test('experimental state composition is not a registered production capability', async () => {
  const registry = JSON.parse(await readFile(registryUrl, 'utf8'));
  const ids = registry.capabilities.map(({ id }) => id);
  assert.equal(ids.some((id) => /consequential.*state|state.*composition/i.test(id)), false);
});
```

- [ ] **Step 2: Run boundary test before any correction**

```bash
node --test mesh/test/consequential-state-composition-boundary.test.mjs
```

Expected: PASS if Tasks 2–5 preserved the pure boundary. If it fails because a forbidden production dependency was introduced, remove that dependency; do not weaken the static test.

- [ ] **Step 3: Write canonical-document registration RED**

Create:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { CANONICAL_DOCUMENTS } from '../src/check-docs.mjs';

const required = new Set([
  'docs/superpowers/specs/2026-09-08-consequential-mcp-state-composition-design.md',
  'docs/superpowers/plans/2026-09-08-consequential-mcp-state-composition.md'
]);

test('consequential MCP state-composition spec and plan are canonical documents', () => {
  const canonical = new Set(CANONICAL_DOCUMENTS);
  for (const path of required) {
    assert.equal(canonical.has(path), true, `${path} must be canonical`);
  }
});
```

Run:

```bash
node --test mesh/test/consequential-state-composition-doc-registration.test.mjs
```

Expected: FAIL because the two new Markdown paths are not yet registered on the implementation branch.

- [ ] **Step 4: Register exactly the spec and plan**

Add exactly these two lines to `CANONICAL_DOCUMENTS` in `mesh/src/check-docs.mjs`, alongside the other 2026-09-08 superpowers documents:

```js
'docs/superpowers/specs/2026-09-08-consequential-mcp-state-composition-design.md',
'docs/superpowers/plans/2026-09-08-consequential-mcp-state-composition.md',
```

Do not register the Agent Commons JSON fixture files as canonical Markdown documents; their structure is enforced by the dedicated conformance test.

- [ ] **Step 5: Run documentation and boundary checks**

```bash
node --test \
  mesh/test/consequential-state-composition.test.mjs \
  mesh/test/consequential-state-composition-boundary.test.mjs \
  mesh/test/consequential-state-composition-doc-registration.test.mjs
node mesh/src/check-docs.mjs
```

Expected: all pass.

- [ ] **Step 6: Commit Task 6**

```bash
git add \
  mesh/src/check-docs.mjs \
  mesh/test/consequential-state-composition-boundary.test.mjs \
  mesh/test/consequential-state-composition-doc-registration.test.mjs \
  docs/superpowers/specs/2026-09-08-consequential-mcp-state-composition-design.md \
  docs/superpowers/plans/2026-09-08-consequential-mcp-state-composition.md
git commit -m "test: enforce consequential state authority boundary"
```

---

### Task 7: Full verification, exact-head review, and draft implementation PR

**Files:**
- No new production file is introduced in this task.
- Modify only test/profile/guard/docs files if a verified failure identifies a genuine defect inside the approved file envelope.

**Interfaces:**
- Produces verification evidence only; does not promote the experimental guard.

- [ ] **Step 1: Run the complete focused suite**

```bash
node --test \
  mesh/test/consequential-state-composition.test.mjs \
  mesh/test/consequential-state-composition-boundary.test.mjs \
  mesh/test/consequential-state-composition-doc-registration.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run Agent Commons and repository checks**

```bash
npm run agent-commons:check
npm run check
```

Expected: exit code 0. `mesh/config/capabilities.json` remains unchanged.

If `agent-commons:check` or `check` requires runtime activation, a new policy/capability entry, network access, or a production adapter merely to recognize the fixtures, STOP and return to design review rather than weakening the checker.

- [ ] **Step 3: Inspect the exact changed-file envelope**

```bash
git diff --name-only <IMPLEMENTATION_BASE_SHA>...HEAD
```

`<IMPLEMENTATION_BASE_SHA>` is the exact protected `main` head from which the implementation worktree/branch is created at execution time. It is intentionally resolved then, not hard-coded now, because `main` is active.

The final changed-file set must be a subset of:

```text
agent-commons/consequential-state-composition-profile.v1.json
agent-commons/consequential-state-composition-fixtures.v1.json
mesh/src/lib/consequential-state-composition-guard.mjs
mesh/test/consequential-state-composition.test.mjs
mesh/test/consequential-state-composition-boundary.test.mjs
mesh/test/consequential-state-composition-doc-registration.test.mjs
mesh/src/check-docs.mjs
docs/superpowers/specs/2026-09-08-consequential-mcp-state-composition-design.md
docs/superpowers/plans/2026-09-08-consequential-mcp-state-composition.md
```

If any capability registry, policy, Gateway, Hypervisor, Sandbox, Grid, provider, credential, deployment, runtime-adapter, networking, persistence, or effect-executor file appears, STOP and reopen Stage 5B rather than normalizing the scope expansion.

- [ ] **Step 4: Confirm the current existing causal composition guard is unchanged**

```bash
git diff <IMPLEMENTATION_BASE_SHA>...HEAD -- mesh/src/lib/authority-composition-guard.mjs
```

Expected: no diff. This slice supplements resulting-state composition; it does not replace the existing causal grant/intent composition substrate.

- [ ] **Step 5: Open a draft implementation PR**

Use title:

```text
Agent Commons: add consequential state-composition conformance
```

PR body must state:

```markdown
## Scope

Experimental Agent Commons conformance only. No production effect authorization, MCP/A2A activation, provider integration, capability promotion, credential, deployment, or policy change.

## Core invariant

An individually authorized consequential effect is still denied when its projected aggregate state violates a current invariant or exact state/currentness/serializable-admission requirements are not established.

## Authority boundary

- consumes already-verified local-grant evaluation; does not issue grants;
- `permit_candidate` is non-authorizing;
- `authority_effect: none`;
- `production_authorization: false`;
- `effect_invoked: false`;
- protocol/deputy identity cannot create a new authority root;
- rollback receives no authority shortcut;
- remote acknowledgement does not prove observed state or satisfaction;
- state composition does not claim root/subtree budget compliance.

## TDD evidence

Record the exact Task 1 fixture RED, Task 2 missing-module RED, Task 4 receipt RED, documentation-registration RED, and corresponding GREEN commit SHAs.
```

Keep the implementation PR draft until exact-head protected checks and review are complete.

- [ ] **Step 6: Require protected exact-head verification**

Read and confirm the exact immutable PR head's protected workflow results. At minimum require the repository's normal lanes represented by current practice:

```text
Clean Kernel / verify
Clean Kernel / container
Node 22 compatibility
Windows Compatibility
macOS Apple Silicon compatibility
macOS Intel compatibility
CodeQL / JavaScript-TypeScript
CodeQL / actions
```

Do not claim passing, ready, complete, or mergeable until the exact head's results have been read.

- [ ] **Step 7: Review focus before readiness**

Review must explicitly answer:

```text
1. Does the guard consume, rather than recreate, local authorization?
2. Can tool/protocol/provider identity ever change authority_root_id or causal_scope_id semantics?
3. Can two individually valid facts form a forbidden S1 without denial?
4. Can stale state/currentness/admission evidence produce permit_candidate?
5. Can replay of committed effect_id compound state?
6. Does rollback bypass current grant evaluation?
7. Can remote acknowledgement become observed-state or satisfaction proof?
8. Does permit_candidate make any production authorization/effect claim?
9. Is root/subtree budget compliance kept explicitly separate?
10. Are there any imports or file changes that create a real effect path?
```

Any answer requiring a persistent authoritative state service, distributed lock/ledger, real executor, MCP adapter, provider adapter, capability promotion, or production currentness source is a fresh Stage 5B design issue, not a patch inside this slice.

- [ ] **Step 8: Commit only verified repairs, then re-run exact-head checks**

For each review/CI defect:

```bash
# write a focused failing regression first
node --test <exact-focused-test>
# verify RED for the intended defect
# apply the smallest fail-closed fix
node --test <exact-focused-test>
npm run check
```

Each repair gets its own commit and invalidates earlier exact-head CI until the new head is reverified.

---

## Plan Self-Review Record

### 1. Spec coverage

- Tool reachability/authentication not authority: Tasks 1, 2, 6.
- Concrete effect binding: Tasks 2 and 3.
- `S0 + E -> S1` projected-state model: Task 2.
- Aggregate forbidden state despite individually valid effect: Tasks 2, 3, 5.
- Causal/root scope across protocol transitions: Tasks 2, 3, 5.
- Effect-time state/currentness freshness: Task 3.
- Provider/deputy attribution: Task 3.
- Rollback as a new consequential effect: Task 3.
- Replay/duplicate ambiguity: Tasks 3 and 5.
- Atomic/serializable admission requirement: Tasks 2 and 3.
- Requested/admitted/invoked/acknowledged/observed separation: Task 4.
- Portable A-J corpus: Tasks 1 and 5.
- Positive control: Tasks 1, 2, 5.
- Semantic elevation / non-authority claims: Tasks 2, 4, 6.
- Static no-side-effect/no-registry boundary: Task 6.
- Canonical document registration: Task 6.
- Full verification and exact-head review: Task 7.

No approved spec requirement is left without an implementation/test task.

### 2. Placeholder scan

There are no `TBD`, `TODO`, “implement later”, “similar to Task N”, or unspecified error-handling steps. `<IMPLEMENTATION_BASE_SHA>` is intentionally resolved only when execution starts from the then-current protected `main`; hard-coding today's head would make the plan stale and weaken exact-head evidence.

### 3. Type/interface consistency

- `digestConsequentialEffect()` always digests the same strict normalized effect consumed by `evaluateConsequentialStateComposition()`.
- `digestConsequentialState()` always digests the same strict state shape used by admission evidence.
- `grantEvaluation.effect_digest` binds the exact authorized effect, while the evaluator compares it to the proposed effect; destination/argument substitutions therefore fail as `effect-binding-mismatch`.
- `authority_root_id`, `causal_scope_id`, `policy_digest`, and `currentness_evidence_digest` have one spelling across profile, fixtures, tests, and source.
- Admission modes are exactly `compare-and-commit`, `serialized`, and `single-authoritative-admitter`.
- Decisions are exactly `permit_candidate` and `deny`.
- All evaluator results keep `authority_effect: 'none'`, `production_authorization: false`, and `effect_invoked: false`.
- Receipt outcomes are exactly `unobserved`, `matches-projection`, and `discrepancy`; none imply external satisfaction.

### 4. Scope/authority consistency

The plan intentionally does not modify `authority-composition-guard.mjs`, does not implement a second grant engine, and does not connect the state-composition guard to any executor. Root/subtree budgets remain a separate complementary control. A future production integration requires a fresh Stage 5B gate defining authoritative state sources, real atomic/serializable admission, multi-replica semantics, rollback/recovery, deputy attribution, effect receipts, and explicit runtime approval.