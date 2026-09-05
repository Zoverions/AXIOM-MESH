import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import { SovereignInformationGridStore } from '../src/grid/sovereign-information-store.mjs';
import { INFORMATION_ACCESS_DECISION_SCHEMA, validateInformationAccessDecision } from '../src/domain/information-access-decision.mjs';
import { INFORMATION_RIGHTS_SCHEMA } from '../src/domain/information-rights.mjs';
import { EVIDENCE_ASSERTION_SCHEMA, EVIDENCE_REVIEW_SCHEMA } from '../src/domain/evidence-graph.mjs';
import { CONTEXTUAL_DISCLOSURE_REQUEST_SCHEMA } from '../src/domain/contextual-disclosure.mjs';
import { REPUTATION_QUERY_SCHEMA } from '../src/domain/reputation-query.mjs';
import { ContextualTrustProjector } from '../src/lib/contextual-trust-projector.mjs';

const NOW = '2026-09-03T12:20:00.000Z';

function query(overrides = {}) {
  return {
    schema: REPUTATION_QUERY_SCHEMA,
    query_id: 'repq:store-backed-security-review-1',
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
    max_claim_ttl_seconds: 600,
    verifier_policy_ref: 'policy:vendor-security-v1',
    created_at: '2026-09-03T12:00:00.000Z',
    expires_at: '2026-09-03T13:00:00.000Z',
    ...overrides
  };
}

function assertion() {
  return {
    schema: EVIDENCE_ASSERTION_SCHEMA,
    assertion_id: 'assertion:store-finding-1',
    type: 'evidence-item',
    proposition: 'Independent review recorded a verified security finding.',
    source_ref: 'principal:reviewer',
    epistemic_state: 'corroborated',
    purpose_scope: ['reputation:software-security'],
    provenance_refs: ['artifact:review-1'],
    created_at: '2026-09-03T12:00:00.000Z'
  };
}

function rights() {
  return {
    schema: INFORMATION_RIGHTS_SCHEMA,
    object_ref: 'assertion:store-finding-1',
    information_class: 'reputation-evidence',
    sensitivity_class: 'restricted',
    relationships: {
      subjects: ['principal:subject'],
      originators: ['principal:reviewer'],
      custodians: ['institution:review-registry'],
      controllers: ['institution:review-registry'],
      affected_parties: [],
      beneficiaries: ['principal:subject'],
      permitted_recipients: ['principal:verifier-a'],
      reviewers: ['principal:reviewer'],
      auditors: [],
      decision_users: ['principal:verifier-a'],
      challengers: ['principal:subject'],
      disclosure_authorities: ['policy:vendor-security-v1'],
      retention_authorities: ['policy:review-retention-v1']
    },
    authority_basis: ['policy:vendor-security-v1'],
    allowed_purposes: ['vendor-security-review'],
    forbidden_purposes: [],
    policy_refs: {
      access: ['policy:vendor-security-v1'],
      disclosure: ['policy:vendor-security-v1'],
      retention: ['policy:review-retention-v1'],
      challenge: ['policy:review-challenge-v1'],
      correction: ['policy:review-correction-v1'],
      export: [],
      deletion: []
    },
    projection_profiles: ['projection:criterion-only-v1'],
    jurisdiction_context: ['jurisdiction:example'],
    provenance_refs: ['artifact:review-1'],
    evidence_refs: ['assertion:store-finding-1'],
    state: { retention: 'active', challenge: 'none', supersession: 'current' },
    created_at: '2026-09-03T12:00:00.000Z',
    reviewed_at: '2026-09-03T12:05:00.000Z'
  };
}

function review() {
  return {
    schema: EVIDENCE_REVIEW_SCHEMA,
    object_ref: 'assertion:store-finding-1',
    known: true,
    available: true,
    acquired: true,
    integrity_verified: true,
    indexed: true,
    machine_reviewed: true,
    human_reviewed: false,
    relied_upon: false,
    disclosed: false,
    challenged: false,
    adjudicated: false,
    updated_at: '2026-09-03T12:06:00.000Z'
  };
}

function disclosureRequest(q = query(), overrides = {}) {
  return {
    schema: CONTEXTUAL_DISCLOSURE_REQUEST_SCHEMA,
    request_id: 'disclosure-request:store-reputation-1',
    requester: q.requester,
    subject_ref: q.subject_ref,
    purpose: q.purpose,
    required_claims: [q.criterion_ref],
    requested_fields: [],
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

function mutationVerifier() {
  return {
    allowed: true,
    authority_ref: 'policy:test-write',
    verifier_ref: 'verifier:test-write'
  };
}

function accessVerifier(decision) {
  return { valid: decision.verifier_ref === 'verifier:trusted-policy' };
}

function accessDecision({ requester, object_ref, object_digest, purpose = 'vendor-security-review', overrides = {} }) {
  return {
    schema: INFORMATION_ACCESS_DECISION_SCHEMA,
    decision_id: `access-decision:${object_digest.slice(0, 16)}`,
    requester,
    object_ref,
    purpose,
    right: 'inspect-full-content',
    decision: 'allow',
    authority_ref: 'policy:vendor-security-v1',
    object_digest,
    issued_at: '2026-09-03T12:10:00.000Z',
    expires_at: '2026-09-03T12:40:00.000Z',
    verifier_ref: 'verifier:trusted-policy',
    verifier_version: '1.0.0',
    reason_codes: ['exact-policy-match'],
    ...overrides
  };
}

function criterionEvaluator() {
  return {
    result: 'met',
    supporting_assertion_refs: ['assertion:store-finding-1'],
    contrary_assertion_refs: [],
    neutral_assertion_refs: [],
    reason_codes: [],
    recommended_ttl_seconds: 600,
    requires_complete_evidence: false
  };
}

async function fixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-contextual-projector-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const claimSigner = await ensureMeshIdentity(dataDir, 'reputation-evaluator', { create: true });
  const presentationSigner = await ensureMeshIdentity(dataDir, 'reputation-presenter', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const store = new SovereignInformationGridStore({
    path: join(dataDir, 'grid.sqlite'),
    dataDir,
    identity,
    protector,
    mutationVerifier,
    informationAccessDecisionVerifier: accessVerifier
  });

  const evidence = assertion();
  const rightsEnvelope = rights();
  const reviewState = review();
  store.recordEvidenceAssertion({ actor: 'principal:reviewer', traceId: 'trace:assertion-store-finding-1', assertion: evidence });
  store.recordInformationRightsEnvelope({ actor: 'principal:reviewer', traceId: 'trace:rights-store-finding-1', envelope: rightsEnvelope });
  store.recordEvidenceReview({ actor: 'principal:reviewer', traceId: 'trace:review-store-finding-1', review: reviewState });

  const q = query();
  const decisions = {
    assertion: accessDecision({ requester: q.requester, object_ref: evidence.assertion_id, object_digest: digestObject(evidence) }),
    rights: accessDecision({ requester: q.requester, object_ref: rightsEnvelope.object_ref, object_digest: digestObject(rightsEnvelope) }),
    review: accessDecision({ requester: q.requester, object_ref: reviewState.object_ref, object_digest: digestObject(reviewState) })
  };
  const criterionEvaluators = new Map([[q.criterion_ref, criterionEvaluator]]);
  const projector = new ContextualTrustProjector({
    store,
    criterionEvaluators,
    claimSigner,
    presentationSigner
  });

  t.after(async () => {
    try { store.close(); } catch {}
    await rm(dataDir, { recursive: true, force: true });
  });
  return { store, q, decisions, criterionEvaluators, claimSigner, presentationSigner, projector };
}

function allDecisions(decisions) {
  return [decisions.assertion, decisions.rights, decisions.review];
}

function project(projector, q, decisions, overrides = {}) {
  return projector.project({
    query: q,
    disclosureRequest: disclosureRequest(q),
    projectionPolicy: projectionPolicy(q),
    accessDecisions: allDecisions(decisions),
    now: NOW,
    ...overrides
  });
}

test('store-backed projector derives and presents reputation only from exact authorized SIEA reads', async t => {
  const { projector, q, decisions } = await fixture(t);
  const value = project(projector, q, decisions);

  assert.equal(value.derived_claim_envelope.claim.result, 'met');
  assert.equal(value.derived_claim_envelope.claim.subject_ref, q.subject_ref);
  assert.equal(value.derived_claim_envelope.claim.authority_effect, 'none');
  assert.equal(value.derived_claim_envelope.claim.reputation_transfer, 'none');
  assert.equal(value.derived_claim_envelope.claim.access_decision_digests.length, 3);
  for (const decision of allDecisions(decisions)) {
    assert.ok(value.derived_claim_envelope.claim.access_decision_digests.includes(
      digestObject(validateInformationAccessDecision(decision))
    ));
  }
  assert.equal(value.projection_result.status, 'satisfied');
  assert.equal(value.presentation_envelope.presentation.result, 'met');
  assert.equal(value.presentation_envelope.presentation.authority_effect, 'none');
});

test('subject status cannot bypass an omitted rights-envelope access decision', async t => {
  const { projector, q, decisions } = await fixture(t);
  const value = projector.project({
    query: q,
    disclosureRequest: disclosureRequest(q),
    projectionPolicy: projectionPolicy(q),
    accessDecisions: [decisions.assertion, decisions.review],
    now: NOW
  });
  assert.equal(value.derived_claim_envelope.claim.result, 'unresolved');
  assert.ok(value.derived_claim_envelope.claim.reason_codes.includes('rights_missing'));
  assert.notEqual(value.presentation_envelope.presentation.result, 'met');
});

test('wrong purpose, requester, digest, future-issued, or expired decisions fail closed at the SIEA read boundary', async t => {
  const { projector, q, decisions } = await fixture(t);
  const cases = [
    { ...decisions.assertion, purpose: 'different-purpose' },
    { ...decisions.assertion, requester: 'principal:other' },
    { ...decisions.assertion, object_digest: 'f'.repeat(64) },
    { ...decisions.assertion, issued_at: '2026-09-03T12:21:00.000Z', expires_at: '2026-09-03T12:40:00.000Z' },
    { ...decisions.assertion, issued_at: '2026-09-03T12:00:00.000Z', expires_at: NOW }
  ];

  for (const malformed of cases) {
    assert.throws(() => projector.project({
      query: q,
      disclosureRequest: disclosureRequest(q),
      projectionPolicy: projectionPolicy(q),
      accessDecisions: [malformed, decisions.rights, decisions.review],
      now: NOW
    }), /object unavailable|access decision|verification/i);
  }
});

test('criterion registry is exact-ref keyed and an unknown criterion remains unresolved without score or authority', async t => {
  const { store, decisions, claimSigner, presentationSigner } = await fixture(t);
  const q = query({ criterion_ref: 'criterion:unknown-v1', query_id: 'repq:store-backed-unknown-criterion-1' });
  const projector = new ContextualTrustProjector({
    store,
    criterionEvaluators: new Map([['criterion:nearby-name-v1', criterionEvaluator]]),
    claimSigner,
    presentationSigner
  });
  const value = projector.project({
    query: q,
    disclosureRequest: disclosureRequest(q, { request_id: 'disclosure-request:store-reputation-unknown-1' }),
    projectionPolicy: projectionPolicy(q),
    accessDecisions: allDecisions(decisions),
    now: NOW
  });

  assert.equal(value.derived_claim_envelope.claim.result, 'unresolved');
  assert.ok(value.derived_claim_envelope.claim.reason_codes.includes('criterion_evaluator_unavailable'));
  assert.equal(value.presentation_envelope.presentation.result, 'unresolved');
  assert.equal(value.presentation_envelope.presentation.authority_effect, 'none');
  const serialized = JSON.stringify(value);
  assert.equal(serialized.includes('score'), false);
  assert.equal(serialized.includes('rank'), false);
  assert.equal(serialized.includes('percentile'), false);
});

test('projector source has no raw Grid database, private-row, migration, or mutation bypass', async () => {
  const source = await readFile(new URL('../src/lib/contextual-trust-projector.mjs', import.meta.url), 'utf8');
  assert.match(source, /listAuthorizedSovereignInformation/);
  for (const forbidden of [
    '.db',
    'decodeAllSieaRows',
    '#decodedSieaRows',
    'siea_objects',
    'CREATE TABLE',
    'runSovereignInformationMigrations',
    'appendEvents(',
    'recordEvidenceAssertion(',
    'recordInformationRightsEnvelope(',
    'recordEvidenceReview('
  ]) {
    assert.equal(source.includes(forbidden), false, `projector bypassed governed read boundary via ${forbidden}`);
  }
});

test('Slice 3 projection requires no new Grid schema or event kind', async t => {
  const { store, projector, q, decisions } = await fixture(t);
  assert.equal(store.getStatus().sovereign_information_schema_version, 1);
  const value = project(projector, q, decisions);
  assert.equal(value.derived_claim_envelope.claim.result, 'met');
  assert.equal(store.getStatus().sovereign_information_schema_version, 1);
});
