import assert from 'node:assert/strict';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import { validateAgentExecutorPlatformProfile } from '../src/lib/agent-executor-dry-run.mjs';
import {
  AGENT_EXECUTOR_ISOLATION_POLICY_CATALOG,
  AGENT_EXECUTOR_ISOLATION_POLICY_CATALOG_DIGEST,
  validateAgentExecutorIsolationProfile
} from '../src/lib/agent-executor-isolation-profile.mjs';

function platformProfile() {
  return {
    schema: 'axiom-agent-executor-platform-profile.v1',
    profile_id: 'platform-linux-x64-policy-binding',
    operating_system: 'linux',
    architecture: 'x64',
    fact_status: 'measured',
    source_ref: 'synthetic:isolation-policy-binding-test',
    claims: {
      platform_trust_inferred: false,
      secure_boot_verified: false,
      platform_backed_key_verified: false,
      privileged_executor_available: false,
      remote_administration_enabled: false,
      authority_granted: false
    }
  };
}

function isolationProfile() {
  const platform = validateAgentExecutorPlatformProfile(platformProfile());
  const policy = AGENT_EXECUTOR_ISOLATION_POLICY_CATALOG.profiles.linux;
  return {
    schema: 'axiom-agent-executor-isolation-profile.v1',
    profile_id: 'isolation-linux-x64-policy-binding',
    platform_profile_digest: digestObject(platform),
    operating_system: 'linux',
    architecture: 'x64',
    policy: {
      catalog_schema: AGENT_EXECUTOR_ISOLATION_POLICY_CATALOG.schema,
      catalog_digest: AGENT_EXECUTOR_ISOLATION_POLICY_CATALOG_DIGEST,
      policy_id: policy.policy_id,
      revision: policy.revision
    },
    evidence: {
      status: 'declared',
      observation_environment: 'unspecified',
      refs: [],
      real_effects_observed: false
    },
    requirements: {
      common_controls: [...AGENT_EXECUTOR_ISOLATION_POLICY_CATALOG.common_controls],
      mechanism_families: [...policy.mechanism_families],
      repository_code_boundary: policy.repository_code_boundary,
      hosted_ci_sufficient: false,
      physical_device_evidence_required_before_production_promotion: true
    },
    claims: {
      platform_isolation_verified: false,
      repository_code_isolation_verified: false,
      effect_reachable: false,
      production_executor_ready: false,
      remote_execution_enabled: false,
      production_node_enrollment: false,
      deployment_authority: false,
      capability_promoted: false,
      authority_granted: false
    }
  };
}

test('shape-correct isolation profile cannot substitute a different reviewed catalog digest', () => {
  const raw = isolationProfile();
  raw.policy.catalog_digest = 'f'.repeat(64);
  assert.throws(
    () => validateAgentExecutorIsolationProfile(raw, { expectedPlatformProfile: platformProfile() }),
    /catalog digest does not match the reviewed catalog/
  );
});

test('caller cannot smuggle an unreviewed isolation requirement through an extra field', () => {
  const raw = isolationProfile();
  raw.requirements.shell_allowed = true;
  assert.throws(
    () => validateAgentExecutorIsolationProfile(raw),
    /requirements contains unsupported field: shell_allowed/
  );
});
