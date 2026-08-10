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
import { loadIntentExecutorRegistry } from '../src/lib/intent-execution-eligibility.mjs';
import {
  INTENT_EXECUTOR_PROMOTION_PACKAGE_SCHEMA,
  INTENT_EXECUTOR_REGISTRY_PATH,
  buildIntentExecutorPromotionPackage,
  normalizeIntentExecutorPromotionPackage,
  verifyIntentExecutorPromotionPackage
} from '../src/lib/intent-executor-promotion-package.mjs';

const policy = JSON.parse(await readFile(new URL('../config/policy.json', import.meta.url), 'utf8'));
const capabilities = JSON.parse(await readFile(new URL('../config/capabilities.json', import.meta.url), 'utf8'));
const registryUrl = new URL('../config/intent-remediation-executors.json', import.meta.url);
const registryBytes = await readFile(registryUrl, 'utf8');
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
      source_digest: sha256('v0.8-promotion-package-source')
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
    fixed_input: { value: 'v0.8 offline package conformance only' },
    constraints: { conformance_only: true },
    ...overrides
  };
}

function evidence() {
  return requiredIntentExecutorAdmissionEvidenceAssertions().map(assertion => ({
    assertion,
    result: 'pass',
    artifact_digest: sha256(`v08:${assertion}`),
    artifact_type: 'conformance-assertion',
    ref: `evidence:v08:${assertion}`
  }));
}

function reviewedPromotionFixture() {
  const currentContext = context();
  const dossier = buildIntentExecutorAdmissionDossier({
    candidate_mapping: mapping(),
    current_context: currentContext,
    evidence: evidence(),
    producer: 'v08-producer',
    created_at: '2026-08-10T21:40:00.000Z',
    expires_at: '2026-08-11T21:40:00.000Z'
  });
  const security = identity('v08-security-reviewer');
  const implementation = identity('v08-implementation-reviewer');
  const reviews = [
    {
      review: buildIntentExecutorReviewAttestation(dossier, {
        identity: security,
        review_role: 'security_authority',
        reviewed_at: '2026-08-10T21:41:00.000Z',
        expires_at: '2026-08-11T21:41:00.000Z'
      }),
      public_key: security.publicKey
    },
    {
      review: buildIntentExecutorReviewAttestation(dossier, {
        identity: implementation,
        review_role: 'implementation_conformance',
        reviewed_at: '2026-08-10T21:42:00.000Z',
        expires_at: '2026-08-11T21:42:00.000Z'
      }),
      public_key: implementation.publicKey
    }
  ];
  const candidate = buildIntentExecutorPromotionCandidate({
    dossier,
    reviews,
    current_context: currentContext,
    now: '2026-08-10T21:45:00.000Z'
  });
  return { currentContext, dossier, reviews, candidate };
}

function packageFixture(overrides = {}) {
  const fixture = reviewedPromotionFixture();
  const promotionPackage = buildIntentExecutorPromotionPackage({
    promotion_candidate: fixture.candidate,
    dossier: fixture.dossier,
    reviews: fixture.reviews,
    current_context: fixture.currentContext,
    current_registry_bytes: registryBytes,
    now: '2026-08-10T21:45:00.000Z',
    ...overrides
  });
  return { ...fixture, promotionPackage };
}

function readdressPackage(raw) {
  const copy = structuredClone(raw);
  delete copy.package_id;
  delete copy.package_digest;
  const digest = digestObject(copy);
  return {
    ...copy,
    package_id: `intent-executor-promotion-package:${digest}`,
    package_digest: digest
  };
}

test('offline promotion package is deterministic, content-addressed, and non-applying', () => {
  const fixture = reviewedPromotionFixture();
  const first = buildIntentExecutorPromotionPackage({
    promotion_candidate: fixture.candidate,
    dossier: fixture.dossier,
    reviews: fixture.reviews,
    current_context: fixture.currentContext,
    current_registry_bytes: registryBytes,
    now: '2026-08-10T21:45:00.000Z'
  });
  const second = buildIntentExecutorPromotionPackage({
    promotion_candidate: fixture.candidate,
    dossier: fixture.dossier,
    reviews: fixture.reviews,
    current_context: fixture.currentContext,
    current_registry_bytes: registryBytes,
    now: '2026-08-10T21:45:00.000Z'
  });

  assert.deepEqual(first, second);
  assert.equal(first.schema, INTENT_EXECUTOR_PROMOTION_PACKAGE_SCHEMA);
  assert.match(first.package_id, /^intent-executor-promotion-package:[a-f0-9]{64}$/);
  assert.equal(first.destination.path, INTENT_EXECUTOR_REGISTRY_PATH);
  assert.equal(first.destination.mutation_performed, false);
  assert.equal(first.patch.operation, 'add_exactly_one_mapping');
  assert.equal(first.patch.base_mapping_count, 0);
  assert.equal(first.patch.proposed_mapping_count, 1);
  assert.equal(first.patch.existing_mapping_modifications, 0);
  assert.equal(first.patch.existing_mapping_deletions, 0);
  assert.equal(first.apply_authorized, false);
  assert.equal(first.mapping_installed, false);
  assert.equal(first.execution_authorized, false);
  assert.equal(first.installation_authority, null);
  assert.ok(!('apply' in first));
  assert.ok(!('command' in first));
  assert.ok(!('approval_ids' in first));
  assert.ok(!('confirmations' in first));
  assert.deepEqual(normalizeIntentExecutorPromotionPackage(first), first);
});

test('proposed registry bytes are a valid exact one-mapping addition', async () => {
  const { promotionPackage } = packageFixture();
  const proposedDocument = JSON.parse(promotionPackage.proposed_registry.utf8);
  assert.equal(proposedDocument.schema, 'axiom-intent-remediation-executor-registry.v1');
  assert.equal(proposedDocument.mappings.length, 1);
  assert.equal(proposedDocument.mappings[0].semantic_action, 'repo.tests.add');
  assert.equal(proposedDocument.mappings[0].target_action, 'system.echo');
  assert.equal(sha256(promotionPackage.proposed_registry.utf8), promotionPackage.proposed_registry.file_bytes_digest);
  assert.equal(sha256(registryBytes), promotionPackage.base_registry.file_bytes_digest);
});

test('package verification reproduces the exact current reviewed promotion state', () => {
  const fixture = packageFixture();
  assert.deepEqual(verifyIntentExecutorPromotionPackage(fixture.promotionPackage, {
    promotion_candidate: fixture.candidate,
    dossier: fixture.dossier,
    reviews: fixture.reviews,
    current_context: fixture.currentContext,
    current_registry_bytes: registryBytes,
    now: '2026-08-10T21:45:00.000Z'
  }), fixture.promotionPackage);
});

test('base registry byte drift fails closed even when JSON semantics are unchanged', () => {
  const fixture = reviewedPromotionFixture();
  const semanticallyEquivalentBytes = `${registryBytes.trim()}  \n`;
  const built = buildIntentExecutorPromotionPackage({
    promotion_candidate: fixture.candidate,
    dossier: fixture.dossier,
    reviews: fixture.reviews,
    current_context: fixture.currentContext,
    current_registry_bytes: semanticallyEquivalentBytes,
    now: '2026-08-10T21:45:00.000Z'
  });
  assert.notEqual(built.base_registry.file_bytes_digest, sha256(registryBytes));

  assert.throws(() => verifyIntentExecutorPromotionPackage(built, {
    promotion_candidate: fixture.candidate,
    dossier: fixture.dossier,
    reviews: fixture.reviews,
    current_context: fixture.currentContext,
    current_registry_bytes: registryBytes,
    now: '2026-08-10T21:45:00.000Z'
  }), /does not match the exact current reviewed promotion state/);
});

test('base registry semantic drift and duplicate semantic action fail closed', () => {
  const fixture = reviewedPromotionFixture();
  const differentRegistryBytes = `${JSON.stringify({
    schema: 'axiom-intent-remediation-executor-registry.v1',
    kernel_version: '0.12.0-dev.3',
    mappings: [{
      semantic_action: 'test.other',
      target_action: 'system.echo',
      capability_id: 'core.intent-loop',
      tool: 'builtin.echo',
      fixed_input: { value: 'other' },
      constraints: {}
    }]
  }, null, 2)}\n`;
  assert.throws(() => buildIntentExecutorPromotionPackage({
    promotion_candidate: fixture.candidate,
    dossier: fixture.dossier,
    reviews: fixture.reviews,
    current_context: fixture.currentContext,
    current_registry_bytes: differentRegistryBytes,
    now: '2026-08-10T21:45:00.000Z'
  }), /do not match the current semantic executor registry/);

  const duplicateContext = context({
    executor_registry: {
      schema: 'axiom-intent-remediation-executor-registry.v1',
      kernel_version: '0.12.0-dev.3',
      mappings: [mapping()]
    }
  });
  assert.throws(() => buildIntentExecutorPromotionPackage({
    promotion_candidate: fixture.candidate,
    dossier: fixture.dossier,
    reviews: fixture.reviews,
    current_context: duplicateContext,
    current_registry_bytes: `${JSON.stringify({
      schema: 'axiom-intent-remediation-executor-registry.v1',
      kernel_version: '0.12.0-dev.3',
      mappings: [mapping()]
    }, null, 2)}\n`,
    now: '2026-08-10T21:45:00.000Z'
  }), /stale|already exists|expects a different base/);
});

test('tampered proposed registry bytes fail even after package re-addressing', () => {
  const fixture = packageFixture();
  const tampered = structuredClone(fixture.promotionPackage);
  tampered.proposed_registry.utf8 = tampered.proposed_registry.utf8.replace(
    'v0.8 offline package conformance only',
    'tampered proposed value'
  );
  tampered.proposed_registry.file_bytes_digest = sha256(tampered.proposed_registry.utf8);
  const proposedDocument = JSON.parse(tampered.proposed_registry.utf8);
  tampered.proposed_registry.semantic_digest = loadSemanticDigest(proposedDocument);
  const readdressed = readdressPackage(tampered);

  assert.throws(() => verifyIntentExecutorPromotionPackage(readdressed, {
    promotion_candidate: fixture.candidate,
    dossier: fixture.dossier,
    reviews: fixture.reviews,
    current_context: fixture.currentContext,
    current_registry_bytes: registryBytes,
    now: '2026-08-10T21:45:00.000Z'
  }), /does not match the exact current reviewed promotion state|does not exactly match/);
});

test('stale policy/capability/build/review state invalidates package construction', () => {
  const fixture = reviewedPromotionFixture();
  const changedPolicy = structuredClone(policy);
  changedPolicy.v08_staleness_marker = 'changed';
  assert.throws(() => buildIntentExecutorPromotionPackage({
    promotion_candidate: fixture.candidate,
    dossier: fixture.dossier,
    reviews: fixture.reviews,
    current_context: context({ policy: changedPolicy }),
    current_registry_bytes: registryBytes,
    now: '2026-08-10T21:45:00.000Z'
  }), /stale/);

  assert.throws(() => buildIntentExecutorPromotionPackage({
    promotion_candidate: fixture.candidate,
    dossier: fixture.dossier,
    reviews: fixture.reviews,
    current_context: fixture.currentContext,
    current_registry_bytes: registryBytes,
    now: '2026-08-12T21:45:00.000Z'
  }), /expired/);
});

function loadSemanticDigest(document) {
  const body = {
    schema: document.schema,
    kernel_version: document.kernel_version,
    mappings: document.mappings.map(raw => {
      const mappingBody = {
        semantic_action: raw.semantic_action,
        target_action: raw.target_action,
        capability_id: raw.capability_id,
        tool: raw.tool,
        fixed_input: raw.fixed_input,
        constraints: raw.constraints
      };
      return { ...mappingBody, mapping_digest: digestObject(mappingBody) };
    })
  };
  return digestObject(body);
}
