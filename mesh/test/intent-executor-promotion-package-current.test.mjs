import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { sha256 } from '../src/lib/canonical.mjs';
import { MeshIdentity } from '../src/lib/identity.mjs';
import * as admission from '../src/lib/intent-executor-admission-current.mjs';
import * as legacyAdmission from '../src/lib/intent-executor-admission.mjs';
import * as currentPackage from '../src/lib/intent-executor-promotion-package-current.mjs';
import * as legacyPackage from '../src/lib/intent-executor-promotion-package.mjs';
import {
  REPOSITORY_DOCS_EFFECT_POLICY,
  REPOSITORY_DOCS_EFFECT_POLICY_DIGEST
} from '../src/lib/repository-docs-effect.mjs';
import { REPOSITORY_DOCS_INPUT_RESOLVER_ID } from '../src/lib/intent-executor-input-resolution.mjs';

const productionPolicy = JSON.parse(
  await readFile(new URL('../config/policy.json', import.meta.url), 'utf8')
);
const productionCapabilities = JSON.parse(
  await readFile(new URL('../config/capabilities.json', import.meta.url), 'utf8')
);
const productionRegistryBytes = await readFile(
  new URL('../config/intent-remediation-executors.json', import.meta.url),
  'utf8'
);
const productionRegistry = JSON.parse(productionRegistryBytes);

const CREATED = '2026-08-11T02:00:00.000Z';
const DOSSIER_EXPIRES = '2026-08-12T02:00:00.000Z';
const REVIEWED = '2026-08-11T02:05:00.000Z';
const REVIEW_EXPIRES = '2026-08-11T14:05:00.000Z';
const NOW = '2026-08-11T02:10:00.000Z';

function identity(service) {
  const pair = generateKeyPairSync('ed25519');
  return new MeshIdentity(
    service,
    pair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    pair.publicKey.export({ type: 'spki', format: 'pem' })
  );
}

function build() {
  return {
    kernel_version: '0.12.0-dev.3',
    source_digest: sha256('promotion-package-current-source')
  };
}

function evidence(mode) {
  return admission.requiredIntentExecutorAdmissionEvidenceAssertions({ mode }).map(assertion => ({
    assertion,
    result: 'pass',
    artifact_digest: sha256(`promotion-package-evidence:${assertion}`),
    artifact_type: 'test-evidence'
  }));
}

function fixedEvidence() {
  return legacyAdmission.requiredIntentExecutorAdmissionEvidenceAssertions().map(assertion => ({
    assertion,
    result: 'pass',
    artifact_digest: sha256(`promotion-package-evidence:${assertion}`),
    artifact_type: 'test-evidence'
  }));
}

function fixedMapping() {
  return {
    semantic_action: 'repo.tests.add',
    target_action: 'system.echo',
    capability_id: 'core.intent-loop',
    tool: 'builtin.echo',
    fixed_input: { message: 'promotion-package-fixed-parity' },
    constraints: { conformance_only: true }
  };
}

function resolverMapping() {
  return {
    semantic_action: REPOSITORY_DOCS_EFFECT_POLICY.semantic_action,
    target_action: REPOSITORY_DOCS_EFFECT_POLICY.target_action,
    capability_id: REPOSITORY_DOCS_EFFECT_POLICY.capability_id,
    tool: REPOSITORY_DOCS_EFFECT_POLICY.tool,
    fixed_input: null,
    constraints: {
      input_resolver: {
        id: REPOSITORY_DOCS_INPUT_RESOLVER_ID,
        repository: REPOSITORY_DOCS_EFFECT_POLICY.repository,
        base_branch: REPOSITORY_DOCS_EFFECT_POLICY.base_branch,
        path_policy_digest: REPOSITORY_DOCS_EFFECT_POLICY_DIGEST,
        max_plan_lifetime_ms: 5 * 60 * 1000
      }
    }
  };
}

function fixedContext() {
  return {
    executor_registry: productionRegistry,
    policy: productionPolicy,
    capabilities: productionCapabilities,
    build: build()
  };
}

function resolverPolicy() {
  const policy = structuredClone(productionPolicy);
  policy.actions[REPOSITORY_DOCS_EFFECT_POLICY.target_action] = {
    decision: 'allow',
    risk: 'high',
    required_scopes: ['repository:docs:write'],
    required_confirmations: 1,
    required_confirmation_values: ['confirm:repository.docs.pull-request.create'],
    requires_independent_approval: true,
    tool: REPOSITORY_DOCS_EFFECT_POLICY.tool,
    constraints: {
      repository: REPOSITORY_DOCS_EFFECT_POLICY.repository,
      docs_only: true
    },
    timeout_ms: 15_000
  };
  return policy;
}

function resolverCapabilities() {
  const capabilities = structuredClone(productionCapabilities);
  const item = capabilities.capabilities.find(
    capability => capability.id === REPOSITORY_DOCS_EFFECT_POLICY.capability_id
  );
  if (item) item.status = 'implemented';
  else capabilities.capabilities.push({
    id: REPOSITORY_DOCS_EFFECT_POLICY.capability_id,
    family: 'repository',
    status: 'implemented',
    summary: 'Test-only resolver promotion package capability.'
  });
  return capabilities;
}

function resolverContext(overrides = {}) {
  return {
    executor_registry: productionRegistry,
    policy: resolverPolicy(),
    capabilities: resolverCapabilities(),
    build: build(),
    ...overrides
  };
}

function reviewsFor(dossier) {
  const implementation = identity('package-implementation-review');
  const security = identity('package-security-review');
  return [
    {
      review: admission.buildIntentExecutorReviewAttestation(dossier, {
        identity: implementation,
        review_role: 'implementation_conformance',
        reviewed_at: REVIEWED,
        expires_at: REVIEW_EXPIRES
      }),
      public_key: implementation.publicKey
    },
    {
      review: admission.buildIntentExecutorReviewAttestation(dossier, {
        identity: security,
        review_role: 'security_authority',
        reviewed_at: REVIEWED,
        expires_at: REVIEW_EXPIRES
      }),
      public_key: security.publicKey
    }
  ];
}

function fixedFixture() {
  const context = fixedContext();
  const dossier = legacyAdmission.buildIntentExecutorAdmissionDossier({
    candidate_mapping: fixedMapping(),
    current_context: context,
    evidence: fixedEvidence(),
    producer: 'package-fixed-producer',
    created_at: CREATED,
    expires_at: DOSSIER_EXPIRES
  });
  const reviews = reviewsFor(dossier);
  const promotion = legacyAdmission.buildIntentExecutorPromotionCandidate({
    dossier,
    reviews,
    current_context: context,
    now: NOW
  });
  return { context, dossier, reviews, promotion };
}

function resolverFixture() {
  const context = resolverContext();
  const dossier = admission.buildIntentExecutorAdmissionDossier({
    candidate_mapping: resolverMapping(),
    current_context: context,
    evidence: evidence('input_resolver'),
    producer: 'package-resolver-producer',
    created_at: CREATED,
    expires_at: DOSSIER_EXPIRES
  });
  const reviews = reviewsFor(dossier);
  const promotion = admission.buildIntentExecutorPromotionCandidate({
    dossier,
    reviews,
    current_context: context,
    now: NOW
  });
  return { context, dossier, reviews, promotion };
}

test('fixed-input promotion package facade is exactly the legacy package artifact', () => {
  const fixture = fixedFixture();
  const args = {
    promotion_candidate: fixture.promotion,
    dossier: fixture.dossier,
    reviews: fixture.reviews,
    current_context: fixture.context,
    current_registry_bytes: productionRegistryBytes,
    now: NOW
  };
  const legacy = legacyPackage.buildIntentExecutorPromotionPackage(args);
  const facade = currentPackage.buildIntentExecutorPromotionPackage(args);
  assert.deepEqual(facade, legacy);
  assert.deepEqual(
    currentPackage.normalizeIntentExecutorPromotionPackage(facade),
    legacyPackage.normalizeIntentExecutorPromotionPackage(legacy)
  );
});

test('resolver promotion package proposes exactly one reviewed resolver mapping and performs no mutation', () => {
  const fixture = resolverFixture();
  const pkg = currentPackage.buildIntentExecutorPromotionPackage({
    promotion_candidate: fixture.promotion,
    dossier: fixture.dossier,
    reviews: fixture.reviews,
    current_context: fixture.context,
    current_registry_bytes: productionRegistryBytes,
    now: NOW
  });

  assert.equal(pkg.schema, 'axiom-intent-resolver-promotion-package.v1');
  assert.equal(pkg.destination.repository, 'Zoverions/AXIOM-MESH');
  assert.equal(pkg.destination.path, 'mesh/config/intent-remediation-executors.json');
  assert.equal(pkg.destination.mutation_performed, false);
  assert.equal(pkg.patch.operation, 'add_exactly_one_mapping');
  assert.equal(pkg.patch.input_mode, 'input_resolver');
  assert.equal(pkg.patch.base_mapping_count, productionRegistry.mappings.length);
  assert.equal(pkg.patch.proposed_mapping_count, productionRegistry.mappings.length + 1);
  assert.equal(pkg.patch.existing_mapping_modifications, 0);
  assert.equal(pkg.patch.existing_mapping_deletions, 0);
  assert.equal(pkg.apply_authorized, false);
  assert.equal(pkg.mapping_installed, false);
  assert.equal(pkg.execution_authorized, false);
  assert.equal(pkg.installation_authority, null);

  const proposed = JSON.parse(pkg.proposed_registry.utf8);
  assert.equal(proposed.mappings.length, 1);
  assert.deepEqual(proposed.mappings[0], resolverMapping());
  assert.equal(pkg.effect_destination, 'github:Zoverions/AXIOM-MESH');
  assert.equal(pkg.policy_gates.requires_independent_approval, true);
  assert.equal(pkg.policy_gates.required_confirmations, 1);

  // Building the package is pure; the tracked production registry bytes remain unchanged.
  assert.deepEqual(JSON.parse(productionRegistryBytes), productionRegistry);
  assert.equal(productionRegistry.mappings.length, 0);

  assert.deepEqual(currentPackage.normalizeIntentExecutorPromotionPackage(pkg), pkg);
  assert.deepEqual(
    currentPackage.verifyIntentExecutorPromotionPackage(pkg, {
      promotion_candidate: fixture.promotion,
      dossier: fixture.dossier,
      reviews: fixture.reviews,
      current_context: fixture.context,
      current_registry_bytes: productionRegistryBytes,
      now: NOW
    }),
    pkg
  );
});

test('resolver package rejects stale base registry bytes or reviewed-state drift', () => {
  const fixture = resolverFixture();
  const pkg = currentPackage.buildIntentExecutorPromotionPackage({
    promotion_candidate: fixture.promotion,
    dossier: fixture.dossier,
    reviews: fixture.reviews,
    current_context: fixture.context,
    current_registry_bytes: productionRegistryBytes,
    now: NOW
  });

  const changedBase = JSON.stringify({
    ...productionRegistry,
    mappings: [fixedMapping()]
  }, null, 2) + '\n';
  assert.throws(
    () => currentPackage.verifyIntentExecutorPromotionPackage(pkg, {
      promotion_candidate: fixture.promotion,
      dossier: fixture.dossier,
      reviews: fixture.reviews,
      current_context: fixture.context,
      current_registry_bytes: changedBase,
      now: NOW
    }),
    /base|registry|current semantic executor registry/
  );

  const changedPolicy = resolverPolicy();
  changedPolicy.actions[REPOSITORY_DOCS_EFFECT_POLICY.target_action].constraints.generation = 2;
  assert.throws(
    () => currentPackage.verifyIntentExecutorPromotionPackage(pkg, {
      promotion_candidate: fixture.promotion,
      dossier: fixture.dossier,
      reviews: fixture.reviews,
      current_context: resolverContext({ policy: changedPolicy }),
      current_registry_bytes: productionRegistryBytes,
      now: NOW
    }),
    /stale|current|reviewed/
  );
});

test('resolver package content tampering cannot preserve its content address', () => {
  const fixture = resolverFixture();
  const pkg = currentPackage.buildIntentExecutorPromotionPackage({
    promotion_candidate: fixture.promotion,
    dossier: fixture.dossier,
    reviews: fixture.reviews,
    current_context: fixture.context,
    current_registry_bytes: productionRegistryBytes,
    now: NOW
  });
  const forged = structuredClone(pkg);
  forged.proposed_registry.utf8 = forged.proposed_registry.utf8.replace(
    'repository-docs-plan.v1',
    'arbitrary-json.v1'
  );
  assert.throws(
    () => currentPackage.normalizeIntentExecutorPromotionPackage(forged),
    /content-addressed/
  );
});
