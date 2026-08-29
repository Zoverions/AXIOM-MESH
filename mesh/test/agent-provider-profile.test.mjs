import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AGENT_PROVIDER_PROFILE_SCHEMA,
  agentProviderProfileDigest,
  validateAgentProviderProfile
} from '../src/lib/agent-provider-profile.mjs';

const DIGEST = 'a'.repeat(64);

function validProfile() {
  return {
    schema: 'axiom-agent-provider-profile.v0',
    version: 0,
    status: 'inert-provider-laboratory',
    provider_id: 'provider.memory.example',
    provider_class: 'memory',
    implementation: {
      artifact_ref: 'artifact.memory.example.v1',
      artifact_digest: DIGEST,
      source_kind: 'external',
      upstream_ref: 'upstream.memory.example'
    },
    profile_ref: 'profile.memory.example.v1',
    capabilities: ['memory.semantic', 'memory.episodic'],
    evidence_classes: ['deterministic-derivation'],
    assurance_ceiling: 'none',
    created_at: '2026-08-29T12:00:00.000Z',
    updated_at: '2026-08-29T12:00:00.000Z',
    authority_effect: 'none',
    trust_effect: 'evidence-only',
    credential_visibility: 'none',
    network_effect: 'none',
    runtime_activation: false,
    settlement_activation: false
  };
}

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

test('validates a zero-authority provider profile and returns a frozen summary', () => {
  const profile = validProfile();
  const result = validateAgentProviderProfile(profile);

  assert.equal(AGENT_PROVIDER_PROFILE_SCHEMA, profile.schema);
  assert.equal(result.valid, true);
  assert.equal(result.provider_id, profile.provider_id);
  assert.equal(result.provider_class, 'memory');
  assert.equal(result.profile_ref, profile.profile_ref);
  assert.equal(result.assurance_ceiling, 'none');
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.trust_effect, 'evidence-only');
  assert.equal(result.network_effect, 'none');
  assert.equal(result.runtime_activation, false);
  assert.equal(result.settlement_activation, false);
  assert.equal(result.provider_digest, agentProviderProfileDigest(profile));
  assert.match(result.provider_digest, /^[a-f0-9]{64}$/);
  assert.equal(Object.isFrozen(result), true);
});

test('accepts all six provider classes without changing authority', () => {
  for (const providerClass of [
    'memory',
    'knowledge-projection',
    'agent-interop',
    'attestation',
    'provenance',
    'settlement'
  ]) {
    const profile = validProfile();
    const identifierSlug = providerClass.replaceAll('-', '.');
    profile.provider_id = `provider.${identifierSlug}`;
    profile.provider_class = providerClass;
    profile.profile_ref = `profile.${identifierSlug}.v1`;
    const result = validateAgentProviderProfile(profile);
    assert.equal(result.provider_class, providerClass);
    assert.equal(result.authority_effect, 'none');
    assert.equal(result.runtime_activation, false);
    assert.equal(result.settlement_activation, false);
  }
});

test('digest is deterministic across object key order', () => {
  const first = validProfile();
  const second = Object.fromEntries(Object.entries(first).reverse());
  assert.equal(agentProviderProfileDigest(first), agentProviderProfileDigest(second));
});

test('unknown and secret-bearing fields fail closed', () => {
  for (const field of ['api_key', 'cookie', 'payment_token']) {
    const topLevel = validProfile();
    topLevel[field] = 'not-allowed';
    assert.throws(() => validateAgentProviderProfile(topLevel), /unknown field/i);
  }

  const implementation = validProfile();
  implementation.implementation.api_key = 'not-allowed';
  assert.throws(() => validateAgentProviderProfile(implementation), /unknown field/i);
});

test('invalid provider metadata fails closed', () => {
  const providerClass = validProfile();
  providerClass.provider_class = 'universal';
  assert.throws(() => validateAgentProviderProfile(providerClass), /provider_class/i);

  const sourceKind = validProfile();
  sourceKind.implementation.source_kind = 'ambient';
  assert.throws(() => validateAgentProviderProfile(sourceKind), /source_kind/i);

  const evidence = validProfile();
  evidence.evidence_classes = ['magic-proof'];
  assert.throws(() => validateAgentProviderProfile(evidence), /evidence_classes/i);

  const assurance = validProfile();
  assurance.assurance_ceiling = 'absolute';
  assert.throws(() => validateAgentProviderProfile(assurance), /assurance_ceiling/i);
});

test('unverified external artifacts use explicit null digest without weakening pinned sources', () => {
  const unresolvedExternal = validProfile();
  unresolvedExternal.implementation.artifact_digest = null;
  assert.equal(validateAgentProviderProfile(unresolvedExternal).valid, true);

  const missingUpstream = validProfile();
  missingUpstream.implementation.artifact_digest = null;
  missingUpstream.implementation.upstream_ref = null;
  assert.throws(() => validateAgentProviderProfile(missingUpstream), /upstream_ref/i);

  for (const sourceKind of ['local', 'fork', 'adapter']) {
    const pinnedSource = validProfile();
    pinnedSource.implementation.source_kind = sourceKind;
    pinnedSource.implementation.artifact_digest = null;
    assert.throws(() => validateAgentProviderProfile(pinnedSource), /artifact_digest/i);
  }
});

test('duplicate and oversized capability or evidence lists fail closed', () => {
  const duplicateCapability = validProfile();
  duplicateCapability.capabilities.push('memory.semantic');
  assert.throws(() => validateAgentProviderProfile(duplicateCapability), /duplicate/i);

  const duplicateEvidence = validProfile();
  duplicateEvidence.evidence_classes.push('deterministic-derivation');
  assert.throws(() => validateAgentProviderProfile(duplicateEvidence), /duplicate/i);

  const oversizedCapabilities = validProfile();
  oversizedCapabilities.capabilities = Array.from({ length: 33 }, (_, index) => `capability.${index}`);
  assert.throws(() => validateAgentProviderProfile(oversizedCapabilities), /at most 32/i);

  const oversizedEvidence = validProfile();
  oversizedEvidence.evidence_classes = Array.from({ length: 17 }, () => 'self-assertion');
  assert.throws(() => validateAgentProviderProfile(oversizedEvidence), /at most 16/i);
});

test('malformed identifiers and digests fail closed', () => {
  const identifier = validProfile();
  identifier.provider_id = 'not valid with spaces';
  assert.throws(() => validateAgentProviderProfile(identifier), /provider_id/i);

  const digest = validProfile();
  digest.implementation.artifact_digest = 'abc';
  assert.throws(() => validateAgentProviderProfile(digest), /artifact_digest/i);
});

test('updated_at cannot precede created_at', () => {
  const profile = validProfile();
  profile.updated_at = '2026-08-29T11:59:59.000Z';
  assert.throws(() => validateAgentProviderProfile(profile), /updated_at/i);
});

test('hard non-authority boundary fields cannot be widened', () => {
  const mutations = [
    ['authority_effect', 'grant'],
    ['trust_effect', 'trusted'],
    ['credential_visibility', 'model'],
    ['network_effect', 'outbound'],
    ['runtime_activation', true],
    ['settlement_activation', true]
  ];

  for (const [field, value] of mutations) {
    const profile = validProfile();
    profile[field] = value;
    assert.throws(() => validateAgentProviderProfile(profile), /boundary/i);
  }
});

test('validation does not mutate a deeply frozen profile', () => {
  const profile = deepFreeze(validProfile());
  const before = JSON.stringify(profile);
  const result = validateAgentProviderProfile(profile);
  assert.equal(result.valid, true);
  assert.equal(JSON.stringify(profile), before);
});
