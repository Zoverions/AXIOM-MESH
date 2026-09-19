import { generateKeyPairSync } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ENTITY_ASSURANCE_EVIDENCE_SCHEMA,
  ENTITY_ASSURANCE_POLICY_SCHEMA
} from '../src/lib/entity-assurance.mjs';
import {
  admitEntityAssuranceSource,
  buildDurableAssuranceSourceAdmission,
  collectBrokerVerifiedSourceBindings,
  verifyDurableAssuranceSourceAdmission
} from '../src/lib/assurance-source-broker.mjs';
import { MeshIdentity } from '../src/lib/identity.mjs';

const NOW = '2026-09-01T12:00:00.000Z';


function signingIdentity(service = 'grid') {
  const pair = generateKeyPairSync('ed25519');
  const privatePem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' });
  const publicPem = pair.publicKey.export({ type: 'spki', format: 'pem' });
  return {
    identity: new MeshIdentity(service, privatePem, publicPem),
    publicKey: pair.publicKey
  };
}

function admittedSource() {
  return admitEntityAssuranceSource({
    sourceId: 'source.entity-assurance',
    policy: policy(),
    evidence: [evidence()],
    subjectId: 'agent.broker-subject',
    now: NOW
  });
}

function policy() {
  return {
    schema: ENTITY_ASSURANCE_POLICY_SCHEMA,
    policy_id: 'policy.broker.entity',
    identity_requirement: 'none',
    requirements: [
      {
        dimension: 'reputation',
        minimum_strength: 'moderate',
        accepted_evidence_classes: ['independently_verified']
      }
    ],
    authority_effect: 'none',
    delegation_effect: 'none'
  };
}

function evidence(result = 'pass') {
  return {
    schema: ENTITY_ASSURANCE_EVIDENCE_SCHEMA,
    evidence_id: 'evidence.broker.reputation',
    subject_id: 'agent.broker-subject',
    dimension: 'reputation',
    result,
    strength: 'strong',
    evidence_class: 'independently_verified',
    basis_digest: 'a'.repeat(64),
    issuer_id: 'issuer.broker',
    binding_scope: 'pseudonymous',
    observed_at: '2026-09-01T11:00:00.000Z',
    expires_at: '2026-09-02T11:00:00.000Z',
    non_authorizing: true
  };
}

test('source broker admits a satisfied upstream entity-assurance decision', () => {
  const admission = admitEntityAssuranceSource({
    sourceId: 'source.entity-assurance',
    policy: policy(),
    evidence: [evidence()],
    subjectId: 'agent.broker-subject',
    now: NOW
  });
  assert.equal(admission.source_class, 'entity-assurance');
  assert.equal(admission.authority_effect, 'none');
  assert.equal(admission.truth_established, false);
  assert.match(admission.source_verification_digest, /^[a-f0-9]{64}$/);

  const bindings = collectBrokerVerifiedSourceBindings([admission]);
  assert.deepEqual(bindings.get(admission.source_verification_digest), {
    source_id: 'source.entity-assurance',
    source_class: 'entity-assurance'
  });
});

test('source broker refuses an unsatisfied upstream entity-assurance decision', () => {
  assert.throws(
    () => admitEntityAssuranceSource({
      sourceId: 'source.entity-assurance',
      policy: policy(),
      evidence: [evidence('fail')],
      subjectId: 'agent.broker-subject',
      now: NOW
    }),
    /cannot admit an unsatisfied/
  );
});

test('lookalike or cloned admissions cannot manufacture verified source status', () => {
  const admission = admitEntityAssuranceSource({
    sourceId: 'source.entity-assurance',
    policy: policy(),
    evidence: [evidence()],
    subjectId: 'agent.broker-subject',
    now: NOW
  });
  const forged = { ...admission };
  assert.throws(
    () => collectBrokerVerifiedSourceBindings([forged]),
    /only live admissions/
  );
});

test('broker admissions remain runtime-local and non-authorizing', () => {
  const admission = admitEntityAssuranceSource({
    sourceId: 'source.entity-assurance',
    policy: policy(),
    evidence: [evidence()],
    subjectId: 'agent.broker-subject',
    now: NOW
  });
  assert.equal(admission.authority_effect, 'none');
  assert.equal('execution_authority' in admission, false);
});


test('durable source admission survives serialization and verifies with the trusted Grid key', () => {
  const { identity, publicKey } = signingIdentity();
  const receipt = buildDurableAssuranceSourceAdmission(admittedSource(), {
    identity,
    issuedAt: '2026-09-01T12:00:00.000Z',
    expiresAt: '2026-09-02T12:00:00.000Z'
  });

  const serialized = JSON.parse(JSON.stringify(receipt));
  const verified = verifyDurableAssuranceSourceAdmission(
    serialized,
    publicKey,
    { now: '2026-09-01T18:00:00.000Z' }
  );
  assert.equal(verified.valid, true);
  assert.equal(verified.source_id, 'source.entity-assurance');
  assert.equal(verified.source_class, 'entity-assurance');
  assert.equal(verified.authority_effect, 'none');
  assert.equal(verified.truth_established, false);

  // Durable receipt verification is intentionally separate from binding
  // collection, which additionally requires a current revocation snapshot.
});

test('durable source admission rejects tampering and the wrong Grid key', () => {
  const trusted = signingIdentity();
  const wrong = signingIdentity('other-grid');
  const receipt = buildDurableAssuranceSourceAdmission(admittedSource(), {
    identity: trusted.identity,
    issuedAt: '2026-09-01T12:00:00.000Z',
    expiresAt: '2026-09-02T12:00:00.000Z'
  });

  assert.throws(
    () => verifyDurableAssuranceSourceAdmission(
      receipt,
      wrong.publicKey,
      { now: '2026-09-01T18:00:00.000Z' }
    ),
    /signature is invalid/
  );

  const tampered = JSON.parse(JSON.stringify(receipt));
  tampered.statement.source_id = 'source.substituted';
  assert.throws(
    () => verifyDurableAssuranceSourceAdmission(
      tampered,
      trusted.publicKey,
      { now: '2026-09-01T18:00:00.000Z' }
    ),
    /receipt_digest mismatch|signature is invalid/
  );
});

test('durable source admission rejects future, expired, and excessive-lifetime records', () => {
  const { identity, publicKey } = signingIdentity();
  const receipt = buildDurableAssuranceSourceAdmission(admittedSource(), {
    identity,
    issuedAt: '2026-09-01T12:00:00.000Z',
    expiresAt: '2026-09-02T12:00:00.000Z'
  });

  assert.throws(
    () => verifyDurableAssuranceSourceAdmission(
      receipt,
      publicKey,
      { now: '2026-09-01T11:59:59.000Z' }
    ),
    /future-dated/
  );
  assert.throws(
    () => verifyDurableAssuranceSourceAdmission(
      receipt,
      publicKey,
      { now: '2026-09-02T12:00:00.000Z' }
    ),
    /expired/
  );
  assert.throws(
    () => buildDurableAssuranceSourceAdmission(admittedSource(), {
      identity,
      issuedAt: '2026-09-01T12:00:00.000Z',
      expiresAt: '2026-09-09T12:00:00.000Z'
    }),
    /exceeds seven days/
  );
});

test('serialized lookalike cannot be treated as a live admission for signing', () => {
  const { identity } = signingIdentity();
  const live = admittedSource();
  const cloned = JSON.parse(JSON.stringify(live));
  assert.throws(
    () => buildDurableAssuranceSourceAdmission(cloned, {
      identity,
      issuedAt: '2026-09-01T12:00:00.000Z',
      expiresAt: '2026-09-02T12:00:00.000Z'
    }),
    /requires a live broker admission/
  );
});
