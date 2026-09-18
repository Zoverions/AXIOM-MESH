import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import {
  AMN_TRUST_SCHEMAS,
  amnTrustKeyId,
  createAmnTrustStatement
} from '../src/lib/amn-trust-evidence.mjs';
import {
  createAmnDomainSnapshot,
  createAmnTrustDomainBundle,
  evaluateAmnTrustDomainAdmission,
  normalizeAmnDomainAdmission
} from '../src/lib/amn-trust-domain.mjs';

const BUNDLE_ISSUED_AT = '2026-09-18T15:59:00.000Z';
const VALID_FROM = '2026-09-18T16:00:00.000Z';
const VALID_UNTIL = '2026-09-18T18:00:00.000Z';
const EVALUATED_AT = '2026-09-18T16:05:00.000Z';
const IDENTITY_AT = '2026-09-18T16:01:00.000Z';
const STATUS_AT = '2026-09-18T16:04:00.000Z';
const FUTURE_AT = '2026-09-18T16:06:00.000Z';

function keys() {
  return generateKeyPairSync('ed25519');
}

function canonicalPem(key) {
  return key.export({ type: 'spki', format: 'pem' }).toString();
}

function fixture() {
  const customer = keys();
  const vendor = keys();
  const node = keys();
  const issuerId = 'issuer.vendor-a';
  const nodeId = 'node.vendor-a.001';
  const bundle = createAmnTrustDomainBundle({
    bundleId: 'bundle.customer.001',
    customerDomain: 'spiffe://customer.example',
    customerPrivateKey: customer.privateKey,
    version: 1,
    issuedAt: BUNDLE_ISSUED_AT,
    validFrom: VALID_FROM,
    validUntil: VALID_UNTIL,
    issuers: [{
      issuer_id: issuerId,
      trust_domain: 'spiffe://vendor-a.example',
      issuer_key_id: amnTrustKeyId(vendor.publicKey),
      issuer_public_key: canonicalPem(vendor.publicKey),
      allowed_subject_prefixes: ['node.vendor-a.'],
      status_max_age_seconds: 300
    }]
  });
  return { customer, vendor, node, issuerId, nodeId, bundle };
}

function nodeIdentity(f, { issuedAt = IDENTITY_AT } = {}) {
  return createAmnTrustStatement({
    schema: AMN_TRUST_SCHEMAS.node_identity,
    issuerId: f.issuerId,
    issuerPrivateKey: f.vendor.privateKey,
    issuedAt,
    claims: {
      node_id: f.nodeId,
      trust_domain: 'spiffe://vendor-a.example',
      platform_vendor: 'vendor-a',
      platform_family: 'vendor-a-reference',
      identity_method: 'software-key',
      subject_key_id: amnTrustKeyId(f.node.publicKey),
      subject_public_key: canonicalPem(f.node.publicKey)
    }
  });
}

function status(f, {
  subjectType = 'node',
  state = 'active',
  sequence = 1,
  effectiveAt = STATUS_AT,
  issuedAt = effectiveAt
} = {}) {
  return createAmnTrustStatement({
    schema: AMN_TRUST_SCHEMAS.status,
    issuerId: f.issuerId,
    issuerPrivateKey: f.vendor.privateKey,
    issuedAt,
    claims: {
      subject_id: f.nodeId,
      subject_type: subjectType,
      status: state,
      reason_code: 'operator-confirmed',
      effective_at: effectiveAt,
      sequence
    }
  });
}

function admission(f, statement, statuses) {
  return evaluateAmnTrustDomainAdmission({
    bundle: f.bundle,
    trustedCustomerPublicKey: f.customer.publicKey,
    expectedCustomerDomain: 'spiffe://customer.example',
    statement,
    statusStatements: statuses,
    at: EVALUATED_AT
  });
}

test('node admission quarantines status evidence with a mismatched signed subject type', () => {
  const f = fixture();
  const result = admission(
    f,
    nodeIdentity(f),
    [status(f, { subjectType: 'organization' })]
  );

  assert.equal(result.result, 'quarantined');
  assert.equal(result.reason_code, 'status_subject_type_mismatch');
  assert.equal(result.status_state, 'quarantined');
  assert.equal(result.authority_effect, 'none');
});

test('future-issued status cannot affect an earlier admission evaluation', () => {
  const f = fixture();
  const result = admission(
    f,
    nodeIdentity(f),
    [status(f, { issuedAt: FUTURE_AT, effectiveAt: STATUS_AT })]
  );

  assert.equal(result.result, 'quarantined');
  assert.equal(result.reason_code, 'status_future_issued');
  assert.equal(result.status_state, 'quarantined');
});

test('future-issued node identity is quarantined before namespace or status admission', () => {
  const f = fixture();
  const result = admission(
    f,
    nodeIdentity(f, { issuedAt: FUTURE_AT }),
    [status(f)]
  );

  assert.equal(result.result, 'quarantined');
  assert.equal(result.reason_code, 'evidence_future_issued');
  assert.equal(result.status_evidence_digest, null);
});

test('admission normalization rejects a substituted schema discriminator', () => {
  const f = fixture();
  const accepted = admission(f, nodeIdentity(f), [status(f)]);
  assert.equal(accepted.result, 'admitted');

  const substituted = structuredClone(accepted);
  substituted.schema = 'axiom-amn-domain-admission.wrong';

  assert.throws(
    () => normalizeAmnDomainAdmission(substituted),
    /admission schema is unsupported/
  );
});

test('snapshot rejects mutually exclusive admissions for the same identity key', () => {
  const f = fixture();
  const statement = nodeIdentity(f);
  const active = admission(f, statement, [status(f, { state: 'active' })]);
  const revoked = admission(f, statement, [status(f, { state: 'revoked' })]);

  assert.equal(active.result, 'admitted');
  assert.equal(revoked.result, 'rejected');
  assert.notEqual(active.admission_digest, revoked.admission_digest);

  assert.throws(
    () => createAmnDomainSnapshot([active, revoked]),
    /duplicate admission identities/
  );
});
