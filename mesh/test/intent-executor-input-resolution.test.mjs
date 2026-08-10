import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

import { digestObject, sha256 } from '../src/lib/canonical.mjs';
import { MeshIdentity } from '../src/lib/identity.mjs';
import {
  REPOSITORY_DOCS_EFFECT_POLICY,
  REPOSITORY_DOCS_EFFECT_POLICY_DIGEST,
  buildRepositoryDocsEffectPlan
} from '../src/lib/repository-docs-effect.mjs';
import * as resolver from '../src/lib/intent-executor-input-resolution.mjs';

const NOW = '2026-08-10T23:45:00.000Z';
const D = character => character.repeat(64);
const BASE_SHA = 'a'.repeat(40);
const OLD_BLOB = 'b'.repeat(40);
const OLD_CONTENT = '# old\n';
const NEW_CONTENT = '# new\n';

function identity(service) {
  const pair = generateKeyPairSync('ed25519');
  return new MeshIdentity(
    service,
    pair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    pair.publicKey.export({ type: 'spki', format: 'pem' })
  );
}

function eligibility(overrides = {}) {
  const material = {
    schema: 'axiom-intent-execution-eligibility.v1',
    remediation_proposal_id: `intent-remediation:${D('1')}`,
    remediation_proposal_digest: D('1'),
    basis_digest: D('2'),
    source_assessment_digest: D('3'),
    source_reconciliation_digest: D('4'),
    semantic_action: 'repo.docs.update',
    requester: 'operator-human',
    executor_registry_digest: D('5'),
    mapped_executor: {
      mapping_id: `executor-mapping:${D('6')}`,
      mapping_digest: D('6'),
      target_action: REPOSITORY_DOCS_EFFECT_POLICY.target_action,
      tool: REPOSITORY_DOCS_EFFECT_POLICY.tool,
      capability_id: REPOSITORY_DOCS_EFFECT_POLICY.capability_id,
      fixed_input_digest: null,
      registry_constraints: {
        input_resolver: {
          id: resolver.REPOSITORY_DOCS_INPUT_RESOLVER_ID,
          repository: REPOSITORY_DOCS_EFFECT_POLICY.repository,
          base_branch: REPOSITORY_DOCS_EFFECT_POLICY.base_branch,
          path_policy_digest: REPOSITORY_DOCS_EFFECT_POLICY_DIGEST,
          max_plan_lifetime_ms: 5 * 60 * 1000
        }
      }
    },
    policy_digest: D('7'),
    capability_registry_digest: D('8'),
    machine_authority_digest: null,
    target_scope: 'repository:docs:pr',
    target_risk: 'high',
    required_confirmation_values: ['confirm repository docs pull request'],
    required_independent_approvals: 1,
    eligible: false,
    decision: 'unknown',
    reason: 'executor_input_unresolved',
    execution_authorized: false,
    ...overrides
  };
  return { ...material, eligibility_digest: digestObject(material) };
}

function plan(operator, {
  plannedAt = NOW,
  expiresAt = '2026-08-10T23:50:00.000Z'
} = {}) {
  return buildRepositoryDocsEffectPlan({
    identity: operator,
    base_sha: BASE_SHA,
    changes: [{
      path: 'docs/rebuild/STATUS.md',
      operation: 'update',
      old_blob_sha: OLD_BLOB,
      old_content_sha256: sha256(OLD_CONTENT),
      new_content: NEW_CONTENT
    }],
    planned_at: plannedAt,
    expires_at: expiresAt
  });
}

function fixtures() {
  const operator = identity('repository-operator');
  const hypervisor = identity('hypervisor');
  const currentEligibility = eligibility();
  const repositoryPlan = plan(operator);
  const resolution = resolver.buildIntentExecutorInputResolution({
    identity: hypervisor,
    eligibility: currentEligibility,
    repository_plan: repositoryPlan,
    operatorPublicKey: operator.publicKey,
    now: NOW
  });
  const handoff = resolver.buildResolvedIntentExecutionHandoff({
    identity: hypervisor,
    resolution
  });
  return { operator, hypervisor, currentEligibility, repositoryPlan, resolution, handoff };
}

test('signed repository plan resolves only executor input and preserves all target gates', () => {
  const { operator, hypervisor, currentEligibility, resolution, handoff } = fixtures();
  const verified = resolver.verifyIntentExecutorInputResolution(resolution, {
    eligibility: currentEligibility,
    hypervisorPublicKey: hypervisor.publicKey,
    operatorPublicKey: operator.publicKey,
    now: '2026-08-10T23:46:00.000Z'
  });
  assert.equal(verified.target_action, REPOSITORY_DOCS_EFFECT_POLICY.target_action);
  assert.equal(verified.tool, REPOSITORY_DOCS_EFFECT_POLICY.tool);
  assert.equal(verified.capability_id, REPOSITORY_DOCS_EFFECT_POLICY.capability_id);
  assert.equal(verified.resolved_input.repository_plan.plan_digest, verified.repository_plan_digest);
  assert.deepEqual(verified.required_confirmation_values, currentEligibility.required_confirmation_values);
  assert.equal(verified.required_independent_approvals, 1);
  assert.equal(verified.execution_authorized, false);
  assert.equal(verified.external_effect_prepared, false);
  assert.equal(verified.external_effect_executed, false);

  const verifiedHandoff = resolver.verifyResolvedIntentExecutionHandoff(handoff, {
    resolution: verified,
    hypervisorPublicKey: hypervisor.publicKey
  });
  assert.equal(verifiedHandoff.resolved_input_digest, verified.resolved_input_digest);
  assert.deepEqual(verifiedHandoff.required_confirmation_values, currentEligibility.required_confirmation_values);
  assert.equal(verifiedHandoff.required_independent_approvals, 1);
  assert.equal(verifiedHandoff.execution_authorized, false);
});

test('fixed input and non-unresolved eligibility cannot use the dynamic resolver', () => {
  const withFixedInput = eligibility({
    mapped_executor: {
      ...eligibility().mapped_executor,
      fixed_input_digest: D('9')
    }
  });
  assert.throws(() => resolver.verifyResolverEligibleInputState(withFixedInput), /fixed executor input/);

  const apparentlyEligible = eligibility({
    eligible: true,
    decision: 'eligible',
    reason: 'all_execution_prerequisites_satisfied'
  });
  assert.throws(() => resolver.verifyResolverEligibleInputState(apparentlyEligible), /executor_input_unresolved/);
});

test('unknown resolver, authority-like resolver fields, and target substitution fail closed', () => {
  const base = eligibility();
  const unknownResolver = eligibility({
    mapped_executor: {
      ...base.mapped_executor,
      registry_constraints: {
        input_resolver: {
          ...base.mapped_executor.registry_constraints.input_resolver,
          id: 'arbitrary-json.v1'
        }
      }
    }
  });
  assert.throws(() => resolver.verifyResolverEligibleInputState(unknownResolver), /not implemented/);

  const authorityOverride = eligibility({
    mapped_executor: {
      ...base.mapped_executor,
      registry_constraints: {
        input_resolver: {
          ...base.mapped_executor.registry_constraints.input_resolver,
          execution_authorized: true
        }
      }
    }
  });
  assert.throws(() => resolver.verifyResolverEligibleInputState(authorityOverride), /unsupported fields/);

  const wrongTarget = eligibility({
    mapped_executor: {
      ...base.mapped_executor,
      target_action: 'system.echo'
    }
  });
  assert.throws(() => resolver.verifyResolverEligibleInputState(wrongTarget), /target is outside/);
});

test('resolver declaration cannot widen repository base or path policy', () => {
  const base = eligibility();
  for (const changed of [
    { repository: 'other/repository' },
    { base_branch: 'feature/unsafe' },
    { path_policy_digest: D('0') },
    { max_plan_lifetime_ms: 60 * 60 * 1000 }
  ]) {
    const candidate = eligibility({
      mapped_executor: {
        ...base.mapped_executor,
        registry_constraints: {
          input_resolver: {
            ...base.mapped_executor.registry_constraints.input_resolver,
            ...changed
          }
        }
      }
    });
    assert.throws(
      () => resolver.verifyResolverEligibleInputState(candidate),
      /ceiling|digest|lifetime/
    );
  }
});

test('wrong repository-operator key, expired plan, and plan lifetime drift fail resolution', () => {
  const operator = identity('repository-operator');
  const attacker = identity('repository-operator');
  const hypervisor = identity('hypervisor');
  const currentEligibility = eligibility();
  const repositoryPlan = plan(operator);

  assert.throws(() => resolver.buildIntentExecutorInputResolution({
    identity: hypervisor,
    eligibility: currentEligibility,
    repository_plan: repositoryPlan,
    operatorPublicKey: attacker.publicKey,
    now: NOW
  }), /signature/);

  assert.throws(() => resolver.buildIntentExecutorInputResolution({
    identity: hypervisor,
    eligibility: currentEligibility,
    repository_plan: repositoryPlan,
    operatorPublicKey: operator.publicKey,
    now: '2026-08-10T23:51:00.000Z'
  }), /expired/);

  const longPlan = plan(operator, { expiresAt: '2026-08-11T00:00:00.000Z' });
  assert.throws(() => resolver.buildIntentExecutorInputResolution({
    identity: hypervisor,
    eligibility: currentEligibility,
    repository_plan: longPlan,
    operatorPublicKey: operator.publicKey,
    now: NOW
  }), /lifetime/);
});

test('stale eligibility cannot verify an existing resolution', () => {
  const { operator, hypervisor, resolution } = fixtures();
  const changed = eligibility({ policy_digest: D('0') });
  assert.throws(() => resolver.verifyIntentExecutorInputResolution(resolution, {
    eligibility: changed,
    hypervisorPublicKey: hypervisor.publicKey,
    operatorPublicKey: operator.publicKey,
    now: '2026-08-10T23:46:00.000Z'
  }), /stale/);
});

test('eligibility content cannot be rehashed after hidden mutation without changing resolution binding', () => {
  const { operator, hypervisor, resolution } = fixtures();
  const changed = eligibility({ requester: 'attacker' });
  assert.throws(() => resolver.verifyIntentExecutorInputResolution(resolution, {
    eligibility: changed,
    hypervisorPublicKey: hypervisor.publicKey,
    operatorPublicKey: operator.publicKey,
    now: '2026-08-10T23:46:00.000Z'
  }), /stale/);
});

test('re-addressed resolution or resolved-input tampering cannot forge Hypervisor signature', () => {
  const { operator, hypervisor, currentEligibility, resolution } = fixtures();
  const forged = structuredClone(resolution);
  forged.resolved_input.repository_plan.changes[0].new_content = '# attacker\n';
  const {
    resolution_id: ignoredId,
    resolution_digest: ignoredDigest,
    attestation,
    ...body
  } = forged;
  const nextDigest = digestObject(body);
  forged.resolution_id = `resolution:${nextDigest}`;
  forged.resolution_digest = nextDigest;
  forged.attestation = attestation;
  assert.throws(() => resolver.verifyIntentExecutorInputResolution(forged, {
    eligibility: currentEligibility,
    hypervisorPublicKey: hypervisor.publicKey,
    operatorPublicKey: operator.publicKey,
    now: '2026-08-10T23:46:00.000Z'
  }), /signature/);
});

test('resolved handoff tampering cannot claim execution or drop approval gates', () => {
  const { hypervisor, resolution, handoff } = fixtures();
  for (const mutate of [
    value => { value.execution_authorized = true; },
    value => { value.required_independent_approvals = 0; },
    value => { value.required_confirmation_values = []; }
  ]) {
    const forged = structuredClone(handoff);
    mutate(forged);
    const {
      handoff_id: ignoredId,
      handoff_digest: ignoredDigest,
      attestation,
      ...body
    } = forged;
    const nextDigest = digestObject(body);
    forged.handoff_id = `handoff:${nextDigest}`;
    forged.handoff_digest = nextDigest;
    forged.attestation = attestation;
    assert.throws(() => resolver.verifyResolvedIntentExecutionHandoff(forged, {
      resolution,
      hypervisorPublicKey: hypervisor.publicKey
    }), /signature|does not match|non-executing/);
  }
});
