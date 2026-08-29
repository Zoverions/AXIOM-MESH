import assert from 'node:assert/strict';
import test from 'node:test';
import { agentCompositionDigest } from '../src/lib/agent-composition.mjs';
import {
  agentProviderBindingDigest,
  resolveAgentProviderBinding
} from '../src/lib/agent-provider-binding.mjs';
import { agentProviderProfileDigest } from '../src/lib/agent-provider-profile.mjs';

const DIGEST = 'a'.repeat(64);

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

test('provider binding uses the same identifier grammar as composition and provider profiles', () => {
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
