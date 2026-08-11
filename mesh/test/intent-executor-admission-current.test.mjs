import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { sha256 } from '../src/lib/canonical.mjs';
import { MeshIdentity } from '../src/lib/identity.mjs';
import * as legacy from '../src/lib/intent-executor-admission.mjs';
import * as current from '../src/lib/intent-executor-admission-current.mjs';
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
const productionRegistry = JSON.parse(
  await readFile(new URL('../config/intent-remediation-executors.json', import.meta.url), 'utf8')
);

const CREATED = '2026-08-11T01:00:00.000Z';
const DOSSIER_EXPIRES = '2026-08-12T01:00:00.000Z';
const REVIEWED = '2026-08-11T01:05:00.000Z';
const REVIEW_EXPIRES = '2026-08-11T13:05:00.000Z';
const NOW = '2026-08-11T01:10:00.000Z';

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
    source_digest: sha256('resolver-reviewed-admission-current-source')
  };
}

function fixedMapping() {
  return {
    semantic_action: 'repo.tests.add',
    target_action: 'system.echo',
    capability_id: 'core.intent-loop',
    tool: 'builtin.echo',
    fixed_input: { message: 'fixed-parity' },
    constraints: { conformance_only: true }
  };
}

function resolverMapping(overrides = {}) {
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
    },
    ...overrides
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
  const existing = capabilities.capabilities.find(
    item => item.id === REPOSITORY_DOCS_EFFECT_POLICY.capability_id
  );
  if (existing) existing.status = 'implemented';
  else capabilities.capabilities.push({
    id: REPOSITORY_DOCS_EFFECT_POLICY.capability_id,
    family: 'repository',
    status: 'implemented',
    summary: 'Test-only resolver admission capability.'
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

function evidenceFor(module, mode = 'fixed_input') {
  return module.requiredIntentExecutorAdmissionEvidenceAssertions({ mode }).map(assertion => ({
    assertion,
    result: 'pass',
    artifact_digest: sha256(`artifact:${assertion}`),
    artifact_type: 'test-evidence'
  }));
}

function legacyEvidence() {
  return legacy.requiredIntentExecutorAdmissionEvidenceAssertions().map(assertion => ({
    assertion,
    result: 'pass',
    artifact_digest: sha256(`artifact:${assertion}`),
    artifact_type: 'test-evidence'
  }));
}

function reviewSet(dossier, builder = current.buildIntentExecutorReviewAttestation) {
  const implementation = identity('resolver-implementation-review');
  const security = identity('resolver-security-review');
  return {
    implementation,
    security,
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

test('fixed-input facade dossier output is exactly the legacy v0.7 artifact', () => {
  const args = {
    candidate_mapping: fixedMapping(),
    current_context: fixedContext(),
    evidence: legacyEvidence(),
    producer: 'fixed-parity-producer',
    created_at: CREATED,
    expires_at: DOSSIER_EXPIRES
  };
  const legacyDossier = legacy.buildIntentExecutorAdmissionDossier(args);
  const facadeDossier = current.buildIntentExecutorAdmissionDossier(args);
  assert.deepEqual(facadeDossier, legacyDossier);
  assert.deepEqual(
    current.normalizeIntentExecutorAdmissionDossier(facadeDossier),
    legacy.normalizeIntentExecutorAdmissionDossier(legacyDossier)
  );
});

test('fixed-input facade review and promotion remain byte-equivalent to legacy behavior', () => {
  const dossier = legacy.buildIntentExecutorAdmissionDossier({
    candidate_mapping: fixedMapping(),
    current_context: fixedContext(),
    evidence: legacyEvidence(),
    producer: 'fixed-parity-producer',
    created_at: CREATED,
    expires_at: DOSSIER_EXPIRES
  });
  const reviewer = identity('fixed-parity-reviewer');
  const reviewOptions = {
    identity: reviewer,
    review_role: 'implementation_conformance',
    reviewed_at: REVIEWED,
    expires_at: REVIEW_EXPIRES
  };
  assert.deepEqual(
    current.buildIntentExecutorReviewAttestation(dossier, reviewOptions),
    legacy.buildIntentExecutorReviewAttestation(dossier, reviewOptions)
  );

  const implementation = identity('fixed-implementation-review');
  const security = identity('fixed-security-review');
  const reviews = [
    {
      review: legacy.buildIntentExecutorReviewAttestation(dossier, {
        identity: implementation,
        review_role: 'implementation_conformance',
        reviewed_at: REVIEWED,
        expires_at: REVIEW_EXPIRES
      }),
      public_key: implementation.publicKey
    },
    {
      review: legacy.buildIntentExecutorReviewAttestation(dossier, {
        identity: security,
        review_role: 'security_authority',
        reviewed_at: REVIEWED,
        expires_at: REVIEW_EXPIRES
      }),
      public_key: security.publicKey
    }
  ];
  const args = { dossier, reviews, current_context: fixedContext(), now: NOW };
  assert.deepEqual(
    current.buildIntentExecutorPromotionCandidate(args),
    legacy.buildIntentExecutorPromotionCandidate(args)
  );
});

test('resolver facade requires additional resolver-specific admission evidence', () => {
  assert.throws(
    () => current.buildIntentExecutorAdmissionDossier({
      candidate_mapping: resolverMapping(),
      current_context: resolverContext(),
      evidence: evidenceFor(current, 'fixed_input'),
      producer: 'resolver-admission-producer',
      created_at: CREATED,
      expires_at: DOSSIER_EXPIRES
    }),
    /exactly .* required assertions/
  );

  const assertions = current.requiredIntentExecutorAdmissionEvidenceAssertions({
    mode: 'input_resolver'
  });
  for (const required of [
    'resolver_constraints_bound',
    'resolver_destination_bound',
    'resolver_plan_signature_enforced',
    'resolver_substitution_denied',
    'resolved_input_gates_preserved',
    'resolved_input_non_execution'
  ]) {
    assert.equal(assertions.includes(required), true);
  }
});

test('resolver dossier binds exact external destination and high-risk gates but grants no authority', () => {
  const dossier = current.buildIntentExecutorAdmissionDossier({
    candidate_mapping: resolverMapping(),
    current_context: resolverContext(),
    evidence: evidenceFor(current, 'input_resolver'),
    producer: 'resolver-admission-producer',
    created_at: CREATED,
    expires_at: DOSSIER_EXPIRES
  });

  assert.equal(dossier.schema, 'axiom-intent-resolver-admission-dossier.v1');
  assert.equal(dossier.admission_facts.input_mode, 'input_resolver');
  assert.equal(dossier.admission_facts.effect_destination, 'github:Zoverions/AXIOM-MESH');
  assert.equal(dossier.admission_facts.policy_gates.risk, 'high');
  assert.equal(dossier.admission_facts.policy_gates.required_confirmations, 1);
  assert.equal(dossier.admission_facts.policy_gates.requires_independent_approval, true);
  assert.equal(dossier.admission_facts.mapping_installed, false);
  assert.equal(dossier.admission_facts.execution_authorized, false);
  assert.equal(dossier.mapping_installed, false);
  assert.equal(dossier.execution_authorized, false);
  assert.deepEqual(current.normalizeIntentExecutorAdmissionDossier(dossier), dossier);
  assert.deepEqual(
    current.validateIntentExecutorAdmissionDossierCurrent(
      dossier,
      resolverContext(),
      { now: NOW }
    ),
    dossier
  );
});

test('resolver dossier becomes stale when policy/capability/registry/build state changes', () => {
  const dossier = current.buildIntentExecutorAdmissionDossier({
    candidate_mapping: resolverMapping(),
    current_context: resolverContext(),
    evidence: evidenceFor(current, 'input_resolver'),
    producer: 'resolver-admission-producer',
    created_at: CREATED,
    expires_at: DOSSIER_EXPIRES
  });
  const changedPolicy = resolverPolicy();
  changedPolicy.actions[REPOSITORY_DOCS_EFFECT_POLICY.target_action].constraints.generation = 2;
  assert.throws(
    () => current.validateIntentExecutorAdmissionDossierCurrent(
      dossier,
      resolverContext({ policy: changedPolicy }),
      { now: NOW }
    ),
    /stale/
  );
});

test('resolver admission requires two distinct independent review roles and stays non-installing', () => {
  const dossier = current.buildIntentExecutorAdmissionDossier({
    candidate_mapping: resolverMapping(),
    current_context: resolverContext(),
    evidence: evidenceFor(current, 'input_resolver'),
    producer: 'resolver-admission-producer',
    created_at: CREATED,
    expires_at: DOSSIER_EXPIRES
  });
  const { reviews } = reviewSet(dossier);
  for (const entry of reviews) {
    assert.equal(entry.review.mapping_installed, false);
    assert.equal(entry.review.execution_authorized, false);
    assert.deepEqual(
      current.verifyIntentExecutorReviewAttestation(entry.review, dossier, {
        public_key: entry.public_key,
        now: NOW
      }),
      entry.review
    );
  }

  const promotion = current.buildIntentExecutorPromotionCandidate({
    dossier,
    reviews,
    current_context: resolverContext(),
    now: NOW
  });
  assert.equal(promotion.schema, 'axiom-intent-resolver-promotion-candidate.v1');
  assert.equal(promotion.mapping.fixed_input, null);
  assert.equal(promotion.effect_destination, 'github:Zoverions/AXIOM-MESH');
  assert.equal(promotion.mapping_installed, false);
  assert.equal(promotion.execution_authorized, false);
  assert.equal(promotion.installation_authority, null);
  assert.deepEqual(current.normalizeIntentExecutorPromotionCandidate(promotion), promotion);
  assert.deepEqual(
    current.verifyIntentExecutorPromotionCandidate(promotion, {
      dossier,
      reviews,
      current_context: resolverContext(),
      now: NOW
    }),
    promotion
  );
});

test('resolver promotion rejects duplicate reviewer identity or missing required role', () => {
  const dossier = current.buildIntentExecutorAdmissionDossier({
    candidate_mapping: resolverMapping(),
    current_context: resolverContext(),
    evidence: evidenceFor(current, 'input_resolver'),
    producer: 'resolver-admission-producer',
    created_at: CREATED,
    expires_at: DOSSIER_EXPIRES
  });
  const same = identity('same-resolver-reviewer');
  const first = current.buildIntentExecutorReviewAttestation(dossier, {
    identity: same,
    review_role: 'implementation_conformance',
    reviewed_at: REVIEWED,
    expires_at: REVIEW_EXPIRES
  });
  const second = current.buildIntentExecutorReviewAttestation(dossier, {
    identity: same,
    review_role: 'security_authority',
    reviewed_at: REVIEWED,
    expires_at: REVIEW_EXPIRES
  });
  assert.throws(
    () => current.buildIntentExecutorPromotionCandidate({
      dossier,
      reviews: [
        { review: first, public_key: same.publicKey },
        { review: second, public_key: same.publicKey }
      ],
      current_context: resolverContext(),
      now: NOW
    }),
    /distinct identities/
  );
});

test('production state still cannot build a resolver admission dossier', () => {
  assert.equal(productionRegistry.mappings.length, 0);
  assert.equal(productionPolicy.actions[REPOSITORY_DOCS_EFFECT_POLICY.target_action], undefined);
  assert.throws(
    () => current.buildIntentExecutorAdmissionDossier({
      candidate_mapping: resolverMapping(),
      current_context: fixedContext(),
      evidence: evidenceFor(current, 'input_resolver'),
      producer: 'resolver-admission-producer',
      created_at: CREATED,
      expires_at: DOSSIER_EXPIRES
    }),
    /target action does not exist/
  );
});
