import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { canonicalJson, digestObject, sha256 } from '../src/lib/canonical.mjs';
import { MeshIdentity } from '../src/lib/identity.mjs';
import {
  buildIntentExecutorAdmissionDossier,
  buildIntentExecutorPromotionCandidate,
  buildIntentExecutorReviewAttestation,
  normalizeIntentExecutorAdmissionDossier,
  normalizeIntentExecutorPromotionCandidate,
  requiredIntentExecutorAdmissionEvidenceAssertions,
  validateIntentExecutorAdmissionDossierCurrent,
  verifyIntentExecutorPromotionCandidate,
  verifyIntentExecutorReviewAttestation
} from '../src/lib/intent-executor-admission.mjs';
import { loadIntentExecutorRegistry } from '../src/lib/intent-execution-eligibility.mjs';

const policy = JSON.parse(await readFile(new URL('../config/policy.json', import.meta.url), 'utf8'));
const capabilities = JSON.parse(await readFile(new URL('../config/capabilities.json', import.meta.url), 'utf8'));
const registryPath = new URL('../config/intent-remediation-executors.json', import.meta.url);
const registryText = await readFile(registryPath, 'utf8');
const productionRegistry = await loadIntentExecutorRegistry(registryPath);

function signingIdentity(service) {
  const pair = generateKeyPairSync('ed25519');
  const privatePem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' });
  const publicPem = pair.publicKey.export({ type: 'spki', format: 'pem' });
  return new MeshIdentity(service, privatePem, publicPem);
}

function currentContext(overrides = {}) {
  return {
    executor_registry: productionRegistry,
    policy,
    capabilities,
    build: {
      kernel_version: '0.12.0-dev.3',
      source_digest: sha256('intent-v0.7-admission-source')
    },
    ...overrides
  };
}

function mapping(overrides = {}) {
  return {
    semantic_action: 'repo.tests.add',
    target_action: 'system.echo',
    capability_id: 'core.intent-loop',
    tool: 'builtin.echo',
    fixed_input: { value: 'v0.7 admission conformance only' },
    constraints: { conformance_only: true },
    ...overrides
  };
}

function evidence() {
  return requiredIntentExecutorAdmissionEvidenceAssertions().map(assertion => ({
    assertion,
    result: 'pass',
    artifact_digest: sha256(`artifact:${assertion}`),
    artifact_type: 'conformance-assertion',
    ref: `evidence:${assertion}`
  }));
}

function dossier(overrides = {}) {
  return buildIntentExecutorAdmissionDossier({
    candidate_mapping: mapping(),
    current_context: currentContext(),
    evidence: evidence(),
    producer: 'executor-dossier-producer',
    created_at: '2026-08-10T21:00:00.000Z',
    expires_at: '2026-08-11T21:00:00.000Z',
    ...overrides
  });
}

function reviewers(rawDossier = dossier()) {
  const security = signingIdentity('security-reviewer');
  const implementation = signingIdentity('implementation-reviewer');
  const securityReview = buildIntentExecutorReviewAttestation(rawDossier, {
    identity: security,
    review_role: 'security_authority',
    reviewed_at: '2026-08-10T21:05:00.000Z',
    expires_at: '2026-08-11T21:05:00.000Z'
  });
  const implementationReview = buildIntentExecutorReviewAttestation(rawDossier, {
    identity: implementation,
    review_role: 'implementation_conformance',
    reviewed_at: '2026-08-10T21:06:00.000Z',
    expires_at: '2026-08-11T21:06:00.000Z'
  });
  return {
    security,
    implementation,
    entries: [
      { review: securityReview, public_key: security.publicKey },
      { review: implementationReview, public_key: implementation.publicKey }
    ]
  };
}

function readdressDossier(raw) {
  const copy = structuredClone(raw);
  delete copy.dossier_id;
  delete copy.dossier_digest;
  const digest = digestObject(copy);
  return {
    ...copy,
    dossier_id: `intent-executor-dossier:${digest}`,
    dossier_digest: digest
  };
}

function readdressReview(raw) {
  const copy = structuredClone(raw);
  const signature = copy.signature;
  delete copy.signature;
  delete copy.review_id;
  delete copy.review_digest;
  const digest = digestObject({ body: copy, signature });
  return {
    ...copy,
    signature,
    review_id: `intent-executor-review:${digest}`,
    review_digest: digest
  };
}

test('production executor registry remains byte-for-byte empty', () => {
  assert.equal(registryText, '{\n  "schema": "axiom-intent-remediation-executor-registry.v1",\n  "kernel_version": "0.12.0-dev.3",\n  "mappings": []\n}\n');
  assert.deepEqual(productionRegistry.mappings, []);
});

test('admission dossier is deterministic, content-addressed, and contains no reviewer identity', () => {
  const first = dossier();
  const second = dossier();
  assert.deepEqual(first, second);
  assert.match(first.dossier_id, /^intent-executor-dossier:[a-f0-9]{64}$/);
  assert.equal(first.mapping_installed, false);
  assert.equal(first.execution_authorized, false);
  assert.equal(first.mapping.semantic_action, 'repo.tests.add');
  assert.equal(first.mapping.target_action, 'system.echo');
  assert.equal(first.effect_destination, 'local');
  assert.equal(first.policy_gates.risk, 'low');
  assert.deepEqual(first.policy_gates.required_scopes, ['intent:execute']);
  assert.ok(!canonicalJson(first).includes('reviewer'));
  assert.deepEqual(normalizeIntentExecutorAdmissionDossier(first), first);
  assert.deepEqual(
    validateIntentExecutorAdmissionDossierCurrent(first, currentContext(), {
      now: '2026-08-10T21:10:00.000Z'
    }),
    first
  );
});

test('all required negative-path evidence is mandatory and unique', () => {
  const incomplete = evidence().slice(1);
  assert.throws(() => dossier({ evidence: incomplete }), /exactly 8 required assertions/);

  const duplicate = evidence();
  duplicate[1] = structuredClone(duplicate[0]);
  assert.throws(() => dossier({ evidence: duplicate }), /must be unique|missing/);
});

test('wildcard, self-modifying, authority-control, unknown, denied, and tool-mismatched mappings fail admission', () => {
  assert.throws(() => dossier({
    candidate_mapping: mapping({ semantic_action: 'repo.*' })
  }), /invalid format|wildcard/);
  assert.throws(() => dossier({
    candidate_mapping: mapping({ semantic_action: 'intent.executor.add' })
  }), /self-modifying|authority-registry/);
  assert.throws(() => dossier({
    candidate_mapping: mapping({
      target_action: 'governance.propose',
      capability_id: 'governance.local-records',
      tool: 'builtin.validate-mutation'
    })
  }), /authority-control/);
  assert.throws(() => dossier({
    candidate_mapping: mapping({ target_action: 'missing.action' })
  }), /does not exist/);
  assert.throws(() => dossier({
    candidate_mapping: mapping({
      target_action: 'tests.weaken-for-pass',
      tool: 'builtin.echo'
    })
  }), /denied/);
  assert.throws(() => dossier({
    candidate_mapping: mapping({ tool: 'builtin.hash' })
  }), /does not match current policy/);
});

test('unimplemented capability and authority-override mapping constraints fail admission', () => {
  const disabled = structuredClone(capabilities);
  disabled.capabilities.find(item => item.id === 'core.intent-loop').status = 'disabled';
  assert.throws(() => dossier({
    current_context: currentContext({ capabilities: disabled })
  }), /not currently implemented/);

  assert.throws(() => dossier({
    candidate_mapping: mapping({
      constraints: { required_confirmations: 0 }
    })
  }), /cannot override authority field/);
});

test('re-hashing weakened authority facts does not make a dossier current', () => {
  const original = dossier();
  const tampered = structuredClone(original);
  tampered.policy_gates.required_scopes = [];
  tampered.policy_gates.required_confirmations = 0;
  const rehashed = readdressDossier(tampered);
  assert.deepEqual(normalizeIntentExecutorAdmissionDossier(rehashed), rehashed);
  assert.throws(
    () => validateIntentExecutorAdmissionDossierCurrent(rehashed, currentContext(), {
      now: '2026-08-10T21:10:00.000Z'
    }),
    /authority facts do not match current state/
  );
});

test('policy, capability, registry, and build drift invalidate dossier admission', () => {
  const original = dossier();

  const changedPolicy = structuredClone(policy);
  changedPolicy.v07_staleness_marker = 'changed-policy-digest';
  assert.throws(() => validateIntentExecutorAdmissionDossierCurrent(
    original,
    currentContext({ policy: changedPolicy }),
    { now: '2026-08-10T21:10:00.000Z' }
  ), /stale/);

  const changedCapabilities = structuredClone(capabilities);
  changedCapabilities.capabilities.find(item => item.id === 'core.intent-loop').claim = 'changed-for-staleness-test';
  assert.throws(() => validateIntentExecutorAdmissionDossierCurrent(
    original,
    currentContext({ capabilities: changedCapabilities }),
    { now: '2026-08-10T21:10:00.000Z' }
  ), /stale/);

  const changedRegistry = {
    schema: 'axiom-intent-remediation-executor-registry.v1',
    kernel_version: '0.12.0-dev.3',
    mappings: [{
      semantic_action: 'test.other',
      target_action: 'system.echo',
      capability_id: 'core.intent-loop',
      tool: 'builtin.echo',
      fixed_input: { value: 'unrelated mapping' },
      constraints: {}
    }]
  };
  assert.throws(() => validateIntentExecutorAdmissionDossierCurrent(
    original,
    currentContext({ executor_registry: changedRegistry }),
    { now: '2026-08-10T21:10:00.000Z' }
  ), /stale/);

  assert.throws(() => validateIntentExecutorAdmissionDossierCurrent(
    original,
    currentContext({
      build: {
        kernel_version: '0.12.0-dev.3',
        source_digest: sha256('different-build')
      }
    }),
    { now: '2026-08-10T21:10:00.000Z' }
  ), /stale/);
});

test('review attestations are signed, role-bound, current, and producer-independent', () => {
  const rawDossier = dossier();
  const bundle = reviewers(rawDossier);
  const securityReview = bundle.entries[0].review;
  assert.equal(securityReview.review_role, 'security_authority');
  assert.equal(securityReview.mapping_installed, false);
  assert.equal(securityReview.execution_authorized, false);
  assert.deepEqual(
    verifyIntentExecutorReviewAttestation(securityReview, rawDossier, {
      public_key: bundle.security.publicKey,
      now: '2026-08-10T21:10:00.000Z'
    }),
    securityReview
  );

  const producerIdentity = signingIdentity('executor-dossier-producer');
  assert.throws(() => buildIntentExecutorReviewAttestation(rawDossier, {
    identity: producerIdentity,
    review_role: 'security_authority',
    reviewed_at: '2026-08-10T21:05:00.000Z',
    expires_at: '2026-08-11T21:05:00.000Z'
  }), /cannot review its own dossier/);

  const tampered = structuredClone(securityReview);
  const signatureBytes = Buffer.from(tampered.signature.signature, 'base64url');
  signatureBytes[0] ^= 1;
  tampered.signature.signature = signatureBytes.toString('base64url');
  const readdressedTamper = readdressReview(tampered);
  assert.throws(() => verifyIntentExecutorReviewAttestation(readdressedTamper, rawDossier, {
    public_key: bundle.security.publicKey,
    now: '2026-08-10T21:10:00.000Z'
  }), /signature is invalid/);
});

test('promotion requires two distinct reviewer identities and both required roles', () => {
  const rawDossier = dossier();
  const shared = signingIdentity('shared-reviewer');
  const security = buildIntentExecutorReviewAttestation(rawDossier, {
    identity: shared,
    review_role: 'security_authority',
    reviewed_at: '2026-08-10T21:05:00.000Z',
    expires_at: '2026-08-11T21:05:00.000Z'
  });
  const implementation = buildIntentExecutorReviewAttestation(rawDossier, {
    identity: shared,
    review_role: 'implementation_conformance',
    reviewed_at: '2026-08-10T21:06:00.000Z',
    expires_at: '2026-08-11T21:06:00.000Z'
  });
  assert.throws(() => buildIntentExecutorPromotionCandidate({
    dossier: rawDossier,
    reviews: [
      { review: security, public_key: shared.publicKey },
      { review: implementation, public_key: shared.publicKey }
    ],
    current_context: currentContext(),
    now: '2026-08-10T21:10:00.000Z'
  }), /distinct identities/);

  const first = signingIdentity('first-reviewer');
  const second = signingIdentity('second-reviewer');
  const one = buildIntentExecutorReviewAttestation(rawDossier, {
    identity: first,
    review_role: 'security_authority',
    reviewed_at: '2026-08-10T21:05:00.000Z',
    expires_at: '2026-08-11T21:05:00.000Z'
  });
  const two = buildIntentExecutorReviewAttestation(rawDossier, {
    identity: second,
    review_role: 'security_authority',
    reviewed_at: '2026-08-10T21:06:00.000Z',
    expires_at: '2026-08-11T21:06:00.000Z'
  });
  assert.throws(() => buildIntentExecutorPromotionCandidate({
    dossier: rawDossier,
    reviews: [
      { review: one, public_key: first.publicKey },
      { review: two, public_key: second.publicKey }
    ],
    current_context: currentContext(),
    now: '2026-08-10T21:10:00.000Z'
  }), /requires security_authority and implementation_conformance/);
});

test('reviewed promotion candidate is content-addressed but has no installation or execution authority', () => {
  const rawDossier = dossier();
  const reviewBundle = reviewers(rawDossier);
  const candidate = buildIntentExecutorPromotionCandidate({
    dossier: rawDossier,
    reviews: reviewBundle.entries,
    current_context: currentContext(),
    now: '2026-08-10T21:10:00.000Z'
  });
  assert.match(candidate.promotion_id, /^intent-executor-promotion:[a-f0-9]{64}$/);
  assert.equal(candidate.mapping_installed, false);
  assert.equal(candidate.execution_authorized, false);
  assert.equal(candidate.installation_authority, null);
  assert.ok(!('install_action' in candidate));
  assert.ok(!('approval_ids' in candidate));
  assert.ok(!('confirmations' in candidate));
  assert.deepEqual(normalizeIntentExecutorPromotionCandidate(candidate), candidate);
  assert.deepEqual(verifyIntentExecutorPromotionCandidate(candidate, {
    dossier: rawDossier,
    reviews: reviewBundle.entries,
    current_context: currentContext(),
    now: '2026-08-10T21:10:00.000Z'
  }), candidate);
});

test('stale review/dossier context invalidates an already-built promotion candidate', () => {
  const rawDossier = dossier();
  const reviewBundle = reviewers(rawDossier);
  const candidate = buildIntentExecutorPromotionCandidate({
    dossier: rawDossier,
    reviews: reviewBundle.entries,
    current_context: currentContext(),
    now: '2026-08-10T21:10:00.000Z'
  });
  const changedPolicy = structuredClone(policy);
  changedPolicy.v07_staleness_marker = 'changed-policy-digest';
  assert.throws(() => verifyIntentExecutorPromotionCandidate(candidate, {
    dossier: rawDossier,
    reviews: reviewBundle.entries,
    current_context: currentContext({ policy: changedPolicy }),
    now: '2026-08-10T21:10:00.000Z'
  }), /stale/);

  assert.throws(() => verifyIntentExecutorPromotionCandidate(candidate, {
    dossier: rawDossier,
    reviews: reviewBundle.entries,
    current_context: currentContext(),
    now: '2026-08-12T21:10:00.000Z'
  }), /expired/);
});
