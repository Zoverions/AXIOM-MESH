import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { digestObject } from '../src/lib/canonical.mjs';
import { MeshIdentity } from '../src/lib/identity.mjs';
import { INFORMATION_RIGHTS_SCHEMA } from '../src/domain/information-rights.mjs';
import {
  EVIDENCE_ASSERTION_SCHEMA,
  EVIDENCE_REVIEW_SCHEMA
} from '../src/domain/evidence-graph.mjs';
import { CONTEXTUAL_DISCLOSURE_REQUEST_SCHEMA } from '../src/domain/contextual-disclosure.mjs';
import {
  REPUTATION_QUERY_SCHEMA,
  validateReputationQuery
} from '../src/domain/reputation-query.mjs';
import { evaluateContextualReputation } from '../src/domain/contextual-reputation.mjs';
import {
  DERIVED_REPUTATION_CLAIM_SCHEMA,
  signDerivedReputationClaim,
  validateDerivedReputationClaim,
  verifyDerivedReputationClaimEnvelope
} from '../src/domain/derived-reputation-claim.mjs';
import {
  buildReputationPresentation,
  validateReputationPresentation,
  verifyReputationPresentationEnvelope
} from '../src/domain/reputation-presentation.mjs';

const NOW = '2026-09-03T12:20:00.000Z';
const ACCESS_DIGEST = 'a'.repeat(64);

const PARENT_BLOBS = Object.freeze({
  capabilities: 'fd34c4b1836654bb7eeb7dda0f8be748ee124db8',
  gateway_contract: '2a9bb5c18fe07fa875be770a2a303d401e5919f1',
  grid_server: '2ba84e3995c760a615f59f1c35c79e7a6a4e83b7',
  core_migrations: '36514febba8d6420b165f19c9032d3510253a521',
  siea_migrations: '4464812d39a5df53e4bb46d26fb814e812439980'
});

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
    query_id: 'repq:invariant-security-review-1',
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

function assertion(overrides = {}) {
  return {
    schema: EVIDENCE_ASSERTION_SCHEMA,
    assertion_id: 'assertion:invariant-finding-1',
    type: 'evidence-item',
    proposition: 'Independent review recorded a verified security finding.',
    source_ref: 'principal:reviewer',
    epistemic_state: 'corroborated',
    purpose_scope: ['reputation:software-security'],
    provenance_refs: ['artifact:review-1'],
    created_at: '2026-09-03T12:00:00.000Z',
    ...overrides
  };
}

function rights({
  subjects = ['principal:subject'],
  allowedPurposes = ['vendor-security-review'],
  forbiddenPurposes = [],
  challenge = 'none'
} = {}) {
  return {
    schema: INFORMATION_RIGHTS_SCHEMA,
    object_ref: 'assertion:invariant-finding-1',
    information_class: 'reputation-evidence',
    sensitivity_class: 'restricted',
    relationships: {
      subjects,
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
    allowed_purposes: allowedPurposes,
    forbidden_purposes: forbiddenPurposes,
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
    evidence_refs: ['assertion:invariant-finding-1'],
    state: { retention: 'active', challenge, supersession: 'current' },
    created_at: '2026-09-03T12:00:00.000Z',
    reviewed_at: '2026-09-03T12:05:00.000Z'
  };
}

function review(overrides = {}) {
  return {
    schema: EVIDENCE_REVIEW_SCHEMA,
    object_ref: 'assertion:invariant-finding-1',
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
    updated_at: '2026-09-03T12:06:00.000Z',
    ...overrides
  };
}

function stored(object_kind, object) {
  const object_ref = object_kind === 'evidence-assertion' ? object.assertion_id : object.object_ref;
  return {
    object_ref,
    object_kind,
    object_digest: digestObject(object),
    lifecycle_status: 'active',
    created_at: '2026-09-03T12:00:00.000Z',
    updated_at: '2026-09-03T12:06:00.000Z',
    object
  };
}

function objects({ assertionValue = assertion(), rightsValue = rights(), reviewValue = review() } = {}) {
  return [
    stored('evidence-assertion', assertionValue),
    stored('information-rights', rightsValue),
    stored('evidence-review', reviewValue)
  ];
}

function criterion(result = 'met', overrides = {}) {
  return () => ({
    result,
    supporting_assertion_refs: result === 'met' ? ['assertion:invariant-finding-1'] : [],
    contrary_assertion_refs: [],
    neutral_assertion_refs: [],
    reason_codes: [],
    recommended_ttl_seconds: 600,
    requires_complete_evidence: result === 'not-met',
    ...overrides
  });
}

function evaluate({
  q = query(),
  evidenceObjects = objects(),
  criterionEvaluator = criterion(),
  completenessVerifier = () => ({ complete: false }),
  now = NOW
} = {}) {
  return evaluateContextualReputation({
    query: q,
    objects: evidenceObjects,
    accessDecisionDigests: [ACCESS_DIGEST],
    criterionEvaluator,
    completenessVerifier,
    now
  });
}

function claim(overrides = {}) {
  return {
    schema: DERIVED_REPUTATION_CLAIM_SCHEMA,
    claim_id: 'repclaim:invariant-security-1',
    query_id: 'repq:invariant-security-review-1',
    subject_ref: 'principal:subject',
    domain: 'software-security',
    purpose: 'vendor-security-review',
    criterion_ref: 'criterion:verified-findings-v1',
    result: 'met',
    reason_codes: [],
    evidence_set_digest: 'b'.repeat(64),
    considered_evidence_refs: ['evidence:a', 'evidence:b'],
    supporting_evidence_refs: ['evidence:a'],
    contrary_evidence_refs: ['evidence:b'],
    challenge_refs: [],
    correction_refs: [],
    access_decision_digests: [ACCESS_DIGEST],
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
    request_id: 'disclosure-request:invariant-reputation-1',
    requester: q.requester,
    subject_ref: q.subject_ref,
    purpose: q.purpose,
    required_claims: [q.criterion_ref],
    requested_fields: ['source_ids', 'relationship_history', 'supporting_count'],
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

function buildPresentation({
  q = query(),
  privateClaim = claim(),
  request = disclosureRequest(q),
  policy = projectionPolicy(q),
  claimSigner = identity('reputation-evaluator'),
  presenter = identity('reputation-presenter'),
  now = NOW
} = {}) {
  const derivedClaimEnvelope = signDerivedReputationClaim({ claim: privateClaim, signer: claimSigner });
  const value = buildReputationPresentation({
    query: q,
    disclosureRequest: request,
    projectionPolicy: policy,
    derivedClaimEnvelope,
    claimPublicKey: claimSigner.publicKey,
    signer: presenter,
    now
  });
  return { ...value, derivedClaimEnvelope, claimSigner, presenter };
}

function expected(q = query()) {
  return {
    audience_ref: q.requester,
    purpose: q.purpose,
    subject_ref: q.subject_ref,
    criterion_ref: q.criterion_ref
  };
}

async function gitBlobSha(relative) {
  const bytes = await readFile(new URL(relative, import.meta.url));
  return createHash('sha1')
    .update(Buffer.from(`blob ${bytes.length}\0`))
    .update(bytes)
    .digest('hex');
}

test('universal score, rank, percentile, and cross-domain aggregate surfaces fail closed at every reputation contract', () => {
  const validPresentation = buildPresentation().presentation_envelope.presentation;
  const forbidden = [
    ['score', 97],
    ['rank', 1],
    ['percentile', 99],
    ['global_reputation', 1],
    ['cross_domain_aggregate', 1]
  ];

  for (const [field, value] of forbidden) {
    assert.throws(() => validateReputationQuery({ ...query(), [field]: value }), /unsupported|authority/i);
    assert.throws(() => evaluate({ criterionEvaluator: criterion('met', { [field]: value }) }), /unsupported|authority/i);
    assert.throws(() => validateDerivedReputationClaim({ ...claim(), [field]: value }), /unsupported|authority/i);
    assert.throws(() => validateReputationPresentation({ ...validPresentation, [field]: value }), /unsupported|authority/i);
  }
});

test('reputation cannot transfer from a subject to its delegate, owner, agent, or representative', () => {
  for (const substitute of ['principal:delegate', 'principal:owner', 'principal:agent', 'principal:representative']) {
    assert.throws(
      () => evaluate({ q: query({ subject_ref: substitute }) }),
      /subject binding/i
    );
  }
  assert.throws(
    () => buildPresentation({ q: query({ subject_ref: 'principal:delegate' }) }),
    /subject|binding/i
  );
  assert.throws(
    () => validateDerivedReputationClaim({ ...claim(), reputation_transfer: 'delegate' }),
    /reputation_transfer/i
  );
});

test('cross-domain evidence cannot satisfy clinical-review or teaching reputation queries', () => {
  for (const domain of ['clinical-review', 'teaching']) {
    const value = evaluate({ q: query({ domain }) });
    assert.equal(value.result, 'unresolved');
    assert.ok(value.reason_codes.includes('evidence_domain_mismatch'));
  }
});

test('cross-subject isolation uses rights relationships rather than proposition text', () => {
  const evidenceObjects = objects({
    assertionValue: assertion({ proposition: 'This sentence explicitly names principal:subject.' }),
    rightsValue: rights({ subjects: ['principal:other'] })
  });
  assert.throws(
    () => evaluate({ evidenceObjects }),
    /subject binding/i
  );
});

test('challenged or disputed supporting evidence stays unresolved unless challenge adjudication is explicit', () => {
  const challenged = evaluate({
    evidenceObjects: objects({ reviewValue: review({ challenged: true, adjudicated: false }) })
  });
  assert.equal(challenged.result, 'unresolved');
  assert.ok(challenged.reason_codes.includes('evidence_challenged'));

  const adjudicated = evaluate({
    evidenceObjects: objects({ reviewValue: review({ challenged: true, adjudicated: true }) })
  });
  assert.equal(adjudicated.result, 'met');
  assert.equal(adjudicated.reason_codes.includes('evidence_challenged'), false);

  const disputed = evaluate({
    evidenceObjects: objects({ assertionValue: assertion({ epistemic_state: 'disputed' }) })
  });
  assert.equal(disputed.result, 'unresolved');
  assert.ok(disputed.reason_codes.includes('evidence_disputed'));
});

test('future, stale, and expired evidence, review, query, claim, and presentation state cannot become current reputation', () => {
  const futureEvidence = evaluate({
    evidenceObjects: objects({ assertionValue: assertion({ created_at: '2026-09-03T12:21:00.000Z' }) })
  });
  assert.equal(futureEvidence.result, 'unresolved');
  assert.ok(futureEvidence.reason_codes.includes('evidence_future_dated'));

  const staleEvidence = evaluate({
    evidenceObjects: objects({ assertionValue: assertion({ created_at: '2026-09-03T09:59:59.000Z' }) })
  });
  assert.equal(staleEvidence.result, 'unresolved');
  assert.ok(staleEvidence.reason_codes.includes('evidence_outside_window'));

  const futureReview = evaluate({
    evidenceObjects: objects({ reviewValue: review({ updated_at: '2026-09-03T12:21:00.000Z' }) })
  });
  assert.equal(futureReview.result, 'unresolved');
  assert.ok(futureReview.reason_codes.includes('review_future_dated'));

  assert.throws(
    () => evaluate({ now: '2026-09-03T13:00:00.000Z' }),
    /not active/i
  );

  const claimSigner = identity('reputation-evaluator-freshness');
  const claimEnvelope = signDerivedReputationClaim({ claim: claim(), signer: claimSigner });
  assert.throws(
    () => verifyDerivedReputationClaimEnvelope({
      envelope: claimEnvelope,
      publicKey: claimSigner.publicKey,
      now: '2026-09-03T12:05:00.000Z'
    }),
    /future/i
  );
  assert.throws(
    () => verifyDerivedReputationClaimEnvelope({
      envelope: claimEnvelope,
      publicKey: claimSigner.publicKey,
      now: '2026-09-03T12:50:00.000Z'
    }),
    /expired/i
  );

  const q = query();
  const built = buildPresentation({ q });
  assert.throws(
    () => verifyReputationPresentationEnvelope({
      envelope: built.presentation_envelope,
      publicKey: built.presenter.publicKey,
      now: '2026-09-03T12:19:00.000Z',
      expected: expected(q)
    }),
    /future/i
  );
  assert.throws(
    () => verifyReputationPresentationEnvelope({
      envelope: built.presentation_envelope,
      publicKey: built.presenter.publicKey,
      now: '2026-09-03T12:50:00.000Z',
      expected: expected(q)
    }),
    /expired/i
  );
});

test('not-met absence claims require separately verified complete-for-criterion evidence', () => {
  assert.throws(
    () => validateDerivedReputationClaim({
      ...claim(),
      result: 'not-met',
      supporting_evidence_refs: [],
      completeness: 'bounded-selected-evidence'
    }),
    /verified-complete-for-criterion/i
  );

  const unresolved = evaluate({ criterionEvaluator: criterion('not-met') });
  assert.equal(unresolved.result, 'unresolved');
  assert.equal(unresolved.completeness, 'bounded-selected-evidence');
  assert.ok(unresolved.reason_codes.includes('criterion_completeness_unverified'));

  const complete = evaluate({
    criterionEvaluator: criterion('not-met'),
    completenessVerifier: () => ({ complete: true })
  });
  assert.equal(complete.result, 'not-met');
  assert.equal(complete.completeness, 'verified-complete-for-criterion');
});

test('purpose binding prevents a reputation query or presentation from being replayed for another purpose', () => {
  assert.throws(
    () => evaluate({ q: query({ purpose: 'employment-screening' }) }),
    /purpose/i
  );

  const q = query();
  const built = buildPresentation({ q });
  assert.throws(
    () => verifyReputationPresentationEnvelope({
      envelope: built.presentation_envelope,
      publicKey: built.presenter.publicKey,
      now: '2026-09-03T12:25:00.000Z',
      expected: { ...expected(q), purpose: 'employment-screening' }
    }),
    /purpose|binding/i
  );
});

test('audience binding prevents verifier A presentation from being accepted by verifier B', () => {
  const q = query({ requester: 'principal:verifier-a' });
  const built = buildPresentation({ q });
  assert.throws(
    () => verifyReputationPresentationEnvelope({
      envelope: built.presentation_envelope,
      publicKey: built.presenter.publicKey,
      now: '2026-09-03T12:25:00.000Z',
      expected: { ...expected(q), audience_ref: 'principal:verifier-b' }
    }),
    /audience|binding/i
  );
});

test('criterion-only presentations minimize correlation surface and bind each audience separately', () => {
  const claimSigner = identity('reputation-evaluator-correlation');
  const presenter = identity('reputation-presenter-correlation');
  const firstQuery = query({ requester: 'principal:verifier-a' });
  const secondQuery = query({ requester: 'principal:verifier-b' });
  const first = buildPresentation({ q: firstQuery, claimSigner, presenter });
  const second = buildPresentation({
    q: secondQuery,
    request: disclosureRequest(secondQuery, { request_id: 'disclosure-request:invariant-reputation-2' }),
    claimSigner,
    presenter
  });

  assert.notEqual(
    first.presentation_envelope.presentation.basis_binding_digest,
    second.presentation_envelope.presentation.basis_binding_digest
  );

  for (const envelope of [first.presentation_envelope, second.presentation_envelope]) {
    const serialized = JSON.stringify(envelope.presentation);
    for (const forbidden of [
      'evidence:',
      'artifact:',
      'evidence_set_digest',
      'access_decision_digests',
      'private_claim_digest',
      'considered_evidence_refs',
      'supporting_evidence_refs',
      'contrary_evidence_refs',
      'challenge_refs',
      'correction_refs',
      'source_ids',
      'relationship_history'
    ]) {
      assert.equal(serialized.includes(forbidden), false, `criterion-only presentation leaked ${forbidden}`);
    }
  }
});

test('credential or reputation state never becomes execution, delegation, or capability authority', () => {
  const validPresentation = buildPresentation().presentation_envelope.presentation;
  const forbidden = [
    ['authority_granted', true],
    ['execution_authority', 'grant:any'],
    ['delegation_granted', true],
    ['capability_grant', 'capability:any']
  ];

  for (const [field, value] of forbidden) {
    assert.throws(() => validateReputationQuery({ ...query(), [field]: value }), /unsupported|authority/i);
    assert.throws(() => evaluate({ criterionEvaluator: criterion('met', { [field]: value }) }), /unsupported|authority/i);
    assert.throws(() => validateDerivedReputationClaim({ ...claim(), [field]: value }), /unsupported|authority/i);
    assert.throws(() => validateReputationPresentation({ ...validPresentation, [field]: value }), /unsupported|authority/i);
  }

  const derived = evaluate();
  assert.equal(derived.authority_effect, 'none');
  assert.equal(derived.reputation_transfer, 'none');
  const presentation = validPresentation;
  assert.equal(presentation.authority_effect, 'none');
  assert.equal(presentation.reputation_transfer, 'none');
});

test('Slice 3 does not promote capability, Gateway, migration, SIEA, or Grid runtime boundaries', async () => {
  assert.equal(await gitBlobSha('../config/capabilities.json'), PARENT_BLOBS.capabilities);
  assert.equal(await gitBlobSha('../config/gateway-client-contract.json'), PARENT_BLOBS.gateway_contract);
  assert.equal(await gitBlobSha('../src/grid/migrations.mjs'), PARENT_BLOBS.core_migrations);
  assert.equal(await gitBlobSha('../src/grid/sovereign-information-migrations.mjs'), PARENT_BLOBS.siea_migrations);
  assert.equal(await gitBlobSha('../src/grid/server.mjs'), PARENT_BLOBS.grid_server);

  const serverSource = await readFile(new URL('../src/grid/server.mjs', import.meta.url), 'utf8');
  assert.equal(serverSource.includes('ContextualTrustProjector'), false);
  assert.equal(serverSource.includes('SovereignInformationGridStore'), false);
});
