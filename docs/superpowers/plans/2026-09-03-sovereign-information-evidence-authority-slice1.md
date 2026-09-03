# Sovereign Information, Evidence, Privacy, and Authority Slice 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the zero-egress, zero-provider, zero-regulated-data semantic foundation for sovereign information rights, evidence integrity, delegated gate authority, consequence-proportional assurance, and minimum-sufficient contextual disclosure without granting any new execution authority.

**Architecture:** Add small pure ESM modules under `mesh/src/domain/` that validate and evaluate semantic objects only. Reuse `mesh/src/lib/canonical.mjs` validation primitives, reject authority-bearing fields in semantic objects, and keep every result deterministic and side-effect-free. Do not add Gateway routes, Grid persistence, network access, provider calls, regulated records, policy grants, or capability-registry promotion in Slice 1.

**Tech Stack:** Node.js ESM, Node built-in `node:test` / `node:assert/strict`, existing zero-dependency kernel helpers in `mesh/src/lib/canonical.mjs`.

**Spec:** `docs/superpowers/specs/2026-09-03-sovereign-information-evidence-authority-design.md`

## Global Constraints

- Slice 1 is **zero-egress, zero-provider, zero-regulated-data, and zero-new-execution-authority**.
- `mesh/config/capabilities.json` remains unchanged in this slice; no new capability may be marked implemented, enabled, exposed, production-promoted, or marketed.
- Preserve the current Gateway → Hypervisor → Sandbox → Grid rule for AXIOM-governed consequential effects.
- Preserve current executable high-risk protections until replacement semantics are implemented, tested, reviewed, and promoted.
- `risk/consequence -> required scrutiny`; `policy/authority -> whether action may occur`.
- Higher consequence must not automatically imply denial or mandatory end-user interruption.
- Preference inference must not silently enlarge delegated authority.
- Credential, reputation, risk, review state, institutional role, and identity must not mint execution authority.
- Information-subject, originator, custodian, controller, affected-party, beneficiary, reviewer, disclosure-authority, and retention-authority relationships must remain independently representable.
- Provenance/integrity must never be represented as proof of truth.
- Known contradictory evidence, challenges, missing evidence, and alternative explanations must remain retrievable from an evidence-context projection.
- Personalization data must not become an external disclosure entitlement.
- No universal reputation score, universal risk score, stable cross-domain analytics person identifier, production differential privacy claim, MPC claim, healthcare-compliance claim, justice-compliance claim, payroll-compliance claim, or government-deployment claim is introduced.
- Follow existing repository ESM/test conventions and Node engine floor from `mesh/package.json`: `>=22.23.2 <23 || >=24.14.0 <25`.
- Every task is TDD: failing test first, verify failure, minimal implementation, verify pass, commit.

---

## File Structure

Create focused semantic modules rather than one large `sovereign-information.mjs` file:

- `mesh/src/domain/sovereign-information-common.mjs` — shared enums and validation helpers; explicitly rejects execution-authority-bearing fields from Slice 1 semantic objects.
- `mesh/src/domain/information-rights.mjs` — `InformationRightsEnvelope` schema constants and validator.
- `mesh/src/domain/evidence-graph.mjs` — evidence assertion/link/review-state validators plus context projection that preserves disconfirming/challenge relationships.
- `mesh/src/domain/delegated-gate-mandate.mjs` — delegated gate mandate validator and pure mandate-scope evaluator; never executes an effect.
- `mesh/src/domain/assurance-profile.mjs` — deterministic consequence-to-assurance evaluator; returns controls/reasons only, never permission.
- `mesh/src/domain/contextual-disclosure.mjs` — request/result validators and minimum-sufficient claim projection.

Create matching tests:

- `mesh/test/sovereign-information-common.test.mjs`
- `mesh/test/information-rights.test.mjs`
- `mesh/test/evidence-graph.test.mjs`
- `mesh/test/delegated-gate-mandate.test.mjs`
- `mesh/test/assurance-profile.test.mjs`
- `mesh/test/contextual-disclosure.test.mjs`
- `mesh/test/sovereign-information-invariants.test.mjs`
- `mesh/test/sovereign-information-doc-registration.test.mjs`

Documentation integration:

- Modify `docs/rebuild/REQUIREMENTS.md` to add normative `SIEA-*` requirements while preserving the requirement-state rule.
- Modify `CONSTITUTION.md` only to clarify that consequence drives assurance rather than permission and that delegated principals may satisfy gates only where policy already authorizes them; do not weaken current executable high-risk protection.
- Modify `mesh/src/check-docs.mjs` to register both the approved spec and this plan as canonical documents and to require stable phrases from the spec/requirements.

---

### Task 1: Shared semantic validation boundary

**Files:**
- Create: `mesh/src/domain/sovereign-information-common.mjs`
- Test: `mesh/test/sovereign-information-common.test.mjs`

**Interfaces:**
- Consumes: `assertPlainObject`, `assertString`, `assertStringArray`, `ValidationError` from `../lib/canonical.mjs`.
- Produces:
  - `SIEA_AUTHORITY_BEARING_FIELDS: ReadonlySet<string>`
  - `assertEnum(value, name, allowed): string`
  - `assertUniqueStrings(value, name, options?): string[]`
  - `assertIsoTimestamp(value, name): string`
  - `assertReference(value, name): string`
  - `assertAuthorityNeutral(record, name): object`
  - `assertNoUnknownKeys(record, name, allowedKeys): object`

- [ ] **Step 1: Write the failing test**

Create `mesh/test/sovereign-information-common.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertAuthorityNeutral,
  assertEnum,
  assertIsoTimestamp,
  assertNoUnknownKeys,
  assertReference,
  assertUniqueStrings
} from '../src/domain/sovereign-information-common.mjs';

test('shared SIEA validators accept bounded canonical semantic values', () => {
  assert.equal(assertEnum('subject', 'relationship', new Set(['subject', 'originator'])), 'subject');
  assert.deepEqual(assertUniqueStrings(['a', 'b'], 'refs', { min: 1 }), ['a', 'b']);
  assert.equal(assertIsoTimestamp('2026-09-03T12:00:00.000Z', 'created_at'), '2026-09-03T12:00:00.000Z');
  assert.equal(assertReference('principal:alice', 'principal_ref'), 'principal:alice');
  assert.deepEqual(assertNoUnknownKeys({ a: 1 }, 'value', new Set(['a'])), { a: 1 });
});

test('shared SIEA validators reject ambiguous or authority-bearing semantic state', () => {
  assert.throws(() => assertUniqueStrings(['a', 'a'], 'refs'), /duplicates/);
  assert.throws(() => assertIsoTimestamp('tomorrow', 'created_at'), /ISO timestamp/);
  assert.throws(() => assertReference('', 'principal_ref'), /reference/);
  assert.throws(() => assertNoUnknownKeys({ a: 1, b: 2 }, 'value', new Set(['a'])), /unknown field b/);
  assert.throws(() => assertAuthorityNeutral({ execution_authority: ['effect:x'] }, 'semantic object'), /execution authority/);
  assert.throws(() => assertAuthorityNeutral({ capability_grant: 'grant:x' }, 'semantic object'), /execution authority/);
});
```

- [ ] **Step 2: Run the focused test to verify RED**

Run:

```bash
cd mesh
node --test test/sovereign-information-common.test.mjs
```

Expected: FAIL because `../src/domain/sovereign-information-common.mjs` does not exist.

- [ ] **Step 3: Implement the minimal shared validators**

Create `mesh/src/domain/sovereign-information-common.mjs` with this public shape:

```js
import {
  ValidationError,
  assertPlainObject,
  assertString,
  assertStringArray
} from '../lib/canonical.mjs';

export const SIEA_AUTHORITY_BEARING_FIELDS = new Set([
  'allow',
  'authorized',
  'authorized_effects',
  'capability_grant',
  'execution_authority',
  'grant',
  'sandbox_grant'
]);

export function assertEnum(value, name, allowed) {
  assertString(value, name, { max: 128 });
  if (!allowed.has(value)) throw new ValidationError(`${name} is not an allowed value`);
  return value;
}

export function assertUniqueStrings(value, name, { min = 0, maxItems = 64, itemMax = 256 } = {}) {
  const items = assertStringArray(value, name, { maxItems, itemMax });
  if (items.length < min) throw new ValidationError(`${name} must contain at least ${min} item(s)`);
  if (new Set(items).size !== items.length) throw new ValidationError(`${name} must not contain duplicates`);
  return items;
}

export function assertIsoTimestamp(value, name) {
  assertString(value, name, { max: 64 });
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new ValidationError(`${name} must be an ISO timestamp`);
  }
  return value;
}

export function assertReference(value, name) {
  assertString(value, name, { min: 3, max: 512 });
  if (!value.includes(':')) throw new ValidationError(`${name} must be a namespaced reference`);
  return value;
}

export function assertNoUnknownKeys(record, name, allowedKeys) {
  assertPlainObject(record, name);
  for (const key of Object.keys(record)) {
    if (!allowedKeys.has(key)) throw new ValidationError(`${name} contains unknown field ${key}`);
  }
  return record;
}

export function assertAuthorityNeutral(record, name) {
  assertPlainObject(record, name);
  for (const key of SIEA_AUTHORITY_BEARING_FIELDS) {
    if (Object.hasOwn(record, key)) {
      throw new ValidationError(`${name} must not carry execution authority via ${key}`);
    }
  }
  return record;
}
```

- [ ] **Step 4: Run the focused test to verify GREEN**

Run:

```bash
cd mesh
node --test test/sovereign-information-common.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mesh/src/domain/sovereign-information-common.mjs mesh/test/sovereign-information-common.test.mjs
git commit -m "feat: add sovereign information validation boundary"
```

---

### Task 2: Information Rights Envelope

**Files:**
- Create: `mesh/src/domain/information-rights.mjs`
- Test: `mesh/test/information-rights.test.mjs`

**Interfaces:**
- Consumes: shared validators from Task 1.
- Produces:
  - `INFORMATION_RIGHTS_SCHEMA = 'axiom-information-rights-envelope.v1'`
  - `INFORMATION_RELATIONSHIP_FIELDS: readonly string[]`
  - `INFORMATION_RIGHTS: ReadonlySet<string>`
  - `validateInformationRightsEnvelope(envelope): object`

**Canonical envelope shape:**

```js
{
  schema: 'axiom-information-rights-envelope.v1',
  object_ref: 'record:abc',
  information_class: 'clinical-note',
  sensitivity_class: 'restricted',
  relationships: {
    subjects: ['principal:patient'],
    originators: ['principal:clinician'],
    custodians: ['institution:hospital'],
    controllers: ['institution:hospital'],
    affected_parties: [],
    beneficiaries: ['principal:patient'],
    reviewers: [],
    disclosure_authorities: ['policy:health-access-v1'],
    retention_authorities: ['policy:health-retention-v1']
  },
  authority_basis: ['policy:health-access-v1'],
  allowed_purposes: ['care'],
  forbidden_purposes: ['advertising'],
  policy_refs: {
    access: ['policy:health-access-v1'],
    disclosure: ['policy:health-disclosure-v1'],
    retention: ['policy:health-retention-v1'],
    challenge: ['policy:health-challenge-v1'],
    correction: ['policy:health-correction-v1'],
    export: [],
    deletion: []
  },
  projection_profiles: ['projection:clinical-summary-v1'],
  jurisdiction_context: ['jurisdiction:example'],
  provenance_refs: ['evidence:event-1'],
  evidence_refs: [],
  state: {
    retention: 'active',
    challenge: 'none',
    supersession: 'current'
  },
  created_at: '2026-09-03T12:00:00.000Z',
  reviewed_at: null
}
```

- [ ] **Step 1: Write the failing tests**

Create `mesh/test/information-rights.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  INFORMATION_RIGHTS_SCHEMA,
  validateInformationRightsEnvelope
} from '../src/domain/information-rights.mjs';

function fixture() {
  return {
    schema: INFORMATION_RIGHTS_SCHEMA,
    object_ref: 'record:clinical-1',
    information_class: 'clinical-note',
    sensitivity_class: 'restricted',
    relationships: {
      subjects: ['principal:patient'],
      originators: ['principal:clinician'],
      custodians: ['institution:hospital'],
      controllers: ['institution:hospital'],
      affected_parties: [],
      beneficiaries: ['principal:patient'],
      reviewers: [],
      disclosure_authorities: ['policy:health-access-v1'],
      retention_authorities: ['policy:health-retention-v1']
    },
    authority_basis: ['policy:health-access-v1'],
    allowed_purposes: ['care'],
    forbidden_purposes: ['advertising'],
    policy_refs: {
      access: ['policy:health-access-v1'],
      disclosure: ['policy:health-disclosure-v1'],
      retention: ['policy:health-retention-v1'],
      challenge: ['policy:health-challenge-v1'],
      correction: ['policy:health-correction-v1'],
      export: [],
      deletion: []
    },
    projection_profiles: ['projection:clinical-summary-v1'],
    jurisdiction_context: ['jurisdiction:example'],
    provenance_refs: ['evidence:event-1'],
    evidence_refs: [],
    state: { retention: 'active', challenge: 'none', supersession: 'current' },
    created_at: '2026-09-03T12:00:00.000Z',
    reviewed_at: null
  };
}

test('information rights preserve independent subject, author, custody, control, and disclosure relationships', () => {
  const value = validateInformationRightsEnvelope(fixture());
  assert.deepEqual(value.relationships.subjects, ['principal:patient']);
  assert.deepEqual(value.relationships.originators, ['principal:clinician']);
  assert.deepEqual(value.relationships.custodians, ['institution:hospital']);
  assert.deepEqual(value.relationships.controllers, ['institution:hospital']);
  assert.deepEqual(value.relationships.disclosure_authorities, ['policy:health-access-v1']);
});

test('subject status and authorship do not become universal ownership shortcuts', () => {
  assert.throws(() => validateInformationRightsEnvelope({ ...fixture(), owner: 'principal:patient' }), /unknown field owner|owner/);
  const authorOnly = fixture();
  authorOnly.relationships.subjects = [];
  assert.equal(validateInformationRightsEnvelope(authorOnly).relationships.originators[0], 'principal:clinician');
});

test('information rights envelope cannot carry execution authority', () => {
  assert.throws(() => validateInformationRightsEnvelope({ ...fixture(), execution_authority: ['read:anything'] }), /execution authority/);
});
```

- [ ] **Step 2: Run RED**

```bash
cd mesh
node --test test/information-rights.test.mjs
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the minimal validator**

Create `mesh/src/domain/information-rights.mjs` with exact allowed root keys, exact relationship keys, exact policy-ref keys, and these enums:

```js
export const INFORMATION_RIGHTS_SCHEMA = 'axiom-information-rights-envelope.v1';
export const INFORMATION_RELATIONSHIP_FIELDS = Object.freeze([
  'subjects',
  'originators',
  'custodians',
  'controllers',
  'affected_parties',
  'beneficiaries',
  'reviewers',
  'disclosure_authorities',
  'retention_authorities'
]);

export const INFORMATION_RIGHTS = new Set([
  'know-exists',
  'inspect-metadata',
  'inspect-full-content',
  'receive-projection',
  'use-for-purpose',
  'correct-factual-metadata',
  'challenge-interpretation',
  'append-contrary-evidence',
  'export',
  'disclose-onward',
  'delete',
  'request-deletion',
  'retain-under-obligation',
  'seal',
  'unseal',
  'aggregate-analytics',
  'model-input',
  'cite-as-evidence',
  'rely-for-decision'
]);
```

`validateInformationRightsEnvelope()` must:

1. call `assertAuthorityNeutral(envelope, 'information rights envelope')` before any semantic validation;
2. reject unknown root keys, including ambiguous `owner`;
3. require `schema === INFORMATION_RIGHTS_SCHEMA`;
4. require namespaced references for `object_ref` and all relationship/policy/provenance/evidence refs;
5. permit empty relationship arrays so an originator can exist without the subject receiving automatic access semantics;
6. require all relationship keys to exist;
7. reject duplicate refs within each array;
8. reject overlap between `allowed_purposes` and `forbidden_purposes`;
9. require `state.retention` in `active|held|expired|deleted`, `state.challenge` in `none|open|resolved`, and `state.supersession` in `current|superseded`;
10. accept `reviewed_at` only as `null` or an exact ISO timestamp;
11. return the validated envelope unchanged; do not add authority, default recipients, or inferred access rights.

- [ ] **Step 4: Run GREEN**

```bash
cd mesh
node --test test/information-rights.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mesh/src/domain/information-rights.mjs mesh/test/information-rights.test.mjs
git commit -m "feat: add information rights envelope"
```

---

### Task 3: Evidence graph and disconfirming-evidence preservation

**Files:**
- Create: `mesh/src/domain/evidence-graph.mjs`
- Test: `mesh/test/evidence-graph.test.mjs`

**Interfaces:**
- Consumes: Task 1 validators.
- Produces:
  - `EVIDENCE_ASSERTION_SCHEMA = 'axiom-evidence-assertion.v1'`
  - `EVIDENCE_LINK_SCHEMA = 'axiom-evidence-link.v1'`
  - `EVIDENCE_REVIEW_SCHEMA = 'axiom-evidence-review-state.v1'`
  - `validateEvidenceAssertion(assertion): object`
  - `validateEvidenceLink(link): object`
  - `validateEvidenceReviewState(review): object`
  - `buildEvidenceContext({ assertions, links, focus_ids }): { assertions, links }`

**Assertion node types:** `observation`, `assertion`, `inference`, `hypothesis`, `evidence-item`, `counterevidence`, `source`, `alternative-explanation`, `unknown`, `missing-evidence`, `challenge`, `correction`, `supersession`, `review`, `adjudication`, `decision-use`.

**Epistemic states:** `asserted`, `corroborated`, `disputed`, `superseded`, `adjudicated-for-defined-purpose`, `indeterminate`, `withdrawn`.

**Link relations:** `supports`, `contradicts`, `weakens`, `corroborates`, `derived-from`, `observed-by`, `asserted-by`, `reviewed-by`, `relied-upon-by`, `challenged-by`, `corrected-by`, `superseded-by`, `alternative-to`, `missing-from`, `produced-by`, `disclosed-to`, `sealed-under`, `adjudicated-by`.

- [ ] **Step 1: Write the failing tests**

Create `mesh/test/evidence-graph.test.mjs` with fixtures representing one hypothesis, one supporting item, one contradicting item, one alternative explanation, and one challenge. Assert:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EVIDENCE_ASSERTION_SCHEMA,
  EVIDENCE_LINK_SCHEMA,
  EVIDENCE_REVIEW_SCHEMA,
  buildEvidenceContext,
  validateEvidenceAssertion,
  validateEvidenceLink,
  validateEvidenceReviewState
} from '../src/domain/evidence-graph.mjs';

const at = '2026-09-03T12:00:00.000Z';

function node(id, type, proposition) {
  return {
    schema: EVIDENCE_ASSERTION_SCHEMA,
    assertion_id: id,
    type,
    proposition,
    source_ref: 'principal:reviewer',
    epistemic_state: type === 'challenge' ? 'disputed' : 'asserted',
    purpose_scope: ['investigation'],
    provenance_refs: ['artifact:source-1'],
    created_at: at
  };
}

function link(id, from_ref, to_ref, relation) {
  return {
    schema: EVIDENCE_LINK_SCHEMA,
    link_id: id,
    from_ref,
    to_ref,
    relation,
    asserted_by: 'principal:reviewer',
    created_at: at
  };
}

test('evidence context preserves support, contradiction, alternatives, and challenge around a hypothesis', () => {
  const assertions = [
    node('assertion:h', 'hypothesis', 'Hypothesis A'),
    node('assertion:s', 'evidence-item', 'Supports A'),
    node('assertion:c', 'counterevidence', 'Conflicts with A'),
    node('assertion:a', 'alternative-explanation', 'Alternative B'),
    node('assertion:q', 'challenge', 'A is disputed')
  ];
  const links = [
    link('link:s', 'assertion:s', 'assertion:h', 'supports'),
    link('link:c', 'assertion:c', 'assertion:h', 'contradicts'),
    link('link:a', 'assertion:a', 'assertion:h', 'alternative-to'),
    link('link:q', 'assertion:q', 'assertion:h', 'challenged-by')
  ];
  const result = buildEvidenceContext({ assertions, links, focus_ids: ['assertion:h'] });
  assert.deepEqual(new Set(result.assertions.map(item => item.assertion_id)), new Set(assertions.map(item => item.assertion_id)));
  assert.deepEqual(new Set(result.links.map(item => item.relation)), new Set(['supports', 'contradicts', 'alternative-to', 'challenged-by']));
});

test('review state never promotes availability or machine review into human review', () => {
  const review = validateEvidenceReviewState({
    schema: EVIDENCE_REVIEW_SCHEMA,
    object_ref: 'artifact:1',
    known: true,
    acquired: true,
    integrity_verified: true,
    indexed: true,
    machine_reviewed: true,
    human_reviewed: false,
    relied_upon: false,
    disclosed: true,
    challenged: false,
    updated_at: at
  });
  assert.equal(review.machine_reviewed, true);
  assert.equal(review.human_reviewed, false);
  assert.equal(review.disclosed, true);
  assert.equal(review.relied_upon, false);
});

test('evidence schemas reject truth and execution-authority shortcuts', () => {
  assert.throws(() => validateEvidenceAssertion({ ...node('assertion:x', 'assertion', 'X'), truth: true }), /unknown field truth/);
  assert.throws(() => validateEvidenceAssertion({ ...node('assertion:x', 'assertion', 'X'), execution_authority: ['effect:x'] }), /execution authority/);
  assert.throws(() => validateEvidenceLink({ ...link('link:x', 'assertion:x', 'assertion:y', 'proves') }), /relation/);
});
```

- [ ] **Step 2: Run RED**

```bash
cd mesh
node --test test/evidence-graph.test.mjs
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement validators and context traversal**

`buildEvidenceContext()` must:

1. validate every assertion and link before traversal;
2. require each link endpoint to reference an assertion present in the supplied set;
3. start from `focus_ids` and repeatedly include both endpoints of every link touching an already-included node until the set reaches a fixed point;
4. return assertions and links in their original input order for deterministic presentation;
5. never filter `contradicts`, `weakens`, `alternative-to`, `missing-from`, `challenged-by`, `corrected-by`, or `superseded-by` merely because supporting evidence exists;
6. reject duplicate assertion IDs and duplicate link IDs;
7. return no `truth`, `confidence_as_authority`, or execution grant field.

`validateEvidenceReviewState()` must represent each state as an independent boolean and must not derive `human_reviewed`, `relied_upon`, or `disclosed` from another state.

- [ ] **Step 4: Run GREEN**

```bash
cd mesh
node --test test/evidence-graph.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mesh/src/domain/evidence-graph.mjs mesh/test/evidence-graph.test.mjs
git commit -m "feat: add evidence graph semantics"
```

---

### Task 4: Delegated Gate Mandate

**Files:**
- Create: `mesh/src/domain/delegated-gate-mandate.mjs`
- Test: `mesh/test/delegated-gate-mandate.test.mjs`

**Interfaces:**
- Consumes: Task 1 validators.
- Produces:
  - `DELEGATED_GATE_MANDATE_SCHEMA = 'axiom-delegated-gate-mandate.v1'`
  - `validateDelegatedGateMandate(mandate): object`
  - `evaluateDelegatedGateMandate(mandate, request, { now }): { gate_authorized: boolean, reason_code: string }`

**Important semantic boundary:** `gate_authorized` means only that this delegate may make the named gate decision under the mandate. It is **not** an effect authorization or Sandbox grant.

- [ ] **Step 1: Write the failing tests**

Create `mesh/test/delegated-gate-mandate.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DELEGATED_GATE_MANDATE_SCHEMA,
  evaluateDelegatedGateMandate,
  validateDelegatedGateMandate
} from '../src/domain/delegated-gate-mandate.mjs';

function mandate() {
  return {
    schema: DELEGATED_GATE_MANDATE_SCHEMA,
    mandate_id: 'mandate:1',
    grantor: 'principal:human',
    delegate: 'agent:personal',
    domains: ['health'],
    actions: ['disclosure.projection'],
    purposes: ['routine-care'],
    data_classes: ['restricted'],
    destinations: ['institution:clinic'],
    resource_ceilings: { max_records: 1, max_value_minor: 0 },
    assurance_ceiling: 'high-assurance',
    allowed_gate_decisions: ['minimum-disclosure', 'credential-refresh'],
    escalation_conditions: ['novel-purpose', 'new-destination', 'insufficient-evidence'],
    credential_rules: { allow_opaque_handle: true, allow_raw_secret: false },
    retention_constraints: ['no-new-retention'],
    starts_at: '2026-09-03T00:00:00.000Z',
    expires_at: '2026-09-04T00:00:00.000Z',
    revocation: { revoked: false, revoked_at: null, reason: null },
    delegation: { mode: 'none' },
    receipt_required: true
  };
}

test('delegated agent can clear an in-scope gate without minting effect authority', () => {
  const result = evaluateDelegatedGateMandate(mandate(), {
    delegate: 'agent:personal',
    domain: 'health',
    action: 'disclosure.projection',
    purpose: 'routine-care',
    data_class: 'restricted',
    destination: 'institution:clinic',
    assurance_profile: 'enhanced',
    gate_decision: 'minimum-disclosure'
  }, { now: '2026-09-03T12:00:00.000Z' });
  assert.deepEqual(result, { gate_authorized: true, reason_code: 'mandate_scope_satisfied' });
  assert.equal(Object.hasOwn(result, 'execution_authority'), false);
});

test('expired, revoked, and scope-widening requests do not clear gates', () => {
  assert.equal(evaluateDelegatedGateMandate(mandate(), {
    delegate: 'agent:personal', domain: 'health', action: 'disclosure.projection', purpose: 'routine-care',
    data_class: 'restricted', destination: 'institution:clinic', assurance_profile: 'enhanced', gate_decision: 'minimum-disclosure'
  }, { now: '2026-09-05T00:00:00.000Z' }).reason_code, 'mandate_expired');

  const revoked = mandate();
  revoked.revocation = { revoked: true, revoked_at: '2026-09-03T10:00:00.000Z', reason: 'owner-revoked' };
  assert.equal(evaluateDelegatedGateMandate(revoked, {
    delegate: 'agent:personal', domain: 'health', action: 'disclosure.projection', purpose: 'routine-care',
    data_class: 'restricted', destination: 'institution:clinic', assurance_profile: 'enhanced', gate_decision: 'minimum-disclosure'
  }, { now: '2026-09-03T12:00:00.000Z' }).reason_code, 'mandate_revoked');

  assert.equal(evaluateDelegatedGateMandate(mandate(), {
    delegate: 'agent:personal', domain: 'health', action: 'disclosure.projection', purpose: 'research',
    data_class: 'restricted', destination: 'institution:clinic', assurance_profile: 'enhanced', gate_decision: 'minimum-disclosure'
  }, { now: '2026-09-03T12:00:00.000Z' }).reason_code, 'purpose_out_of_scope');
});

test('mandate schema rejects execution grants and unrestricted delegation', () => {
  assert.throws(() => validateDelegatedGateMandate({ ...mandate(), execution_authority: ['health.read'] }), /execution authority/);
  const widened = mandate();
  widened.delegation = { mode: 'unrestricted' };
  assert.throws(() => validateDelegatedGateMandate(widened), /delegation/);
});
```

- [ ] **Step 2: Run RED**

```bash
cd mesh
node --test test/delegated-gate-mandate.test.mjs
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement mandate validation/evaluation**

Rules:

1. `assurance_ceiling` enum: `standard|enhanced|high-assurance|critical-assurance`.
2. `delegation.mode` enum: `none|attenuation-only`.
3. `revocation.revoked === true` requires non-null ISO `revoked_at` and non-empty reason.
4. `starts_at < expires_at` is mandatory.
5. `credential_rules.allow_raw_secret` must be `false` in Slice 1.
6. evaluation checks, in order: schema validity, delegate match, active time, revocation, domain, action, purpose, data class, destination, assurance ceiling, gate decision.
7. use stable failure reason codes: `delegate_mismatch`, `mandate_not_started`, `mandate_expired`, `mandate_revoked`, `domain_out_of_scope`, `action_out_of_scope`, `purpose_out_of_scope`, `data_class_out_of_scope`, `destination_out_of_scope`, `assurance_exceeds_ceiling`, `gate_decision_out_of_scope`.
8. return only `{ gate_authorized, reason_code }`; no effect grant, capability, token, credential, or provider call.

- [ ] **Step 4: Run GREEN**

```bash
cd mesh
node --test test/delegated-gate-mandate.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mesh/src/domain/delegated-gate-mandate.mjs mesh/test/delegated-gate-mandate.test.mjs
git commit -m "feat: add delegated gate mandates"
```

---

### Task 5: Deterministic Assurance Profile Evaluator

**Files:**
- Create: `mesh/src/domain/assurance-profile.mjs`
- Test: `mesh/test/assurance-profile.test.mjs`

**Interfaces:**
- Consumes: Task 1 validators.
- Produces:
  - `ASSURANCE_PROFILE_SCHEMA = 'axiom-assurance-profile.v1'`
  - `evaluateAssuranceProfile(consequence): { schema, profile, required_controls, reason_codes }`

**Consequence input:**

```js
{
  data_sensitivity: 'public|private|restricted|highly-restricted|unknown',
  disclosure_breadth: 'none|bounded|broad|mass|unknown',
  third_party_impact: 'none|limited|material|severe|unknown',
  monetary_exposure: 'none|bounded|high|systemic|unknown',
  physical_safety_impact: 'none|limited|material|severe|unknown',
  legal_regulatory_consequence: 'none|limited|material|severe|unknown',
  clinical_consequence: 'none|limited|material|severe|unknown',
  employment_eligibility_consequence: 'none|limited|material|severe|unknown',
  governance_authority_consequence: 'none|limited|material|severe|unknown',
  trust_root_impact: 'none|limited|material|root|unknown',
  reversibility: 'reversible|recoverable|hard-to-reverse|irreversible|unknown',
  affected_population: 'one|small|large|mass|unknown',
  destination_currentness: 'current|stale|unknown',
  evidence_freshness: 'current|stale|unknown',
  runtime_uncertainty: 'low|moderate|high|unknown',
  contestability: 'clear|disputed|unavailable|unknown'
}
```

- [ ] **Step 1: Write the failing tests**

Create `mesh/test/assurance-profile.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateAssuranceProfile } from '../src/domain/assurance-profile.mjs';

function baseline(overrides = {}) {
  return {
    data_sensitivity: 'public',
    disclosure_breadth: 'none',
    third_party_impact: 'none',
    monetary_exposure: 'none',
    physical_safety_impact: 'none',
    legal_regulatory_consequence: 'none',
    clinical_consequence: 'none',
    employment_eligibility_consequence: 'none',
    governance_authority_consequence: 'none',
    trust_root_impact: 'none',
    reversibility: 'reversible',
    affected_population: 'one',
    destination_currentness: 'current',
    evidence_freshness: 'current',
    runtime_uncertainty: 'low',
    contestability: 'clear',
    ...overrides
  };
}

test('low consequence returns standard assurance without granting permission', () => {
  const result = evaluateAssuranceProfile(baseline());
  assert.equal(result.profile, 'standard');
  assert.equal(Object.hasOwn(result, 'allowed'), false);
  assert.equal(Object.hasOwn(result, 'authorized'), false);
  assert.equal(Object.hasOwn(result, 'requires_human_confirmation'), false);
});

test('high consequence increases safeguards rather than automatically denying', () => {
  const result = evaluateAssuranceProfile(baseline({
    data_sensitivity: 'highly-restricted',
    clinical_consequence: 'severe',
    reversibility: 'irreversible'
  }));
  assert.equal(result.profile, 'critical-assurance');
  assert.ok(result.required_controls.includes('strong-identity-assurance'));
  assert.ok(result.required_controls.includes('independent-verification-when-policy-requires'));
  assert.ok(result.required_controls.includes('recovery-or-containment-plan'));
  assert.equal(Object.hasOwn(result, 'deny'), false);
});

test('unknown consequence dimensions select stricter assurance with stable reasons', () => {
  const result = evaluateAssuranceProfile(baseline({ evidence_freshness: 'unknown' }));
  assert.equal(result.profile, 'high-assurance');
  assert.ok(result.reason_codes.includes('evidence_freshness_unknown'));
});
```

- [ ] **Step 2: Run RED**

```bash
cd mesh
node --test test/assurance-profile.test.mjs
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement deterministic severity mapping**

Use **maximum severity, not a weighted average**, so a severe single dimension cannot be washed out by many low-risk dimensions.

Map each enum value to severity `0..3` explicitly. Required rules:

- baseline/none/current/clear/low/reversible/one -> `0`;
- private/bounded/limited/moderate/recoverable/small -> `1`;
- restricted/broad/material/high/stale/hard-to-reverse/large/disputed -> `2`;
- highly-restricted/mass/severe/systemic/root/irreversible/unavailable -> `3`;
- every `unknown` -> at least `2`, with `destination_currentness: unknown`, `evidence_freshness: unknown`, `trust_root_impact: unknown`, and `reversibility: unknown` forcing severity `2` and a stable `<dimension>_unknown` reason code.

Profile mapping:

```text
0 -> standard
1 -> enhanced
2 -> high-assurance
3 -> critical-assurance
```

Control mapping:

```js
standard: ['bounded-inputs']
enhanced: ['bounded-inputs', 'fresh-evidence-check', 'explicit-destination-check']
high-assurance: ['bounded-inputs', 'fresh-evidence-check', 'explicit-destination-check', 'strong-identity-assurance', 'enhanced-observability', 'recovery-or-containment-plan']
critical-assurance: ['bounded-inputs', 'fresh-evidence-check', 'explicit-destination-check', 'strong-identity-assurance', 'enhanced-observability', 'recovery-or-containment-plan', 'independent-verification-when-policy-requires', 'post-action-reconciliation']
```

The evaluator must never return `allow`, `deny`, `authorized`, `execution_authority`, or `requires_human_confirmation`. Those belong to later policy/authority evaluation.

- [ ] **Step 4: Run GREEN**

```bash
cd mesh
node --test test/assurance-profile.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mesh/src/domain/assurance-profile.mjs mesh/test/assurance-profile.test.mjs
git commit -m "feat: add consequence proportional assurance profiles"
```

---

### Task 6: Minimum-Sufficient Contextual Disclosure

**Files:**
- Create: `mesh/src/domain/contextual-disclosure.mjs`
- Test: `mesh/test/contextual-disclosure.test.mjs`

**Interfaces:**
- Consumes: Task 1 validators.
- Produces:
  - `CONTEXTUAL_DISCLOSURE_REQUEST_SCHEMA = 'axiom-contextual-disclosure-request.v1'`
  - `CONTEXTUAL_DISCLOSURE_RESULT_SCHEMA = 'axiom-contextual-disclosure-result.v1'`
  - `validateContextualDisclosureRequest(request): object`
  - `validateContextualDisclosureResult(result): object`
  - `selectMinimumSufficientProjection({ request, available_claims, available_fields, policy }): object`

**Available claim shape:**

```js
{
  claim_id: 'claim:licensed',
  predicate: 'professional-licence-active',
  value: true,
  evidence_refs: ['credential:licence-1'],
  derived_from_fields: ['licence_number', 'licence_status']
}
```

**Projection policy shape:**

```js
{
  allowed_claims: ['age-at-least-18', 'professional-licence-active'],
  allowed_raw_fields: [],
  required_authority_ref: 'policy:disclosure-v1'
}
```

- [ ] **Step 1: Write the failing tests**

Create `mesh/test/contextual-disclosure.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONTEXTUAL_DISCLOSURE_REQUEST_SCHEMA,
  selectMinimumSufficientProjection,
  validateContextualDisclosureRequest
} from '../src/domain/contextual-disclosure.mjs';

function request() {
  return {
    schema: CONTEXTUAL_DISCLOSURE_REQUEST_SCHEMA,
    request_id: 'disclosure-request:1',
    requester: 'institution:clinic',
    subject_ref: 'principal:professional',
    purpose: 'professional-access-check',
    required_claims: ['professional-licence-active'],
    requested_fields: ['licence_number', 'home_address'],
    verifier_policy_ref: 'policy:clinic-access-v1',
    created_at: '2026-09-03T12:00:00.000Z'
  };
}

test('minimum sufficient projection satisfies a credential requirement without revealing unrelated raw profile fields', () => {
  const result = selectMinimumSufficientProjection({
    request: request(),
    available_claims: [{
      claim_id: 'claim:licensed',
      predicate: 'professional-licence-active',
      value: true,
      evidence_refs: ['credential:licence-1'],
      derived_from_fields: ['licence_number', 'licence_status']
    }],
    available_fields: {
      licence_number: 'SECRET-LICENCE-NUMBER',
      home_address: 'PRIVATE-HOME-ADDRESS'
    },
    policy: {
      allowed_claims: ['professional-licence-active'],
      allowed_raw_fields: [],
      required_authority_ref: 'policy:disclosure-v1'
    }
  });
  assert.equal(result.status, 'satisfied');
  assert.deepEqual(result.selected_claim_ids, ['claim:licensed']);
  assert.deepEqual(result.disclosed_fields, {});
  assert.deepEqual(new Set(result.withheld_fields), new Set(['licence_number', 'home_address']));
  assert.equal(result.authority_ref, 'policy:disclosure-v1');
});

test('requester desire does not justify raw disclosure without policy authority', () => {
  const result = selectMinimumSufficientProjection({
    request: request(),
    available_claims: [],
    available_fields: { home_address: 'PRIVATE-HOME-ADDRESS' },
    policy: { allowed_claims: [], allowed_raw_fields: [], required_authority_ref: 'policy:disclosure-v1' }
  });
  assert.equal(result.status, 'escalation');
  assert.deepEqual(result.disclosed_fields, {});
  assert.ok(result.reason_codes.includes('required_claim_unavailable'));
});

test('contextual disclosure request cannot carry an execution grant', () => {
  assert.throws(() => validateContextualDisclosureRequest({ ...request(), capability_grant: 'grant:1' }), /execution authority/);
});
```

- [ ] **Step 2: Run RED**

```bash
cd mesh
node --test test/contextual-disclosure.test.mjs
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement deterministic projection selection**

Rules:

1. validate request, claims, raw field names, and policy before selection;
2. satisfy each `required_claims` predicate using an allowed claim with exact predicate match;
3. never disclose raw fields merely because they were used to derive a selected claim;
4. disclose a requested raw field only when it is listed in both `request.requested_fields` and `policy.allowed_raw_fields` and exists in `available_fields`;
5. all requested but non-authorized fields go to `withheld_fields`;
6. if all required claims are satisfied, status is `satisfied`; if some are satisfied, `partial`; if none are satisfied and at least one is required, `escalation`;
7. return `reason_codes` including `required_claim_unavailable`, `raw_field_not_authorized`, and `minimum_sufficient_projection_applied` where applicable;
8. return the policy's `required_authority_ref` as provenance for the projection decision; do not create an effect grant;
9. result schema must permit `denied` for later policy composition but this pure selector itself returns only `satisfied|partial|escalation`.

- [ ] **Step 4: Run GREEN**

```bash
cd mesh
node --test test/contextual-disclosure.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mesh/src/domain/contextual-disclosure.mjs mesh/test/contextual-disclosure.test.mjs
git commit -m "feat: add minimum sufficient disclosure projection"
```

---

### Task 7: Cross-cutting authority/evidence invariants

**Files:**
- Create: `mesh/test/sovereign-information-invariants.test.mjs`
- Modify only if a failing invariant exposes a real semantic bug: the Slice 1 modules created in Tasks 1-6.

**Interfaces:**
- Consumes: all Slice 1 public interfaces.
- Produces: regression coverage for the architectural distinctions; no new runtime interface.

- [ ] **Step 1: Write the invariant suite**

Create `mesh/test/sovereign-information-invariants.test.mjs` with complete literal fixtures. The committed file must include these exact semantic assertions:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateAssuranceProfile } from '../src/domain/assurance-profile.mjs';
import { buildEvidenceContext } from '../src/domain/evidence-graph.mjs';
import { evaluateDelegatedGateMandate } from '../src/domain/delegated-gate-mandate.mjs';

const criticalConsequence = {
  data_sensitivity: 'highly-restricted',
  disclosure_breadth: 'broad',
  third_party_impact: 'material',
  monetary_exposure: 'none',
  physical_safety_impact: 'none',
  legal_regulatory_consequence: 'material',
  clinical_consequence: 'severe',
  employment_eligibility_consequence: 'none',
  governance_authority_consequence: 'none',
  trust_root_impact: 'none',
  reversibility: 'irreversible',
  affected_population: 'one',
  destination_currentness: 'current',
  evidence_freshness: 'current',
  runtime_uncertainty: 'low',
  contestability: 'disputed'
};

const delegatedMandate = {
  schema: 'axiom-delegated-gate-mandate.v1',
  mandate_id: 'mandate:invariant',
  grantor: 'principal:human',
  delegate: 'agent:personal',
  domains: ['health'],
  actions: ['disclosure.projection'],
  purposes: ['routine-care'],
  data_classes: ['restricted'],
  destinations: ['institution:clinic'],
  resource_ceilings: { max_records: 1, max_value_minor: 0 },
  assurance_ceiling: 'high-assurance',
  allowed_gate_decisions: ['minimum-disclosure'],
  escalation_conditions: ['novel-purpose'],
  credential_rules: { allow_opaque_handle: true, allow_raw_secret: false },
  retention_constraints: ['no-new-retention'],
  starts_at: '2026-09-03T00:00:00.000Z',
  expires_at: '2026-09-04T00:00:00.000Z',
  revocation: { revoked: false, revoked_at: null, reason: null },
  delegation: { mode: 'none' },
  receipt_required: true
};

const delegatedRequest = {
  delegate: 'agent:personal',
  domain: 'health',
  action: 'disclosure.projection',
  purpose: 'routine-care',
  data_class: 'restricted',
  destination: 'institution:clinic',
  assurance_profile: 'enhanced',
  gate_decision: 'minimum-disclosure'
};

const at = '2026-09-03T12:00:00.000Z';
const evidenceAssertions = [
  { schema: 'axiom-evidence-assertion.v1', assertion_id: 'assertion:h', type: 'hypothesis', proposition: 'Hypothesis A', source_ref: 'principal:reviewer', epistemic_state: 'asserted', purpose_scope: ['investigation'], provenance_refs: ['artifact:1'], created_at: at },
  { schema: 'axiom-evidence-assertion.v1', assertion_id: 'assertion:c', type: 'counterevidence', proposition: 'Evidence conflicts with A', source_ref: 'principal:reviewer', epistemic_state: 'asserted', purpose_scope: ['investigation'], provenance_refs: ['artifact:2'], created_at: at },
  { schema: 'axiom-evidence-assertion.v1', assertion_id: 'assertion:q', type: 'challenge', proposition: 'A is disputed', source_ref: 'principal:reviewer', epistemic_state: 'disputed', purpose_scope: ['investigation'], provenance_refs: ['artifact:3'], created_at: at }
];
const evidenceLinks = [
  { schema: 'axiom-evidence-link.v1', link_id: 'link:c', from_ref: 'assertion:c', to_ref: 'assertion:h', relation: 'contradicts', asserted_by: 'principal:reviewer', created_at: at },
  { schema: 'axiom-evidence-link.v1', link_id: 'link:q', from_ref: 'assertion:q', to_ref: 'assertion:h', relation: 'challenged-by', asserted_by: 'principal:reviewer', created_at: at }
];

test('high consequence changes assurance but never itself decides allow or deny', () => {
  const result = evaluateAssuranceProfile(criticalConsequence);
  assert.equal(result.profile, 'critical-assurance');
  for (const forbidden of ['allow', 'deny', 'authorized', 'execution_authority', 'requires_human_confirmation']) {
    assert.equal(Object.hasOwn(result, forbidden), false);
  }
});

test('delegated gate clearance remains distinct from execution authority', () => {
  const result = evaluateDelegatedGateMandate(delegatedMandate, delegatedRequest, { now: at });
  assert.equal(result.gate_authorized, true);
  assert.equal(Object.hasOwn(result, 'execution_authority'), false);
  assert.equal(Object.hasOwn(result, 'capability_grant'), false);
});

test('evidence context cannot collapse to the dominant narrative', () => {
  const context = buildEvidenceContext({ assertions: evidenceAssertions, links: evidenceLinks, focus_ids: ['assertion:h'] });
  assert.ok(context.links.some(link => link.relation === 'contradicts'));
  assert.ok(context.links.some(link => link.relation === 'challenged-by'));
});
```

Add separate literal-fixture assertions in the same file that:

- subject relationship does not produce `inspect-full-content` authority;
- originator relationship does not produce `withhold-from-subject` authority;
- a `machine_reviewed: true` review state remains `human_reviewed: false` unless explicitly set;
- a contextual reputation-like claim may be projected but does not return authority fields;
- a request containing `learned_preference: 'always approve'` is rejected as an unknown mandate/disclosure field rather than used to expand authority.

- [ ] **Step 2: Run the invariant suite**

```bash
cd mesh
node --test test/sovereign-information-invariants.test.mjs
```

Expected: PASS if Tasks 1-6 implement the spec correctly; otherwise RED exposes a semantic bug to fix before proceeding.

- [ ] **Step 3: Fix only the failing semantic boundary**

If any assertion fails, change the smallest responsible Slice 1 module. Do not weaken the invariant test and do not add policy/execution code.

- [ ] **Step 4: Run the entire Slice 1 test set**

```bash
cd mesh
node --test \
  test/sovereign-information-common.test.mjs \
  test/information-rights.test.mjs \
  test/evidence-graph.test.mjs \
  test/delegated-gate-mandate.test.mjs \
  test/assurance-profile.test.mjs \
  test/contextual-disclosure.test.mjs \
  test/sovereign-information-invariants.test.mjs
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add mesh/test/sovereign-information-invariants.test.mjs mesh/src/domain
git commit -m "test: enforce sovereign information invariants"
```

---

### Task 8: Normative requirements and constitutional clarification

**Files:**
- Modify: `docs/rebuild/REQUIREMENTS.md`
- Modify: `CONSTITUTION.md`
- Test: `mesh/test/sovereign-information-doc-registration.test.mjs` (created in Task 9; Task 8 prepares content for it)

**Interfaces:**
- Consumes: approved spec and implemented Slice 1 semantics.
- Produces: normative requirements that describe intended system behavior without claiming unpromoted capabilities.

- [ ] **Step 1: Add the requirements section**

Append a section titled exactly:

```markdown
## Sovereign information, evidence, privacy, and authority
```

Add these rows with exact IDs and intent:

```markdown
| SIEA-01 | Consequential information MUST represent subject, originator, custodian, controller, affected-party, beneficiary, disclosure-authority, and retention-authority relationships independently where applicable; no single relationship creates universal ownership or access. | Information-rights schema/negative tests. |
| SIEA-02 | Provenance, signature, attestation, institutional status, consensus, or confidence MUST NOT be represented as proof that an assertion is true. | Evidence-schema and forbidden-field tests. |
| SIEA-03 | Consequential evidence workflows MUST preserve retrievable supporting evidence, contradictory evidence, missing evidence, alternative explanations, challenge, correction, and supersession relationships. | Evidence-context adversarial tests. |
| SIEA-04 | Known, acquired, integrity-verified, indexed, machine-reviewed, human-reviewed, relied-upon, disclosed, challenged, and adjudicated states MUST remain explicitly distinguishable. | Review-state tests. |
| SIEA-05 | Consequence classification MUST determine minimum assurance requirements, not permission. High-consequence authorized actions MAY proceed when the applicable authority and required safeguards are satisfied. | Assurance evaluator and authority-separation tests. |
| SIEA-06 | A delegated gate mandate MUST be purpose-, action-, domain-, data-, destination-, assurance-, time-, and revocation-bounded and MUST NOT silently expand from inferred user preference. | Mandate scope/expiry/revocation tests. |
| SIEA-07 | Contextual disclosure SHOULD prefer the minimum sufficient claim/proof over unrelated raw profile data, subject to applicable authority, law, and policy. | Projection minimization tests. |
| SIEA-08 | Identity, credential, reputation, risk, review state, or institutional role MUST NOT independently mint execution authority. | Cross-cutting authority-confusion tests. |
| SIEA-09 | Personalization data MUST NOT become externally disclosable merely because a local agent possesses or derived it. | Disclosure unknown-field/minimization tests. |
| SIEA-10 | Collective analytics SHOULD avoid stable cross-domain person identifiers and raw cross-domain dossiers by default; production privacy mechanisms require separate threat-model, reconstruction, composition, and independent-review evidence. | Future privacy-lab promotion gate; current non-claim tests. |
| SIEA-11 | Domain adapters MAY impose stronger lawful/privacy/safety requirements but MUST NOT bypass or weaken non-waivable substrate protections. | Domain-adapter property tests before promotion. |
| SIEA-12 | Real Health, Justice, Work/Payroll, Education, Finance, or Government deployments MUST remain disabled until exact legal, privacy, security, accessibility, operational, support, incident, jurisdictional, and independent-review boundaries are evidenced for the deployment. | Domain-specific signed promotion dossier; synthetic evidence is insufficient. |
```

Do not mark any of SIEA-10 through SIEA-12 as implemented capability claims.

- [ ] **Step 2: Clarify the Constitution without weakening current runtime guarantees**

Immediately after the existing high-risk approval paragraph, add language equivalent to this exact doctrine:

```markdown
Consequence classification is not authorization. Higher consequence raises the required assurance burden; it does not by itself require denial. A human or digital delegate may satisfy a gate only within an explicit applicable mandate and policy. End-user interruption is required only where the active authority/policy requires it. Until successor assurance semantics are implemented, verified, and promoted, existing executable high-risk approval requirements remain in force.

Information relationships are likewise non-collapsible: being the subject, originator, custodian, controller, reviewer, or institutional holder of information does not by itself create every access, disclosure, deletion, retention, or reliance right. Provenance establishes attributable history, not truth. Consequential systems must preserve challenge, correction, contradictory evidence, and explicit uncertainty rather than silently promoting the current narrative into fact.
```

- [ ] **Step 3: Run existing documentation and status checks**

```bash
cd mesh
npm run status:check
npm run docs:check
```

Expected at this moment: `status:check` should remain GREEN; `docs:check` may be RED only because the new spec/plan are not yet registered. Any other failure must be fixed before Task 9.

- [ ] **Step 4: Commit**

```bash
git add CONSTITUTION.md docs/rebuild/REQUIREMENTS.md
git commit -m "docs: codify sovereign information authority requirements"
```

---

### Task 9: Canonical documentation registration and exact verification

**Files:**
- Modify: `mesh/src/check-docs.mjs`
- Create: `mesh/test/sovereign-information-doc-registration.test.mjs`
- Existing: `docs/superpowers/specs/2026-09-03-sovereign-information-evidence-authority-design.md`
- Existing: `docs/superpowers/plans/2026-09-03-sovereign-information-evidence-authority-slice1.md`

**Interfaces:**
- Consumes: current `CANONICAL_DOCUMENTS` / `REQUIRED_CONTENT` structure.
- Produces: fail-closed registration of the approved spec, plan, and normative requirements phrases.

- [ ] **Step 1: Write the failing registration test**

Create `mesh/test/sovereign-information-doc-registration.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { CANONICAL_DOCUMENTS } from '../src/check-docs.mjs';

const required = new Set([
  'docs/superpowers/specs/2026-09-03-sovereign-information-evidence-authority-design.md',
  'docs/superpowers/plans/2026-09-03-sovereign-information-evidence-authority-slice1.md'
]);

test('sovereign information spec and plan are canonical registered documents', () => {
  const canonical = new Set(CANONICAL_DOCUMENTS);
  for (const path of required) assert.equal(canonical.has(path), true, `${path} must be canonical`);
});
```

- [ ] **Step 2: Run RED**

```bash
cd mesh
node --test test/sovereign-information-doc-registration.test.mjs
```

Expected: FAIL because the two documents are not yet in `CANONICAL_DOCUMENTS`.

- [ ] **Step 3: Register the documents and stable required content**

In `mesh/src/check-docs.mjs`:

1. add both paths to `CANONICAL_DOCUMENTS` adjacent to the other September 2026 superpowers documents;
2. add a `REQUIRED_CONTENT` entry for the new spec requiring these exact phrases:

```js
[
  'Risk is not prohibition',
  'Security gates and human interruptions are independent',
  'Privacy must hold against correlation, not merely direct disclosure',
  'Cross-domain knowledge is permitted; cross-domain dossiers are not the default mechanism',
  'Provenance is not truth',
  'available != reviewed'
]
```

3. extend the `docs/rebuild/REQUIREMENTS.md` required-content list with `SIEA-01`, `SIEA-05`, `SIEA-08`, and `SIEA-12`.

- [ ] **Step 4: Run GREEN documentation checks**

```bash
cd mesh
node --test test/sovereign-information-doc-registration.test.mjs
npm run docs:check
npm run status:check
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add mesh/src/check-docs.mjs mesh/test/sovereign-information-doc-registration.test.mjs
git commit -m "docs: register sovereign information programme"
```

---

### Task 10: Full Slice 1 verification and capability non-promotion proof

**Files:**
- Modify only if verification exposes a defect: files from Tasks 1-9.
- Must remain unchanged: `mesh/config/capabilities.json`.

**Interfaces:**
- Consumes: all Slice 1 code/tests/docs.
- Produces: reproducible verification evidence suitable for PR review; no new runtime capability.

- [ ] **Step 1: Run the complete Slice 1 tests**

```bash
cd mesh
node --test --test-reporter=spec \
  test/sovereign-information-common.test.mjs \
  test/information-rights.test.mjs \
  test/evidence-graph.test.mjs \
  test/delegated-gate-mandate.test.mjs \
  test/assurance-profile.test.mjs \
  test/contextual-disclosure.test.mjs \
  test/sovereign-information-invariants.test.mjs \
  test/sovereign-information-doc-registration.test.mjs
```

Expected: all PASS.

- [ ] **Step 2: Run the full kernel verification**

```bash
cd mesh
npm run check
```

Expected: PASS, including setup verification, network policy, Gateway client contract, Axiom One, registry, status, docs, and full `node --test` suite.

- [ ] **Step 3: Prove no capability registry promotion**

From repository root:

```bash
git diff main...HEAD -- mesh/config/capabilities.json
```

Expected: no output.

Also inspect the Slice 1 modules for forbidden side effects:

```bash
rg -n "fetch\(|https?:|child_process|spawn\(|exec\(|GridStore|Gateway|Sandbox|provider|credential_secret|private_key" \
  mesh/src/domain/sovereign-information-common.mjs \
  mesh/src/domain/information-rights.mjs \
  mesh/src/domain/evidence-graph.mjs \
  mesh/src/domain/delegated-gate-mandate.mjs \
  mesh/src/domain/assurance-profile.mjs \
  mesh/src/domain/contextual-disclosure.mjs
```

Expected: no runtime/network/provider/secret-handling implementation. Incidental words in comments must be reviewed manually and must not correspond to imported effectful dependencies.

- [ ] **Step 4: Inspect the diff for scope creep**

```bash
git diff --stat main...HEAD
git diff --check main...HEAD
```

Expected: only the approved spec/plan, Slice 1 semantic modules/tests, normative docs, and doc registration changes; `git diff --check` returns no whitespace errors.

- [ ] **Step 5: Commit any verification-only correction, if needed**

Only if Steps 1-4 exposed a defect that required a code/doc correction; stage exactly those corrected files and commit:

```bash
git add path/to/corrected-file-one path/to/corrected-file-two
git commit -m "fix: close sovereign information slice 1 verification gaps"
```

If no correction was required, make no empty commit.

---

## Self-Review Against the Approved Spec

### Covered by Slice 1

- Information Rights Envelope relationship separation — Tasks 2 and 7.
- Provenance/attestation not truth — Tasks 3, 7, and 8.
- Disconfirming evidence, challenges, alternatives, missing evidence — Tasks 3 and 7.
- Review-state distinctions — Tasks 3 and 7.
- Risk/consequence -> scrutiny, not permission — Task 5 and normative Task 8.
- High consequence can proceed under stronger assurance; no automatic human prompt — Tasks 4, 5, 7, and 8.
- Delegated gate mandates with expiry/revocation/scope and no learned-authority widening — Task 4 and Task 7.
- Minimum-sufficient contextual disclosure — Task 6.
- Credential/reputation/risk/identity do not mint authority — Tasks 1, 6, and 7.
- Personalization does not create external entitlement — Tasks 6-8.
- Human/digital agent-neutral authority grammar — Task 4.
- Normative cross-domain foundation and non-claims — Tasks 8-10.

### Intentionally deferred to later slices

These approved-spec areas are not omitted; they are explicitly outside Slice 1 and remain non-claims:

- Grid persistence, signed transactional receipts, revocation storage, authorized retrieval, export/import integration — Slice 2.
- Contextual reputation query/presentation state and credential proof integration — Slice 3.
- Privacy contribution contracts, compositional privacy ledger, differential-privacy experiments, secure aggregation/MPC, reconstruction attacks — Slice 4 Lab.
- Health, Justice, Work/Payroll, Governance, and real Education adapters — Slice 5 and later domain-specific promotion programmes.
- One/Verify/Studio production UX — subsequent product work after the underlying runtime contracts exist.

### Placeholder scan

No `TBD`, `TODO`, `implement later`, or unspecified code placeholder remains in this plan. Every code-producing task names exact files, interfaces, tests, commands, expected results, and implementation rules.

### Type/signature consistency

All later tasks consume the public function names defined in earlier task `Interfaces` blocks. No later task assumes Grid, Gateway, provider, or capability-registry interfaces that Slice 1 does not create.
