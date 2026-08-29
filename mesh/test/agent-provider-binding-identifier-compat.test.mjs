import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { agentCompositionDigest } from '../src/lib/agent-composition.mjs';
import {
  agentProviderBindingDigest,
  resolveAgentProviderBinding
} from '../src/lib/agent-provider-binding.mjs';
import { agentProviderProfileDigest } from '../src/lib/agent-provider-profile.mjs';

const DIGEST = 'a'.repeat(64);
const IDENTIFIER_PATTERN = '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$';

function composition() {
  return {
    schema: 'axiom-agent-composition.v0',
    version: 0,
    status: 'inert-contract-laboratory',
    composition_id: 'composition.personal.primary',
    principal_id: 'agent.personal.primary',
    integration_mode: 'integrated',
    self_bundle: { ref: 'self.personal.v1', digest: DIGEST },
    runtimes: [],
    models: [],
    memories: [{
      memory_id: 'memory.primary',
      provider_id: 'provider.memory.memory-os',
      profile_ref: 'profile.memory.memory-os.v0',
      classes: ['semantic', 'episodic']
    }],
    skill_sources: [],
    cognitive_workers: {
      policy_ref: null,
      authority_effect: 'none',
      delegation_enabled: false
    },
    continuity_policy_ref: null,
    credential_broker_policy_ref: null,
    assurance_policy_ref: null,
    portability: { enabled: true, export_profile_ref: null },
    created_at: '2026-08-29T12:00:00.000Z',
    updated_at: '2026-08-29T12:00:00.000Z',
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function memoryOsProfile() {
  return {
    schema: 'axiom-agent-provider-profile.v0',
    version: 0,
    status: 'inert-provider-laboratory',
    provider_id: 'provider.memory.memory-os',
    provider_class: 'memory',
    implementation: {
      artifact_ref: 'artifact.memory.memory-os.elyan.v0',
      artifact_digest: '1'.repeat(64),
      source_kind: 'external',
      upstream_ref: 'upstream.scottcjn.memory-os-elyan-edition'
    },
    profile_ref: 'profile.memory.memory-os.v0',
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

async function readSchema(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, import.meta.url), 'utf8'));
}

test('provider binding uses the same identifier grammar exposed by composition and provider profile schemas', async () => {
  const [compositionSchema, providerSchema, bindingSchema] = await Promise.all([
    readSchema('../config/agent-composition-v0.schema.json'),
    readSchema('../config/agent-provider-profile-v0.schema.json'),
    readSchema('../config/agent-provider-binding-v0.schema.json')
  ]);

  assert.equal(compositionSchema.$defs.identifier.pattern, IDENTIFIER_PATTERN);
  assert.equal(bindingSchema.$defs.identifier.pattern, IDENTIFIER_PATTERN);

  const providerIdentifierPatterns = [
    providerSchema.properties.provider_id.pattern,
    providerSchema.properties.profile_ref.pattern,
    providerSchema.properties.implementation.properties.artifact_ref.pattern,
    providerSchema.properties.implementation.properties.upstream_ref.anyOf[0].pattern,
    providerSchema.properties.capabilities.items.pattern
  ];
  assert.deepEqual(
    [...new Set(providerIdentifierPatterns)],
    [IDENTIFIER_PATTERN],
    'all identifier-bearing Provider Profile paths must use the canonical AXIOM identifier grammar'
  );
});

test('provider binding resolves real hyphenated identifiers accepted by the shared grammar', () => {
  const comp = composition();
  const profile = memoryOsProfile();
  const binding = {
    schema: 'axiom-agent-provider-binding.v0',
    version: 0,
    status: 'inert-binding-laboratory',
    binding_id: 'binding.personal.memory-os.v0',
    composition_id: comp.composition_id,
    composition_digest: agentCompositionDigest(comp),
    bindings: [{
      provider_id: profile.provider_id,
      provider_class: profile.provider_class,
      profile_ref: profile.profile_ref,
      provider_digest: agentProviderProfileDigest(profile),
      target_ref: 'memory.primary',
      required: true
    }],
    created_at: '2026-08-29T12:00:00.000Z',
    updated_at: '2026-08-29T12:00:00.000Z',
    authority_effect: 'none',
    trust_effect: 'evidence-only',
    network_effect: 'none',
    runtime_activation: false,
    settlement_activation: false
  };

  const result = resolveAgentProviderBinding(binding, comp, [profile]);
  assert.equal(result.valid, true);
  assert.equal(result.providers, 1);
  assert.equal(result.binding_digest, agentProviderBindingDigest(binding));
});
