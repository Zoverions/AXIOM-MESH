import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import {
  AMN_TRUST_SCHEMAS,
  amnTrustKeyId,
  createAmnTrustStatement
} from '../src/lib/amn-trust-evidence.mjs';
import {
  createAxiomShadowAmnTrustProvider,
  createLocalAmnTrustProvider
} from '../src/lib/amn-shadow-evidence.mjs';

const ISSUED_AT = '2026-09-18T17:00:00.000Z';
const SHADOW_AT = '2026-09-18T17:00:01.000Z';

function keys() {
  return generateKeyPairSync('ed25519');
}

function trusted(issuer) {
  return {
    'issuer.customer.assurance': issuer.publicKey
  };
}

function validStatement({ issuer, subject } = {}) {
  const publicKey = subject.publicKey.export({
    type: 'spki',
    format: 'pem'
  }).toString();
  return createAmnTrustStatement({
    schema: AMN_TRUST_SCHEMAS.node_identity,
    issuerId: 'issuer.customer.assurance',
    issuerPrivateKey: issuer.privateKey,
    issuedAt: ISSUED_AT,
    claims: {
      node_id: 'node.vendor-a.review-regression',
      trust_domain: 'spiffe://customer.example',
      platform_vendor: 'vendor-a',
      platform_family: 'airframe-alpha',
      identity_method: 'software-key',
      subject_key_id: amnTrustKeyId(subject.publicKey),
      subject_public_key: publicKey
    }
  });
}

test('empty malformed schema is normalized into a rejected provider result', () => {
  const issuer = keys();
  const provider = createLocalAmnTrustProvider({
    trustedIssuers: trusted(issuer)
  });

  const result = provider.verify({
    issuer_id: 'issuer.customer.assurance',
    schema: ''
  });

  assert.equal(result.verification.trust_state, 'rejected');
  assert.equal(result.verification.statement_schema, null);
  assert.equal(result.verification.cryptographic_validity, false);
  assert.equal(result.verification.authority_effect, 'none');
  assert.equal(result.shadow.status, 'disabled');
});

test('malformed queue results fail the shadow path without changing local trust', () => {
  const issuer = keys();
  const subject = keys();
  const statement = validStatement({ issuer, subject });
  const malformedResults = [
    {
      status: 'queued',
      reason_code: 'shadow_record_queued'
    },
    {
      status: 'unsupported-state',
      reason_code: 'shadow_record_queued',
      record_digest: null,
      sequence: null
    }
  ];

  for (const malformed of malformedResults) {
    const queue = Object.freeze({
      enqueue() {
        return malformed;
      }
    });
    const provider = createAxiomShadowAmnTrustProvider({
      trustedIssuers: trusted(issuer),
      queue
    });

    const result = provider.verify(statement, { shadowAt: SHADOW_AT });

    assert.equal(result.verification.trust_state, 'verified');
    assert.equal(result.verification.cryptographic_validity, true);
    assert.equal(result.verification.authority_effect, 'none');
    assert.equal(result.shadow.status, 'failed');
    assert.equal(result.shadow.reason_code, 'shadow_path_unavailable');
    assert.equal(result.shadow.record_digest, null);
    assert.equal(result.shadow.sequence, null);
  }
});
