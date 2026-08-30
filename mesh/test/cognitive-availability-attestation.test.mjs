import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { cognitiveTopologyDigest } from '../src/lib/cognitive-topology.mjs';
import {
  COGNITIVE_AVAILABILITY_ATTESTATION_SCHEMA,
  cognitiveAvailabilityAttestationDigest,
  resolveCognitiveAvailabilityAttestation,
  validateCognitiveAvailabilityAttestation
} from '../src/lib/cognitive-availability-attestation.mjs';

const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);
const DIGEST_C = 'c'.repeat(64);
const DIGEST_D = 'd'.repeat(64);

function topologyFixture() {
  return {
    schema: 'axiom-cognitive-topology.v0',
    version: 0,
    status: 'inert-contract-laboratory',
    topology_id: 'topology.availability.v1',
    composition_id: 'composition.availability.v1',
    composition_digest: DIGEST_C,
    nodes: [
      {
        node_id: 'node.owner.kernel',
        model_id: 'model.owner.kernel',
        engagement: 'persistent',
        topology_role: 'identity-kernel',
        access_mode: 'local-runtime',
        custody: 'owner-local',
        weights: {
          state: 'open-acquired',
          artifact_digest: DIGEST_A,
          licence_ref: 'licence.owner.kernel.v1'
        },
        persistence: {
          mode: 'local',
          provider_id: null,
          state_ref: 'state.owner.kernel.v1',
          exportability: 'full'
        },
        continuity_importance: 'critical',
        fidelity_importance: 'important',
        adaptation_authorization_ref: null,
        lineage_ref: null,
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
          provider_id: 'provider.primary.memory',
          state_ref: 'state.provider.primary.v1',
          exportability: 'partial'
        },
        continuity_importance: 'important',
        fidelity_importance: 'critical',
        adaptation_authorization_ref: null,
        lineage_ref: null,
        transition_policy_ref: null
      }
    ],
    created_at: '2026-08-29T20:00:00.000Z',
    updated_at: '2026-08-29T20:00:00.000Z',
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function availabilityAttestation(topology = topologyFixture(), nodeId = 'node.owner.kernel') {
  const node = topology.nodes.find(candidate => candidate.node_id === nodeId);
  const ownerAddressable = node.weights.state === 'open-acquired' || node.weights.state === 'local-proprietary';
  return {
    schema: 'axiom-cognitive-availability-attestation.v0',
    version: 0,
    status: 'inert-evidence',
    attestation_id: `availability.${nodeId}.v1`,
    topology_id: topology.topology_id,
    topology_digest: cognitiveTopologyDigest(topology),
    node_id: node.node_id,
    model_id: node.model_id,
    declared_target: {
      access_mode: node.access_mode,
      custody: node.custody,
      weight_state: node.weights.state,
      artifact_digest: node.weights.artifact_digest
    },
    observation: {
      availability: 'available',
      observation_mode: ownerAddressable ? 'local-artifact' : 'provider-api',
      evidence_class: ownerAddressable ? 'direct-local' : 'direct-remote',
      observed_artifact_digest: ownerAddressable ? node.weights.artifact_digest : null
    },
    observer_ref: `observer.${nodeId}.v1`,
    evidence: {
      evidence_ref: `evidence.${nodeId}.v1`,
      evidence_digest: DIGEST_D
    },
    observed_at: '2026-08-29T20:01:00.000Z',
    valid_until: '2026-08-29T20:06:00.000Z',
    recorded_at: '2026-08-29T20:01:01.000Z',
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function clone(value) {
  return structuredClone(value);
}

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function expectReject(mutator, pattern) {
  const topology = topologyFixture();
  const document = availabilityAttestation(topology);
  mutator(document, topology);
  assert.throws(() => validateCognitiveAvailabilityAttestation(document), pattern);
}

test('valid owner availability attestation validates, resolves, and digests deterministically', () => {
  const topology = topologyFixture();
  const document = availabilityAttestation(topology);

  const validated = validateCognitiveAvailabilityAttestation(document);
  const resolved = resolveCognitiveAvailabilityAttestation(document, topology);

  assert.equal(COGNITIVE_AVAILABILITY_ATTESTATION_SCHEMA, 'axiom-cognitive-availability-attestation.v0');
  assert.equal(validated.valid, true);
  assert.equal(resolved.valid, true);
  assert.equal(resolved.availability, 'available');
  assert.equal(resolved.observation_mode, 'local-artifact');
  assert.equal(resolved.evidence_class, 'direct-local');
  assert.equal(resolved.artifact_match, true);
  assert.equal(resolved.observed_artifact_digest, DIGEST_A);
  assert.equal(resolved.authority_effect, 'none');
  assert.equal(resolved.network_effect, 'none');
  assert.equal(resolved.runtime_activation, false);
  assert.match(resolved.attestation_digest, /^[a-f0-9]{64}$/);
  assert.equal(cognitiveAvailabilityAttestationDigest(document), resolved.attestation_digest);
});

test('provider-controlled availability attestation does not invent an artifact digest', () => {
  const topology = topologyFixture();
  const document = availabilityAttestation(topology, 'node.provider.primary');
  const resolved = resolveCognitiveAvailabilityAttestation(document, topology);

  assert.equal(resolved.availability, 'available');
  assert.equal(resolved.observation_mode, 'provider-api');
  assert.equal(resolved.evidence_class, 'direct-remote');
  assert.equal(resolved.observed_artifact_digest, null);
  assert.equal(resolved.artifact_match, null);
});

test('digest is invariant to object key order', () => {
  const document = availabilityAttestation();
  const reordered = {
    runtime_activation: document.runtime_activation,
    network_effect: document.network_effect,
    authority_effect: document.authority_effect,
    contains_secret_material: document.contains_secret_material,
    recorded_at: document.recorded_at,
    valid_until: document.valid_until,
    observed_at: document.observed_at,
    evidence: { evidence_digest: document.evidence.evidence_digest, evidence_ref: document.evidence.evidence_ref },
    observer_ref: document.observer_ref,
    observation: {
      observed_artifact_digest: document.observation.observed_artifact_digest,
      evidence_class: document.observation.evidence_class,
      observation_mode: document.observation.observation_mode,
      availability: document.observation.availability
    },
    declared_target: {
      artifact_digest: document.declared_target.artifact_digest,
      weight_state: document.declared_target.weight_state,
      custody: document.declared_target.custody,
      access_mode: document.declared_target.access_mode
    },
    model_id: document.model_id,
    node_id: document.node_id,
    topology_digest: document.topology_digest,
    topology_id: document.topology_id,
    attestation_id: document.attestation_id,
    status: document.status,
    version: document.version,
    schema: document.schema
  };
  assert.equal(cognitiveAvailabilityAttestationDigest(document), cognitiveAvailabilityAttestationDigest(reordered));
});

test('unknown and credential-like fields fail closed', () => {
  expectReject(document => { document.extra = true; }, /unknown field extra/i);
  expectReject(document => { document.provider_token = 'secret'; }, /unknown field provider_token/i);
  expectReject(document => { document.evidence.cookie = 'secret'; }, /unknown field cookie/i);
});

test('schema, identifiers, digests, and timestamps are strict', () => {
  expectReject(document => { document.schema = 'wrong'; }, /schema\/version\/status/i);
  expectReject(document => { document.attestation_id = 'bad id'; }, /attestation_id/i);
  expectReject(document => { document.topology_digest = DIGEST_B.toUpperCase(); }, /topology_digest/i);
  expectReject(document => { document.observed_at = '2026-08-29T20:01:00Z'; }, /canonical ISO timestamp/i);
});

test('timestamp chronology fails closed', () => {
  expectReject(document => { document.valid_until = '2026-08-29T19:59:00.000Z'; }, /valid_until cannot precede observed_at/i);
  expectReject(document => { document.recorded_at = '2026-08-29T19:59:00.000Z'; }, /recorded_at cannot precede observed_at/i);
});

test('availability, observation mode, and evidence class enums are exact', () => {
  expectReject(document => { document.observation.availability = 'healthy'; }, /availability/i);
  expectReject(document => { document.observation.observation_mode = 'ping'; }, /observation_mode/i);
  expectReject(document => { document.observation.evidence_class = 'trusted'; }, /evidence_class/i);
});

test('declared target must exactly match bound topology facts', () => {
  const topology = topologyFixture();
  for (const [field, value] of [
    ['access_mode', 'api'],
    ['custody', 'owner-remote'],
    ['weight_state', 'local-proprietary'],
    ['artifact_digest', DIGEST_B]
  ]) {
    const document = availabilityAttestation(topology);
    document.declared_target[field] = value;
    assert.throws(() => resolveCognitiveAvailabilityAttestation(document, topology), new RegExp(field, 'i'));
  }
});

test('owner-addressable available observation requires an observed artifact digest', () => {
  expectReject(document => { document.observation.observed_artifact_digest = null; }, /observed_artifact_digest.*required/i);
});

test('owner-addressable unavailable or indeterminate observation requires null artifact digest', () => {
  for (const availability of ['unavailable', 'indeterminate']) {
    const topology = topologyFixture();
    const document = availabilityAttestation(topology);
    document.observation.availability = availability;
    assert.throws(() => validateCognitiveAvailabilityAttestation(document), /observed_artifact_digest must be null/i);
    document.observation.observed_artifact_digest = null;
    assert.doesNotThrow(() => validateCognitiveAvailabilityAttestation(document));
  }
});

test('non-owner-addressable observation rejects an artifact digest', () => {
  const topology = topologyFixture();
  const document = availabilityAttestation(topology, 'node.provider.primary');
  document.observation.observed_artifact_digest = DIGEST_A;
  assert.throws(() => validateCognitiveAvailabilityAttestation(document), /observed_artifact_digest must be null/i);
});

test('different valid owner artifact digest is visible as mismatch rather than trusted availability', () => {
  const topology = topologyFixture();
  const document = availabilityAttestation(topology);
  document.observation.observed_artifact_digest = DIGEST_B;

  assert.doesNotThrow(() => validateCognitiveAvailabilityAttestation(document));
  const resolved = resolveCognitiveAvailabilityAttestation(document, topology);
  assert.equal(resolved.availability, 'available');
  assert.equal(resolved.artifact_match, false);
  assert.equal(resolved.observed_artifact_digest, DIGEST_B);
});

test('topology, node, and model binding fail closed', () => {
  const topology = topologyFixture();

  const wrongId = availabilityAttestation(topology);
  wrongId.topology_id = 'topology.other.v1';
  assert.throws(() => resolveCognitiveAvailabilityAttestation(wrongId, topology), /topology_id/i);

  const wrongDigest = availabilityAttestation(topology);
  wrongDigest.topology_digest = DIGEST_B;
  assert.throws(() => resolveCognitiveAvailabilityAttestation(wrongDigest, topology), /topology digest/i);

  const wrongNode = availabilityAttestation(topology);
  wrongNode.node_id = 'node.missing';
  assert.throws(() => resolveCognitiveAvailabilityAttestation(wrongNode, topology), /node_id/i);

  const wrongModel = availabilityAttestation(topology);
  wrongModel.model_id = 'model.other';
  assert.throws(() => resolveCognitiveAvailabilityAttestation(wrongModel, topology), /model_id/i);
});

test('activation boundary is exact', () => {
  expectReject(document => { document.contains_secret_material = true; }, /activation boundary/i);
  expectReject(document => { document.authority_effect = 'grant'; }, /activation boundary/i);
  expectReject(document => { document.network_effect = 'probe'; }, /activation boundary/i);
  expectReject(document => { document.runtime_activation = true; }, /activation boundary/i);
});

test('validator and resolver do not mutate frozen inputs', () => {
  const topology = deepFreeze(topologyFixture());
  const document = deepFreeze(availabilityAttestation(clone(topology)));
  const before = JSON.stringify(document);

  assert.doesNotThrow(() => validateCognitiveAvailabilityAttestation(document));
  assert.doesNotThrow(() => resolveCognitiveAvailabilityAttestation(document, topology));
  assert.equal(JSON.stringify(document), before);
});

test('production module imports only canonical and cognitive topology', async () => {
  const source = await readFile(new URL('../src/lib/cognitive-availability-attestation.mjs', import.meta.url), 'utf8');
  const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1]).sort();
  assert.deepEqual(imports, ['./canonical.mjs', './cognitive-topology.mjs']);
});
