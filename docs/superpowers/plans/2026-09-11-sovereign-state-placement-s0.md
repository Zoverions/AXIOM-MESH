# Sovereign State Placement S0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the inert S0 state-placement contracts and deterministic fail-closed policy evaluator that can explain which synthetic storage destinations are eligible for a logical placement request without performing provider I/O, changing canonical Grid state, or granting storage/network authority.

**Architecture:** S0 introduces four closed language-neutral contracts: `StatePlacementRequest`, `StateDestinationProfile`, `StatePlacementPolicy`, and `StatePlacementPlan`. A zero-dependency pure evaluator validates all four inputs, applies hard residency/privacy/retention/destination constraints before any optimization, returns deterministic eligible/ineligible destination sets with bounded reason codes, and produces a content-addressed plan that explicitly has no authority or provider effect. Grid remains the canonical first-generation state authority; S0 never opens a provider, network, filesystem, Gateway, Hypervisor, Sandbox, or Grid path.

**Tech Stack:** Node.js ESM on the repository-supported Node ranges (`>=22.23.2 <23 || >=24.14.0 <25`), built-in `node:test`, JSON Schema 2020-12 contract descriptions, existing `mesh/src/lib/canonical.mjs`, zero third-party runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-09-11-sovereign-state-placement-projection-plane-design.md`

## Global Constraints

- Grid remains the first-generation canonical authoritative state store.
- Storage location, recency, provider acknowledgement, availability, cache hit, or replica count never creates canonical state authority.
- Placement eligibility is not provider execution authority.
- S0 performs no provider I/O, no network I/O, no filesystem I/O, no credential access, no Gateway route, no Grid write/read, and no external effect.
- Do not modify `mesh/config/capabilities.json`, production policy, Gateway client contract, service-network policy, Hypervisor, Sandbox, Grid store/server, provider supervisor, or production deployment files.
- Reuse `canonicalJson`, `digestObject`, and `ValidationError` from `mesh/src/lib/canonical.mjs`; do not introduce a second canonicalization or hashing implementation.
- Every S0 contract is a plain JSON-compatible object, closed to unknown fields, bounded, and content-addressed where it carries a digest.
- Unknown enum values, malformed digests, duplicate set members, non-canonical timestamps, stale/expired request or policy, impossible time bounds, or unsupported destination evidence fail closed.
- Residency, confidentiality, retention, destination, and policy constraints are hard filters. No cost/performance preference may compensate for violating them.
- The evaluator ranks nothing in S0. Eligible destinations are sorted deterministically by `destination_id`; optimization belongs to a later separately approved slice.
- The evaluator reports ineligible destinations with closed reason codes rather than silently dropping them.
- A plan may report `satisfied: false` when the availability target cannot be met. That is a truthful planning result, not an exception and not permission to weaken constraints.
- Maximum placement request, destination profile, policy profile, or plan canonical serialized size: 65,536 bytes each.
- Maximum destination candidates per evaluation: 64.
- Maximum permitted destination classes: 16. Maximum forbidden destination classes: 16.
- Maximum region codes: 16. Maximum allowed operations/purposes/data classes/encryption profiles per destination profile: 32 each.
- Maximum plan lifetime: 15 minutes and never beyond either request or policy expiry.
- All S0 outputs preserve `authority_effect: 'none'`, `network_effect: 'none'`, `provider_effect: 'none'`, and `canonical_state_effect: 'none'`.
- Implementation must begin from current `main` after the design/plan documentation gate is merged or otherwise reconstructed exactly on current `main`; do not implement from a stale design branch.

## Scope decomposition

The approved design includes S0-S6. This plan implements **S0 only**. S1 provider-adapter work, S2 projection outbox work, S3 derived consumers, S4 remote object adapters, S5 recovery pilot, and S6 scale campaign each require later execution plans so they can be reviewed and rejected independently.

## Exact changed-file envelope for S0

The S0 implementation may create or modify only:

```text
docs/architecture/contracts/state-placement-request.v1.schema.json
docs/architecture/contracts/state-destination-profile.v0.schema.json
docs/architecture/contracts/state-placement-policy.v0.schema.json
docs/architecture/contracts/state-placement-plan.v1.schema.json
mesh/src/lib/state-placement-contracts.mjs
mesh/src/lib/state-placement-policy.mjs
mesh/fixtures/state-placement/s0-vectors.json
mesh/test/state-placement-contracts.test.mjs
mesh/test/state-placement-policy.test.mjs
mesh/test/state-placement-authority-boundary.test.mjs
docs/security/STATE-PLACEMENT-PROJECTION-THREAT-MODEL.md
docs/MASTER-TODO.md
docs/rebuild/STATUS.md
docs/README.md
mesh/src/check-docs.mjs
docs/superpowers/specs/2026-09-11-sovereign-state-placement-projection-plane-design.md
docs/superpowers/plans/2026-09-11-sovereign-state-placement-s0.md
```

If implementation requires a different production policy, Gateway, Hypervisor, Sandbox, Grid, service-network, credential, provider, storage SDK, network client, capability-registry, or runtime file, stop and reopen the architecture gate.

---

### Task 1: Closed S0 placement contracts and semantic verifier

**Files:**
- Create: `docs/architecture/contracts/state-placement-request.v1.schema.json`
- Create: `docs/architecture/contracts/state-destination-profile.v0.schema.json`
- Create: `docs/architecture/contracts/state-placement-policy.v0.schema.json`
- Create: `docs/architecture/contracts/state-placement-plan.v1.schema.json`
- Create: `mesh/src/lib/state-placement-contracts.mjs`
- Test: `mesh/test/state-placement-contracts.test.mjs`

**Interfaces:**
- Consumes: `canonicalJson(value)`, `digestObject(value)`, `ValidationError` from `mesh/src/lib/canonical.mjs`.
- Produces:
  - `STATE_PLACEMENT_REQUEST_SCHEMA = 'axiom-state-placement-request.v1'`
  - `STATE_DESTINATION_PROFILE_SCHEMA = 'axiom-state-destination-profile.v0'`
  - `STATE_PLACEMENT_POLICY_SCHEMA = 'axiom-state-placement-policy.v0'`
  - `STATE_PLACEMENT_PLAN_SCHEMA = 'axiom-state-placement-plan.v1'`
  - `PLACEMENT_OPERATION_CLASSES = Object.freeze(['replicate','cache','archive','export-staging','restore-staging'])`
  - `DESTINATION_CLASSES = Object.freeze(['owner-local','owner-peer','managed-object','institutional-escrow','cold-archive'])`
  - `RESIDENCY_EVIDENCE_LEVELS = Object.freeze(['unknown','declared','provider-configured','authenticated-assertion','independently-verified'])`
  - `CONFIDENTIALITY_LEVELS = Object.freeze(['public','protected','sensitive','restricted'])`
  - `CONSISTENCY_CLASSES = Object.freeze(['immutable-object','eventual-derived','bounded-lag-replica'])`
  - `RECOVERY_IMPORTANCE = Object.freeze(['ordinary','important','critical'])`
  - `CONSEQUENCE_CLASSES = Object.freeze(['C0','C1','C2','C3'])`
  - `PLACEMENT_REASON_CODES` as the exact closed reason-code list defined in Task 2.
  - `contractDigest(value, digestField)` -> `sha256:<64 lowercase hex>` computed over the canonical contract with `digestField` omitted.
  - `verifyStatePlacementRequest(value, { now })` -> canonical verified request.
  - `verifyStateDestinationProfile(value, { now })` -> canonical verified destination profile.
  - `verifyStatePlacementPolicy(value, { now })` -> canonical verified policy.
  - `verifyStatePlacementPlan(value)` -> canonical verified plan.

- [ ] **Step 1: Write the failing contract tests**

Create `mesh/test/state-placement-contracts.test.mjs` with concrete positive fixtures and closed-object negatives.

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  contractDigest,
  verifyStatePlacementRequest,
  verifyStateDestinationProfile,
  verifyStatePlacementPolicy,
  verifyStatePlacementPlan
} from '../src/lib/state-placement-contracts.mjs';

const NOW = '2026-09-11T20:00:00.000Z';
const LATER = '2026-09-11T20:10:00.000Z';
const POLICY_DIGEST = `sha256:${'1'.repeat(64)}`;

function withDigest(value, field) {
  return { ...value, [field]: contractDigest(value, field) };
}

function requestFixture() {
  return withDigest({
    schema: 'axiom-state-placement-request.v1',
    version: 1,
    status: 'inert-contract-laboratory',
    request_id: 'placement:req:1',
    owner_scope: 'owner:fixture',
    source_state_family: 'memory.graph',
    operation_class: 'replicate',
    purpose: 'owner-recovery',
    data_class: 'owner-private-memory',
    confidentiality_requirement: 'sensitive',
    disclosure_ceiling: 'ciphertext-only',
    residency: {
      allowed_regions: ['CA'],
      minimum_evidence_level: 'provider-configured'
    },
    permitted_destination_classes: ['owner-peer', 'managed-object'],
    forbidden_destination_classes: [],
    retention: { minimum_days: 7, maximum_days: 365 },
    availability_target: { minimum_replicas: 1, minimum_failure_domains: 1 },
    maximum_lag_ms: 300000,
    consistency_class: 'bounded-lag-replica',
    encryption_profile: 'profile:encrypted-replica-v1',
    recovery_importance: 'important',
    cost_ceiling_units: 1000,
    consequence_class: 'C2',
    policy_profile_digest: POLICY_DIGEST,
    created_at: NOW,
    expires_at: LATER,
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    provider_effect: 'none',
    canonical_state_effect: 'none'
  }, 'request_digest');
}

test('placement request is closed, bounded, and self-digesting', () => {
  const value = requestFixture();
  assert.equal(verifyStatePlacementRequest(value, { now: NOW }).request_digest, value.request_digest);
  assert.throws(
    () => verifyStatePlacementRequest({ ...value, provider_token: 'secret' }, { now: NOW }),
    /unknown field|unsupported field/
  );
});
```

Add equivalent concrete positive fixtures for destination, policy, and plan. Add negatives proving: malformed `sha256:` digest, duplicate region, invalid enum, `expires_at <= created_at`, request lifetime over 15 minutes, `contains_secret_material !== false`, or any non-`none` effect field is rejected.

- [ ] **Step 2: Run the focused tests and verify RED**

```bash
cd mesh
node --test test/state-placement-contracts.test.mjs
```

Expected: FAIL because the S0 contracts and verifier do not exist.

- [ ] **Step 3: Add the four JSON Schema 2020-12 contract descriptions**

All schemas use `additionalProperties: false`, explicit `required`, bounded strings/arrays, and `^sha256:[0-9a-f]{64}$` for digests.

Use exactly these top-level fields:

```text
StatePlacementRequest v1:
  schema, version, status, request_id, owner_scope, source_state_family,
  operation_class, purpose, data_class, confidentiality_requirement,
  disclosure_ceiling, residency, permitted_destination_classes,
  forbidden_destination_classes, retention, availability_target,
  maximum_lag_ms, consistency_class, encryption_profile,
  recovery_importance, cost_ceiling_units, consequence_class,
  policy_profile_digest, created_at, expires_at, contains_secret_material,
  authority_effect, network_effect, provider_effect, canonical_state_effect,
  request_digest

StateDestinationProfile v0:
  schema, version, status, destination_id, destination_class,
  failure_domain, regions, residency_evidence_level, owner_controlled,
  managed_provider, allowed_operations, allowed_purposes, allowed_data_classes,
  maximum_confidentiality, disclosure_modes, retention_days,
  maximum_lag_ms, consistency_classes, encryption_profiles,
  recovery_importance_supported, cost_units, observed_at, expires_at,
  contains_secret_material, authority_effect, network_effect,
  provider_effect, canonical_state_effect, profile_digest

StatePlacementPolicy v0:
  schema, version, status, policy_id, owner_scope,
  allowed_operations, allowed_destination_classes, forbidden_destination_ids,
  minimum_residency_evidence_level, managed_destinations_allowed,
  maximum_eligible_destinations, maximum_plan_lifetime_ms,
  created_at, expires_at, authority_effect, network_effect,
  provider_effect, canonical_state_effect, policy_digest

StatePlacementPlan v1:
  schema, version, status, plan_id, request_id, request_digest,
  policy_id, policy_digest, evaluated_at, expires_at, satisfied,
  eligible_destinations, ineligible_destinations,
  availability_result, authority_effect, network_effect,
  provider_effect, canonical_state_effect, plan_digest
```

Nested shapes are closed too:

```text
request.residency:
  allowed_regions, minimum_evidence_level

request.retention:
  minimum_days, maximum_days

request.availability_target:
  minimum_replicas, minimum_failure_domains

destination.retention_days:
  minimum, maximum

plan.eligible_destinations[]:
  destination_id, destination_class, profile_digest, failure_domain,
  required_encryption_profile, receipt_required

plan.ineligible_destinations[]:
  destination_id, destination_class, profile_digest, reason_codes

plan.availability_result:
  required_replicas, eligible_replicas,
  required_failure_domains, eligible_failure_domains
```

`receipt_required` is always `true` in S0 plans because any later effectful storage action must produce separate evidence.

- [ ] **Step 4: Implement the minimal semantic verifier in `state-placement-contracts.mjs`**

Start with the repository's existing canonicalization discipline:

```js
import { canonicalJson, digestObject, ValidationError } from './canonical.mjs';

const MAX_CONTRACT_BYTES = 65_536;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;

export function contractDigest(value, digestField) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError('contract must be a plain object');
  }
  const copy = { ...value };
  delete copy[digestField];
  return `sha256:${digestObject(copy)}`;
}

function boundedCanonical(value, label) {
  const encoded = canonicalJson(value);
  if (Buffer.byteLength(encoded, 'utf8') > MAX_CONTRACT_BYTES) {
    throw new ValidationError(`${label} exceeds 65536 bytes`);
  }
  return JSON.parse(encoded);
}
```

Implement local helpers for exact fields, identifiers, digest strings, canonical ISO timestamps, unique bounded arrays, non-negative safe integers, and enum membership. Do not add a general-purpose schema runtime dependency.

The request verifier must enforce:

```text
schema === axiom-state-placement-request.v1
version === 1
status === inert-contract-laboratory
created_at <= now < expires_at
0 < expires_at - created_at <= 900000 ms
retention.minimum_days <= retention.maximum_days
1 <= availability_target.minimum_replicas <= 16
1 <= availability_target.minimum_failure_domains <= minimum_replicas
permitted_destination_classes and forbidden_destination_classes do not overlap
contains_secret_material === false
authority_effect/network_effect/provider_effect/canonical_state_effect === none
request_digest exactly recomputes
```

The destination verifier must enforce `observed_at <= now < expires_at`, bounded lists, `retention_days.minimum <= retention_days.maximum`, `managed_provider === !owner_controlled` for this v0 laboratory profile, and exact profile digest.

The policy verifier must enforce `created_at <= now < expires_at`, `1 <= maximum_eligible_destinations <= 64`, `1 <= maximum_plan_lifetime_ms <= 900000`, and exact policy digest.

The plan verifier must enforce sorted unique destination IDs, sorted unique reason codes, effect fields all `none`, `expires_at > evaluated_at`, no destination appearing in both eligible and ineligible arrays, and exact plan digest.

- [ ] **Step 5: Run the contract tests and canonicalization regression**

```bash
cd mesh
node --test test/state-placement-contracts.test.mjs test/canonical-domain.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add docs/architecture/contracts/state-placement-request.v1.schema.json \
  docs/architecture/contracts/state-destination-profile.v0.schema.json \
  docs/architecture/contracts/state-placement-policy.v0.schema.json \
  docs/architecture/contracts/state-placement-plan.v1.schema.json \
  mesh/src/lib/state-placement-contracts.mjs \
  mesh/test/state-placement-contracts.test.mjs
git commit -m "feat: add inert state placement contracts"
```

---

### Task 2: Deterministic fail-closed placement evaluator

**Files:**
- Create: `mesh/src/lib/state-placement-policy.mjs`
- Test: `mesh/test/state-placement-policy.test.mjs`

**Interfaces:**
- Consumes: all Task 1 verifiers plus `contractDigest`.
- Produces:
  - `evaluateStatePlacement({ request, policy, destinations, now })` -> verified `StatePlacementPlan`.
  - `PLACEMENT_REASON_CODES = Object.freeze([...])` using exactly:

```text
policy-owner-scope-mismatch
operation-disallowed-by-policy
destination-class-disallowed-by-policy
destination-id-forbidden-by-policy
managed-destination-disallowed-by-policy
destination-class-not-permitted-by-request
destination-class-forbidden-by-request
operation-unsupported
purpose-unsupported
data-class-unsupported
confidentiality-insufficient
disclosure-mode-unsupported
residency-region-mismatch
residency-evidence-insufficient
retention-window-unsupported
freshness-unsupported
consistency-unsupported
encryption-profile-unsupported
recovery-importance-unsupported
cost-ceiling-exceeded
availability-target-unsatisfied
```

- [ ] **Step 1: Write failing evaluator tests for hard-constraint ordering**

Create fixtures in the test itself first.

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { contractDigest } from '../src/lib/state-placement-contracts.mjs';
import { evaluateStatePlacement } from '../src/lib/state-placement-policy.mjs';

const NOW = '2026-09-11T20:00:00.000Z';

// Use Task 1 request/policy/profile builders with deterministic digests.

test('residency violation cannot be compensated by lower cost', () => {
  const request = makeRequest({
    residency: { allowed_regions: ['CA'], minimum_evidence_level: 'provider-configured' },
    cost_ceiling_units: 1000
  });
  const policy = makePolicy();
  const cheapUs = makeDestination({
    destination_id: 'dest:cheap-us',
    regions: ['US'],
    cost_units: 1
  });
  const ca = makeDestination({
    destination_id: 'dest:ca',
    regions: ['CA'],
    cost_units: 500
  });

  const plan = evaluateStatePlacement({ request, policy, destinations: [cheapUs, ca], now: NOW });
  assert.deepEqual(plan.eligible_destinations.map((item) => item.destination_id), ['dest:ca']);
  assert.deepEqual(
    plan.ineligible_destinations.find((item) => item.destination_id === 'dest:cheap-us').reason_codes,
    ['residency-region-mismatch']
  );
});
```

Add tests that independently reject each closed reason-code case. For destinations with multiple failures, reason codes are lexicographically sorted and all applicable hard failures are retained.

- [ ] **Step 2: Run the evaluator test and verify RED**

```bash
cd mesh
node --test test/state-placement-policy.test.mjs
```

Expected: FAIL because `state-placement-policy.mjs` does not exist.

- [ ] **Step 3: Implement evidence-level and confidentiality ordering as explicit tables**

Do not infer enum strength from string order.

```js
const RESIDENCY_EVIDENCE_RANK = Object.freeze({
  unknown: 0,
  declared: 1,
  'provider-configured': 2,
  'authenticated-assertion': 3,
  'independently-verified': 4
});

const CONFIDENTIALITY_RANK = Object.freeze({
  public: 0,
  protected: 1,
  sensitive: 2,
  restricted: 3
});

const RECOVERY_RANK = Object.freeze({
  ordinary: 0,
  important: 1,
  critical: 2
});
```

A destination satisfies a request only when its supported rank is greater than or equal to the requested rank. Do not create analogous ranking for destination class, purpose, data class, encryption profile, or consistency; those require exact membership.

- [ ] **Step 4: Implement deterministic destination evaluation**

Use one pure helper that returns all reason codes for one already-verified destination.

```js
function evaluateDestination({ request, policy, destination }) {
  const reasons = new Set();

  if (!policy.allowed_destination_classes.includes(destination.destination_class)) {
    reasons.add('destination-class-disallowed-by-policy');
  }
  if (policy.forbidden_destination_ids.includes(destination.destination_id)) {
    reasons.add('destination-id-forbidden-by-policy');
  }
  if (!policy.managed_destinations_allowed && destination.managed_provider) {
    reasons.add('managed-destination-disallowed-by-policy');
  }
  if (!request.permitted_destination_classes.includes(destination.destination_class)) {
    reasons.add('destination-class-not-permitted-by-request');
  }
  if (request.forbidden_destination_classes.includes(destination.destination_class)) {
    reasons.add('destination-class-forbidden-by-request');
  }

  // Apply the remaining exact-membership and rank checks from the closed reason-code list.
  return [...reasons].sort();
}
```

The implementation must explicitly check every reason code in the interface list. `cost-ceiling-exceeded` applies only when `cost_units > request.cost_ceiling_units`; cost never changes the order or makes an otherwise ineligible destination eligible.

- [ ] **Step 5: Implement plan construction**

Rules:

```text
1. Verify request, policy, and every destination using the same injected `now`.
2. Require request.owner_scope === policy.owner_scope or fail the entire evaluation with ValidationError('policy owner scope does not match request owner scope').
3. Require request.operation_class to be in policy.allowed_operations or fail the entire evaluation with ValidationError('operation is disallowed by placement policy').
4. Evaluate each destination independently.
5. Eligible destinations are sorted by destination_id and truncated only by policy.maximum_eligible_destinations; if truncation would occur, reject evaluation instead of silently changing the candidate set in S0.
6. Ineligible destinations are sorted by destination_id; reason_codes are lexicographically sorted.
7. Count unique eligible failure_domain values.
8. satisfied = eligible_count >= minimum_replicas AND unique_failure_domains >= minimum_failure_domains.
9. If satisfied is false, do not move any failed destination into the eligible set. availability_result records the shortfall.
10. plan.expires_at = minimum(request.expires_at, policy.expires_at, evaluated_at + policy.maximum_plan_lifetime_ms).
11. plan_id = `placement-plan:${request.request_id}`.
12. Every eligible entry binds exact destination `profile_digest` and request `encryption_profile`; `receipt_required: true`.
13. The plan is digested and passed through `verifyStatePlacementPlan` before return.
```

- [ ] **Step 6: Add deterministic input-order invariance tests**

```js
test('destination input order cannot change the plan', () => {
  const forward = evaluateStatePlacement({ request, policy, destinations: [a, b, c], now: NOW });
  const reverse = evaluateStatePlacement({ request, policy, destinations: [c, b, a], now: NOW });
  assert.equal(forward.plan_digest, reverse.plan_digest);
});
```

Also prove duplicate `destination_id`, duplicate exact `profile_digest` under different IDs, more than 64 candidates, and `destinations.length > policy.maximum_eligible_destinations` when every candidate would otherwise be eligible fail closed rather than truncate.

- [ ] **Step 7: Run focused S0 tests**

```bash
cd mesh
node --test test/state-placement-contracts.test.mjs test/state-placement-policy.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit Task 2**

```bash
git add mesh/src/lib/state-placement-policy.mjs mesh/test/state-placement-policy.test.mjs
git commit -m "feat: add pure state placement evaluator"
```

---

### Task 3: Adversarial fixture corpus and authority-boundary proof

**Files:**
- Create: `mesh/fixtures/state-placement/s0-vectors.json`
- Create: `mesh/test/state-placement-authority-boundary.test.mjs`
- Modify: `mesh/test/state-placement-policy.test.mjs`

**Interfaces:**
- Consumes: `evaluateStatePlacement()` and Task 1 verifiers.
- Produces a stable fixture corpus covering eligibility, hard denials, availability shortfall, substitution, stale currentness, and non-authority boundaries.

- [ ] **Step 1: Add the deterministic vector file with exact named cases**

The JSON file is a closed fixture object with `schema: 'axiom-state-placement-s0-vectors.v0'`, `version: 0`, and `cases` containing at least these cases:

```text
allow_owner_peer_ca
allow_managed_object_ca
reject_wrong_region
reject_weak_residency_evidence
reject_forbidden_destination_class
reject_policy_disallowed_destination_class
reject_managed_when_policy_disallows
reject_unsupported_operation
reject_unsupported_purpose
reject_unsupported_data_class
reject_confidentiality_too_weak
reject_disclosure_mode
reject_retention_window
reject_freshness
reject_consistency
reject_encryption_profile
reject_recovery_importance
reject_cost_ceiling
unsatisfied_replica_count
unsatisfied_failure_domain_diversity
```

Each case includes one request, one policy, a destination list, and the exact expected `satisfied`, eligible destination IDs, and per-destination reason codes. All digests are generated in the test setup from raw fixture bodies before semantic verification; the fixture file itself contains no secret or credential values.

- [ ] **Step 2: Write vector-driven tests**

```js
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateStatePlacement } from '../src/lib/state-placement-policy.mjs';

const vectors = JSON.parse(await readFile(
  new URL('../fixtures/state-placement/s0-vectors.json', import.meta.url),
  'utf8'
));

for (const fixture of vectors.cases) {
  test(`state placement vector: ${fixture.name}`, () => {
    const result = evaluateFixture(fixture);
    assert.equal(result.satisfied, fixture.expected.satisfied);
    assert.deepEqual(
      result.eligible_destinations.map((item) => item.destination_id),
      fixture.expected.eligible_destination_ids
    );
    assert.deepEqual(
      Object.fromEntries(result.ineligible_destinations.map((item) => [item.destination_id, item.reason_codes])),
      fixture.expected.ineligible
    );
  });
}
```

Keep `evaluateFixture` inside the test file; it only attaches contract digests using Task 1 `contractDigest` and the fixed vector `now` value.

- [ ] **Step 3: Add substitution and stale-policy negatives**

Add direct tests proving all of the following fail closed:

```text
request.policy_profile_digest != policy.policy_digest
request.owner_scope != policy.owner_scope
request expired at evaluation time
policy expired at evaluation time
destination profile expired at evaluation time
destination profile_digest tampered after request assembly
destination_id duplicated with different profile digest
same profile digest presented under two destination IDs
request digest tampered
policy digest tampered
plan digest tampered
unknown destination class
unknown residency evidence level
unknown effect field value
```

For the policy-digest binding, `evaluateStatePlacement` must require exact equality between `request.policy_profile_digest` and `policy.policy_digest` before destination evaluation.

- [ ] **Step 4: Write the authority-boundary source test**

Create `mesh/test/state-placement-authority-boundary.test.mjs`.

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const MODULES = [
  new URL('../src/lib/state-placement-contracts.mjs', import.meta.url),
  new URL('../src/lib/state-placement-policy.mjs', import.meta.url)
];

const FORBIDDEN = [
  "node:http", "node:https", "node:net", "node:tls",
  "node:fs", "node:fs/promises", "node:child_process",
  "../gateway", "../hypervisor", "../sandbox", "../grid",
  "provider-supervisor", "runtime-connector", "credential"
];

test('S0 placement modules have no I/O or authority-path imports', async () => {
  for (const url of MODULES) {
    const source = await readFile(url, 'utf8');
    for (const forbidden of FORBIDDEN) {
      assert.equal(source.includes(forbidden), false, `${url.pathname} contains forbidden dependency ${forbidden}`);
    }
  }
});
```

The allowed imports in S0 implementation source are limited to sibling pure libraries needed for canonicalization/contract validation. If another import is necessary, review it explicitly rather than weakening this test generically.

- [ ] **Step 5: Prove plan non-authority fields are immutable outcomes**

Add an evaluator test that asserts every returned plan has:

```js
assert.deepEqual(
  {
    authority_effect: plan.authority_effect,
    network_effect: plan.network_effect,
    provider_effect: plan.provider_effect,
    canonical_state_effect: plan.canonical_state_effect
  },
  {
    authority_effect: 'none',
    network_effect: 'none',
    provider_effect: 'none',
    canonical_state_effect: 'none'
  }
);
```

Also prove a caller-supplied plan with any field changed to `allowed`, `granted`, `write`, `provider-write`, or another non-`none` value is rejected by `verifyStatePlacementPlan`.

- [ ] **Step 6: Run the complete S0 test set**

```bash
cd mesh
node --test \
  test/state-placement-contracts.test.mjs \
  test/state-placement-policy.test.mjs \
  test/state-placement-authority-boundary.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add mesh/fixtures/state-placement/s0-vectors.json \
  mesh/test/state-placement-policy.test.mjs \
  mesh/test/state-placement-authority-boundary.test.mjs
git commit -m "test: add adversarial state placement vectors"
```

---

### Task 4: S0 threat model, repository truth, and documentation registration

**Files:**
- Create: `docs/security/STATE-PLACEMENT-PROJECTION-THREAT-MODEL.md`
- Modify: `docs/MASTER-TODO.md`
- Modify: `docs/rebuild/STATUS.md`
- Modify: `docs/README.md`
- Modify: `mesh/src/check-docs.mjs`
- Preserve: `docs/superpowers/specs/2026-09-11-sovereign-state-placement-projection-plane-design.md`
- Preserve: `docs/superpowers/plans/2026-09-11-sovereign-state-placement-s0.md`

**Interfaces:**
- Consumes: implementation/test evidence from Tasks 1-3.
- Produces truthful repository status saying S0 is an inert pure planning/evaluation laboratory only; no provider/object-transfer/runtime activation claim.

- [ ] **Step 1: Write the S0 threat-model document**

Use these exact sections:

```text
# State Placement and Projection Threat Model
## Current activation boundary
## Assets and trust statements
## S0 attacker capabilities
## S0 threats and required controls
## Required negative tests
## Later S1-S6 threats not yet implemented
## Current non-claims
```

The S0 threat table must cover at least:

```text
stale request or policy replay -> canonical time/currentness checks; fail closed
policy/request digest substitution -> exact digest binding
owner-scope substitution -> exact equality required
residency evidence downgrade -> explicit rank table and minimum evidence floor
destination-class substitution -> request + policy dual filtering
provider cost used to override privacy -> hard eligibility before cost; cost never ranks S0
unsupported encryption/retention/freshness -> closed exact checks
duplicate destination identity -> reject ambiguity
availability shortfall -> satisfied=false; never weaken constraints
plan presented as capability -> effect fields fixed to none; no runtime route
I/O accidentally introduced -> source-boundary regression test
raw credentials inserted into contracts -> closed fields + contains_secret_material=false
```

State explicitly that S0 has no provider/network effect, no object transfer, no Grid route, no canonical-state alternative, no exactly-once delivery, no projection outbox, and no Rust authority expansion.

- [ ] **Step 2: Update `docs/MASTER-TODO.md` with one bounded S0 row**

Add a storage/placement entry whose status is `Inert S0 laboratory only` and whose acceptance evidence names:

```text
state-placement-contracts.test.mjs
state-placement-policy.test.mjs
state-placement-authority-boundary.test.mjs
```

The text must say that S1 provider I/O, S2 outbox, remote-object adapters, fresh-host recovery, and production promotion remain pending.

- [ ] **Step 3: Update `docs/rebuild/STATUS.md` without adding an implemented capability**

Add a status note under the relevant storage/architecture section:

```text
Sovereign state placement S0: pure inert request/policy/destination/plan contracts and deterministic eligibility evaluation only. No provider I/O, object transfer, Gateway route, capability promotion, or alternative canonical state engine.
```

Do not add an `implemented` entry to `mesh/config/capabilities.json`.

- [ ] **Step 4: Register the new docs/contracts in `docs/README.md` and `mesh/src/check-docs.mjs`**

Add the four contract files, design, plan, and threat model to the supported/canonical documentation inventory using the repository's existing registration pattern.

Add required-content assertions:

```text
design:
  Grid remains the first-generation canonical authoritative state store
  Placement eligibility is not an external effect
  No generic row-level CDC plane
  At-least-once delivery, deterministic idempotency

plan:
  ## Exact changed-file envelope for S0
  ### Task 1: Closed S0 placement contracts and semantic verifier
  ### Task 2: Deterministic fail-closed placement evaluator
  ## S0 acceptance matrix

threat model:
  ## Current activation boundary
  ## S0 threats and required controls
  ## Current non-claims
```

For each JSON schema, require its exact schema identifier string.

- [ ] **Step 5: Add the plan acceptance matrix before registration**

Append this exact section to the plan file if it is not already present when execution begins:

```markdown
## S0 acceptance matrix

| Gate | Required result |
|---|---|
| Contract closure | Unknown fields, invalid enums, bad digests, duplicate set members, oversized objects, invalid time windows fail closed |
| Policy binding | Request binds exact policy digest and owner scope |
| Hard constraints | Residency, confidentiality, retention, encryption, destination and policy rules cannot be offset by cost |
| Determinism | Candidate input order cannot change plan digest |
| Availability | Insufficient replica/failure-domain coverage yields `satisfied:false`, never weaker eligibility |
| Authority | All effect fields remain `none`; no Gateway/Grid/provider path exists |
| Dependencies | Zero third-party runtime dependencies and no I/O imports in S0 modules |
| Claims | No capability registry or production-promotion change |
```

- [ ] **Step 6: Run documentation checks**

```bash
cd mesh
npm run docs:check
npm run status:check
```

Expected: PASS.

- [ ] **Step 7: Commit Task 4**

```bash
git add docs/security/STATE-PLACEMENT-PROJECTION-THREAT-MODEL.md \
  docs/MASTER-TODO.md docs/rebuild/STATUS.md docs/README.md \
  mesh/src/check-docs.mjs \
  docs/superpowers/specs/2026-09-11-sovereign-state-placement-projection-plane-design.md \
  docs/superpowers/plans/2026-09-11-sovereign-state-placement-s0.md
git commit -m "docs: register state placement S0 boundary"
```

---

### Task 5: Exact-head verification and implementation handoff

**Files:**
- No new feature files.
- Verify the exact S0 changed-file envelope and repository state.

**Interfaces:**
- Consumes: Tasks 1-4.
- Produces: exact-head evidence that S0 is pure, deterministic, fail-closed, documentation-registered, and does not widen current authority.

- [ ] **Step 1: Verify changed-file scope against current main**

```bash
git diff --name-only origin/main...HEAD
```

Expected: only files in the S0 changed-file envelope. If a production authority/network/provider file appears, stop and reopen design review.

- [ ] **Step 2: Run focused S0 verification**

```bash
cd mesh
node --test \
  test/state-placement-contracts.test.mjs \
  test/state-placement-policy.test.mjs \
  test/state-placement-authority-boundary.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Run canonicalization and documentation regressions**

```bash
cd mesh
node --test test/canonical-domain.test.mjs
npm run docs:check
npm run status:check
```

Expected: PASS.

- [ ] **Step 4: Run the full protected-equivalent local verification command**

```bash
cd mesh
npm run check
```

Expected: PASS with no capability-registry change.

- [ ] **Step 5: Confirm the capability registry is unchanged**

```bash
git diff origin/main...HEAD -- mesh/config/capabilities.json
```

Expected: empty diff.

- [ ] **Step 6: Confirm no production authority/runtime files changed**

```bash
git diff --name-only origin/main...HEAD -- \
  mesh/src/gateway.mjs \
  mesh/src/hypervisor.mjs \
  mesh/src/sandbox.mjs \
  mesh/src/grid \
  mesh/src/provider-supervisor.mjs \
  mesh/config/capabilities.json \
  mesh/config/service-network-policy.json
```

Expected: empty output.

- [ ] **Step 7: Record the implementation PR claim boundary**

Use this exact substance in the implementation PR description:

```text
Implements S0 only: inert state-placement request/destination/policy/plan contracts plus deterministic pure eligibility evaluation. No provider I/O, object transfer, Gateway route, Grid state mutation, capability promotion, alternative canonical state engine, projection outbox, remote adapter, or production Rust authority. Grid remains canonical; placement plans grant no storage/network/provider authority.
```

- [ ] **Step 8: Commit any verification-only documentation correction if needed**

If verification reveals a truthful documentation mismatch, make the smallest documentation-only correction and rerun Steps 1-6. Do not weaken a test or constraint to make verification green.

---

## S0 acceptance matrix

| Gate | Required result |
|---|---|
| Contract closure | Unknown fields, invalid enums, bad digests, duplicate set members, oversized objects, invalid time windows fail closed |
| Policy binding | Request binds exact policy digest and owner scope |
| Hard constraints | Residency, confidentiality, retention, encryption, destination and policy rules cannot be offset by cost |
| Determinism | Candidate input order cannot change plan digest |
| Availability | Insufficient replica/failure-domain coverage yields `satisfied:false`, never weaker eligibility |
| Authority | All effect fields remain `none`; no Gateway/Grid/provider path exists |
| Dependencies | Zero third-party runtime dependencies and no I/O imports in S0 modules |
| Claims | No capability registry or production-promotion change |

## Plan self-review results

- **Spec coverage:** S0 request/plan contracts, synthetic destination evaluation, hard residency/privacy/retention constraints, fail-closed behavior, deterministic eligibility, non-authority semantics, and no-provider-I/O boundary are all mapped to Tasks 1-5. S1-S6 are intentionally excluded and require separate plans.
- **Placeholder scan:** No `TBD`, `TODO`, “implement later”, or unspecified “write tests” step remains in the S0 plan.
- **Type/interface consistency:** Request, destination, policy, plan schema IDs and evaluator function names are defined once and reused consistently. `request.policy_profile_digest` binds `policy.policy_digest`; destination results bind exact `profile_digest`; all digest strings use `sha256:<64 lowercase hex>`.
- **Authority check:** Nothing in S0 grants capability, credential, provider, network, canonical-state, or execution authority. Any need to touch an effectful path reopens design review.

## Explicit non-claims

S0 does not claim or authorize production cloud/object storage, object transfer, provider SDK integration, remote storage discovery, backup replacement, a new canonical database, multi-master consensus, a projection/CDC runtime, exactly-once delivery, a search/index service, privacy analytics execution, automatic provider migration, autonomous deletion, billing, credential use, Gateway exposure, Grid mutation, a new capability, or Rust production authority.

## Landing gate

S0 is ready for review only when the exact implementation head passes the focused S0 tests, canonicalization regression, documentation/status checks, and full `npm run check`; the changed-file scope contains no production authority/runtime/provider file; `mesh/config/capabilities.json` is unchanged; and the PR repeats the explicit S0-only non-claims above.