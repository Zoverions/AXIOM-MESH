import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { cognitiveTopologyDigest } from '../src/lib/cognitive-topology.mjs';
import {
  COGNITIVE_LINEAGE_MANIFEST_SCHEMA,
  cognitiveLineageManifestDigest,
  resolveCognitiveLineageManifest,
  validateCognitiveLineageManifest
} from '../src/lib/cognitive-lineage-manifest.mjs';

const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);
const DIGEST_C = 'c'.repeat(64);
const DIGEST_D = 'd'.repeat(64);

function topologyFixture() {
  return {
    schema: 'axiom-cognitive-topology.v0',
    version: 0,
    status: 'inert-contract-laboratory',
    topology_id: 'topology.lineage.v1',
    composition_id: 'composition.lineage.v1',
    composition_digest: DIGEST_C,
    nodes: [
      {
        node_id: 'node.provider.primary',
        model_id: 'model.provider.primary',
        engagement: 'primary',
        topology_role: 'primary-embodiment',
        access_mode: 'api',
        custody: 'provider-controlled',
        weights: { state: 'closed', artifact_digest: null, licence_ref: null },
        persistence: { mode: 'provider-bound', provider_id: 'provider.memory.v1', state_ref: 'state.primary.v1', exportability: 'partial' },
        continuity_importance: 'important',
        fidelity_importance: 'critical',
        adaptation_authorization_ref: null,
        lineage_ref: null,
        transition_policy_ref: null
      },
      {
        node_id: 'node.owner.backup',
        model_id: 'model.owner.backup',
        engagement: 'persistent',
        topology_role: 'augmentation',
        access_mode: 'local-runtime',
        custody: 'owner-local',
        weights: { state: 'open-acquired', artifact_digest: DIGEST_A, licence_ref: 'licence.backup.v1' },
        persistence: { mode: 'local', provider_id: null, state_ref: 'state.backup.v1', exportability: 'full' },
        continuity_importance: 'important',
        fidelity_importance: 'important',
        adaptation_authorization_ref: null,
        lineage_ref: null,
        transition_policy_ref: null
      },
      {
        node_id: 'node.owner.alt',
        model_id: 'model.owner.alt',
        engagement: 'persistent',
        topology_role: 'augmentation',
        access_mode: 'local-runtime',
        custody: 'owner-remote',
        weights: { state: 'local-proprietary', artifact_digest: DIGEST_B, licence_ref: 'licence.alt.v1' },
        persistence: { mode: 'local', provider_id: null, state_ref: 'state.alt.v1', exportability: 'partial' },
        continuity_importance: 'optional',
        fidelity_importance: 'important',
        adaptation_authorization_ref: null,
        lineage_ref: null,
        transition_policy_ref: null
      }
    ],
    created_at: '2026-08-29T21:00:00.000Z',
    updated_at: '2026-08-29T21:00:00.000Z',
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function lineageManifest(topology = topologyFixture(), relationship = 'replacement') {
  return {
    schema: 'axiom-cognitive-lineage-manifest.v0',
    version: 0,
    status: 'inert-evidence',
    lineage_id: 'lineage.primary.to.backup.v1',
    topology_id: topology.topology_id,
    topology_digest: cognitiveTopologyDigest(topology),
    source: {
      node_id: 'node.provider.primary',
      model_id: 'model.provider.primary',
      artifact_digest: null
    },
    destination: {
      node_id: 'node.owner.backup',
      model_id: 'model.owner.backup',
      artifact_digest: DIGEST_A
    },
    relationship,
    evidence: {
      evidence_ref: 'evidence.lineage.primary.backup.v1',
      evidence_digest: DIGEST_D
    },
    recorded_at: '2026-08-29T21:05:00.000Z',
    contains_secret_material: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function clone(value) { return structuredClone(value); }
function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function expectValidateReject(mutator, pattern) {
  const document = lineageManifest();
  mutator(document);
  assert.throws(() => validateCognitiveLineageManifest(document), pattern);
}

test('valid one-edge cognitive lineage validates, resolves, and digests deterministically', () => {
  const topology = topologyFixture();
  const document = lineageManifest(topology);
  const validated = validateCognitiveLineageManifest(document);
  const resolved = resolveCognitiveLineageManifest(document, topology);

  assert.equal(COGNITIVE_LINEAGE_MANIFEST_SCHEMA, 'axiom-cognitive-lineage-manifest.v0');
  assert.equal(validated.valid, true);
  assert.equal(resolved.valid, true);
  assert.equal(resolved.relationship, 'replacement');
  assert.equal(resolved.source.node_id, 'node.provider.primary');
  assert.equal(resolved.destination.node_id, 'node.owner.backup');
  assert.match(resolved.lineage_digest, /^[a-f0-9]{64}$/);
  assert.equal(cognitiveLineageManifestDigest(document), resolved.lineage_digest);
  assert.equal(resolved.proves_principal_lineage, false);
  assert.equal(resolved.proves_principal_continuity, false);
  assert.equal(resolved.proves_subjective_identity, false);
});

test('digest is invariant to object key order', () => {
  const document = lineageManifest();
  const reordered = {
    runtime_activation: document.runtime_activation,
    network_effect: document.network_effect,
    authority_effect: document.authority_effect,
    contains_secret_material: document.contains_secret_material,
    recorded_at: document.recorded_at,
    evidence: { evidence_digest: document.evidence.evidence_digest, evidence_ref: document.evidence.evidence_ref },
    relationship: document.relationship,
    destination: { artifact_digest: document.destination.artifact_digest, model_id: document.destination.model_id, node_id: document.destination.node_id },
    source: { artifact_digest: document.source.artifact_digest, model_id: document.source.model_id, node_id: document.source.node_id },
    topology_digest: document.topology_digest,
    topology_id: document.topology_id,
    lineage_id: document.lineage_id,
    status: document.status,
    version: document.version,
    schema: document.schema
  };
  assert.equal(cognitiveLineageManifestDigest(document), cognitiveLineageManifestDigest(reordered));
});

test('source and destination must be different nodes', () => {
  const topology = topologyFixture();
  const document = lineageManifest(topology);
  document.destination = { ...document.source };
  assert.throws(() => resolveCognitiveLineageManifest(document, topology), /source and destination.*different/i);
});

test('topology, source, destination, and model binding fail closed', () => {
  const topology = topologyFixture();
  const cases = [
    [document => { document.topology_id = 'topology.other.v1'; }, /topology_id/i],
    [document => { document.topology_digest = DIGEST_B; }, /topology digest/i],
    [document => { document.source.node_id = 'node.missing'; }, /source.*node_id/i],
    [document => { document.source.model_id = 'model.other'; }, /source.*model_id/i],
    [document => { document.destination.node_id = 'node.missing'; }, /destination.*node_id/i],
    [document => { document.destination.model_id = 'model.other'; }, /destination.*model_id/i]
  ];
  for (const [mutator, pattern] of cases) {
    const document = lineageManifest(topology);
    mutator(document);
    assert.throws(() => resolveCognitiveLineageManifest(document, topology), pattern);
  }
});

test('relationship enum is exact', () => {
  const allowed = [
    'successor',
    'replacement',
    'fine-tuned-descendant',
    'distilled-descendant',
    'quantized-derivative',
    'adapter-derived',
    'provider-version-successor',
    'functionally-unrelated'
  ];
  for (const relationship of allowed) {
    assert.doesNotThrow(() => validateCognitiveLineageManifest(lineageManifest(topologyFixture(), relationship)));
  }
  expectValidateReject(document => { document.relationship = 'same-person'; }, /relationship/i);
});

test('owner-addressable artifact digest must exactly match topology while non-owner source must be null', () => {
  const topology = topologyFixture();

  const wrongOwner = lineageManifest(topology);
  wrongOwner.destination.artifact_digest = DIGEST_B;
  assert.throws(() => resolveCognitiveLineageManifest(wrongOwner, topology), /destination.*artifact_digest/i);

  const inventedProvider = lineageManifest(topology);
  inventedProvider.source.artifact_digest = DIGEST_A;
  assert.throws(() => resolveCognitiveLineageManifest(inventedProvider, topology), /source.*artifact_digest/i);

  const missingOwner = lineageManifest(topology);
  missingOwner.destination.artifact_digest = null;
  assert.throws(() => resolveCognitiveLineageManifest(missingOwner, topology), /destination.*artifact_digest/i);
});

test('evidence, identifiers, digests, and timestamps are strict', () => {
  expectValidateReject(document => { document.lineage_id = 'bad id'; }, /lineage_id/i);
  expectValidateReject(document => { document.evidence.evidence_ref = ''; }, /evidence_ref/i);
  expectValidateReject(document => { document.evidence.evidence_digest = DIGEST_D.toUpperCase(); }, /evidence_digest/i);
  expectValidateReject(document => { document.recorded_at = '2026-08-29T21:05:00Z'; }, /canonical ISO timestamp/i);
});

test('unknown, secret-like, and identity-proof fields fail closed', () => {
  expectValidateReject(document => { document.provider_token = 'secret'; }, /unknown field provider_token/i);
  expectValidateReject(document => { document.principal_lineage = true; }, /unknown field principal_lineage/i);
  expectValidateReject(document => { document.subjective_identity = true; }, /unknown field subjective_identity/i);
  expectValidateReject(document => { document.evidence.cookie = 'secret'; }, /unknown field cookie/i);
});

test('activation boundary is exact', () => {
  expectValidateReject(document => { document.contains_secret_material = true; }, /activation boundary/i);
  expectValidateReject(document => { document.authority_effect = 'grant'; }, /activation boundary/i);
  expectValidateReject(document => { document.network_effect = 'fetch'; }, /activation boundary/i);
  expectValidateReject(document => { document.runtime_activation = true; }, /activation boundary/i);
});

test('validator and resolver do not mutate frozen inputs', () => {
  const topology = deepFreeze(topologyFixture());
  const document = deepFreeze(lineageManifest(clone(topology)));
  const before = JSON.stringify(document);
  assert.doesNotThrow(() => validateCognitiveLineageManifest(document));
  assert.doesNotThrow(() => resolveCognitiveLineageManifest(document, topology));
  assert.equal(JSON.stringify(document), before);
});

test('production module imports only canonical and cognitive topology', async () => {
  const source = await readFile(new URL('../src/lib/cognitive-lineage-manifest.mjs', import.meta.url), 'utf8');
  const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1]).sort();
  assert.deepEqual(imports, ['./canonical.mjs', './cognitive-topology.mjs']);
});
