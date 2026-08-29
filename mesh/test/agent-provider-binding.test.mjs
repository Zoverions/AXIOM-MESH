import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  AGENT_PROVIDER_BINDING_SCHEMA,
  agentProviderBindingDigest,
  resolveAgentProviderBinding,
  validateAgentProviderBinding
} from '../src/lib/agent-provider-binding.mjs';
import { agentCompositionDigest } from '../src/lib/agent-composition.mjs';
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
      provider_id: 'provider.memory.memoryos',
      profile_ref: 'profile.memory.memoryos.v0',
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

function providerProfile({
  providerId = 'provider.memory.memoryos',
  providerClass = 'memory',
  profileRef = 'profile.memory.memoryos.v0',
  digit = '1'
} = {}) {
  return {
    schema: 'axiom-agent-provider-profile.v0',
    version: 0,
    status: 'inert-provider-laboratory',
    provider_id: providerId,
    provider_class: providerClass,
    implementation: {
      artifact_ref: `artifact.${providerClass.replaceAll('-', '')}.example.v0`,
      artifact_digest: digit.repeat(64),
      source_kind: 'external',
      upstream_ref: `upstream.${providerClass.replaceAll('-', '')}.example`
    },
    profile_ref: profileRef,
    capabilities: [`capability.${providerClass.replaceAll('-', '')}.observe`],
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

function bindingDocument(comp, profiles) {
  const entries = profiles.map((profile, index) => ({
    provider_id: profile.provider_id,
    provider_class: profile.provider_class,
    profile_ref: profile.profile_ref,
    provider_digest: agentProviderProfileDigest(profile),
    target_ref: profile.provider_class === 'memory'
      ? 'memory.primary'
      : comp.composition_id,
    required: index === 0
  }));
  return {
    schema: 'axiom-agent-provider-binding.v0',
    version: 0,
    status: 'inert-binding-laboratory',
    binding_id: 'binding.personal.primary.v0',
    composition_id: comp.composition_id,
    composition_digest: agentCompositionDigest(comp),
    bindings: entries,
    created_at: '2026-08-29T12:00:00.000Z',
    updated_at: '2026-08-29T12:00:00.000Z',
    authority_effect: 'none',
    trust_effect: 'evidence-only',
    network_effect: 'none',
    runtime_activation: false,
    settlement_activation: false
  };
}

test('schema is closed-world and preserves a zero-authority binding boundary', async () => {
  const schema = JSON.parse(await readFile(
    new URL('../config/agent-provider-binding-v0.schema.json', import.meta.url),
    'utf8'
  ));
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schema.const, 'axiom-agent-provider-binding.v0');
  assert.equal(schema.properties.status.const, 'inert-binding-laboratory');
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.network_effect.const, 'none');
  assert.equal(schema.properties.runtime_activation.const, false);
  assert.equal(schema.properties.settlement_activation.const, false);
});

test('resolves exact provider profiles against an immutable composition digest', () => {
  const comp = composition();
  const memory = providerProfile();
  const provenance = providerProfile({
    providerId: 'provider.provenance.avap',
    providerClass: 'provenance',
    profileRef: 'profile.provenance.avap.v0',
    digit: '2'
  });
  const document = bindingDocument(comp, [memory, provenance]);

  const result = resolveAgentProviderBinding(document, comp, [provenance, memory]);

  assert.equal(AGENT_PROVIDER_BINDING_SCHEMA, document.schema);
  assert.equal(result.valid, true);
  assert.equal(result.binding_id, document.binding_id);
  assert.equal(result.composition_id, comp.composition_id);
  assert.equal(result.composition_digest, agentCompositionDigest(comp));
  assert.equal(result.providers, 2);
  assert.deepEqual(result.provider_classes, ['memory', 'provenance']);
  assert.equal(result.binding_digest, agentProviderBindingDigest(document));
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.trust_effect, 'evidence-only');
  assert.equal(result.network_effect, 'none');
  assert.equal(result.runtime_activation, false);
  assert.equal(result.settlement_activation, false);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.provider_classes), true);
});

test('memory provider binding must match the declared composition memory slot', () => {
  const comp = composition();
  const memory = providerProfile();
  const document = bindingDocument(comp, [memory]);
  document.bindings[0].target_ref = 'memory.unknown';
  assert.throws(
    () => resolveAgentProviderBinding(document, comp, [memory]),
    /memory target/i
  );
});

test('composition-wide providers must target the composition itself', () => {
  const comp = composition();
  const provenance = providerProfile({
    providerId: 'provider.provenance.avap',
    providerClass: 'provenance',
    profileRef: 'profile.provenance.avap.v0',
    digit: '2'
  });
  const document = bindingDocument(comp, [provenance]);
  document.bindings[0].target_ref = 'some.other.target';
  assert.throws(
    () => resolveAgentProviderBinding(document, comp, [provenance]),
    /composition target/i
  );
});

test('binding fails closed on composition or provider digest drift', () => {
  const comp = composition();
  const memory = providerProfile();
  const document = bindingDocument(comp, [memory]);

  const changedComposition = composition();
  changedComposition.portability.enabled = false;
  assert.throws(
    () => resolveAgentProviderBinding(document, changedComposition, [memory]),
    /composition digest/i
  );

  const changedProvider = structuredClone(memory);
  changedProvider.capabilities.push('capability.memory.extra');
  assert.throws(
    () => resolveAgentProviderBinding(document, comp, [changedProvider]),
    /provider digest/i
  );
});

test('every declared composition memory must have an exact provider binding', () => {
  const comp = composition();
  const provenance = providerProfile({
    providerId: 'provider.provenance.avap',
    providerClass: 'provenance',
    profileRef: 'profile.provenance.avap.v0',
    digit: '2'
  });
  const document = bindingDocument(comp, [provenance]);
  assert.throws(
    () => resolveAgentProviderBinding(document, comp, [provenance]),
    /unbound composition memory/i
  );
});

test('unknown fields and authority widening fail closed', () => {
  const comp = composition();
  const memory = providerProfile();
  for (const [field, value] of [
    ['authority_effect', 'grant'],
    ['trust_effect', 'trusted'],
    ['network_effect', 'outbound'],
    ['runtime_activation', true],
    ['settlement_activation', true]
  ]) {
    const document = bindingDocument(comp, [memory]);
    document[field] = value;
    assert.throws(() => validateAgentProviderBinding(document), /boundary/i);
  }

  const document = bindingDocument(comp, [memory]);
  document.bindings[0].credential = 'secret';
  assert.throws(() => validateAgentProviderBinding(document), /unknown field/i);
});

test('duplicate bindings and missing profiles fail closed', () => {
  const comp = composition();
  const memory = providerProfile();
  const document = bindingDocument(comp, [memory]);
  document.bindings.push({ ...document.bindings[0] });
  assert.throws(() => validateAgentProviderBinding(document), /duplicate/i);

  const fresh = bindingDocument(comp, [memory]);
  assert.throws(
    () => resolveAgentProviderBinding(fresh, comp, []),
    /provider profile/i
  );
});
