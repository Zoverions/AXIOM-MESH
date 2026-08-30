import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { cognitiveTopologyDigest } from '../src/lib/cognitive-topology.mjs';
import {
  PERSISTENCE_ATTESTATION_SCHEMA,
  persistenceAttestationDigest,
  resolvePersistenceAttestation,
  validatePersistenceAttestation
} from '../src/lib/persistence-attestation.mjs';

const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);
const DIGEST_C = 'c'.repeat(64);

function validTopology() {
  return {
    schema: 'axiom-cognitive-topology.v0',
    version: 0,
    status: 'inert-contract-laboratory',
    topology_id: 'topology.persistence.example',
    composition_id: 'composition.persistence.example',
    composition_digest: DIGEST_C,
    nodes: [
      {
        node_id: 'node.local.identity',
        model_id: 'model.local.identity',
        engagement: 'persistent',
        topology_role: 'identity-kernel',
        access_mode: 'local-runtime',
        custody: 'owner-local',
        weights: {
          state: 'open-acquired',
          artifact_digest: DIGEST_A,
          licence_ref: 'licence.local.identity.v1'
        },
        persistence: {
          mode: 'local',
          provider_id: null,
          state_ref: 'state.local.identity.v1',
          exportability: 'full'
        },
        continuity_importance: 'critical',
        fidelity_importance: 'important',
        adaptation_authorization_ref: null,
        lineage_ref: 'lineage.local.identity.v1',
        transition_policy_ref: null
      },
      {
        node_id: 'node.provider.primary',
        model_id: 'model.provider.primary',
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
          provider_id: 'provider.memory.primary',
          state_ref: 'state.provider.primary.v1',
          exportability: 'partial'
        },
        continuity_importance: 'important',
        fidelity_importance: 'critical',
        adaptation_authorization_ref: null,
        lineage_ref: null,
        transition_policy_ref: 'policy.provider.primary.transition.v1'
      },
      {
        node_id: 'node.mirrored.augment',
        model_id: 'model.mirrored.augment',
        engagement: 'persistent',
        topology_role: 'augmentation',
        access_mode: 'hybrid',
        custody: 'shared',
        weights: {
          state: 'open-remote',
          artifact_digest: null,
          licence_ref: 'licence.mirrored.augment.v1'
        },
        persistence: {
          mode: 'mirrored',
          provider_id: 'provider.memory.augment',
          state_ref: 'state.mirrored.augment.v1',
          exportability: 'full'
        },
        continuity_importance: 'optional',
        fidelity_importance: 'important',
        adaptation_authorization_ref: null,
        lineage_ref: null,
        transition_policy_ref: null
      }
    ],
    created_at: '2026-08-29T14:00:00.000Z',
    updated_at: '2026-08-29T14:00:00.000Z',
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function validAttestation(topology = validTopology(), nodeId = 'node.provider.primary') {
  const node = topology.nodes.find(candidate => candidate.node_id === nodeId);
  return {
    schema: 'axiom-persistence-attestation.v0',
    version: 0,
    status: 'inert-evidence',
    attestation_id: `attestation.${nodeId}.v1`,
    topology_id: topology.topology_id,
    topology_digest: cognitiveTopologyDigest(topology),
    node_id: node.node_id,
    model_id: node.model_id,
    declared_persistence: { ...node.persistence },
    observation: {
      availability: 'available',
      observed_exportability: node.persistence.exportability,
      snapshot_ref: `snapshot.${nodeId}.v1`,
      snapshot_digest: DIGEST_B
    },
    evidence: {
      evidence_kind: node.persistence.mode === 'local' ? 'local-observation' : 'provider-statement',
      evidence_ref: `evidence.${nodeId}.v1`,
      evidence_digest: DIGEST_A
    },
    observed_at: '2026-08-29T14:15:00.000Z',
    recorded_at: '2026-08-29T14:16:00.000Z',
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

test('validates an inert persistence attestation and produces a deterministic digest', () => {
  const attestation = validAttestation();
  const result = validatePersistenceAttestation(attestation);

  assert.equal(PERSISTENCE_ATTESTATION_SCHEMA, attestation.schema);
  assert.equal(result.valid, true);
  assert.equal(result.attestation_id, attestation.attestation_id);
  assert.equal(result.topology_id, attestation.topology_id);
  assert.equal(result.node_id, attestation.node_id);
  assert.equal(result.model_id, attestation.model_id);
  assert.equal(result.persistence_mode, 'provider-bound');
  assert.equal(result.provider_id, 'provider.memory.primary');
  assert.equal(result.state_ref, 'state.provider.primary.v1');
  assert.equal(result.declared_exportability, 'partial');
  assert.equal(result.availability, 'available');
  assert.equal(result.observed_exportability, 'partial');
  assert.equal(result.evidence_kind, 'provider-statement');
  assert.equal(result.attestation_digest, persistenceAttestationDigest(attestation));
  assert.match(result.attestation_digest, /^[a-f0-9]{64}$/);
  assert.equal(result.contains_secret_material, false);
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.network_effect, 'none');
  assert.equal(result.runtime_activation, false);
  assert.equal(Object.isFrozen(result), true);
});

test('attestation digest is deterministic across object key order', () => {
  const first = validAttestation();
  const second = Object.fromEntries(Object.entries(first).reverse());
  assert.equal(persistenceAttestationDigest(first), persistenceAttestationDigest(second));
});

test('unknown, secret-bearing, malformed, and non-canonical values fail closed', () => {
  const unknown = validAttestation();
  unknown.api_token = 'not-allowed';
  assert.throws(() => validatePersistenceAttestation(unknown), /unknown field/i);

  const nestedSecret = validAttestation();
  nestedSecret.evidence.cookie = 'not-allowed';
  assert.throws(() => validatePersistenceAttestation(nestedSecret), /unknown field/i);

  const badDigest = validAttestation();
  badDigest.evidence.evidence_digest = 'bad';
  assert.throws(() => validatePersistenceAttestation(badDigest), /evidence_digest/i);

  const badTimestamp = validAttestation();
  badTimestamp.observed_at = '2026-08-29 14:15:00Z';
  assert.throws(() => validatePersistenceAttestation(badTimestamp), /observed_at/i);

  const badAvailability = validAttestation();
  badAvailability.observation.availability = 'reachable';
  assert.throws(() => validatePersistenceAttestation(badAvailability), /availability/i);
});

test('recorded_at cannot precede observed_at', () => {
  const attestation = validAttestation();
  attestation.recorded_at = '2026-08-29T14:14:59.000Z';
  assert.throws(() => validatePersistenceAttestation(attestation), /recorded_at.*observed_at|precede/i);
});

test('available observations require snapshot fields to be both null or both present', () => {
  const noSnapshot = validAttestation();
  noSnapshot.observation.snapshot_ref = null;
  noSnapshot.observation.snapshot_digest = null;
  assert.doesNotThrow(() => validatePersistenceAttestation(noSnapshot));

  const missingDigest = validAttestation();
  missingDigest.observation.snapshot_digest = null;
  assert.throws(() => validatePersistenceAttestation(missingDigest), /snapshot/i);

  const missingRef = validAttestation();
  missingRef.observation.snapshot_ref = null;
  assert.throws(() => validatePersistenceAttestation(missingRef), /snapshot/i);
});

test('unavailable and unknown observations cannot claim snapshots', () => {
  for (const availability of ['unavailable', 'unknown']) {
    const valid = validAttestation();
    valid.observation.availability = availability;
    valid.observation.observed_exportability = 'unknown';
    valid.observation.snapshot_ref = null;
    valid.observation.snapshot_digest = null;
    assert.doesNotThrow(() => validatePersistenceAttestation(valid));

    const invalid = validAttestation();
    invalid.observation.availability = availability;
    invalid.observation.observed_exportability = 'unknown';
    assert.throws(() => validatePersistenceAttestation(invalid), /snapshot/i);
  }
});

test('resolver binds to the exact topology id and digest', () => {
  const topology = validTopology();

  const badId = validAttestation(topology);
  badId.topology_id = 'topology.other';
  assert.throws(() => resolvePersistenceAttestation(badId, topology), /topology_id/i);

  const badDigest = validAttestation(topology);
  badDigest.topology_digest = DIGEST_A;
  assert.throws(() => resolvePersistenceAttestation(badDigest, topology), /topology digest/i);
});

test('resolver requires exact node and model binding', () => {
  const topology = validTopology();

  const missingNode = validAttestation(topology);
  missingNode.node_id = 'node.missing';
  assert.throws(() => resolvePersistenceAttestation(missingNode, topology), /node_id|not declared/i);

  const wrongModel = validAttestation(topology);
  wrongModel.model_id = 'model.other';
  assert.throws(() => resolvePersistenceAttestation(wrongModel, topology), /model_id|model/i);
});

test('resolver requires declared persistence to exactly mirror the topology node', () => {
  const topology = validTopology();
  const fields = ['mode', 'provider_id', 'state_ref', 'exportability'];

  for (const field of fields) {
    const attestation = validAttestation(topology);
    if (field === 'mode') attestation.declared_persistence.mode = 'mirrored';
    if (field === 'provider_id') attestation.declared_persistence.provider_id = 'provider.other';
    if (field === 'state_ref') attestation.declared_persistence.state_ref = 'state.other';
    if (field === 'exportability') attestation.declared_persistence.exportability = 'full';
    assert.throws(() => resolvePersistenceAttestation(attestation, topology), /declared persistence|persistence/i);
  }
});

test('provider-bound and mirrored attestations preserve provider/state references without reachability claims', () => {
  const topology = validTopology();
  const provider = resolvePersistenceAttestation(validAttestation(topology, 'node.provider.primary'), topology);
  const mirrored = resolvePersistenceAttestation(validAttestation(topology, 'node.mirrored.augment'), topology);

  assert.equal(provider.persistence_mode, 'provider-bound');
  assert.equal(provider.provider_id, 'provider.memory.primary');
  assert.equal(provider.state_ref, 'state.provider.primary.v1');
  assert.equal(mirrored.persistence_mode, 'mirrored');
  assert.equal(mirrored.provider_id, 'provider.memory.augment');
  assert.equal(mirrored.state_ref, 'state.mirrored.augment.v1');
});

test('local persistence resolves without inventing a provider', () => {
  const topology = validTopology();
  const result = resolvePersistenceAttestation(validAttestation(topology, 'node.local.identity'), topology);
  assert.equal(result.persistence_mode, 'local');
  assert.equal(result.provider_id, null);
  assert.equal(result.state_ref, 'state.local.identity.v1');
  assert.equal(result.declared_exportability, 'full');
});

test('validation and resolution do not mutate deeply frozen inputs', () => {
  const topology = deepFreeze(validTopology());
  const attestation = deepFreeze(validAttestation(topology));
  assert.doesNotThrow(() => validatePersistenceAttestation(attestation));
  assert.doesNotThrow(() => resolvePersistenceAttestation(attestation, topology));
});

test('production module imports only canonical and cognitive topology primitives', async () => {
  const source = await readFile(new URL('../src/lib/persistence-attestation.mjs', import.meta.url), 'utf8');
  const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1]).sort();
  assert.deepEqual(imports, ['./canonical.mjs', './cognitive-topology.mjs']);
});
