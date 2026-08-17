import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import { validateAgentExecutorPlatformProfile } from '../src/lib/agent-executor-dry-run.mjs';
import {
  AGENT_EXECUTOR_ISOLATION_POLICY_CATALOG,
  AGENT_EXECUTOR_ISOLATION_POLICY_CATALOG_DIGEST,
  assessAgentExecutorIsolationProfile,
  validateAgentExecutorIsolationProfile
} from '../src/lib/agent-executor-isolation-profile.mjs';

const ROOT = new URL('../../', import.meta.url);
const FALSE_CLAIMS = Object.freeze({
  platform_isolation_verified: false,
  repository_code_isolation_verified: false,
  effect_reachable: false,
  production_executor_ready: false,
  remote_execution_enabled: false,
  production_node_enrollment: false,
  deployment_authority: false,
  capability_promoted: false,
  authority_granted: false
});

function platformProfile(operatingSystem = 'linux', architecture = 'x64') {
  return {
    schema: 'axiom-agent-executor-platform-profile.v1',
    profile_id: `platform-${operatingSystem}-${architecture}`,
    operating_system: operatingSystem,
    architecture,
    fact_status: 'measured',
    source_ref: 'synthetic:isolation-profile-test',
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

function isolationProfile(
  operatingSystem = 'linux',
  architecture = 'x64',
  { evidenceStatus = 'declared', observationEnvironment = 'unspecified' } = {}
) {
  const platform = validateAgentExecutorPlatformProfile(platformProfile(operatingSystem, architecture));
  const policy = AGENT_EXECUTOR_ISOLATION_POLICY_CATALOG.profiles[operatingSystem];
  return {
    schema: 'axiom-agent-executor-isolation-profile.v1',
    profile_id: `isolation-${operatingSystem}-${architecture}`,
    platform_profile_digest: digestObject(platform),
    operating_system: operatingSystem,
    architecture,
    policy: {
      catalog_schema: AGENT_EXECUTOR_ISOLATION_POLICY_CATALOG.schema,
      catalog_digest: AGENT_EXECUTOR_ISOLATION_POLICY_CATALOG_DIGEST,
      policy_id: policy.policy_id,
      revision: policy.revision
    },
    evidence: {
      status: evidenceStatus,
      observation_environment: observationEnvironment,
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
    claims: { ...FALSE_CLAIMS }
  };
}

test('reviewed isolation catalog is deterministic and every platform remains effect-ineligible', async () => {
  const committed = JSON.parse(await readFile(new URL('agent-commons/executor-isolation-profiles.json', ROOT), 'utf8'));
  assert.deepEqual(committed, AGENT_EXECUTOR_ISOLATION_POLICY_CATALOG);
  assert.equal(digestObject(committed), AGENT_EXECUTOR_ISOLATION_POLICY_CATALOG_DIGEST);
  assert.deepEqual(Object.keys(committed.profiles), ['linux', 'macos', 'windows']);
  assert.equal(committed.common_controls.length, 15);
  for (const boundary of Object.values(committed.boundaries)) assert.equal(boundary, false);
  for (const policy of Object.values(committed.profiles)) {
    assert.equal(policy.hosted_ci_sufficient, false);
    assert.equal(policy.physical_device_evidence_required_before_production_promotion, true);
    assert.ok(policy.mechanism_families.length >= 5);
  }
});

test('Linux macOS and Windows requirement profiles validate but never authorize effects', () => {
  for (const [operatingSystem, architecture] of [
    ['linux', 'x64'],
    ['macos', 'arm64'],
    ['windows', 'x64']
  ]) {
    const expectedPlatformProfile = platformProfile(operatingSystem, architecture);
    const profile = isolationProfile(operatingSystem, architecture);
    const assessment = assessAgentExecutorIsolationProfile(profile, { expectedPlatformProfile });
    assert.equal(assessment.requirements_match_reviewed_policy, true);
    assert.equal(assessment.platform_isolation_verified, false);
    assert.equal(assessment.repository_code_isolation_verified, false);
    assert.equal(assessment.effect_admission_eligible, false);
    assert.equal(assessment.production_executor_ready, false);
    assert.equal(assessment.hosted_ci_is_physical_device_proof, false);
  }
});

test('platform-profile digest OS and architecture substitution fail closed', () => {
  const profile = isolationProfile('linux', 'x64');

  assert.throws(
    () => validateAgentExecutorIsolationProfile(profile, { expectedPlatformProfile: platformProfile('linux', 'arm64') }),
    /platform-profile digest substitution|platform facts/
  );

  const wrongDigest = structuredClone(profile);
  wrongDigest.platform_profile_digest = '0'.repeat(64);
  assert.throws(
    () => validateAgentExecutorIsolationProfile(wrongDigest, { expectedPlatformProfile: platformProfile('linux', 'x64') }),
    /digest substitution/
  );

  const wrongArchitecture = structuredClone(profile);
  wrongArchitecture.architecture = 'arm64';
  assert.throws(
    () => validateAgentExecutorIsolationProfile(wrongArchitecture, { expectedPlatformProfile: platformProfile('linux', 'x64') }),
    /platform facts/
  );
});

test('common control omission and cross-platform mechanism substitution fail closed', () => {
  const omitted = isolationProfile('linux', 'x64');
  omitted.requirements.common_controls.pop();
  assert.throws(
    () => validateAgentExecutorIsolationProfile(omitted),
    /common controls must match/
  );

  const substituted = isolationProfile('linux', 'x64');
  substituted.requirements.mechanism_families =
    [...AGENT_EXECUTOR_ISOLATION_POLICY_CATALOG.profiles.windows.mechanism_families];
  assert.throws(
    () => validateAgentExecutorIsolationProfile(substituted),
    /mechanism families must match/
  );

  const unknown = isolationProfile('windows', 'x64');
  unknown.requirements.mechanism_families[0] = 'windows-magic-sandbox';
  assert.throws(
    () => validateAgentExecutorIsolationProfile(unknown),
    /mechanism families must match/
  );
});

test('hosted CI and mechanism requirements cannot self-promote platform isolation', () => {
  const hosted = isolationProfile('macos', 'arm64', {
    evidenceStatus: 'reproduced',
    observationEnvironment: 'hosted-ci'
  });
  const assessment = assessAgentExecutorIsolationProfile(hosted, {
    expectedPlatformProfile: platformProfile('macos', 'arm64')
  });
  assert.equal(assessment.hosted_ci_is_physical_device_proof, false);
  assert.equal(assessment.platform_isolation_verified, false);
  assert.equal(assessment.effect_admission_eligible, false);

  const elevatedHosted = structuredClone(hosted);
  elevatedHosted.requirements.hosted_ci_sufficient = true;
  assert.throws(
    () => validateAgentExecutorIsolationProfile(elevatedHosted),
    /Hosted CI cannot be sufficient/
  );

  const claim = structuredClone(hosted);
  claim.claims.platform_isolation_verified = true;
  assert.throws(
    () => validateAgentExecutorIsolationProfile(claim),
    /attempt to elevate platform_isolation_verified/
  );
});

test('external verification requires a separate confirmation and still grants no execution authority', () => {
  const raw = isolationProfile('windows', 'x64', {
    evidenceStatus: 'externally-verified',
    observationEnvironment: 'external-lab'
  });
  raw.evidence.refs = ['evidence:external-lab-report'];

  assert.throws(
    () => validateAgentExecutorIsolationProfile(raw),
    /requires separate verifier confirmation/
  );

  const assessment = assessAgentExecutorIsolationProfile(raw, {
    expectedPlatformProfile: platformProfile('windows', 'x64'),
    verifierConfirmed: true
  });
  assert.equal(assessment.independent_verifier_confirmed, true);
  assert.equal(assessment.platform_isolation_verified, false);
  assert.equal(assessment.repository_code_isolation_verified, false);
  assert.equal(assessment.effect_admission_eligible, false);
  assert.equal(assessment.production_executor_ready, false);
});

test('profile cannot claim real effects production readiness remote execution or authority', () => {
  for (const claimKey of Object.keys(FALSE_CLAIMS)) {
    const raw = isolationProfile('linux', 'arm64');
    raw.claims[claimKey] = true;
    assert.throws(
      () => validateAgentExecutorIsolationProfile(raw),
      new RegExp(`attempt to elevate ${claimKey}`)
    );
  }

  const observed = isolationProfile('linux', 'arm64');
  observed.evidence.real_effects_observed = true;
  assert.throws(
    () => validateAgentExecutorIsolationProfile(observed),
    /cannot claim real effects/
  );
});

test('repository-code boundary and physical-device promotion requirement cannot be weakened', () => {
  const raw = isolationProfile('macos', 'arm64');
  raw.requirements.repository_code_boundary = 'fixed-argv-is-enough';
  assert.throws(
    () => validateAgentExecutorIsolationProfile(raw),
    /repository-code boundary/
  );

  const promotion = isolationProfile('windows', 'x64');
  promotion.requirements.physical_device_evidence_required_before_production_promotion = false;
  assert.throws(
    () => validateAgentExecutorIsolationProfile(promotion),
    /Physical-device evidence must remain required/
  );
});

test('isolation validator is structurally pre-effect and imports no host effect module', async () => {
  const source = await readFile(new URL('mesh/src/lib/agent-executor-isolation-profile.mjs', ROOT), 'utf8');
  const forbiddenImport = /from\s+['"]node:(?:child_process|fs(?:\/promises)?|net|dns(?:\/promises)?|http|https|tls|dgram|worker_threads)['"]/;
  assert.equal(forbiddenImport.test(source), false);
  assert.equal(/\b(?:spawn|spawnSync|exec|execSync|execFile|execFileSync)\s*\(/.test(source), false);
  assert.equal(/(?<!\.)\bfetch\s*\(/.test(source), false);
});

test('isolation threat model preserves the no-effect promotion boundary', async () => {
  const model = JSON.parse(await readFile(
    new URL('agent-commons/executor-isolation-threat-model.json', ROOT),
    'utf8'
  ));
  assert.equal(model.schema, 'axiom-agent-executor-isolation-threat-model.v1');
  assert.equal(model.phase, 'platform-isolation-profile-pre-effect');
  assert.ok(model.attack_classes.length >= 16);
  assert.ok(model.promotion_blockers.length >= 8);
  for (const [key, value] of Object.entries(model.boundaries)) {
    assert.equal(value, false, `${key} must remain false`);
  }
});
