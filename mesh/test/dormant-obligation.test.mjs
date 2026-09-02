import assert from 'node:assert/strict';
import test from 'node:test';
import {
  validateDormantObligation,
  dormantObligationDigest,
  matchDormantObligationTrigger
} from '../src/lib/dormant-obligation.mjs';

const obligation = (overrides = {}) => ({
  schema: 'axiom-dormant-obligation.v0',
  version: 0,
  status: 'inert-contract-laboratory',
  obligation_id: 'obligation.research.1',
  principal_id: 'counterpart.1',
  direction_ref: 'direction.investigate-x.1',
  provenance_ref: 'prov.1',
  trigger: {
    kind: 'condition-change',
    matcher_ref: 'condition.y.1',
    due_at: null
  },
  priority_class: 'P3',
  authority_scope_ref: 'authority.research-only.1',
  resource_profile_ref: 'resource.profile.background.1',
  task_template_ref: 'task.template.investigate.1',
  normal_readmission_required: true,
  created_at: '2026-09-01T12:00:00.000Z',
  not_before_at: '2026-09-01T12:10:00.000Z',
  expires_at: '2027-03-01T00:00:00.000Z',
  state: 'dormant',
  contains_secret_material: false,
  authority_effect: 'none',
  network_effect: 'none',
  runtime_activation: false,
  ...overrides
});

const event = (overrides = {}) => ({
  event_id: 'trigger.event.1',
  kind: 'condition-change',
  matcher_ref: 'condition.y.1',
  occurred_at: '2026-09-01T12:15:00.000Z',
  evidence_ref: 'evidence.condition-y.1',
  ...overrides
});

test('dormant obligation survives serialization with deterministic digest', () => {
  const document = obligation();
  const result = validateDormantObligation(document);
  const restored = JSON.parse(JSON.stringify(document));
  assert.equal(result.valid, true);
  assert.equal(dormantObligationDigest(document), dormantObligationDigest(restored));
  assert.equal(result.authority_effect, 'none');
});

test('matching event returns an admission proposal, never execution authority', () => {
  const result = matchDormantObligationTrigger(obligation(), event(), '2026-09-01T12:15:01.000Z');
  assert.equal(result.matched, true);
  assert.equal(result.reason, 'matched');
  assert.equal(result.proposal.obligation_id, 'obligation.research.1');
  assert.equal(result.proposal.authority_scope_ref, 'authority.research-only.1');
  assert.equal(result.proposal.resource_profile_ref, 'resource.profile.background.1');
  assert.equal(result.proposal.normal_admission_required, true);
  assert.equal(result.proposal.authority_effect, 'none');
  assert.equal(result.proposal.network_effect, 'none');
  assert.equal(result.proposal.runtime_activation, false);
  assert.equal('execution_grant' in result.proposal, false);
});

test('wrong trigger or pre-not-before event stays dormant', () => {
  const wrong = matchDormantObligationTrigger(obligation(), event({ matcher_ref: 'condition.other.1' }), '2026-09-01T12:15:01.000Z');
  assert.equal(wrong.matched, false);
  assert.equal(wrong.proposal, null);

  const early = matchDormantObligationTrigger(obligation(), event({ occurred_at: '2026-09-01T12:05:00.000Z' }), '2026-09-01T12:05:01.000Z');
  assert.equal(early.matched, false);
  assert.match(early.reason, /not-before/i);
});

test('expired or non-dormant obligations never produce admission proposals', () => {
  const expired = matchDormantObligationTrigger(obligation(), event({ occurred_at: '2027-03-02T00:00:00.000Z' }), '2027-03-02T00:00:01.000Z');
  assert.equal(expired.matched, false);
  assert.equal(expired.reason, 'expired');

  const completed = obligation({ state: 'completed' });
  const done = matchDormantObligationTrigger(completed, event(), '2026-09-01T12:15:01.000Z');
  assert.equal(done.matched, false);
  assert.equal(done.reason, 'not-dormant');
});

test('deadline trigger can activate without a synthetic polling event', () => {
  const document = obligation({
    trigger: { kind: 'deadline', matcher_ref: null, due_at: '2026-09-02T09:00:00.000Z' },
    not_before_at: null
  });
  const result = matchDormantObligationTrigger(document, null, '2026-09-02T09:00:00.000Z');
  assert.equal(result.matched, true);
  assert.equal(result.proposal.trigger_evidence_ref, null);
});

test('trigger contract cannot hide ambient authority or disable readmission', () => {
  const unsafe = obligation();
  unsafe.normal_readmission_required = false;
  assert.throws(() => validateDormantObligation(unsafe), /readmission/i);

  const active = obligation();
  active.runtime_activation = true;
  assert.throws(() => validateDormantObligation(active), /activation boundary/i);
});
