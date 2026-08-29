import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  AGENT_COMPOSITION_SCHEMA,
  agentCompositionDigest,
  validateAgentComposition
} from '../src/lib/agent-composition.mjs';

const DIGEST = 'a'.repeat(64);

function validComposition() {
  return {
    schema: 'axiom-agent-composition.v0',
    version: 0,
    status: 'inert-contract-laboratory',
    composition_id: 'composition.personal.primary',
    principal_id: 'agent.personal.primary',
    integration_mode: 'integrated',
    self_bundle: { ref: 'self.personal.v1', digest: DIGEST },
    runtimes: [{
      runtime_id: 'runtime.hermes',
      adapter_id: 'adapter.hermes.v1',
      profile_ref: 'profile.runtime.hermes.v1',
      required: true
    }],
    models: [{
      model_id: 'model.reasoner.primary',
      provider_id: 'provider.example',
      profile_ref: 'profile.model.reasoner.v1',
      roles: ['reasoning']
    }],
    memories: [{
      memory_id: 'memory.primary',
      provider_id: 'memory.example',
      profile_ref: 'profile.memory.primary.v1',
      classes: ['semantic', 'episodic']
    }],
    skill_sources: [{
      source_id: 'skills.local',
      kind: 'native',
      artifact_ref: 'artifact.skills.local.v1',
      profile_ref: 'profile.skills.local.v1'
    }],
    cognitive_workers: {
      policy_ref: 'policy.cognitive-workers.v1',
      authority_effect: 'none',
      delegation_enabled: false
    },
    continuity_policy_ref: 'policy.continuity.v1',
    credential_broker_policy_ref: 'policy.credentials.v1',
    assurance_policy_ref: 'policy.assurance.v1',
    portability: {
      enabled: true,
      export_profile_ref: 'profile.export.agent-self.v1'
    },
    created_at: '2026-08-29T12:00:00.000Z',
    updated_at: '2026-08-29T12:00:00.000Z',
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

test('validates a zero-authority integrated composition', () => {
  const document = validComposition();
  const result = validateAgentComposition(document);
  assert.equal(AGENT_COMPOSITION_SCHEMA, document.schema);
  assert.equal(result.valid, true);
  assert.equal(result.composition_id, document.composition_id);
  assert.equal(result.principal_id, document.principal_id);
  assert.equal(result.integration_mode, 'integrated');
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.network_effect, 'none');
  assert.equal(result.runtime_activation, false);
  assert.equal(result.composition_digest, agentCompositionDigest(document));
  assert.match(result.composition_digest, /^[a-f0-9]{64}$/);
  assert.equal(Object.isFrozen(result), true);
});

test('digest is deterministic across object key order', () => {
  const first = validComposition();
  const second = Object.fromEntries(Object.entries(first).reverse());
  assert.equal(agentCompositionDigest(first), agentCompositionDigest(second));
});

test('native mode receives no implicit authority', () => {
  const document = validComposition();
  document.integration_mode = 'native';
  const result = validateAgentComposition(document);
  assert.equal(result.integration_mode, 'native');
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.runtime_activation, false);
});

test('cognitive worker declarations cannot enable delegation', () => {
  const document = validComposition();
  document.cognitive_workers.delegation_enabled = true;
  assert.throws(() => validateAgentComposition(document), /cognitive worker/i);
});

test('unknown and credential-bearing fields fail closed', () => {
  const topLevel = validComposition();
  topLevel.password = 'not-allowed';
  assert.throws(() => validateAgentComposition(topLevel), /unknown field/i);

  const runtime = validComposition();
  runtime.runtimes[0].api_key = 'not-allowed';
  assert.throws(() => validateAgentComposition(runtime), /unknown field/i);

  const model = validComposition();
  model.models[0].refresh_token = 'not-allowed';
  assert.throws(() => validateAgentComposition(model), /unknown field/i);
});

test('duplicate component ids and oversized lists fail closed', () => {
  const duplicate = validComposition();
  duplicate.runtimes.push({ ...duplicate.runtimes[0] });
  assert.throws(() => validateAgentComposition(duplicate), /duplicate runtime_id/i);

  const oversized = validComposition();
  oversized.models = Array.from({ length: 33 }, (_, index) => ({
    model_id: `model.${index}`,
    provider_id: 'provider.example',
    profile_ref: `profile.model.${index}`,
    roles: ['reasoning']
  }));
  assert.throws(() => validateAgentComposition(oversized), /at most 32/i);
});

test('updated_at cannot precede created_at', () => {
  const document = validComposition();
  document.updated_at = '2026-08-29T11:59:59.000Z';
  assert.throws(() => validateAgentComposition(document), /updated_at/i);
});

test('validation does not mutate a deeply frozen document', () => {
  const document = validComposition();
  const deepFreeze = value => {
    if (value && typeof value === 'object') {
      for (const child of Object.values(value)) deepFreeze(child);
      Object.freeze(value);
    }
    return value;
  };
  deepFreeze(document);
  assert.doesNotThrow(() => validateAgentComposition(document));
});

test('validator module imports only the local canonical helper', async () => {
  const sourceUrl = new URL('../src/lib/agent-composition.mjs', import.meta.url);
  const source = await readFile(sourceUrl, 'utf8');
  const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1]);
  assert.deepEqual(imports, ['./canonical.mjs']);
});
