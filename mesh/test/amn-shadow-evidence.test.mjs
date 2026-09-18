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
  AMN_SHADOW_RECORD_SCHEMA,
  AMN_SHADOW_RECEIPT_SCHEMA,
  AMN_TRUST_PROVIDER_RESULT_SCHEMA,
  AMN_VERIFICATION_RESULT_SCHEMA,
  AmnShadowEvidenceQueue,
  createAxiomShadowAmnTrustProvider,
  createAmnShadowReceipt,
  createLocalAmnTrustProvider,
  normalizeAmnVerificationResult
} from '../src/lib/amn-shadow-evidence.mjs';

const ISSUED_AT = '2026-09-18T16:00:00.000Z';
const SHADOW_AT = '2026-09-18T16:00:01.000Z';
const ACCEPTED_AT = '2026-09-18T16:00:02.000Z';

function keys() {
  return generateKeyPairSync('ed25519');
}

function trusted(issuer) {
  return {
    'issuer.customer.assurance': issuer.publicKey
  };
}

function nodeStatement({ issuer, subject, nodeId = 'node.vendor-a.001', issuedAt = ISSUED_AT } = {}) {
  const publicKey = subject.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  return createAmnTrustStatement({
    schema: AMN_TRUST_SCHEMAS.node_identity,
    issuerId: 'issuer.customer.assurance',
    issuerPrivateKey: issuer.privateKey,
    issuedAt,
    claims: {
      node_id: nodeId,
      trust_domain: 'spiffe://customer.example',
      platform_vendor: 'vendor-a',
      platform_family: 'airframe-alpha',
      identity_method: 'software-key',
      subject_key_id: amnTrustKeyId(subject.publicKey),
      subject_public_key: publicKey
    }
  });
}

test('local and AXIOM-shadow providers expose one normalized provider result shape', () => {
  const issuer = keys();
  const subject = keys();
  const statement = nodeStatement({ issuer, subject });

  const local = createLocalAmnTrustProvider({ trustedIssuers: trusted(issuer) });
  const shadow = createAxiomShadowAmnTrustProvider({ trustedIssuers: trusted(issuer) });

  const localResult = local.verify(statement);
  const shadowResult = shadow.verify(statement, { shadowAt: SHADOW_AT });

  assert.equal(localResult.schema, AMN_TRUST_PROVIDER_RESULT_SCHEMA);
  assert.equal(shadowResult.schema, AMN_TRUST_PROVIDER_RESULT_SCHEMA);
  assert.equal(localResult.verification.schema, AMN_VERIFICATION_RESULT_SCHEMA);
  assert.equal(shadowResult.verification.schema, AMN_VERIFICATION_RESULT_SCHEMA);
  assert.equal(localResult.verification.trust_state, 'verified');
  assert.equal(shadowResult.verification.trust_state, 'verified');
  assert.equal(localResult.verification.evidence_digest, shadowResult.verification.evidence_digest);
  assert.equal(localResult.verification.statement_digest, shadowResult.verification.statement_digest);
  assert.equal(localResult.shadow.status, 'disabled');
  assert.equal(shadowResult.shadow.status, 'queued');
});

test('shadow record binds the exact verified AMN evidence digest and claims no Grid persistence', () => {
  const issuer = keys();
  const subject = keys();
  const statement = nodeStatement({ issuer, subject });
  const provider = createAxiomShadowAmnTrustProvider({ trustedIssuers: trusted(issuer) });

  const result = provider.verify(statement, { shadowAt: SHADOW_AT });
  const [record] = provider.queue.history();

  assert.equal(record.schema, AMN_SHADOW_RECORD_SCHEMA);
  assert.equal(record.source_evidence_digest, statement.evidence_digest);
  assert.equal(record.source_statement_digest, statement.statement_digest);
  assert.equal(record.verification_result_digest, result.verification.verification_result_digest);
  assert.equal(record.authority_effect, 'none');
  assert.equal(record.delegation_effect, 'none');
  assert.equal(record.runtime_authority_changed, false);
  assert.equal(record.grid_persistence_claimed, false);
  assert.equal(result.shadow.record_digest, record.shadow_record_digest);
});

test('unknown issuer is rejected locally and never enters the shadow queue', () => {
  const issuer = keys();
  const wrongIssuer = keys();
  const subject = keys();
  const statement = nodeStatement({ issuer, subject });
  const provider = createAxiomShadowAmnTrustProvider({
    trustedIssuers: trusted(wrongIssuer)
  });

  const result = provider.verify(statement, { shadowAt: SHADOW_AT });

  assert.equal(result.verification.trust_state, 'rejected');
  assert.equal(result.verification.reason_code, 'issuer_key_substitution');
  assert.equal(result.shadow.status, 'not-queued');
  assert.equal(provider.queue.history().length, 0);
});

test('serialized or caller-fabricated verification results cannot be laundered into shadow history', () => {
  const issuer = keys();
  const subject = keys();
  const statement = nodeStatement({ issuer, subject });
  const local = createLocalAmnTrustProvider({ trustedIssuers: trusted(issuer) });
  const queue = new AmnShadowEvidenceQueue();
  const result = local.verify(statement);

  assert.equal(result.verification.trust_state, 'verified');
  assert.throws(
    () => queue.enqueue(result.verification, { at: SHADOW_AT }),
    /requires provider-produced verification/
  );

  const fabricated = structuredClone(result.verification);
  fabricated.provider_kind = 'axiom-shadow';
  const { verification_result_digest: _old, ...core } = fabricated;
  fabricated.verification_result_digest = digestObject(core);

  assert.throws(
    () => queue.enqueue(fabricated, { at: SHADOW_AT }),
    /requires provider-produced verification/
  );
  assert.equal(queue.history().length, 0);
});

test('shadow-path failure cannot change a verified local trust result', () => {
  const issuer = keys();
  const subject = keys();
  const statement = nodeStatement({ issuer, subject });
  const throwingQueue = Object.freeze({
    enqueue() {
      throw new Error('sink unavailable');
    }
  });
  const provider = createAxiomShadowAmnTrustProvider({
    trustedIssuers: trusted(issuer),
    queue: throwingQueue
  });

  const result = provider.verify(statement, { shadowAt: SHADOW_AT });

  assert.equal(result.verification.trust_state, 'verified');
  assert.equal(result.verification.cryptographic_validity, true);
  assert.equal(result.verification.authority_effect, 'none');
  assert.equal(result.shadow.status, 'failed');
  assert.equal(result.shadow.reason_code, 'shadow_path_unavailable');
});

test('omitting shadow timestamp fails the shadow path without changing local verification', () => {
  const issuer = keys();
  const subject = keys();
  const statement = nodeStatement({ issuer, subject });
  const provider = createAxiomShadowAmnTrustProvider({ trustedIssuers: trusted(issuer) });

  const result = provider.verify(statement);

  assert.equal(result.verification.trust_state, 'verified');
  assert.equal(result.shadow.status, 'failed');
  assert.equal(provider.queue.history().length, 0);
});

test('exact duplicate evidence deduplicates deterministically without rewriting history', () => {
  const issuer = keys();
  const subject = keys();
  const statement = nodeStatement({ issuer, subject });
  const provider = createAxiomShadowAmnTrustProvider({ trustedIssuers: trusted(issuer) });

  const first = provider.verify(statement, { shadowAt: SHADOW_AT });
  const second = provider.verify(statement, { shadowAt: '2026-09-18T16:00:03.000Z' });

  assert.equal(first.shadow.status, 'queued');
  assert.equal(second.shadow.status, 'duplicate');
  assert.equal(first.shadow.sequence, second.shadow.sequence);
  assert.equal(first.shadow.record_digest, second.shadow.record_digest);
  assert.equal(provider.queue.history().length, 1);
});

test('full shadow queue fails shadowing but does not revoke or downgrade local trust', () => {
  const issuer = keys();
  const subject = keys();
  const queue = new AmnShadowEvidenceQueue({ maxEntries: 1 });
  const provider = createAxiomShadowAmnTrustProvider({
    trustedIssuers: trusted(issuer),
    queue
  });

  const first = provider.verify(
    nodeStatement({ issuer, subject, nodeId: 'node.vendor-a.001' }),
    { shadowAt: SHADOW_AT }
  );
  const second = provider.verify(
    nodeStatement({ issuer, subject, nodeId: 'node.vendor-a.002' }),
    { shadowAt: '2026-09-18T16:00:03.000Z' }
  );

  assert.equal(first.shadow.status, 'queued');
  assert.equal(second.verification.trust_state, 'verified');
  assert.equal(second.shadow.status, 'failed');
  assert.equal(queue.history().length, 1);
});

test('shadow acknowledgements are monotonic, exact-digest-bound and idempotent', () => {
  const issuer = keys();
  const subject = keys();
  const queue = new AmnShadowEvidenceQueue();
  const provider = createAxiomShadowAmnTrustProvider({
    trustedIssuers: trusted(issuer),
    queue
  });

  provider.verify(
    nodeStatement({ issuer, subject, nodeId: 'node.vendor-a.001' }),
    { shadowAt: SHADOW_AT }
  );
  provider.verify(
    nodeStatement({ issuer, subject, nodeId: 'node.vendor-a.002' }),
    { shadowAt: '2026-09-18T16:00:03.000Z' }
  );

  const [first, second] = queue.history();
  const secondReceipt = createAmnShadowReceipt(second, {
    sinkKind: 'test-shadow-sink',
    sinkReceiptId: 'receipt.002',
    acceptedAt: '2026-09-18T16:00:05.000Z'
  });

  assert.throws(() => queue.acknowledge(secondReceipt), /out of order/);

  const firstReceipt = createAmnShadowReceipt(first, {
    sinkKind: 'test-shadow-sink',
    sinkReceiptId: 'receipt.001',
    acceptedAt: ACCEPTED_AT
  });
  const acknowledged = queue.acknowledge(firstReceipt);
  const duplicate = queue.acknowledge(firstReceipt);

  assert.equal(firstReceipt.schema, AMN_SHADOW_RECEIPT_SCHEMA);
  assert.equal(acknowledged.status, 'acknowledged');
  assert.equal(duplicate.status, 'duplicate');
  assert.equal(queue.pending().length, 1);
  assert.equal(queue.pending()[0].sequence, 2);
  assert.equal(queue.history().length, 2);
  assert.equal(queue.history()[0].shadow_record_digest, first.shadow_record_digest);
});

test('receipt digest or source-evidence substitution fails closed', () => {
  const issuer = keys();
  const subject = keys();
  const queue = new AmnShadowEvidenceQueue();
  const provider = createAxiomShadowAmnTrustProvider({
    trustedIssuers: trusted(issuer),
    queue
  });

  provider.verify(nodeStatement({ issuer, subject }), { shadowAt: SHADOW_AT });
  const [record] = queue.history();
  const receipt = createAmnShadowReceipt(record, {
    sinkKind: 'test-shadow-sink',
    sinkReceiptId: 'receipt.001',
    acceptedAt: ACCEPTED_AT
  });

  const tampered = structuredClone(receipt);
  tampered.source_evidence_digest = digestObject({ attacker: true });

  assert.throws(() => queue.acknowledge(tampered), /receipt digest mismatch/);
  assert.equal(queue.snapshot().acknowledged_sequence, 0);
});

test('queue snapshot preserves append-only history and cannot claim authority or persistence', () => {
  const issuer = keys();
  const subject = keys();
  const queue = new AmnShadowEvidenceQueue();
  const provider = createAxiomShadowAmnTrustProvider({
    trustedIssuers: trusted(issuer),
    queue
  });

  provider.verify(nodeStatement({ issuer, subject }), { shadowAt: SHADOW_AT });
  const before = queue.snapshot();
  const [record] = queue.history();
  const receipt = createAmnShadowReceipt(record, {
    sinkKind: 'axiom-grid-shadow-candidate',
    sinkReceiptId: 'candidate.receipt.001',
    acceptedAt: ACCEPTED_AT
  });
  queue.acknowledge(receipt);
  const after = queue.snapshot();

  assert.equal(before.history_record_digests.length, 1);
  assert.deepEqual(after.history_record_digests, before.history_record_digests);
  assert.equal(after.receipt_digests.length, 1);
  assert.equal(after.pending_record_digests.length, 0);
  assert.equal(after.authority_effect, 'none');
  assert.equal(after.delegation_effect, 'none');
  assert.equal(after.grid_persistence_claimed, false);
  assert.notEqual(before.snapshot_digest, after.snapshot_digest);
});

test('verification result digest detects semantic mutation before shadowing', () => {
  const issuer = keys();
  const subject = keys();
  const local = createLocalAmnTrustProvider({ trustedIssuers: trusted(issuer) });
  const result = local.verify(nodeStatement({ issuer, subject }));
  const tampered = structuredClone(result.verification);
  tampered.authority_effect = 'execute';

  assert.throws(
    () => normalizeAmnVerificationResult(tampered),
    /authority_effect must be none/
  );
});

test('Mode-1 shadow module contains no network, filesystem, Grid, Gateway or policy import', async () => {
  const source = await readFile(
    new URL('../src/lib/amn-shadow-evidence.mjs', import.meta.url),
    'utf8'
  );
  const imports = [...source.matchAll(/from\s+['"](.+?)['"]/g)]
    .map(match => match[1])
    .sort();

  assert.deepEqual(imports, [
    './amn-trust-evidence.mjs',
    './canonical.mjs'
  ]);
  for (const forbidden of [
    "node:fs",
    "node:net",
    "node:http",
    "node:https",
    "node:child_process",
    "/grid/",
    "gateway",
    "policy.mjs"
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});
