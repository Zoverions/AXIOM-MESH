import assert from 'node:assert/strict';
import test from 'node:test';

import { sha256 } from '../src/lib/canonical.mjs';
import {
  STATE_ACCESS_ENVELOPE_SCHEMA,
  normalizeStateAccessEnvelope,
  verifyStateAccessUse
} from '../src/identity/actor-state-access.mjs';

const T0 = '2026-08-16T17:00:00.000Z';
const T1 = '2026-08-16T17:30:00.000Z';
const T2 = '2026-08-16T18:00:00.000Z';

function envelope(overrides = {}) {
  return {
    schema: STATE_ACCESS_ENVELOPE_SCHEMA,
    envelope_id: 'access-publication-1',
    subject_actor_id: 'actor-alice',
    requester_actor_id: 'actor-alice',
    state_class: 'publications',
    purpose: 'social-publish',
    action: 'publish',
    data_scopes: ['publication-projection'],
    recipient_actor_ids: [],
    disclosure_profile: 'pseudonymous',
    authority_basis: {
      type: 'self_authority',
      source_id: 'actor-alice',
      basis_digest: sha256('self authority basis')
    },
    consent: {
      required: false,
      receipt_digest: null
    },
    required_assurance: 'A2',
    observed_assurance: 'A2',
    effective_at: T0,
    expires_at: T2,
    raw_state_allowed: false,
    grants_ordinary_authority: false,
    ...overrides
  };
}

function use(overrides = {}) {
  return {
    subject_actor_id: 'actor-alice',
    requester_actor_id: 'actor-alice',
    state_class: 'publications',
    purpose: 'social-publish',
    action: 'publish',
    data_scopes: ['publication-projection'],
    recipient_actor_ids: [],
    disclosure_profile: 'pseudonymous',
    payload_digest: sha256('public persona-bound publication projection'),
    ...overrides
  };
}

test('self-authorized publication binds a non-raw A2 projection exactly', () => {
  const normalized = normalizeStateAccessEnvelope(envelope());
  assert.equal(normalized.action, 'publish');
  assert.equal(normalized.raw_state_allowed, false);
  assert.equal(normalized.required_assurance, 'A2');
  assert.equal(normalized.grants_ordinary_authority, false);

  const used = verifyStateAccessUse(normalized, use(), T1);
  assert.equal(used.payload_digest, use().payload_digest);
  assert.equal(used.observed_assurance, 'A2');
  assert.equal(used.grants_ordinary_authority, false);
});

test('association or jurisdiction status cannot force public publication', () => {
  for (const type of ['association_obligation', 'jurisdiction_requirement']) {
    assert.throws(
      () => normalizeStateAccessEnvelope(envelope({
        authority_basis: {
          type,
          source_id: `${type}-1`,
          basis_digest: sha256(type)
        }
      })),
      /publication authority basis must be self, delegated, or succession authority/
    );
  }
});

test('publication requires at least A2 and cannot disclose raw state', () => {
  assert.throws(
    () => normalizeStateAccessEnvelope(envelope({
      required_assurance: 'A1',
      observed_assurance: 'A2'
    })),
    /at least A2/
  );
  assert.throws(
    () => normalizeStateAccessEnvelope(envelope({ raw_state_allowed: true })),
    /raw state cannot cross|non-raw projection/
  );
});

test('observed assurance cannot understate the required shared assurance tier', () => {
  assert.throws(
    () => normalizeStateAccessEnvelope(envelope({
      required_assurance: 'A3',
      observed_assurance: 'A2'
    })),
    /observed assurance is below required assurance/
  );
});

test('state access use is exact-bound to subject, requester, purpose, action, scope and disclosure', () => {
  const normalized = normalizeStateAccessEnvelope(envelope());
  for (const changed of [
    { subject_actor_id: 'actor-other' },
    { requester_actor_id: 'actor-other' },
    { purpose: 'different-purpose' },
    { action: 'export' },
    { data_scopes: ['other-scope'] },
    { recipient_actor_ids: ['actor-bob'] },
    { disclosure_profile: 'public' }
  ]) {
    assert.throws(
      () => verifyStateAccessUse(normalized, use(changed), T1),
      /does not match the authorized envelope/
    );
  }
});

test('expired state access fails closed', () => {
  assert.throws(
    () => verifyStateAccessUse(envelope(), use(), T2),
    /state access envelope is not active/
  );
});

test('association metric obligation is minimized/non-raw and cannot become private read access', () => {
  const metric = normalizeStateAccessEnvelope(envelope({
    envelope_id: 'access-metric-1',
    requester_actor_id: 'organization-research',
    state_class: 'education',
    purpose: 'aggregate-outcome-metric',
    action: 'contribute_metric',
    data_scopes: ['aggregate-score'],
    disclosure_profile: 'aggregate',
    authority_basis: {
      type: 'association_obligation',
      source_id: 'membership-rule-1',
      basis_digest: sha256('membership rule')
    }
  }));
  assert.equal(metric.raw_state_allowed, false);

  assert.throws(
    () => normalizeStateAccessEnvelope({
      ...metric,
      envelope_id: 'access-private-read',
      action: 'read',
      disclosure_profile: 'private',
      data_scopes: ['raw-learning-history']
    }),
    /association obligation cannot authorize arbitrary private-state access/
  );
});

test('succession publication can be represented but cannot fabricate current source consent', () => {
  const succession = normalizeStateAccessEnvelope(envelope({
    requester_actor_id: 'actor-alice-echo',
    authority_basis: {
      type: 'succession_directive',
      source_id: 'succession-alice-v1',
      basis_digest: sha256('succession directive')
    }
  }));
  assert.equal(succession.action, 'publish');

  assert.throws(
    () => normalizeStateAccessEnvelope(envelope({
      requester_actor_id: 'actor-alice-echo',
      authority_basis: {
        type: 'succession_directive',
        source_id: 'succession-alice-v1',
        basis_digest: sha256('succession directive')
      },
      consent: {
        required: true,
        receipt_digest: sha256('fabricated source consent')
      }
    })),
    /cannot fabricate current-source consent/
  );
});
