import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { MeshIdentity } from '../src/lib/identity.mjs';
import { CONTEXTUAL_DISCLOSURE_REQUEST_SCHEMA } from '../src/domain/contextual-disclosure.mjs';
import { REPUTATION_QUERY_SCHEMA } from '../src/domain/reputation-query.mjs';
import {
  DERIVED_REPUTATION_CLAIM_SCHEMA,
  signDerivedReputationClaim
} from '../src/domain/derived-reputation-claim.mjs';
import {
  REPUTATION_PRESENTATION_SCHEMA,
  buildReputationPresentation,
  verifyReputationPresentationEnvelope
} from '../src/domain/reputation-presentation.mjs';

const NOW = '2026-09-03T12:20:00.000Z';

function identity(service) {
  const pair = generateKeyPairSync('ed25519');
  return new MeshIdentity(
    service,
    pair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    pair.publicKey.export({ type: 'spki', format: 'pem' })
  );
}

function query(overrides = {}) {
  return {
    schema: REPUTATION_QUERY_SCHEMA,
    query_id: 'repq:security-review-1',
    requester: 'principal:verifier-a',
    subject_ref: 'principal:subject',
    domain: 'software-security',
    purpose: 'vendor-security-review',
    criterion_ref: 'criterion:verified-findings-v1',
    evidence_window: {
      starts_at: '2026-09-03T10:00:00.000Z',
      ends_at: '2026-09-03T12:30:00.000Z'
    },
    minimum_review_state: 'machine-reviewed',
    requested_presentation: 'criterion-only',
    max_claim_ttl_seconds: 3600,
    verifier_policy_ref: 'policy:vendor-security-v1',
    created_at: '2026-09-03T12:00:00.000Z',
    expires_at: '2026-09-03T13:00:00.000Z',
    ...overrides
  };
}

function claim(overrides = {}) {
  return {
    schema: DERIVED_REPUTATION_CLAIM_SCHEMA,
    claim_id: 'repclaim:security-1',
    query_id: 'repq:security-review-1',
    subject_ref: 'principal:subject',
    domain: 'software-security',
    purpose: 'vendor-security-review',
    criterion_ref: 'criterion:verified-findings-v1',
    result: 'met',
    reason_codes: [],
    evidence_set_digest: 'a'.repeat(64),
    considered_evidence_refs: ['evidence:a', 'evidence:b', 'evidence:c'],
    supporting_evidence_refs: ['evidence:a', 'evidence:b'],
    contrary_evidence_refs: ['evidence:c'],
    challenge_refs: ['challenge:a'],
    correction_refs: [],
    access_decision_digests: ['b'.repeat(64)],
    evaluator_ref: 'criterion:verified-findings-v1',
    evaluated_at: '2026-09-03T12:10:00.000Z',
    valid_until: '2026-09-03T12:50:00.000Z',
    completeness: 'bounded-selected-evidence',
    authority_effect: 'none',
    reputation_transfer: 'none',
    truth_status: 'attributed-derived-claim',
    ...overrides
  };
}

function disclosureRequest(q = query(), overrides = {}) {
  return {
    schema: CONTEXTUAL_DISCLOSURE_REQUEST_SCHEMA,
    request_id: 'disclosure-request:reputation-1',
    requester: q.requester,
    subject_ref: q.subject_ref,
    purpose: q.purpose,
    required_claims: [q.criterion_ref],
    requested_fields: ['source_ids', 'client_history', 'supporting_count'],
    verifier_policy_ref: q.verifier_policy_ref,
    created_at: NOW,
    ...overrides
  };
}

function projectionPolicy(q = query(), overrides = {}) {
  return {
    allowed_claims: [q.criterion_ref],
    allowed_raw_fields: [],
    required_authority_ref: 'policy:projection-authority-v1',
    ...overrides
  };
}

function build({ q = query(), privateClaim = claim(), request, policy, claimSigner, presentationSigner } = {}) {
  const claimIdentity = claimSigner ?? identity('reputation-evaluator');
  const presenter = presentationSigner ?? identity('reputation-presenter');
  const derivedClaimEnvelope = signDerivedReputationClaim({ claim: privateClaim, signer: claimIdentity });
  const value = buildReputationPresentation({
    query: q,
    disclosureRequest: request ?? disclosureRequest(q),
    projectionPolicy: policy ?? projectionPolicy(q),
    derivedClaimEnvelope,
    claimPublicKey: claimIdentity.publicKey,
    signer: presenter,
    now: NOW
  });
  return { ...value, claimIdentity, presenter, derivedClaimEnvelope };
}

function expected(q = query()) {
  return {
    audience_ref: q.requester,
    purpose: q.purpose,
    subject_ref: q.subject_ref,
    criterion_ref: q.criterion_ref
  };
}

test('criterion-only presentation reveals the result and exact binding but no private evidence history', () => {
  const { presentation_envelope: envelope, projection_result: projection } = build();
  const statement = envelope.presentation;

  assert.equal(statement.schema, REPUTATION_PRESENTATION_SCHEMA);
  assert.equal(statement.audience_ref, 'principal:verifier-a');
  assert.equal(statement.subject_ref, 'principal:subject');
  assert.equal(statement.domain, 'software-security');
  assert.equal(statement.purpose, 'vendor-security-review');
  assert.equal(statement.criterion_ref, 'criterion:verified-findings-v1');
  assert.equal(statement.result, 'met');
  assert.equal(statement.disclosure_level, 'criterion-only');
  assert.equal(statement.summary, null);
  assert.equal(statement.issued_at, NOW);
  assert.equal(statement.valid_until, '2026-09-03T12:50:00.000Z');
  assert.match(statement.basis_binding_digest, /^[a-f0-9]{64}$/);
  assert.equal(statement.authority_effect, 'none');
  assert.equal(statement.reputation_transfer, 'none');

  assert.deepEqual(projection.disclosed_fields, {});
  assert.deepEqual(projection.withheld_fields.sort(), ['client_history', 'source_ids', 'supporting_count']);

  const serialized = JSON.stringify(statement);
  for (const forbidden of [
    'evidence_refs', 'evidence_set_digest', 'access_decision_digests', 'private_claim_digest',
    'source_ids', 'client_history', 'evidence:a', 'score', 'rank', 'percentile'
  ]) {
    assert.equal(serialized.includes(forbidden), false, `presentation leaked ${forbidden}`);
  }
});

test('broad requested fields cannot override minimum-sufficient local projection policy', () => {
  const q = query();
  const request = disclosureRequest(q, {
    requested_fields: ['source_ids', 'client_history', 'relationship_history', 'supporting_count']
  });
  const { presentation_envelope: envelope, projection_result: projection } = build({ q, request });
  assert.equal(envelope.presentation.summary, null);
  assert.equal(envelope.presentation.disclosure_level, 'criterion-only');
  assert.deepEqual(projection.disclosed_fields, {});
  assert.deepEqual(
    projection.withheld_fields.sort(),
    ['client_history', 'relationship_history', 'source_ids', 'supporting_count']
  );
});

test('bounded-summary exposes only explicitly authorized integer counts', () => {
  const q = query({ requested_presentation: 'bounded-summary' });
  const request = disclosureRequest(q, {
    requested_fields: ['supporting_count', 'contrary_count', 'source_ids']
  });
  const policy = projectionPolicy(q, {
    allowed_raw_fields: ['supporting_count', 'contrary_count']
  });
  const { presentation_envelope: envelope, projection_result: projection } = build({ q, request, policy });
  assert.equal(envelope.presentation.disclosure_level, 'bounded-summary');
  assert.deepEqual(envelope.presentation.summary, {
    supporting_count: 2,
    contrary_count: 1
  });
  assert.deepEqual(projection.disclosed_fields, {
    supporting_count: 2,
    contrary_count: 1
  });
  assert.deepEqual(projection.withheld_fields, ['source_ids']);
  assert.equal(JSON.stringify(envelope.presentation).includes('evidence:a'), false);
});

test('builder requires exact claim/query and disclosure-request binding', () => {
  assert.throws(
    () => build({ privateClaim: claim({ subject_ref: 'principal:other' }) }),
    /subject|binding/
  );
  const q = query();
  assert.throws(
    () => build({ q, request: disclosureRequest(q, { purpose: 'different-purpose' }) }),
    /purpose|binding/
  );
});

test('verification rejects replay across audience, purpose, subject, or criterion and rejects expiry', () => {
  const q = query();
  const { presentation_envelope: envelope, presenter } = build({ q });

  assert.equal(verifyReputationPresentationEnvelope({
    envelope,
    publicKey: presenter.publicKey,
    now: '2026-09-03T12:25:00.000Z',
    expected: expected(q)
  }).valid, true);

  for (const [field, value] of [
    ['audience_ref', 'principal:verifier-b'],
    ['purpose', 'different-purpose'],
    ['subject_ref', 'principal:other'],
    ['criterion_ref', 'criterion:other-v1']
  ]) {
    assert.throws(
      () => verifyReputationPresentationEnvelope({
        envelope,
        publicKey: presenter.publicKey,
        now: '2026-09-03T12:25:00.000Z',
        expected: { ...expected(q), [field]: value }
      }),
      new RegExp(field.replace('_ref', '') + '|binding')
    );
  }

  assert.throws(
    () => verifyReputationPresentationEnvelope({
      envelope,
      publicKey: presenter.publicKey,
      now: '2026-09-03T12:50:00.000Z',
      expected: expected(q)
    }),
    /expired/
  );
});

test('signature and digest bind the complete external statement', () => {
  const q = query();
  const { presentation_envelope: envelope, presenter } = build({ q });
  const tampered = structuredClone(envelope);
  tampered.presentation.result = 'not-met';
  assert.throws(
    () => verifyReputationPresentationEnvelope({
      envelope: tampered,
      publicKey: presenter.publicKey,
      now: '2026-09-03T12:25:00.000Z',
      expected: expected(q)
    }),
    /digest|signature/
  );
});

test('the same private claim gets audience-specific basis bindings', () => {
  const claimIdentity = identity('reputation-evaluator');
  const presenter = identity('reputation-presenter');
  const firstQuery = query({ requester: 'principal:verifier-a' });
  const secondQuery = query({ requester: 'principal:verifier-b' });

  const first = build({ q: firstQuery, claimSigner: claimIdentity, presentationSigner: presenter });
  const second = build({
    q: secondQuery,
    request: disclosureRequest(secondQuery, { request_id: 'disclosure-request:reputation-2' }),
    claimSigner: claimIdentity,
    presentationSigner: presenter
  });

  assert.notEqual(
    first.presentation_envelope.presentation.basis_binding_digest,
    second.presentation_envelope.presentation.basis_binding_digest
  );
});
