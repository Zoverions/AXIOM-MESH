import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { digestObject, sha256 } from '../src/lib/canonical.mjs';
import { MeshIdentity } from '../src/lib/identity.mjs';
import {
  buildIntentExecutorAdmissionDossier,
  buildIntentExecutorPromotionCandidate,
  buildIntentExecutorReviewAttestation,
  requiredIntentExecutorAdmissionEvidenceAssertions
} from '../src/lib/intent-executor-admission.mjs';
import {
  buildIntentExecutorApplicationReceipt,
  verifyIntentExecutorApplicationReceipt
} from '../src/lib/intent-executor-application-receipt.mjs';
import { loadIntentExecutorRegistry } from '../src/lib/intent-execution-eligibility.mjs';
import { buildIntentExecutorPromotionPackage } from '../src/lib/intent-executor-promotion-package.mjs';

const policy = JSON.parse(await readFile(new URL('../config/policy.json', import.meta.url), 'utf8'));
const capabilities = JSON.parse(await readFile(new URL('../config/capabilities.json', import.meta.url), 'utf8'));
const registryUrl = new URL('../config/intent-remediation-executors.json', import.meta.url);
const preBytes = await readFile(registryUrl, 'utf8');
const registry = await loadIntentExecutorRegistry(registryUrl);

function identity(service) {
  const pair = generateKeyPairSync('ed25519');
  return new MeshIdentity(
    service,
    pair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    pair.publicKey.export({ type: 'spki', format: 'pem' })
  );
}

function context(overrides = {}) {
  return {
    executor_registry: registry,
    policy,
    capabilities,
    build: {
      kernel_version: '0.12.0-dev.3',
      source_digest: sha256('v0.9-application-receipt-source')
    },
    ...overrides
  };
}

function mapping() {
  return {
    semantic_action: 'repo.tests.add',
    target_action: 'system.echo',
    capability_id: 'core.intent-loop',
    tool: 'builtin.echo',
    fixed_input: { value: 'v0.9 application receipt conformance only' },
    constraints: { conformance_only: true }
  };
}

function evidence() {
  return requiredIntentExecutorAdmissionEvidenceAssertions().map(assertion => ({
    assertion,
    result: 'pass',
    artifact_digest: sha256(`v09:${assertion}`),
    artifact_type: 'conformance-assertion',
    ref: `evidence:v09:${assertion}`
  }));
}

function fixture() {
  const currentContext = context();
  const dossier = buildIntentExecutorAdmissionDossier({
    candidate_mapping: mapping(),
    current_context: currentContext,
    evidence: evidence(),
    producer: 'v09-producer',
    created_at: '2026-08-10T21:50:00.000Z',
    expires_at: '2026-08-11T21:50:00.000Z'
  });
  const security = identity('v09-security-reviewer');
  const implementation = identity('v09-implementation-reviewer');
  const reviews = [
    {
      review: buildIntentExecutorReviewAttestation(dossier, {
        identity: security,
        review_role: 'security_authority',
        reviewed_at: '2026-08-10T21:51:00.000Z',
        expires_at: '2026-08-11T21:51:00.000Z'
      }),
      public_key: security.publicKey
    },
    {
      review: buildIntentExecutorReviewAttestation(dossier, {
        identity: implementation,
        review_role: 'implementation_conformance',
        reviewed_at: '2026-08-10T21:52:00.000Z',
        expires_at: '2026-08-11T21:52:00.000Z'
      }),
      public_key: implementation.publicKey
    }
  ];
  const candidate = buildIntentExecutorPromotionCandidate({
    dossier,
    reviews,
    current_context: currentContext,
    now: '2026-08-10T21:55:00.000Z'
  });
  const promotionPackage = buildIntentExecutorPromotionPackage({
    promotion_candidate: candidate,
    dossier,
    reviews,
    current_context: currentContext,
    current_registry_bytes: preBytes,
    now: '2026-08-10T21:55:00.000Z'
  });
  return {
    currentContext,
    dossier,
    reviews,
    candidate,
    promotionPackage,
    postBytes: promotionPackage.proposed_registry.utf8
  };
}

function receiptFixture() {
  const base = fixture();
  const verifier = identity('v09-application-verifier');
  const receipt = buildIntentExecutorApplicationReceipt({
    promotion_package: base.promotionPackage,
    promotion_candidate: base.candidate,
    dossier: base.dossier,
    reviews: base.reviews,
    current_context: base.currentContext,
    pre_registry_bytes: preBytes,
    post_registry_bytes: base.postBytes,
    identity: verifier,
    verified_at: '2026-08-10T21:56:00.000Z',
    source_revision: 'release/v0.9-test',
    release_context: { channel: 'conformance', operator_ticket: 'TEST-009' },
    now: '2026-08-10T21:56:00.000Z'
  });
  return { ...base, verifier, receipt };
}

function readdressReceipt(raw) {
  const copy = structuredClone(raw);
  const signature = copy.signature;
  delete copy.signature;
  delete copy.receipt_id;
  delete copy.receipt_digest;
  const digest = digestObject({ body: copy, signature });
  return {
    ...copy,
    signature,
    receipt_id: `intent-executor-application-receipt:${digest}`,
    receipt_digest: digest
  };
}

test('exact external application produces a signed non-executing receipt', () => {
  const { receipt, verifier, ...base } = receiptFixture();
  assert.equal(receipt.application_verified, true);
  assert.equal(receipt.mapping_installed_observed, true);
  assert.equal(receipt.apply_authorized, false);
  assert.equal(receipt.execution_authorized, false);
  assert.equal(receipt.remediation_execution_observed, false);
  assert.equal(receipt.semantic_action, 'repo.tests.add');
  assert.equal(receipt.pre_registry.file_bytes_digest, sha256(preBytes));
  assert.equal(receipt.post_registry.file_bytes_digest, sha256(base.postBytes));
  assert.equal(receipt.post_registry.file_bytes_digest, receipt.package_proposed_registry.file_bytes_digest);
  assert.match(receipt.receipt_id, /^intent-executor-application-receipt:[a-f0-9]{64}$/);
  assert.ok(!('apply' in receipt));
  assert.ok(!('approval_ids' in receipt));
  assert.ok(!('confirmations' in receipt));

  assert.deepEqual(verifyIntentExecutorApplicationReceipt(receipt, {
    promotion_package: base.promotionPackage,
    promotion_candidate: base.candidate,
    dossier: base.dossier,
    reviews: base.reviews,
    current_context: base.currentContext,
    pre_registry_bytes: preBytes,
    post_registry_bytes: base.postBytes,
    public_key: verifier.publicKey,
    now: '2026-08-10T21:57:00.000Z'
  }), receipt);
});

test('wrong pre bytes fail closed even if semantically equivalent', () => {
  const base = fixture();
  const verifier = identity('v09-application-verifier');
  const changedPre = `${preBytes.trim()}  \n`;
  assert.throws(() => buildIntentExecutorApplicationReceipt({
    promotion_package: base.promotionPackage,
    promotion_candidate: base.candidate,
    dossier: base.dossier,
    reviews: base.reviews,
    current_context: base.currentContext,
    pre_registry_bytes: changedPre,
    post_registry_bytes: base.postBytes,
    identity: verifier,
    verified_at: '2026-08-10T21:56:00.000Z',
    now: '2026-08-10T21:56:00.000Z'
  }), /exact current reviewed promotion state|pre-application registry/);
});

test('byte-different post content fails even when JSON semantics are equivalent', () => {
  const base = fixture();
  const verifier = identity('v09-application-verifier');
  const equivalentPost = `${base.postBytes.trim()}  \n`;
  assert.throws(() => buildIntentExecutorApplicationReceipt({
    promotion_package: base.promotionPackage,
    promotion_candidate: base.candidate,
    dossier: base.dossier,
    reviews: base.reviews,
    current_context: base.currentContext,
    pre_registry_bytes: preBytes,
    post_registry_bytes: equivalentPost,
    identity: verifier,
    verified_at: '2026-08-10T21:56:00.000Z',
    now: '2026-08-10T21:56:00.000Z'
  }), /bytes do not exactly match/);
});

test('semantic post drift, extra additions, and mapping mutation fail closed', () => {
  const base = fixture();
  const verifier = identity('v09-application-verifier');
  const document = JSON.parse(base.postBytes);
  document.mappings[0].fixed_input.value = 'tampered';
  const changed = `${JSON.stringify(document, null, 2)}\n`;
  assert.throws(() => buildIntentExecutorApplicationReceipt({
    promotion_package: base.promotionPackage,
    promotion_candidate: base.candidate,
    dossier: base.dossier,
    reviews: base.reviews,
    current_context: base.currentContext,
    pre_registry_bytes: preBytes,
    post_registry_bytes: changed,
    identity: verifier,
    verified_at: '2026-08-10T21:56:00.000Z',
    now: '2026-08-10T21:56:00.000Z'
  }), /bytes do not exactly match|checksums/);
});

test('dossier producer and mapping reviewers cannot self-certify application', () => {
  const base = fixture();
  for (const service of ['v09-producer', 'v09-security-reviewer', 'v09-implementation-reviewer']) {
    const verifier = identity(service);
    assert.throws(() => buildIntentExecutorApplicationReceipt({
      promotion_package: base.promotionPackage,
      promotion_candidate: base.candidate,
      dossier: base.dossier,
      reviews: base.reviews,
      current_context: base.currentContext,
      pre_registry_bytes: preBytes,
      post_registry_bytes: base.postBytes,
      identity: verifier,
      verified_at: '2026-08-10T21:56:00.000Z',
      now: '2026-08-10T21:56:00.000Z'
    }), /must be independent/);
  }
});

test('stale reviewed state prevents application receipt construction', () => {
  const base = fixture();
  const verifier = identity('v09-application-verifier');
  const changedPolicy = structuredClone(policy);
  changedPolicy.v09_staleness_marker = 'changed';
  assert.throws(() => buildIntentExecutorApplicationReceipt({
    promotion_package: base.promotionPackage,
    promotion_candidate: base.candidate,
    dossier: base.dossier,
    reviews: base.reviews,
    current_context: context({ policy: changedPolicy }),
    pre_registry_bytes: preBytes,
    post_registry_bytes: base.postBytes,
    identity: verifier,
    verified_at: '2026-08-10T21:56:00.000Z',
    now: '2026-08-10T21:56:00.000Z'
  }), /stale/);
});

test('signature tampering fails even after receipt content address is recomputed', () => {
  const { receipt, verifier, ...base } = receiptFixture();
  const tampered = structuredClone(receipt);
  const bytes = Buffer.from(tampered.signature.signature, 'base64url');
  bytes[0] ^= 1;
  tampered.signature.signature = bytes.toString('base64url');
  const readdressed = readdressReceipt(tampered);
  assert.throws(() => verifyIntentExecutorApplicationReceipt(readdressed, {
    promotion_package: base.promotionPackage,
    promotion_candidate: base.candidate,
    dossier: base.dossier,
    reviews: base.reviews,
    current_context: base.currentContext,
    pre_registry_bytes: preBytes,
    post_registry_bytes: base.postBytes,
    public_key: verifier.publicKey,
    now: '2026-08-10T21:57:00.000Z'
  }), /signature is invalid/);
});

test('re-addressing a tampered receipt body does not bypass exact-state verification', () => {
  const { receipt, verifier, ...base } = receiptFixture();
  const tampered = structuredClone(receipt);
  tampered.release_context.operator_ticket = 'FORGED-009';
  const readdressed = readdressReceipt(tampered);
  assert.throws(() => verifyIntentExecutorApplicationReceipt(readdressed, {
    promotion_package: base.promotionPackage,
    promotion_candidate: base.candidate,
    dossier: base.dossier,
    reviews: base.reviews,
    current_context: base.currentContext,
    pre_registry_bytes: preBytes,
    post_registry_bytes: base.postBytes,
    public_key: verifier.publicKey,
    now: '2026-08-10T21:57:00.000Z'
  }), /signature is invalid|does not match/);
});
