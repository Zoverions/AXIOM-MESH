import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { sha256 } from '../src/lib/canonical.mjs';
import { MeshIdentity } from '../src/lib/identity.mjs';
import * as admission from '../src/lib/intent-executor-admission-current.mjs';
import * as legacyAdmission from '../src/lib/intent-executor-admission.mjs';
import * as packages from '../src/lib/intent-executor-promotion-package-current.mjs';
import * as legacyPackage from '../src/lib/intent-executor-promotion-package.mjs';
import * as receipts from '../src/lib/intent-executor-application-receipt-current.mjs';
import * as legacyReceipt from '../src/lib/intent-executor-application-receipt.mjs';
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

const CREATED = '2026-08-11T02:20:00.000Z';
const DOSSIER_EXPIRES = '2026-08-12T02:20:00.000Z';
const REVIEWED = '2026-08-11T02:25:00.000Z';
const REVIEW_EXPIRES = '2026-08-11T14:25:00.000Z';
const VERIFIED = '2026-08-11T02:30:00.000Z';

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
    kernel_version: '0.12.0-dev.4',
    source_digest: sha256('application-receipt-current-source')
  };
}

function fixedMapping() {
  return {
    semantic_action: 'repo.tests.add',
    target_action: 'system.echo',
    capability_id: 'core.intent-loop',
    tool: 'builtin.echo',
    fixed_input: { message: 'application-receipt-fixed-parity' },
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

function fixedEvidence() {
  return legacyAdmission.requiredIntentExecutorAdmissionEvidenceAssertions().map(assertion => ({
    assertion,
    result: 'pass',
    artifact_digest: sha256(`application-receipt-evidence:${assertion}`),
    artifact_type: 'test-evidence'
  }));
}

function resolverEvidence() {
  return admission.requiredIntentExecutorAdmissionEvidenceAssertions({ mode: 'input_resolver' }).map(assertion => ({
    assertion,
    result: 'pass',
    artifact_digest: sha256(`application-receipt-evidence:${assertion}`),
    artifact_type: 'test-evidence'
  }));
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
    summary: 'Test-only resolver application observation capability.'
  });
  return capabilities;
}

function resolverContext() {
  return {
    executor_registry: productionRegistry,
    policy: resolverPolicy(),
    capabilities: resolverCapabilities(),
    build: build()
  };
}

function makeReviews(dossier, builder = admission.buildIntentExecutorReviewAttestation) {
  const implementation = identity('receipt-implementation-review');
  const security = identity('receipt-security-review');
  return {
    identities: { implementation, security },
    reviews: [
      {
        review: builder(dossier, {
          identity: implementation,
          review_role: 'implementation_conformance',
          reviewed_at: REVIEWED,
          expires_at: REVIEW_EXPIRES
        }),
        public_key: implementation.publicKey
      },
      {
        review: builder(dossier, {
          identity: security,
          review_role: 'security_authority',
          reviewed_at: REVIEWED,
          expires_at: REVIEW_EXPIRES
        }),
        public_key: security.publicKey
      }
    ]
  };
}

function fixedFixture() {
  const context = fixedContext();
  const dossier = legacyAdmission.buildIntentExecutorAdmissionDossier({
    candidate_mapping: fixedMapping(),
    current_context: context,
    evidence: fixedEvidence(),
    producer: 'receipt-fixed-producer',
    created_at: CREATED,
    expires_at: DOSSIER_EXPIRES
  });
  const { reviews } = makeReviews(dossier, legacyAdmission.buildIntentExecutorReviewAttestation);
  const promotion = legacyAdmission.buildIntentExecutorPromotionCandidate({
    dossier,
    reviews,
    current_context: context,
    now: VERIFIED
  });
  const pkg = legacyPackage.buildIntentExecutorPromotionPackage({
    promotion_candidate: promotion,
    dossier,
    reviews,
    current_context: context,
    current_registry_bytes: productionRegistryBytes,
    now: VERIFIED
  });
  return { context, dossier, reviews, promotion, pkg };
}

function resolverFixture() {
  const context = resolverContext();
  const dossier = admission.buildIntentExecutorAdmissionDossier({
    candidate_mapping: resolverMapping(),
    current_context: context,
    evidence: resolverEvidence(),
    producer: 'receipt-resolver-producer',
    created_at: CREATED,
    expires_at: DOSSIER_EXPIRES
  });
  const reviewSet = makeReviews(dossier);
  const promotion = admission.buildIntentExecutorPromotionCandidate({
    dossier,
    reviews: reviewSet.reviews,
    current_context: context,
    now: VERIFIED
  });
  const pkg = packages.buildIntentExecutorPromotionPackage({
    promotion_candidate: promotion,
    dossier,
    reviews: reviewSet.reviews,
    current_context: context,
    current_registry_bytes: productionRegistryBytes,
    now: VERIFIED
  });
  return {
    context,
    dossier,
    reviews: reviewSet.reviews,
    reviewerIdentities: reviewSet.identities,
    promotion,
    pkg
  };
}

test('fixed-input application receipt facade is exactly the legacy artifact', () => {
  const fixture = fixedFixture();
  const verifier = identity('receipt-fixed-application-verifier');
  const args = {
    promotion_package: fixture.pkg,
    promotion_candidate: fixture.promotion,
    dossier: fixture.dossier,
    reviews: fixture.reviews,
    current_context: fixture.context,
    pre_registry_bytes: productionRegistryBytes,
    post_registry_bytes: fixture.pkg.proposed_registry.utf8,
    identity: verifier,
    verified_at: VERIFIED,
    source_revision: 'test-fixed-application-receipt',
    release_context: { channel: 'test' },
    now: VERIFIED
  };
  const legacy = legacyReceipt.buildIntentExecutorApplicationReceipt(args);
  const facade = receipts.buildIntentExecutorApplicationReceipt(args);
  assert.deepEqual(facade, legacy);
  assert.deepEqual(
    receipts.verifyIntentExecutorApplicationReceipt(facade, {
      ...args,
      public_key: verifier.publicKey
    }),
    legacyReceipt.verifyIntentExecutorApplicationReceipt(legacy, {
      ...args,
      public_key: verifier.publicKey
    })
  );
});

test('resolver receipt observes only the exact reviewed registry addition', () => {
  const fixture = resolverFixture();
  const verifier = identity('receipt-resolver-application-verifier');
  const receipt = receipts.buildIntentExecutorApplicationReceipt({
    promotion_package: fixture.pkg,
    promotion_candidate: fixture.promotion,
    dossier: fixture.dossier,
    reviews: fixture.reviews,
    current_context: fixture.context,
    pre_registry_bytes: productionRegistryBytes,
    post_registry_bytes: fixture.pkg.proposed_registry.utf8,
    identity: verifier,
    verified_at: VERIFIED,
    source_revision: 'test-resolver-application-receipt',
    release_context: { channel: 'test' },
    now: VERIFIED
  });

  assert.equal(receipt.schema, 'axiom-intent-resolver-application-receipt.v1');
  assert.equal(receipt.application_verified, true);
  assert.equal(receipt.mapping_installed_observed, true);
  assert.equal(receipt.mapping.fixed_input, null);
  assert.deepEqual(receipt.resolver, fixture.pkg.resolver);
  assert.equal(receipt.resolver_digest, fixture.pkg.resolver_digest);
  assert.equal(receipt.effect_destination, 'github:Zoverions/AXIOM-MESH');
  assert.equal(receipt.policy_gates.required_confirmations, 1);
  assert.equal(receipt.policy_gates.requires_independent_approval, true);
  assert.equal(receipt.delta.operation, 'add_exactly_one_mapping');
  assert.equal(receipt.delta.input_mode, 'input_resolver');
  assert.equal(receipt.apply_authorized, false);
  assert.equal(receipt.execution_authorized, false);
  assert.equal(receipt.resolved_input_observed, false);
  assert.equal(receipt.external_effect_prepared_observed, false);
  assert.equal(receipt.external_effect_executed_observed, false);

  const verified = receipts.verifyIntentExecutorApplicationReceipt(receipt, {
    promotion_package: fixture.pkg,
    promotion_candidate: fixture.promotion,
    dossier: fixture.dossier,
    reviews: fixture.reviews,
    current_context: fixture.context,
    pre_registry_bytes: productionRegistryBytes,
    post_registry_bytes: fixture.pkg.proposed_registry.utf8,
    public_key: verifier.publicKey,
    now: VERIFIED
  });
  assert.deepEqual(verified, receipt);
});

test('resolver application verifier must be independent from producer and both mapping reviewers', () => {
  const fixture = resolverFixture();
  for (const badIdentity of [
    identity(fixture.dossier.producer),
    fixture.reviewerIdentities.implementation,
    fixture.reviewerIdentities.security
  ]) {
    assert.throws(
      () => receipts.buildIntentExecutorApplicationReceipt({
        promotion_package: fixture.pkg,
        promotion_candidate: fixture.promotion,
        dossier: fixture.dossier,
        reviews: fixture.reviews,
        current_context: fixture.context,
        pre_registry_bytes: productionRegistryBytes,
        post_registry_bytes: fixture.pkg.proposed_registry.utf8,
        identity: badIdentity,
        verified_at: VERIFIED,
        now: VERIFIED
      }),
      /independent from dossier producer and mapping reviewers/
    );
  }
});

test('resolver receipt rejects any post-registry byte substitution or extra mapping', () => {
  const fixture = resolverFixture();
  const verifier = identity('receipt-resolver-application-verifier');
  const extra = JSON.parse(fixture.pkg.proposed_registry.utf8);
  extra.mappings.push(fixedMapping());
  const extraBytes = `${JSON.stringify(extra, null, 2)}\n`;

  for (const badBytes of [
    fixture.pkg.proposed_registry.utf8.replace('repository-docs-plan.v1', 'arbitrary-json.v1'),
    extraBytes
  ]) {
    assert.throws(
      () => receipts.buildIntentExecutorApplicationReceipt({
        promotion_package: fixture.pkg,
        promotion_candidate: fixture.promotion,
        dossier: fixture.dossier,
        reviews: fixture.reviews,
        current_context: fixture.context,
        pre_registry_bytes: productionRegistryBytes,
        post_registry_bytes: badBytes,
        identity: verifier,
        verified_at: VERIFIED,
        now: VERIFIED
      }),
      /post-application registry bytes|exactly one|checksums|reviewed resolver package proposal/
    );
  }
});

test('resolver receipt signature and authority flags cannot be re-addressed', () => {
  const fixture = resolverFixture();
  const verifier = identity('receipt-resolver-application-verifier');
  const receipt = receipts.buildIntentExecutorApplicationReceipt({
    promotion_package: fixture.pkg,
    promotion_candidate: fixture.promotion,
    dossier: fixture.dossier,
    reviews: fixture.reviews,
    current_context: fixture.context,
    pre_registry_bytes: productionRegistryBytes,
    post_registry_bytes: fixture.pkg.proposed_registry.utf8,
    identity: verifier,
    verified_at: VERIFIED,
    now: VERIFIED
  });

  for (const mutate of [
    value => { value.execution_authorized = true; },
    value => { value.resolved_input_observed = true; },
    value => { value.external_effect_prepared_observed = true; },
    value => { value.effect_destination = 'github:other/repository'; }
  ]) {
    const forged = structuredClone(receipt);
    mutate(forged);
    assert.throws(
      () => receipts.verifyIntentExecutorApplicationReceipt(forged, {
        promotion_package: fixture.pkg,
        promotion_candidate: fixture.promotion,
        dossier: fixture.dossier,
        reviews: fixture.reviews,
        current_context: fixture.context,
        pre_registry_bytes: productionRegistryBytes,
        post_registry_bytes: fixture.pkg.proposed_registry.utf8,
        public_key: verifier.publicKey,
        now: VERIFIED
      }),
      /flags|content-addressed|signature|does not match/
    );
  }
});

test('constructing resolver observation evidence does not modify production registry bytes', () => {
  const fixture = resolverFixture();
  const verifier = identity('receipt-resolver-application-verifier');
  receipts.buildIntentExecutorApplicationReceipt({
    promotion_package: fixture.pkg,
    promotion_candidate: fixture.promotion,
    dossier: fixture.dossier,
    reviews: fixture.reviews,
    current_context: fixture.context,
    pre_registry_bytes: productionRegistryBytes,
    post_registry_bytes: fixture.pkg.proposed_registry.utf8,
    identity: verifier,
    verified_at: VERIFIED,
    now: VERIFIED
  });
  assert.deepEqual(JSON.parse(productionRegistryBytes), productionRegistry);
  assert.equal(productionRegistry.mappings.length, 0);
  assert.equal(productionPolicy.actions[REPOSITORY_DOCS_EFFECT_POLICY.target_action], undefined);
});
