import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import {
  AMN_TRUST_SCHEMAS,
  amnTrustKeyId,
  createAmnTrustStatement
} from '../src/lib/amn-trust-evidence.mjs';
import {
  AMN_DOMAIN_ADMISSION_SCHEMA,
  AMN_DOMAIN_SNAPSHOT_SCHEMA,
  AMN_TRUST_DOMAIN_BUNDLE_SCHEMA,
  createAmnDomainSnapshot,
  createAmnTrustDomainBundle,
  evaluateAmnTrustDomainAdmission,
  normalizeAmnDomainAdmission,
  verifyAmnTrustDomainBundle
} from '../src/lib/amn-trust-domain.mjs';

const ISSUED_AT = '2026-09-18T15:59:00.000Z';
const VALID_FROM = '2026-09-18T16:00:00.000Z';
const VALID_UNTIL = '2026-09-18T18:00:00.000Z';
const EVALUATED_AT = '2026-09-18T16:05:00.000Z';
const STATUS_AT = '2026-09-18T16:04:00.000Z';

function keys() {
  return generateKeyPairSync('ed25519');
}

function canonicalPem(key) {
  return key.export({ type: 'spki', format: 'pem' }).toString();
}

function issuerEntry({
  id,
  domain,
  key,
  prefixes,
  statusMaxAgeSeconds = 300
}) {
  return {
    issuer_id: id,
    trust_domain: domain,
    issuer_key_id: amnTrustKeyId(key.publicKey),
    issuer_public_key: canonicalPem(key.publicKey),
    allowed_subject_prefixes: prefixes,
    status_max_age_seconds: statusMaxAgeSeconds
  };
}

function fixture() {
  const customer = keys();
  const vendorA = keys();
  const vendorB = keys();
  const nodeA = keys();
  const nodeB = keys();

  const issuers = [
    issuerEntry({
      id: 'issuer.vendor-a',
      domain: 'spiffe://vendor-a.example',
      key: vendorA,
      prefixes: ['node.vendor-a.']
    }),
    issuerEntry({
      id: 'issuer.vendor-b',
      domain: 'spiffe://vendor-b.example',
      key: vendorB,
      prefixes: ['node.vendor-b.']
    })
  ];

  const bundle = createAmnTrustDomainBundle({
    bundleId: 'bundle.customer.001',
    customerDomain: 'spiffe://customer.example',
    customerPrivateKey: customer.privateKey,
    version: 1,
    issuedAt: ISSUED_AT,
    validFrom: VALID_FROM,
    validUntil: VALID_UNTIL,
    issuers
  });

  return {
    customer,
    vendorA,
    vendorB,
    nodeA,
    nodeB,
    issuers,
    bundle
  };
}

function nodeIdentity({
  issuer,
  issuerId,
  subject,
  nodeId,
  vendor
}) {
  return createAmnTrustStatement({
    schema: AMN_TRUST_SCHEMAS.node_identity,
    issuerId,
    issuerPrivateKey: issuer.privateKey,
    issuedAt: '2026-09-18T16:01:00.000Z',
    claims: {
      node_id: nodeId,
      trust_domain: `spiffe://${vendor}.example`,
      platform_vendor: vendor,
      platform_family: `${vendor}-reference`,
      identity_method: 'software-key',
      subject_key_id: amnTrustKeyId(subject.publicKey),
      subject_public_key: canonicalPem(subject.publicKey)
    }
  });
}

function status({
  issuer,
  issuerId,
  subjectId,
  state = 'active',
  sequence = 1,
  effectiveAt = STATUS_AT,
  reasonCode = 'operator-confirmed'
}) {
  return createAmnTrustStatement({
    schema: AMN_TRUST_SCHEMAS.status,
    issuerId,
    issuerPrivateKey: issuer.privateKey,
    issuedAt: effectiveAt,
    claims: {
      subject_id: subjectId,
      subject_type: 'node',
      status: state,
      reason_code: reasonCode,
      effective_at: effectiveAt,
      sequence
    }
  });
}

function admission({
  f,
  statement,
  statuses,
  at = EVALUATED_AT,
  bundle = f.bundle
}) {
  return evaluateAmnTrustDomainAdmission({
    bundle,
    trustedCustomerPublicKey: f.customer.publicKey,
    expectedCustomerDomain: 'spiffe://customer.example',
    statement,
    statusStatements: statuses,
    at
  });
}

test('customer-signed trust bundle verifies deterministically with sorted isolated issuers', () => {
  const f = fixture();
  const verified = verifyAmnTrustDomainBundle(f.bundle, {
    trustedCustomerPublicKey: f.customer.publicKey,
    expectedCustomerDomain: 'spiffe://customer.example',
    at: EVALUATED_AT
  });

  assert.equal(verified.schema, AMN_TRUST_DOMAIN_BUNDLE_SCHEMA);
  assert.equal(verified.currentness, 'current');
  assert.deepEqual(
    verified.statement.issuers.map(item => item.issuer_id),
    ['issuer.vendor-a', 'issuer.vendor-b']
  );
  assert.equal(verified.authority_effect, 'none');
  assert.equal(verified.federation_authority_claimed, false);
  assert.equal(verified.pooled_authority_claimed, false);
  assert.match(verified.bundle_digest, /^[a-f0-9]{64}$/);
});

test('wrong customer root, bundle tamper, and authority widening fail closed', () => {
  const f = fixture();
  const wrongCustomer = keys();

  assert.throws(
    () => verifyAmnTrustDomainBundle(f.bundle, {
      trustedCustomerPublicKey: wrongCustomer.publicKey,
      expectedCustomerDomain: 'spiffe://customer.example',
      at: EVALUATED_AT
    }),
    /customer key substitution/
  );

  const tampered = structuredClone(f.bundle);
  tampered.statement.version = 2;
  assert.throws(
    () => verifyAmnTrustDomainBundle(tampered, {
      trustedCustomerPublicKey: f.customer.publicKey,
      expectedCustomerDomain: 'spiffe://customer.example',
      at: EVALUATED_AT
    }),
    /statement digest mismatch/
  );

  const widened = structuredClone(f.bundle);
  widened.statement.pooled_authority_claimed = true;
  assert.throws(
    () => verifyAmnTrustDomainBundle(widened, {
      trustedCustomerPublicKey: f.customer.publicKey,
      expectedCustomerDomain: 'spiffe://customer.example',
      at: EVALUATED_AT
    }),
    /widens its non-authority boundary/
  );
});

test('issuer ids, trust domains, roots, and subject namespaces cannot collide', () => {
  const f = fixture();

  for (const mutate of [
    issuers => { issuers[1].issuer_id = issuers[0].issuer_id; },
    issuers => { issuers[1].trust_domain = issuers[0].trust_domain; },
    issuers => {
      issuers[1].issuer_public_key = issuers[0].issuer_public_key;
      issuers[1].issuer_key_id = issuers[0].issuer_key_id;
    },
    issuers => { issuers[0].allowed_subject_prefixes = ['node.vendor-']; }
  ]) {
    const issuers = structuredClone(f.issuers);
    mutate(issuers);
    assert.throws(
      () => createAmnTrustDomainBundle({
        bundleId: 'bundle.bad',
        customerDomain: 'spiffe://customer.example',
        customerPrivateKey: f.customer.privateKey,
        version: 1,
        issuedAt: ISSUED_AT,
        validFrom: VALID_FROM,
        validUntil: VALID_UNTIL,
        issuers
      }),
      /must be unique|namespaces overlap/
    );
  }
});

test('Vendor A and Vendor B are admitted independently under current active status', () => {
  const f = fixture();
  const statementA = nodeIdentity({
    issuer: f.vendorA,
    issuerId: 'issuer.vendor-a',
    subject: f.nodeA,
    nodeId: 'node.vendor-a.001',
    vendor: 'vendor-a'
  });
  const statementB = nodeIdentity({
    issuer: f.vendorB,
    issuerId: 'issuer.vendor-b',
    subject: f.nodeB,
    nodeId: 'node.vendor-b.001',
    vendor: 'vendor-b'
  });
  const statusA = status({
    issuer: f.vendorA,
    issuerId: 'issuer.vendor-a',
    subjectId: 'node.vendor-a.001'
  });
  const statusB = status({
    issuer: f.vendorB,
    issuerId: 'issuer.vendor-b',
    subjectId: 'node.vendor-b.001'
  });

  const a = admission({ f, statement: statementA, statuses: [statusA, statusB] });
  const b = admission({ f, statement: statementB, statuses: [statusA, statusB] });

  for (const result of [a, b]) {
    assert.equal(result.schema, AMN_DOMAIN_ADMISSION_SCHEMA);
    assert.equal(result.result, 'admitted');
    assert.equal(result.reason_code, 'verified_supplied_current');
    assert.equal(result.status_state, 'active');
    assert.equal(result.status_evidence_scope, 'supplied-issuer-evidence-only');
    assert.equal(result.global_currentness_claimed, false);
    assert.equal(result.authority_effect, 'none');
    assert.equal(result.delegation_effect, 'none');
    assert.equal(result.pooled_authority_effect, 'none');
    assert.equal(result.federation_authority_effect, 'none');
    assert.match(result.admission_digest, /^[a-f0-9]{64}$/);
  }
});

test('Vendor A cannot claim Vendor B trust-domain label inside Vendor A namespace', () => {
  const f = fixture();
  const publicKey = canonicalPem(f.nodeA.publicKey);
  const mislabeled = createAmnTrustStatement({
    schema: AMN_TRUST_SCHEMAS.node_identity,
    issuerId: 'issuer.vendor-a',
    issuerPrivateKey: f.vendorA.privateKey,
    issuedAt: '2026-09-18T16:01:00.000Z',
    claims: {
      node_id: 'node.vendor-a.mislabeled',
      trust_domain: 'spiffe://vendor-b.example',
      platform_vendor: 'vendor-a',
      platform_family: 'vendor-a-reference',
      identity_method: 'software-key',
      subject_key_id: amnTrustKeyId(f.nodeA.publicKey),
      subject_public_key: publicKey
    }
  });

  const result = admission({ f, statement: mislabeled, statuses: [] });

  assert.equal(result.result, 'rejected');
  assert.equal(result.reason_code, 'trust_domain_mismatch');
  assert.equal(result.issuer_trust_domain, 'spiffe://vendor-a.example');
  assert.equal(result.authority_effect, 'none');
});

test('Vendor A cannot mint a trusted identity inside Vendor B subject namespace', () => {
  const f = fixture();
  const crossNamespace = nodeIdentity({
    issuer: f.vendorA,
    issuerId: 'issuer.vendor-a',
    subject: f.nodeA,
    nodeId: 'node.vendor-b.rogue-a',
    vendor: 'vendor-a'
  });
  const result = admission({
    f,
    statement: crossNamespace,
    statuses: []
  });

  assert.equal(result.result, 'rejected');
  assert.equal(result.reason_code, 'subject_namespace_mismatch');
  assert.equal(result.issuer_id, 'issuer.vendor-a');
  assert.equal(result.subject_id, 'node.vendor-b.rogue-a');
});

test('Vendor A cannot impersonate Vendor B issuer id with Vendor A signing key', () => {
  const f = fixture();
  const forgedIssuer = nodeIdentity({
    issuer: f.vendorA,
    issuerId: 'issuer.vendor-b',
    subject: f.nodeA,
    nodeId: 'node.vendor-b.forged',
    vendor: 'vendor-b'
  });

  const result = admission({
    f,
    statement: forgedIssuer,
    statuses: []
  });

  assert.equal(result.result, 'rejected');
  assert.equal(result.reason_code, 'issuer_key_substitution');
  assert.equal(result.issuer_id, 'issuer.vendor-b');
});

test('revoking Vendor A leaves Vendor B admission byte-equivalent', () => {
  const f = fixture();
  const statementB = nodeIdentity({
    issuer: f.vendorB,
    issuerId: 'issuer.vendor-b',
    subject: f.nodeB,
    nodeId: 'node.vendor-b.001',
    vendor: 'vendor-b'
  });
  const statusB = status({
    issuer: f.vendorB,
    issuerId: 'issuer.vendor-b',
    subjectId: 'node.vendor-b.001'
  });

  const before = admission({
    f,
    statement: statementB,
    statuses: [statusB]
  });

  const revokedA = status({
    issuer: f.vendorA,
    issuerId: 'issuer.vendor-a',
    subjectId: 'node.vendor-a.001',
    state: 'revoked',
    sequence: 2,
    effectiveAt: '2026-09-18T16:04:30.000Z',
    reasonCode: 'operator-revoked'
  });

  const after = admission({
    f,
    statement: statementB,
    statuses: [statusB, revokedA]
  });

  assert.deepEqual(after, before);
  assert.equal(after.admission_digest, before.admission_digest);
});

test('Vendor A revocation rejects A while Vendor B remains admitted', () => {
  const f = fixture();
  const statementA = nodeIdentity({
    issuer: f.vendorA,
    issuerId: 'issuer.vendor-a',
    subject: f.nodeA,
    nodeId: 'node.vendor-a.001',
    vendor: 'vendor-a'
  });
  const statementB = nodeIdentity({
    issuer: f.vendorB,
    issuerId: 'issuer.vendor-b',
    subject: f.nodeB,
    nodeId: 'node.vendor-b.001',
    vendor: 'vendor-b'
  });
  const activeA = status({
    issuer: f.vendorA,
    issuerId: 'issuer.vendor-a',
    subjectId: 'node.vendor-a.001'
  });
  const revokedA = status({
    issuer: f.vendorA,
    issuerId: 'issuer.vendor-a',
    subjectId: 'node.vendor-a.001',
    state: 'revoked',
    sequence: 2,
    effectiveAt: '2026-09-18T16:04:30.000Z',
    reasonCode: 'operator-revoked'
  });
  const activeB = status({
    issuer: f.vendorB,
    issuerId: 'issuer.vendor-b',
    subjectId: 'node.vendor-b.001'
  });

  const a = admission({
    f,
    statement: statementA,
    statuses: [activeA, revokedA, activeB]
  });
  const b = admission({
    f,
    statement: statementB,
    statuses: [activeA, revokedA, activeB]
  });

  assert.equal(a.result, 'rejected');
  assert.equal(a.reason_code, 'status_revoked');
  assert.equal(b.result, 'admitted');
  assert.equal(b.reason_code, 'verified_supplied_current');
});

test('stale or missing status quarantines rather than silently promoting trust', () => {
  const f = fixture();
  const statementB = nodeIdentity({
    issuer: f.vendorB,
    issuerId: 'issuer.vendor-b',
    subject: f.nodeB,
    nodeId: 'node.vendor-b.001',
    vendor: 'vendor-b'
  });

  const missing = admission({ f, statement: statementB, statuses: [] });
  assert.equal(missing.result, 'quarantined');
  assert.equal(missing.reason_code, 'status_unknown');

  const stale = status({
    issuer: f.vendorB,
    issuerId: 'issuer.vendor-b',
    subjectId: 'node.vendor-b.001',
    effectiveAt: '2026-09-18T15:50:00.000Z'
  });
  const staleResult = admission({ f, statement: statementB, statuses: [stale] });

  assert.equal(staleResult.result, 'quarantined');
  assert.equal(staleResult.reason_code, 'status_stale');
  assert.equal(staleResult.status_state, 'stale');
  assert.ok(staleResult.status_age_seconds > 300);
});

test('expired trust bundle quarantines otherwise valid vendor evidence', () => {
  const f = fixture();
  const statementA = nodeIdentity({
    issuer: f.vendorA,
    issuerId: 'issuer.vendor-a',
    subject: f.nodeA,
    nodeId: 'node.vendor-a.001',
    vendor: 'vendor-a'
  });
  const activeA = status({
    issuer: f.vendorA,
    issuerId: 'issuer.vendor-a',
    subjectId: 'node.vendor-a.001'
  });

  const result = admission({
    f,
    statement: statementA,
    statuses: [activeA],
    at: '2026-09-18T18:00:01.000Z'
  });

  assert.equal(result.result, 'quarantined');
  assert.equal(result.reason_code, 'bundle_expired');
  assert.equal(result.authority_effect, 'none');
});

test('same-sequence contradictory status evidence quarantines as ambiguous', () => {
  const f = fixture();
  const statementA = nodeIdentity({
    issuer: f.vendorA,
    issuerId: 'issuer.vendor-a',
    subject: f.nodeA,
    nodeId: 'node.vendor-a.001',
    vendor: 'vendor-a'
  });
  const active = status({
    issuer: f.vendorA,
    issuerId: 'issuer.vendor-a',
    subjectId: 'node.vendor-a.001',
    state: 'active',
    sequence: 1
  });
  const revoked = status({
    issuer: f.vendorA,
    issuerId: 'issuer.vendor-a',
    subjectId: 'node.vendor-a.001',
    state: 'revoked',
    sequence: 1,
    reasonCode: 'operator-revoked'
  });

  const result = admission({
    f,
    statement: statementA,
    statuses: [active, revoked]
  });

  assert.equal(result.result, 'quarantined');
  assert.equal(result.reason_code, 'ambiguous_status');
  assert.equal(result.status_state, 'unknown');
});

test('trust-bundle root swap changes bundle identity and invalidates old vendor evidence', () => {
  const f = fixture();
  const newVendorB = keys();
  const replacementIssuers = [
    f.issuers[0],
    issuerEntry({
      id: 'issuer.vendor-b',
      domain: 'spiffe://vendor-b.example',
      key: newVendorB,
      prefixes: ['node.vendor-b.']
    })
  ];
  const replacement = createAmnTrustDomainBundle({
    bundleId: 'bundle.customer.001',
    customerDomain: 'spiffe://customer.example',
    customerPrivateKey: f.customer.privateKey,
    version: 2,
    issuedAt: '2026-09-18T16:02:00.000Z',
    validFrom: '2026-09-18T16:03:00.000Z',
    validUntil: VALID_UNTIL,
    issuers: replacementIssuers
  });

  assert.notEqual(replacement.bundle_digest, f.bundle.bundle_digest);

  const oldStatementB = nodeIdentity({
    issuer: f.vendorB,
    issuerId: 'issuer.vendor-b',
    subject: f.nodeB,
    nodeId: 'node.vendor-b.001',
    vendor: 'vendor-b'
  });
  const result = admission({
    f,
    bundle: replacement,
    statement: oldStatementB,
    statuses: [],
    at: EVALUATED_AT
  });

  assert.equal(result.result, 'rejected');
  assert.equal(result.reason_code, 'issuer_key_substitution');
  assert.equal(result.bundle_version, 2);
});

test('bundle version change rebinds admission evidence even with identical roots', () => {
  const f = fixture();
  const version2 = createAmnTrustDomainBundle({
    bundleId: 'bundle.customer.001',
    customerDomain: 'spiffe://customer.example',
    customerPrivateKey: f.customer.privateKey,
    version: 2,
    issuedAt: '2026-09-18T16:02:00.000Z',
    validFrom: '2026-09-18T16:03:00.000Z',
    validUntil: VALID_UNTIL,
    issuers: f.issuers
  });

  const statementA = nodeIdentity({
    issuer: f.vendorA,
    issuerId: 'issuer.vendor-a',
    subject: f.nodeA,
    nodeId: 'node.vendor-a.001',
    vendor: 'vendor-a'
  });
  const activeA = status({
    issuer: f.vendorA,
    issuerId: 'issuer.vendor-a',
    subjectId: 'node.vendor-a.001'
  });

  const v1 = admission({ f, statement: statementA, statuses: [activeA] });
  const v2 = admission({
    f,
    bundle: version2,
    statement: statementA,
    statuses: [activeA]
  });

  assert.equal(v1.result, 'admitted');
  assert.equal(v2.result, 'admitted');
  assert.notEqual(v1.bundle_digest, v2.bundle_digest);
  assert.notEqual(v1.admission_digest, v2.admission_digest);
  assert.equal(v1.bundle_version, 1);
  assert.equal(v2.bundle_version, 2);
});

test('domain snapshot aggregates evidence without creating pooled or federation authority', () => {
  const f = fixture();
  const statementA = nodeIdentity({
    issuer: f.vendorA,
    issuerId: 'issuer.vendor-a',
    subject: f.nodeA,
    nodeId: 'node.vendor-a.001',
    vendor: 'vendor-a'
  });
  const statementB = nodeIdentity({
    issuer: f.vendorB,
    issuerId: 'issuer.vendor-b',
    subject: f.nodeB,
    nodeId: 'node.vendor-b.001',
    vendor: 'vendor-b'
  });
  const activeA = status({
    issuer: f.vendorA,
    issuerId: 'issuer.vendor-a',
    subjectId: 'node.vendor-a.001'
  });
  const activeB = status({
    issuer: f.vendorB,
    issuerId: 'issuer.vendor-b',
    subjectId: 'node.vendor-b.001'
  });

  const a = admission({ f, statement: statementA, statuses: [activeA, activeB] });
  const b = admission({ f, statement: statementB, statuses: [activeA, activeB] });
  const snapshot = createAmnDomainSnapshot([b, a]);

  assert.equal(snapshot.schema, AMN_DOMAIN_SNAPSHOT_SCHEMA);
  assert.deepEqual(snapshot.counts, {
    admitted: 2,
    rejected: 0,
    quarantined: 0
  });
  assert.equal(snapshot.admitted_evidence_digests.length, 2);
  assert.equal(snapshot.authority_effect, 'none');
  assert.equal(snapshot.delegation_effect, 'none');
  assert.equal(snapshot.pooled_authority_effect, 'none');
  assert.equal(snapshot.federation_authority_effect, 'none');
  assert.equal(snapshot.global_currentness_claimed, false);
  assert.match(snapshot.snapshot_digest, /^[a-f0-9]{64}$/);
});

test('domain snapshot refuses duplicate admissions so counts cannot be inflated', () => {
  const f = fixture();
  const statementA = nodeIdentity({
    issuer: f.vendorA,
    issuerId: 'issuer.vendor-a',
    subject: f.nodeA,
    nodeId: 'node.vendor-a.001',
    vendor: 'vendor-a'
  });
  const activeA = status({
    issuer: f.vendorA,
    issuerId: 'issuer.vendor-a',
    subjectId: 'node.vendor-a.001'
  });
  const a = admission({ f, statement: statementA, statuses: [activeA] });

  assert.throws(
    () => createAmnDomainSnapshot([a, a]),
    /cannot count duplicate admissions/
  );
});

test('domain snapshot refuses to pool admissions from different customer trust bundles', () => {
  const f = fixture();
  const version2 = createAmnTrustDomainBundle({
    bundleId: 'bundle.customer.001',
    customerDomain: 'spiffe://customer.example',
    customerPrivateKey: f.customer.privateKey,
    version: 2,
    issuedAt: '2026-09-18T16:02:00.000Z',
    validFrom: '2026-09-18T16:03:00.000Z',
    validUntil: VALID_UNTIL,
    issuers: f.issuers
  });
  const statementA = nodeIdentity({
    issuer: f.vendorA,
    issuerId: 'issuer.vendor-a',
    subject: f.nodeA,
    nodeId: 'node.vendor-a.001',
    vendor: 'vendor-a'
  });
  const activeA = status({
    issuer: f.vendorA,
    issuerId: 'issuer.vendor-a',
    subjectId: 'node.vendor-a.001'
  });
  const statementB = nodeIdentity({
    issuer: f.vendorB,
    issuerId: 'issuer.vendor-b',
    subject: f.nodeB,
    nodeId: 'node.vendor-b.001',
    vendor: 'vendor-b'
  });
  const activeB = status({
    issuer: f.vendorB,
    issuerId: 'issuer.vendor-b',
    subjectId: 'node.vendor-b.001'
  });

  const a1 = admission({ f, statement: statementA, statuses: [activeA] });
  const a2 = admission({
    f,
    bundle: version2,
    statement: statementB,
    statuses: [activeB]
  });

  assert.throws(
    () => createAmnDomainSnapshot([a1, a2]),
    /cannot pool admissions from different trust bundles/
  );
});

test('admission digest rejects semantic mutation and remains non-authorizing', () => {
  const f = fixture();
  const statementA = nodeIdentity({
    issuer: f.vendorA,
    issuerId: 'issuer.vendor-a',
    subject: f.nodeA,
    nodeId: 'node.vendor-a.001',
    vendor: 'vendor-a'
  });
  const activeA = status({
    issuer: f.vendorA,
    issuerId: 'issuer.vendor-a',
    subjectId: 'node.vendor-a.001'
  });
  const result = admission({ f, statement: statementA, statuses: [activeA] });
  const tampered = structuredClone(result);
  tampered.pooled_authority_effect = 'execute';

  assert.throws(
    () => normalizeAmnDomainAdmission(tampered),
    /pooled_authority_effect must be none/
  );
});

test('trust-domain module is pure and has no Grid, Gateway, network, filesystem or policy import', async () => {
  const source = await readFile(
    new URL('../src/lib/amn-trust-domain.mjs', import.meta.url),
    'utf8'
  );
  const imports = [...source.matchAll(/from\s+['"](.+?)['"]/g)]
    .map(match => match[1])
    .sort();

  assert.deepEqual(imports, [
    './amn-trust-evidence.mjs',
    './canonical.mjs',
    'node:crypto'
  ]);
  for (const forbidden of [
    'node:fs',
    'node:net',
    'node:http',
    'node:https',
    'node:child_process',
    '/grid/',
    'gateway',
    'policy.mjs',
    'capabilities.json'
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});