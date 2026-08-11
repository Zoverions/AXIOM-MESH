import assert from 'node:assert/strict';
import test from 'node:test';

import { sha256 } from '../src/lib/canonical.mjs';
import {
  STATE_ACCESS_ENVELOPE_SCHEMA,
  normalizeStateAccessEnvelope,
  verifyStateAccessUse
} from '../src/identity/actor-state-access.mjs';

const T0 = '2026-08-11T13:00:00.000Z';
const T1 = '2026-08-11T13:10:00.000Z';
const T2 = '2026-08-11T14:00:00.000Z';

function envelope(overrides = {}) {
  return {
    schema: STATE_ACCESS_ENVELOPE_SCHEMA,
    envelope_id: 'access-alice-learning-export-1',
    subject_actor_id: 'actor-alice',
    requester_actor_id: 'actor-alice',
    state_class: 'education',
    purpose: 'portable-learning-export',
    action: 'export',
    data_scopes: ['competency-evidence', 'portfolio-projects'],
    recipient_actor_ids: ['actor-alice'],
    disclosure_profile: 'minimum',
    authority_basis: {
      type: 'self_authority',
      source_id: 'actor-alice',
      basis_digest: sha256('self-authority-state')
    },
    consent: {
      required: true,
      receipt_digest: sha256('consent-receipt')
    },
    required_assurance: 'A2',
    observed_assurance: 'A3',
    effective_at: T0,
    expires_at: T2,
    raw_state_allowed: false,
    grants_ordinary_authority: false,
    ...overrides
  };
}

test('exact state access use binds actor, purpose, scopes, recipient, authority and consent', () => {
  const authorized = envelope();
  const use = verifyStateAccessUse(authorized, {
    subject_actor_id: 'actor-alice',
    requester_actor_id: 'actor-alice',
    state_class: 'education',
    purpose: 'portable-learning-export',
    action: 'export',
    data_scopes: ['portfolio-projects', 'competency-evidence'],
    recipient_actor_ids: ['actor-alice'],
    disclosure_profile: 'minimum',
    payload_digest: sha256('bounded-export-payload')
  }, T1);
  assert.equal(use.envelope_id, authorized.envelope_id);
  assert.equal(use.authority_basis_digest, authorized.authority_basis.basis_digest);
  assert.equal(use.consent_receipt_digest, authorized.consent.receipt_digest);
  assert.equal(use.grants_ordinary_authority, false);
});

test('purpose, actor, state class, action, scope, recipient and disclosure substitution fail closed', () => {
  const authorized = envelope();
  const base = {
    subject_actor_id: 'actor-alice',
    requester_actor_id: 'actor-alice',
    state_class: 'education',
    purpose: 'portable-learning-export',
    action: 'export',
    data_scopes: ['competency-evidence', 'portfolio-projects'],
    recipient_actor_ids: ['actor-alice'],
    disclosure_profile: 'minimum',
    payload_digest: sha256('payload')
  };
  for (const mutation of [
    { purpose: 'employment-screening' },
    { requester_actor_id: 'employer-acme' },
    { state_class: 'sensitive_inference' },
    { action: 'publish' },
    { data_scopes: ['competency-evidence'] },
    { recipient_actor_ids: ['employer-acme'] },
    { disclosure_profile: 'public' }
  ]) {
    assert.throws(() => verifyStateAccessUse(authorized, { ...base, ...mutation }, T1));
  }
});

test('expired envelope fails even when the requested use otherwise matches exactly', () => {
  assert.throws(() => verifyStateAccessUse(envelope(), {
    subject_actor_id: 'actor-alice',
    requester_actor_id: 'actor-alice',
    state_class: 'education',
    purpose: 'portable-learning-export',
    action: 'export',
    data_scopes: ['competency-evidence', 'portfolio-projects'],
    recipient_actor_ids: ['actor-alice'],
    disclosure_profile: 'minimum',
    payload_digest: sha256('payload')
  }, T2), /not active/);
});

test('association obligation can require a minimized metric without ambient private-state access', () => {
  const metric = normalizeStateAccessEnvelope(envelope({
    envelope_id: 'access-member-safety-metric-1',
    requester_actor_id: 'institution-coop',
    state_class: 'governance',
    purpose: 'member-safety-statistics',
    action: 'contribute_metric',
    data_scopes: ['incident-count-bucket'],
    recipient_actor_ids: ['institution-coop'],
    disclosure_profile: 'aggregate',
    authority_basis: {
      type: 'association_obligation',
      source_id: 'membership-coop-2026',
      basis_digest: sha256('charter-rule-exact-metric')
    },
    consent: { required: false, receipt_digest: null },
    raw_state_allowed: false
  }));
  assert.equal(metric.action, 'contribute_metric');
  assert.equal(metric.disclosure_profile, 'aggregate');
  assert.equal(metric.raw_state_allowed, false);
  assert.equal(metric.grants_ordinary_authority, false);
});

test('association obligation cannot become arbitrary read authority', () => {
  assert.throws(() => normalizeStateAccessEnvelope(envelope({
    requester_actor_id: 'institution-coop',
    state_class: 'private_memory',
    purpose: 'general-monitoring',
    action: 'read',
    data_scopes: ['all-notes'],
    recipient_actor_ids: ['institution-coop'],
    authority_basis: {
      type: 'association_obligation',
      source_id: 'membership-coop-2026',
      basis_digest: sha256('charter-rule')
    },
    consent: { required: false, receipt_digest: null }
  })), /cannot authorize arbitrary private-state access/);
});

test('mandatory metric contribution cannot carry raw state or public disclosure', () => {
  for (const mutation of [
    { raw_state_allowed: true },
    { disclosure_profile: 'public' }
  ]) {
    assert.throws(() => normalizeStateAccessEnvelope(envelope({
      requester_actor_id: 'institution-coop',
      action: 'contribute_metric',
      data_scopes: ['incident-count-bucket'],
      recipient_actor_ids: ['institution-coop'],
      disclosure_profile: 'aggregate',
      authority_basis: {
        type: 'association_obligation',
        source_id: 'membership-coop-2026',
        basis_digest: sha256('charter-rule')
      },
      consent: { required: false, receipt_digest: null },
      raw_state_allowed: false,
      ...mutation
    })), /metric contribution|raw state/);
  }
});

test('state access envelope cannot smuggle ordinary authority or understate assurance', () => {
  assert.throws(() => normalizeStateAccessEnvelope(envelope({ grants_ordinary_authority: true })), /cannot grant ordinary authority/);
  assert.throws(() => normalizeStateAccessEnvelope(envelope({ required_assurance: 'A3', observed_assurance: 'A2' })), /below required assurance/);
});

test('succession access cannot fabricate consent from an ended source actor', () => {
  assert.throws(() => normalizeStateAccessEnvelope(envelope({
    requester_actor_id: 'actor-alice-echo',
    state_class: 'private_memory',
    purpose: 'authorized-continuity-corpus',
    authority_basis: {
      type: 'succession_directive',
      source_id: 'succession-alice-v1',
      basis_digest: sha256('succession-directive')
    },
    consent: {
      required: true,
      receipt_digest: sha256('fabricated-posthumous-consent')
    }
  })), /cannot fabricate current-source consent/);
});
