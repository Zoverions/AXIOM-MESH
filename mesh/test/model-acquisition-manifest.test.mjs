import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { cognitiveTopologyDigest } from '../src/lib/cognitive-topology.mjs';
import {
  MODEL_ACQUISITION_MANIFEST_SCHEMA,
  modelAcquisitionManifestDigest,
  resolveModelAcquisitionManifest,
  validateModelAcquisitionManifest
} from '../src/lib/model-acquisition-manifest.mjs';

const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);
const DIGEST_C = 'c'.repeat(64);
const DIGEST_D = 'd'.repeat(64);

function validTopology() {
  return {
    schema: 'axiom-cognitive-topology.v0',
    version: 0,
    status: 'inert-contract-laboratory',
    topology_id: 'topology.personal.primary',
    composition_id: 'composition.personal.primary',
    composition_digest: DIGEST_C,
    nodes: [{
      node_id: 'node.identity.kernel',
      model_id: 'model.identity.kernel',
      engagement: 'persistent',
      topology_role: 'identity-kernel',
      access_mode: 'local-runtime',
      custody: 'owner-local',
      weights: {
        state: 'open-acquired',
        artifact_digest: DIGEST_A,
        licence_ref: 'licence.identity.kernel.v1'
      },
      persistence: {
        mode: 'local',
        provider_id: null,
        state_ref: 'state.identity.kernel.v1',
        exportability: 'full'
      },
      continuity_importance: 'critical',
      fidelity_importance: 'important',
      adaptation_authorization_ref: null,
      lineage_ref: 'lineage.identity.kernel.v1',
      transition_policy_ref: 'policy.identity.kernel.transition.v1'
    }],
    created_at: '2026-08-29T12:30:00.000Z',
    updated_at: '2026-08-29T12:30:00.000Z',
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function validManifest(topology = validTopology()) {
  return {
    schema: 'axiom-model-acquisition-manifest.v0',
    version: 0,
    status: 'inert-evidence',
    acquisition_id: 'acquisition.identity.kernel.v1',
    topology_id: topology.topology_id,
    topology_digest: cognitiveTopologyDigest(topology),
    node_id: 'node.identity.kernel',
    model_id: 'model.identity.kernel',
    artifact: {
      artifact_ref: 'artifact.identity.kernel.weights.v1',
      artifact_digest: DIGEST_A,
      licence_ref: 'licence.identity.kernel.v1',
      format_ref: 'format.safetensors.v1'
    },
    source: {
      source_kind: 'upstream-release',
      source_ref: 'source.identity.kernel.release.v1',
      source_evidence_ref: 'evidence.identity.kernel.release.v1',
      source_evidence_digest: DIGEST_B
    },
    custody: {
      mode: 'owner-local',
      location_ref: 'location.models.local.v1',
      verification_ref: 'verification.identity.kernel.local.v1',
      verification_digest: DIGEST_D
    },
    acquired_at: '2026-08-29T13:00:00.000Z',
    recorded_at: '2026-08-29T13:05:00.000Z',
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

test('validates an inert model acquisition manifest and produces a deterministic digest', () => {
  const manifest = validManifest();
  const result = validateModelAcquisitionManifest(manifest);
  assert.equal(MODEL_ACQUISITION_MANIFEST_SCHEMA, manifest.schema);
  assert.equal(result.valid, true);
  assert.equal(result.acquisition_id, manifest.acquisition_id);
  assert.equal(result.topology_id, manifest.topology_id);
  assert.equal(result.node_id, manifest.node_id);
  assert.equal(result.model_id, manifest.model_id);
  assert.equal(result.artifact_digest, DIGEST_A);
  assert.equal(result.custody_mode, 'owner-local');
  assert.equal(result.acquisition_digest, modelAcquisitionManifestDigest(manifest));
  assert.match(result.acquisition_digest, /^[a-f0-9]{64}$/);
  assert.equal(result.contains_secret_material, false);
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.network_effect, 'none');
  assert.equal(result.runtime_activation, false);
  assert.equal(Object.isFrozen(result), true);
});

test('manifest digest is deterministic across object key order', () => {
  const first = validManifest();
  const second = Object.fromEntries(Object.entries(first).reverse());
  assert.equal(modelAcquisitionManifestDigest(first), modelAcquisitionManifestDigest(second));
});

test('unknown and credential-like fields fail closed', () => {
  const top = validManifest();
  top.api_key = 'not-allowed';
  assert.throws(() => validateModelAcquisitionManifest(top), /unknown field/i);

  const source = validManifest();
  source.source.cookie = 'not-allowed';
  assert.throws(() => validateModelAcquisitionManifest(source), /unknown field/i);

  const custody = validManifest();
  custody.custody.provider_token = 'not-allowed';
  assert.throws(() => validateModelAcquisitionManifest(custody), /unknown field/i);
});

test('malformed identifiers, digests, and timestamps fail closed', () => {
  const identifier = validManifest();
  identifier.acquisition_id = ' invalid';
  assert.throws(() => validateModelAcquisitionManifest(identifier), /acquisition_id/i);

  const digest = validManifest();
  digest.artifact.artifact_digest = 'not-a-digest';
  assert.throws(() => validateModelAcquisitionManifest(digest), /artifact_digest/i);

  const timestamp = validManifest();
  timestamp.recorded_at = '2026-08-29 13:05:00Z';
  assert.throws(() => validateModelAcquisitionManifest(timestamp), /recorded_at/i);
});

test('recorded_at cannot precede acquired_at', () => {
  const manifest = validManifest();
  manifest.recorded_at = '2026-08-29T12:59:59.000Z';
  assert.throws(() => validateModelAcquisitionManifest(manifest), /recorded_at.*acquired_at|precede/i);
});

test('resolver binds the manifest to the exact topology id and digest', () => {
  const topology = validTopology();

  const badId = validManifest(topology);
  badId.topology_id = 'topology.other';
  assert.throws(() => resolveModelAcquisitionManifest(badId, topology), /topology_id/i);

  const badDigest = validManifest(topology);
  badDigest.topology_digest = DIGEST_B;
  assert.throws(() => resolveModelAcquisitionManifest(badDigest, topology), /topology digest/i);
});

test('resolver requires exact node and model binding', () => {
  const topology = validTopology();

  const missingNode = validManifest(topology);
  missingNode.node_id = 'node.missing';
  assert.throws(() => resolveModelAcquisitionManifest(missingNode, topology), /node_id|not declared/i);

  const wrongModel = validManifest(topology);
  wrongModel.model_id = 'model.other';
  assert.throws(() => resolveModelAcquisitionManifest(wrongModel, topology), /model_id|model/i);
});

test('resolver accepts only owner-addressable acquired weight states', () => {
  for (const state of ['closed', 'open-remote', 'not-applicable']) {
    const topology = validTopology();
    topology.nodes[0].weights.state = state;
    topology.nodes[0].weights.artifact_digest = null;
    topology.nodes[0].weights.licence_ref = null;
    const manifest = validManifest(topology);
    assert.throws(() => resolveModelAcquisitionManifest(manifest, topology), /weight state|open-acquired|local-proprietary/i);
  }

  for (const state of ['open-acquired', 'local-proprietary']) {
    const topology = validTopology();
    topology.nodes[0].weights.state = state;
    const result = resolveModelAcquisitionManifest(validManifest(topology), topology);
    assert.equal(result.valid, true);
  }
});

test('resolver requires exact artifact digest and declared licence reference', () => {
  const topology = validTopology();

  const digestMismatch = validManifest(topology);
  digestMismatch.artifact.artifact_digest = DIGEST_B;
  assert.throws(() => resolveModelAcquisitionManifest(digestMismatch, topology), /artifact digest/i);

  const licenceMismatch = validManifest(topology);
  licenceMismatch.artifact.licence_ref = 'licence.other.v1';
  assert.throws(() => resolveModelAcquisitionManifest(licenceMismatch, topology), /licence/i);
});

test('resolver rejects provider-controlled custody and requires custody agreement', () => {
  const providerControlled = validTopology();
  providerControlled.nodes[0].custody = 'provider-controlled';
  assert.throws(
    () => resolveModelAcquisitionManifest(validManifest(providerControlled), providerControlled),
    /custody|provider-controlled/i
  );

  const ownerRemote = validTopology();
  ownerRemote.nodes[0].custody = 'owner-remote';
  const wrongOwnerCustody = validManifest(ownerRemote);
  wrongOwnerCustody.custody.mode = 'owner-local';
  assert.throws(() => resolveModelAcquisitionManifest(wrongOwnerCustody, ownerRemote), /custody/i);

  const shared = validTopology();
  shared.nodes[0].custody = 'shared';
  const wrongSharedCustody = validManifest(shared);
  wrongSharedCustody.custody.mode = 'owner-local';
  assert.throws(() => resolveModelAcquisitionManifest(wrongSharedCustody, shared), /custody/i);
});

test('resolver returns the exact frozen evidence summary', () => {
  const topology = validTopology();
  const manifest = validManifest(topology);
  const result = resolveModelAcquisitionManifest(manifest, topology);

  assert.deepEqual(result, {
    valid: true,
    schema: 'axiom-model-acquisition-manifest.v0',
    acquisition_id: manifest.acquisition_id,
    topology_id: topology.topology_id,
    topology_digest: cognitiveTopologyDigest(topology),
    node_id: manifest.node_id,
    model_id: manifest.model_id,
    artifact_digest: DIGEST_A,
    custody_mode: 'owner-local',
    acquisition_digest: modelAcquisitionManifestDigest(manifest),
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  });
  assert.equal(Object.isFrozen(result), true);
});

test('validation and resolution do not mutate deeply frozen inputs', () => {
  const topology = deepFreeze(validTopology());
  const manifest = deepFreeze(validManifest(topology));
  assert.doesNotThrow(() => validateModelAcquisitionManifest(manifest));
  assert.doesNotThrow(() => resolveModelAcquisitionManifest(manifest, topology));
});

test('production module imports only canonical and cognitive topology primitives', async () => {
  const source = await readFile(new URL('../src/lib/model-acquisition-manifest.mjs', import.meta.url), 'utf8');
  const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1]).sort();
  assert.deepEqual(imports, ['./canonical.mjs', './cognitive-topology.mjs']);
});
