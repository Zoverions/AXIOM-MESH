import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  AGENT_TRUST_PROMOTION_PREFLIGHT_SCHEMA,
  AGENT_TRUST_PROMOTION_REQUIRED_EXTERNAL_GATES,
  createAgentTrustPromotionPreflight,
  normalizeAgentTrustPromotionPreflight,
  verifyAgentTrustPromotionPreflight
} from '../src/lib/agent-trust-promotion-preflight.mjs';

const COMMIT = 'a'.repeat(40);

function artifacts(overrides = {}) {
  return {
    implementation: ['mesh/src/lib/agent-trust-promotion-preflight.mjs'],
    strict_validation: ['agent-commons/contracts/agent-trust-promotion-preflight.v1.schema.json'],
    positive_tests: ['mesh/test/agent-trust-promotion-preflight.test.mjs'],
    adversarial_tests: ['mesh/test/agent-trust-promotion-preflight.test.mjs'],
    threat_models: ['agent-commons/agent-trust-promotion-preflight-threat-model.json'],
    recovery_runbooks: ['docs/operations/AGENT-TRUST-PROMOTION-AND-RECOVERY.md'],
    verifier_or_conformance: ['mesh/src/lib/agent-trust-promotion-preflight.mjs'],
    ...overrides
  };
}

function candidate(overrides = {}) {
  return createAgentTrustPromotionPreflight({
    candidateId: 'promotion.preflight.test',
    capabilityId: 'agent-trust.preflight-test',
    candidateCommitSha: COMMIT,
    candidateScope: 'Structural laboratory preflight used only to exercise fail-closed promotion discipline.',
    artifactPaths: artifacts(),
    ...overrides
  });
}

test('A11 preflight verifies local structure without promoting or authorizing anything', async () => {
  const preflight = candidate();
  assert.equal(preflight.schema, AGENT_TRUST_PROMOTION_PREFLIGHT_SCHEMA);
  assert.deepEqual(
    preflight.blockers.filter(item => AGENT_TRUST_PROMOTION_REQUIRED_EXTERNAL_GATES.includes(item)),
    [...AGENT_TRUST_PROMOTION_REQUIRED_EXTERNAL_GATES]
  );

  const result = await verifyAgentTrustPromotionPreflight(preflight);
  assert.equal(result.valid, true);
  assert.equal(result.local_repository_artifacts_verified, true);
  assert.equal(result.authoritative_registry_valid, true);
  assert.equal(result.capability_evidence_bindings_valid, true);
  assert.equal(result.candidate_registry_entry_present, false);
  assert.equal(result.candidate_commit_recorded, true);
  assert.equal(result.candidate_commit_bound_by_verifier, false);
  assert.equal(result.protected_ci_verified, false);
  assert.equal(result.independent_review_verified, false);
  assert.equal(result.explicit_promotion_decision_verified, false);
  assert.equal(result.post_registry_ci_verified, false);
  assert.equal(result.exact_candidate_registry_binding_verified, false);
  assert.equal(result.promotion_authorized, false);
  assert.equal(result.registry_mutation_authorized, false);
  assert.equal(result.production_claims_allowed, false);
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.capability_promotion_effect, 'none');
});

test('preflight refuses to masquerade as validation of an already-registered capability', async () => {
  const preflight = candidate({ capabilityId: 'core.intent-loop' });
  await assert.rejects(
    () => verifyAgentTrustPromotionPreflight(preflight),
    /already present in the authoritative registry/
  );
});

test('preflight requires every external promotion gate to remain an explicit blocker', () => {
  const preflight = structuredClone(candidate());
  preflight.blockers = preflight.blockers.filter(
    item => item !== 'independent-review-required'
  );
  assert.throws(
    () => normalizeAgentTrustPromotionPreflight(preflight),
    /must retain independent-review-required/
  );
});

test('preflight rejects repository path escape and missing artifacts', async () => {
  const escaped = candidate({
    artifactPaths: artifacts({ implementation: ['../escape.mjs'] })
  });
  await assert.rejects(
    () => verifyAgentTrustPromotionPreflight(escaped),
    /escapes repository root/
  );

  const missing = candidate({
    artifactPaths: artifacts({ implementation: ['mesh/src/lib/not-present-promotion-artifact.mjs'] })
  });
  await assert.rejects(
    () => verifyAgentTrustPromotionPreflight(missing),
    /does not exist/
  );
});

test('promotion semantics cannot be elevated by caller-controlled fields', () => {
  const preflight = candidate();
  for (const [field, value] of [
    ['documentation_alone_satisfies_promotion', true],
    ['local_preflight_is_promotion', true],
    ['candidate_record_mutates_registry', true],
    ['promotion_authorized', true],
    ['registry_mutation_authorized', true],
    ['production_claims_allowed', true],
    ['authority_effect', 'grant'],
    ['capability_promotion_effect', 'promote']
  ]) {
    const elevated = structuredClone(preflight);
    elevated.semantics[field] = value;
    assert.throws(
      () => normalizeAgentTrustPromotionPreflight(elevated),
      new RegExp(`${field} must remain`)
    );
  }

  const unknown = structuredClone(preflight);
  unknown.semantics.auto_merge_authorized = true;
  assert.throws(
    () => normalizeAgentTrustPromotionPreflight(unknown),
    /unsupported field auto_merge_authorized/
  );
});

test('preflight content address detects detached mutation', () => {
  const preflight = structuredClone(candidate());
  preflight.candidate_scope = `${preflight.candidate_scope} altered`;
  assert.throws(
    () => normalizeAgentTrustPromotionPreflight(preflight),
    /content digest mismatch/
  );
});

test('promotion verifier is read-only and has no merge, process or network primitive', async () => {
  const sourceUrl = new URL('../src/lib/agent-trust-promotion-preflight.mjs', import.meta.url);
  const source = await readFile(sourceUrl, 'utf8');
  assert.doesNotMatch(source, /writeFile|appendFile|unlink|\brm\(|child_process|node:net|node:http|node:https|merge_pull_request/);
  assert.match(source, /validateCapabilityEvidenceBindings/);
  assert.match(source, /candidate_commit_bound_by_verifier: false/);
  assert.match(source, /promotion_authorized: false/);
});
