# Authority–Verifiability Gate v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deterministic, non-authorizing gate that prevents requested authority from being treated as eligible when its currentness, evidence binding, monitoring, independence, or rollback evidence is insufficient.

**Architecture:** Add one pure library module plus its contract schema and threat model. The evaluator consumes explicit normalized authority/evidence facts, calculates a bounded verification requirement, and returns digest-bound `eligible`, `hold`, or `deny` evidence. It does not integrate with the effect path or create any capability.

**Tech Stack:** Node.js ESM, `node:test`, existing `ValidationError` / `assertPlainObject` / `assertString` / `canonicalJson` / `digestObject` primitives, JSON Schema Draft 2020-12.

**Spec:** `docs/superpowers/specs/2026-09-06-authority-verifiability-gate-v0-design.md`

## Global Constraints

- Supported build remains `0.12.0-dev.3`.
- Supported Node remains `>=22.23.2 <23 || >=24.14.0 <25`.
- The gate is additive and effect-inert.
- `eligible` is never authorization.
- No capability issuance, consumption, delegation, policy mutation, currentness mutation, network access, state mutation, credential creation, tool execution, or self-modification is introduced.
- Unknown, malformed, inconsistent, or ambiguous inputs fail closed.
- Existing policy/runtime authorization remains authoritative.

---

### Task 1: Define executable behavior with RED tests

**Files:**
- Create: `mesh/test/authority-verifiability-gate.test.mjs`

**Interfaces:**
- Consumes: planned `evaluateAuthorityVerifiability({ request, evidence })`.
- Produces: executable requirements for decision semantics and non-authorizing behavior.

- [ ] **Step 1: Write failing tests**

Tests must assert these real behaviors:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AUTHORITY_VERIFIABILITY_SCHEMA,
  evaluateAuthorityVerifiability
} from '../src/lib/authority-verifiability-gate.mjs';

const digest = 'a'.repeat(64);

function request(overrides = {}) {
  return {
    request_id: 'verify.request.1',
    principal_id: 'agent.verify.1',
    action: 'system.echo',
    risk: 'low',
    effect_destination: 'local',
    authority_level: 1,
    autonomy_level: 1,
    novelty_signals: [],
    external_agent_interaction: false,
    self_modification: false,
    ...overrides
  };
}

function evidence(overrides = {}) {
  return {
    policy_binding_digest: digest,
    identity_current: true,
    delegation_current: true,
    evidence_bound: true,
    monitorability_level: 1,
    independent_monitor: false,
    independent_evaluator: false,
    human_authorization_present: false,
    rollback_available: false,
    rollback_tested: false,
    ...overrides
  };
}

test('low-risk bounded authority is eligible when V1 evidence is sufficient', () => {
  const result = evaluateAuthorityVerifiability({ request: request(), evidence: evidence() });
  assert.equal(result.schema, AUTHORITY_VERIFIABILITY_SCHEMA);
  assert.equal(result.decision, 'eligible');
  assert.equal(result.requirements.monitorability_level, 1);
  assert.equal(result.requirements.max_lease_ms, 900_000);
  assert.equal(result.semantics.grants_execution_authority, false);
  assert.equal(result.semantics.mints_capability, false);
  assert.equal(result.semantics.requires_downstream_authorization, true);
  assert.match(result.decision_digest, /^[a-f0-9]{64}$/);
});

test('novel authority holds when monitorability is below the escalated requirement', () => {
  const result = evaluateAuthorityVerifiability({
    request: request({ novelty_signals: ['tool'] }),
    evidence: evidence({ monitorability_level: 1 })
  });
  assert.equal(result.decision, 'hold');
  assert.equal(result.requirements.monitorability_level, 2);
  assert.deepEqual(result.reasons, ['monitorability_below_requirement']);
});

test('external-agent interaction denies inconsistent omission of counterparty novelty', () => {
  const result = evaluateAuthorityVerifiability({
    request: request({ external_agent_interaction: true }),
    evidence: evidence({ monitorability_level: 2, independent_monitor: true })
  });
  assert.equal(result.decision, 'deny');
  assert.deepEqual(result.reasons, ['counterparty_novelty_signal_required']);
});

test('high authority holds without an independent monitor', () => {
  const result = evaluateAuthorityVerifiability({
    request: request({ risk: 'high', authority_level: 4 }),
    evidence: evidence({ monitorability_level: 3 })
  });
  assert.equal(result.decision, 'hold');
  assert.ok(result.reasons.includes('independent_monitor_required'));
});

test('critical authority denies without independent evaluator and human authorization', () => {
  const result = evaluateAuthorityVerifiability({
    request: request({ risk: 'critical', authority_level: 4, autonomy_level: 4 }),
    evidence: evidence({ monitorability_level: 4, independent_monitor: true })
  });
  assert.equal(result.decision, 'deny');
  assert.deepEqual(result.reasons, [
    'human_authorization_required',
    'independent_evaluator_required'
  ]);
});

test('self-modification requires V4, independent monitor/evaluator, human authorization and tested rollback', () => {
  const result = evaluateAuthorityVerifiability({
    request: request({ self_modification: true }),
    evidence: evidence({ monitorability_level: 4, independent_monitor: true })
  });
  assert.equal(result.decision, 'deny');
  assert.equal(result.requirements.monitorability_level, 4);
  assert.equal(result.requirements.max_lease_ms, 15_000);
  assert.deepEqual(result.reasons, [
    'human_authorization_required',
    'independent_evaluator_required',
    'rollback_available_required',
    'rollback_test_required'
  ]);
});

test('stale or unbound authority evidence is denied', () => {
  for (const patch of [
    { identity_current: false },
    { delegation_current: false },
    { evidence_bound: false }
  ]) {
    assert.equal(evaluateAuthorityVerifiability({
      request: request(),
      evidence: evidence(patch)
    }).decision, 'deny');
  }
});

test('unknown request fields fail closed', () => {
  assert.throws(
    () => evaluateAuthorityVerifiability({ request: request({ surprise: true }), evidence: evidence() }),
    /unsupported field/
  );
});
```

- [ ] **Step 2: Run test and verify RED**

Run:

```bash
node --test mesh/test/authority-verifiability-gate.test.mjs
```

Expected: FAIL because `../src/lib/authority-verifiability-gate.mjs` does not exist.

- [ ] **Step 3: Commit RED**

```bash
git add mesh/test/authority-verifiability-gate.test.mjs
git commit -m "test: define authority verifiability gate v0"
```

---

### Task 2: Implement the pure gate

**Files:**
- Create: `mesh/src/lib/authority-verifiability-gate.mjs`
- Test: `mesh/test/authority-verifiability-gate.test.mjs`

**Interfaces:**
- Consumes: `{ request, evidence }` exact objects.
- Produces: `evaluateAuthorityVerifiability({ request, evidence }) -> frozen axiom-authority-verifiability-decision.v1 object`.
- Exports: `AUTHORITY_VERIFIABILITY_SCHEMA`, `AUTHORITY_VERIFIABILITY_NOTICE`, `evaluateAuthorityVerifiability`.

- [ ] **Step 1: Implement strict normalization**

Use existing canonical primitives. Reject unsupported fields; require sorted unique novelty signals; accept only fixed risk and novelty enums; require integer levels `0..4`; require canonical lowercase SHA-256 policy digest.

- [ ] **Step 2: Implement requirement calculation**

Use exact baseline table:

```js
const RISK_PROFILE = Object.freeze({
  low: Object.freeze({ monitorability: 1, maxLeaseMs: 900_000 }),
  medium: Object.freeze({ monitorability: 2, maxLeaseMs: 300_000 }),
  high: Object.freeze({ monitorability: 3, maxLeaseMs: 60_000 }),
  critical: Object.freeze({ monitorability: 4, maxLeaseMs: 15_000 })
});
```

Novelty escalation is `+1` for 1–2 signals and `+2` for 3+ signals, capped at 4. Self-modification forces V4 and the 15-second ceiling.

- [ ] **Step 3: Implement deny/hold/eligible precedence**

Hard-boundary reasons produce `deny`. If no deny reason exists but monitoring is insufficient, produce `hold`. Otherwise produce `eligible`. Reasons must be sorted and unique.

- [ ] **Step 4: Bind output deterministically**

Set fixed semantics and compute `decision_digest = digestObject(body)` before returning a frozen result.

- [ ] **Step 5: Run focused GREEN test**

```bash
node --test mesh/test/authority-verifiability-gate.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit GREEN**

```bash
git add mesh/src/lib/authority-verifiability-gate.mjs mesh/test/authority-verifiability-gate.test.mjs
git commit -m "feat: add authority verifiability gate v0"
```

---

### Task 3: Publish the contract and threat model

**Files:**
- Create: `agent-commons/contracts/authority-verifiability-decision.v1.schema.json`
- Create: `agent-commons/authority-verifiability-gate-v0-threat-model.json`
- Modify: `mesh/test/authority-verifiability-gate.test.mjs`

**Interfaces:**
- Consumes: decision object returned by Task 2.
- Produces: portable strict schema and machine-readable threat/nonclaim evidence.

- [ ] **Step 1: Add RED schema assertions**

The test must load the contract and assert its `$id`, `additionalProperties: false`, required fixed semantics, decision enum, reason enum, risk enum, novelty enum, and SHA-256 digest patterns.

- [ ] **Step 2: Add strict JSON Schema contract**

The schema must mirror the runtime output exactly and preserve `eligible != authorization` in `const` semantics fields.

- [ ] **Step 3: Add threat model**

The threat model must identify authority laundering, novelty omission, self-monitoring, stale evidence, rollback laundering, digest tampering, and caller-supplied lease widening. It must explicitly state that v0 does not grant authority or verify the underlying evidence itself.

- [ ] **Step 4: Run focused tests**

```bash
node --test mesh/test/authority-verifiability-gate.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Run repository checks**

```bash
npm run setup:check
npm test
npm run check
```

Expected: all supported checks PASS with no new warnings.

- [ ] **Step 6: Commit contract**

```bash
git add agent-commons/contracts/authority-verifiability-decision.v1.schema.json agent-commons/authority-verifiability-gate-v0-threat-model.json mesh/test/authority-verifiability-gate.test.mjs
git commit -m "docs: publish authority verifiability v0 contract"
```

---

### Task 4: Review and CI gate

**Files:**
- Review all files changed by Tasks 1–3.

**Interfaces:**
- Consumes: complete v0 slice.
- Produces: reviewable PR with no production authority promotion.

- [ ] **Step 1: Verify source remains effect-inert**

Add/source-review assertions that the new module does not import runtime execution, capability consumption, network, credential issuance, filesystem mutation, or policy mutation surfaces.

- [ ] **Step 2: Run exact-head checks**

```bash
npm run setup:check
npm test
npm run check
```

- [ ] **Step 3: Open draft PR**

PR title:

```text
Authority–Verifiability Gate v0
```

PR body must state that the slice is non-authorizing and does not integrate with the production effect path.

- [ ] **Step 4: Inspect all CI failures before promotion**

Any failing Clean Kernel, compatibility, CodeQL, or repository-specific invariant check blocks merge. Fix failures with a new RED test when behavior changes are required.
