import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { agentCompositionDigest } from '../src/lib/agent-composition.mjs';
import {
  COGNITIVE_TOPOLOGY_SCHEMA,
  cognitiveTopologyDigest,
  resolveCognitiveTopology,
  validateCognitiveTopology
} from '../src/lib/cognitive-topology.mjs';

const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);

function validComposition() {
  return {
    schema: 'axiom-agent-composition.v0',
    version: 0,
    status: 'inert-contract-laboratory',
    composition_id: 'composition.personal.primary',
    principal_id: 'agent.personal.primary',
    integration_mode: 'integrated',
    self_bundle: { ref: 'self.personal.v1', digest: DIGEST_A },
    runtimes: [{
      runtime_id: 'runtime.hermes',
      adapter_id: 'adapter.hermes.v1',
      profile_ref: 'profile.runtime.hermes.v1',
      required: true
    }],
    models: [
      {
        model_id: 'model.identity.kernel',
        provider_id: 'provider.local',
        profile_ref: 'profile.model.identity.v1',
        roles: ['reasoning', 'planning']
      },
      {
        model_id: 'model.primary.frontier',
        provider_id: 'provider.frontier',
        profile_ref: 'profile.model.frontier.v1',
        roles: ['reasoning', 'research', 'coding']
      },
      {
        model_id: 'model.ephemeral.critic',
        provider_id: 'provider.critic',
        profile_ref: 'profile.model.critic.v1',
        roles: ['critique']
      }
    ],
    memories: [{
      memory_id: 'memory.primary',
      provider_id: 'memory.local',
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

function validTopology(composition = validComposition()) {
  return {
    schema: 'axiom-cognitive-topology.v0',
    version: 0,
    status: 'inert-contract-laboratory',
    topology_id: 'topology.personal.primary',
    composition_id: composition.composition_id,
    composition_digest: agentCompositionDigest(composition),
    nodes: [
      {
        node_id: 'node.identity.kernel',
        model_id: 'model.identity.kernel',
        engagement: 'persistent',
        topology_role: 'identity-kernel',
        access_mode: 'local-runtime',
        custody: 'owner-local',
        weights: {
          state: 'open-acquired',
          artifact_digest: DIGEST_B,
          licence_ref: 'license.identity.kernel.v1'
        },
        persistence: {
          mode: 'local',
          provider_id: null,
          state_ref: 'state.identity.kernel.v1',
          exportability: 'full'
        },
        continuity_importance: 'critical',
        fidelity_importance: 'critical',
        adaptation_authorization_ref: 'adapt.identity.kernel.v1',
        lineage_ref: 'lineage.identity.kernel.v1',
        transition_policy_ref: 'policy.identity.kernel.transition.v1'
      },
      {
        node_id: 'node.primary.frontier',
        model_id: 'model.primary.frontier',
        engagement: 'primary',
        topology_role: 'primary-embodiment',
        access_mode: 'api',
        custody: 'provider-controlled',
        weights: {
          state: 'closed',
          artifact_digest: null,
          licence_ref: null
        },
        persistence: {
          mode: 'provider-bound',
          provider_id: 'provider.frontier',
          state_ref: 'state.frontier.personalization.v1',
          exportability: 'partial'
        },
        continuity_importance: 'important',
        fidelity_importance: 'critical',
        adaptation_authorization_ref: null,
        lineage_ref: null,
        transition_policy_ref: 'policy.frontier.transition.v1'
      },
      {
        node_id: 'node.ephemeral.critic',
        model_id: 'model.ephemeral.critic',
        engagement: 'ephemeral',
        topology_role: 'evaluator',
        access_mode: 'api',
        custody: 'owner-remote',
        weights: {
          state: 'not-applicable',
          artifact_digest: null,
          licence_ref: null
        },
        persistence: {
          mode: 'none',
          provider_id: null,
          state_ref: null,
          exportability: 'none'
        },
        continuity_importance: 'optional',
        fidelity_importance: 'optional',
        adaptation_authorization_ref: null,
        lineage_ref: null,
        transition_policy_ref: null
      }
    ],
    created_at: '2026-08-29T12:30:00.000Z',
    updated_at: '2026-08-29T12:30:00.000Z',
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

test('validates an inert cognitive topology and produces a deterministic digest', () => {
  const topology = validTopology();
  const result = validateCognitiveTopology(topology);
  assert.equal(COGNITIVE_TOPOLOGY_SCHEMA, topology.schema);
  assert.equal(result.valid, true);
  assert.equal(result.topology_id, topology.topology_id);
  assert.equal(result.composition_id, topology.composition_id);
  assert.equal(result.topology_digest, cognitiveTopologyDigest(topology));
  assert.match(result.topology_digest, /^[a-f0-9]{64}$/);
  assert.equal(result.contains_secret_material, false);
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.network_effect, 'none');
  assert.equal(result.runtime_activation, false);
  assert.equal(Object.isFrozen(result), true);
});

test('digest is deterministic across object key order', () => {
  const first = validTopology();
  const second = Object.fromEntries(Object.entries(first).reverse());
  assert.equal(cognitiveTopologyDigest(first), cognitiveTopologyDigest(second));
});

test('unknown and credential-like fields fail closed', () => {
  const top = validTopology();
  top.api_key = 'not-allowed';
  assert.throws(() => validateCognitiveTopology(top), /unknown field/i);

  const node = validTopology();
  node.nodes[0].refresh_token = 'not-allowed';
  assert.throws(() => validateCognitiveTopology(node), /unknown field/i);

  const persistence = validTopology();
  persistence.nodes[1].persistence.cookie = 'not-allowed';
  assert.throws(() => validateCognitiveTopology(persistence), /unknown field/i);
});

test('invalid enum values and noncanonical timestamps fail closed', () => {
  const engagement = validTopology();
  engagement.nodes[0].engagement = 'forever';
  assert.throws(() => validateCognitiveTopology(engagement), /engagement/i);

  const timestamp = validTopology();
  timestamp.updated_at = '2026-08-29 12:30:00Z';
  assert.throws(() => validateCognitiveTopology(timestamp), /updated_at/i);
});

test('duplicate node ids and duplicate model ids fail closed', () => {
  const duplicateNode = validTopology();
  duplicateNode.nodes.push({ ...duplicateNode.nodes[2], model_id: 'model.primary.frontier' });
  assert.throws(() => validateCognitiveTopology(duplicateNode), /duplicate node_id/i);

  const duplicateModel = validTopology();
  duplicateModel.nodes[2].model_id = duplicateModel.nodes[1].model_id;
  assert.throws(() => validateCognitiveTopology(duplicateModel), /duplicate model_id/i);
});

test('owned weight states require an exact artifact digest', () => {
  for (const state of ['open-acquired', 'local-proprietary']) {
    const topology = validTopology();
    topology.nodes[0].weights.state = state;
    topology.nodes[0].weights.artifact_digest = null;
    assert.throws(() => validateCognitiveTopology(topology), /artifact_digest/i);
  }
});

test('non-owned weight states reject an artifact digest', () => {
  for (const state of ['closed', 'open-remote', 'not-applicable']) {
    const topology = validTopology();
    topology.nodes[1].weights.state = state;
    topology.nodes[1].weights.artifact_digest = DIGEST_A;
    assert.throws(() => validateCognitiveTopology(topology), /artifact_digest/i);
  }
});

test('provider-bound and mirrored persistence require provider and state references', () => {
  for (const mode of ['provider-bound', 'mirrored']) {
    const missingProvider = validTopology();
    missingProvider.nodes[1].persistence.mode = mode;
    missingProvider.nodes[1].persistence.provider_id = null;
    assert.throws(() => validateCognitiveTopology(missingProvider), /provider_id/i);

    const missingState = validTopology();
    missingState.nodes[1].persistence.mode = mode;
    missingState.nodes[1].persistence.state_ref = null;
    assert.throws(() => validateCognitiveTopology(missingState), /state_ref/i);
  }
});

test('none and local persistence cannot claim an external persistence provider', () => {
  for (const mode of ['none', 'local']) {
    const topology = validTopology();
    topology.nodes[0].persistence.mode = mode;
    topology.nodes[0].persistence.provider_id = 'provider.not-allowed';
    if (mode === 'none') topology.nodes[0].persistence.state_ref = null;
    assert.throws(() => validateCognitiveTopology(topology), /provider_id/i);
  }

  const noneWithState = validTopology();
  noneWithState.nodes[2].persistence.state_ref = 'state.should.not.exist';
  assert.throws(() => validateCognitiveTopology(noneWithState), /state_ref/i);
});

test('identity kernel cannot be an ephemeral recruit', () => {
  const topology = validTopology();
  topology.nodes[0].engagement = 'ephemeral';
  assert.throws(() => validateCognitiveTopology(topology), /identity-kernel/i);

  const primaryKernel = validTopology();
  primaryKernel.nodes[0].engagement = 'primary';
  assert.doesNotThrow(() => validateCognitiveTopology(primaryKernel));
});

test('resolver binds topology to exact composition identifier and digest', () => {
  const composition = validComposition();
  const topology = validTopology(composition);

  const wrongId = structuredClone(topology);
  wrongId.composition_id = 'composition.other';
  assert.throws(() => resolveCognitiveTopology(wrongId, composition), /composition_id/i);

  const wrongDigest = structuredClone(topology);
  wrongDigest.composition_digest = DIGEST_A;
  assert.throws(() => resolveCognitiveTopology(wrongDigest, composition), /composition digest/i);
});

test('resolver rejects a topology model absent from the composition', () => {
  const composition = validComposition();
  const topology = validTopology(composition);
  topology.nodes[2].model_id = 'model.not.declared';
  assert.throws(() => resolveCognitiveTopology(topology, composition), /not declared/i);
});

test('resolver returns a deterministic descriptive dependency summary', () => {
  const composition = validComposition();
  const topology = validTopology(composition);
  const summary = resolveCognitiveTopology(topology, composition);

  assert.deepEqual(summary.engagements, {
    ephemeral: 1,
    primary: 1,
    persistent: 1,
    session: 0
  });
  assert.equal(summary.models, 3);
  assert.equal(summary.provider_bound_persistence, 1);
  assert.equal(summary.owner_controlled_custody, 2);
  assert.equal(summary.identity_kernels, 1);
  assert.equal(summary.primary_embodiments, 1);
  assert.equal(summary.critical_continuity_dependencies, 1);
  assert.equal(summary.critical_fidelity_dependencies, 2);
  assert.equal(summary.contains_secret_material, false);
  assert.equal(summary.authority_effect, 'none');
  assert.equal(summary.network_effect, 'none');
  assert.equal(summary.runtime_activation, false);
  assert.equal(Object.isFrozen(summary), true);
  assert.equal(Object.isFrozen(summary.engagements), true);
});

test('validation and resolution do not mutate deeply frozen inputs', () => {
  const composition = deepFreeze(validComposition());
  const topology = deepFreeze(validTopology(composition));
  assert.doesNotThrow(() => validateCognitiveTopology(topology));
  assert.doesNotThrow(() => resolveCognitiveTopology(topology, composition));
});

test('validator module imports only canonical and agent-composition helpers', async () => {
  const sourceUrl = new URL('../src/lib/cognitive-topology.mjs', import.meta.url);
  const source = await readFile(sourceUrl, 'utf8');
  const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1]).sort();
  assert.deepEqual(imports, ['./agent-composition.mjs', './canonical.mjs']);
});
