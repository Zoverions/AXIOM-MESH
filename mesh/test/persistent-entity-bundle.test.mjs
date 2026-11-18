import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  PERSISTENT_ENTITY_BUNDLE_SCHEMA,
  persistentEntityBundleDigest,
  validatePersistentEntityBundle
} from '../src/lib/persistent-entity-bundle.mjs';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const D = 'd'.repeat(64);

function validBundle() {
  return {
    schema: 'axiom-persistent-entity-bundle.v0',
    version: 0,
    status: 'inert-portability-contract',
    bundle_id: 'bundle.personal.primary',
    entity_ref: 'entity.personal.primary',
    source_composition_digest: A,
    scopes: [
      'identity',
      'character',
      'personal_model_projection',
      'runtime_policy',
      'private_memory_ref',
      'private_artifact_ref',
      'skill_ref',
      'relationship_projection'
    ],
    records: [
      { kind: 'identity', display_name: 'Primary', handle_intent: 'primary' },
      { kind: 'character', text: 'Persistent, relationship-aware, corrigible identity.' },
      { kind: 'personal_model_projection', projection_ref: 'projection.personal.safe', projection_digest: B, purpose: 'portable personalization' },
      { kind: 'runtime_policy', primary_profile_ref: 'runtime.local.primary', fallback_profile_ref: 'runtime.remote.fallback', local_preferred: true },
      { kind: 'private_memory_ref', memory_ref: 'memory.owner.1', content_digest: C },
      { kind: 'private_artifact_ref', artifact_ref: 'artifact.owner.1', content_digest: D },
      { kind: 'skill_ref', skill_ref: 'skill.writer', artifact_digest: A, disabled_by_default: true },
      { kind: 'relationship_projection', relationship_ref: 'relationship.friend.1', projection_digest: B, third_party_private_data: false }
    ],
    created_at: '2026-09-17T20:00:00.000Z',
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    credential_material: false
  };
}

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

test('validates an inert persistent entity bundle', () => {
  const bundle = validBundle();
  const result = validatePersistentEntityBundle(bundle);
  assert.equal(PERSISTENT_ENTITY_BUNDLE_SCHEMA, bundle.schema);
  assert.equal(result.valid, true);
  assert.equal(result.bundle_id, bundle.bundle_id);
  assert.equal(result.entity_ref, bundle.entity_ref);
  assert.equal(result.record_count, 8);
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.network_effect, 'none');
  assert.equal(result.runtime_activation, false);
  assert.equal(result.credential_material, false);
  assert.equal(result.bundle_digest, persistentEntityBundleDigest(bundle));
  assert.match(result.bundle_digest, /^[a-f0-9]{64}$/);
  assert.equal(Object.isFrozen(result), true);
});

test('digest is deterministic across object key order', () => {
  const first = validBundle();
  const second = Object.fromEntries(Object.entries(first).reverse());
  assert.equal(persistentEntityBundleDigest(first), persistentEntityBundleDigest(second));
});

test('validation does not mutate a deeply frozen bundle', () => {
  const bundle = deepFreeze(validBundle());
  assert.doesNotThrow(() => validatePersistentEntityBundle(bundle));
});

test('unknown top-level and record fields fail closed', () => {
  const top = validBundle();
  top.extra = true;
  assert.throws(() => validatePersistentEntityBundle(top), /unknown field/i);
  const record = validBundle();
  record.records[0].extra = true;
  assert.throws(() => validatePersistentEntityBundle(record), /unknown field/i);
});

test('unknown record kinds and invalid scopes fail closed', () => {
  const kind = validBundle();
  kind.records[0].kind = 'unknown';
  assert.throws(() => validatePersistentEntityBundle(kind), /record kind|scope/i);
  const scope = validBundle();
  scope.scopes[0] = 'unknown';
  assert.throws(() => validatePersistentEntityBundle(scope), /scope/i);
});

test('scope declarations must exactly match carried record kinds', () => {
  const missing = validBundle();
  missing.scopes = missing.scopes.filter(scope => scope !== 'skill_ref');
  assert.throws(() => validatePersistentEntityBundle(missing), /scope/i);
  const emptyDeclared = validBundle();
  emptyDeclared.records = emptyDeclared.records.filter(record => record.kind !== 'skill_ref');
  assert.throws(() => validatePersistentEntityBundle(emptyDeclared), /scope/i);
});

test('singleton semantic groups cannot be duplicated', () => {
  const bundle = validBundle();
  bundle.records.push({ ...bundle.records[0] });
  assert.throws(() => validatePersistentEntityBundle(bundle), /duplicate.*identity|singleton/i);
});

test('reference record identifiers cannot be duplicated', () => {
  const bundle = validBundle();
  const memory = bundle.records.find(record => record.kind === 'private_memory_ref');
  bundle.records.push({ ...memory });
  assert.throws(() => validatePersistentEntityBundle(bundle), /duplicate.*memory_ref|duplicate reference/i);
});

test('invalid digests and timestamps fail closed', () => {
  const digest = validBundle();
  digest.source_composition_digest = 'bad';
  assert.throws(() => validatePersistentEntityBundle(digest), /digest/i);
  const timestamp = validBundle();
  timestamp.created_at = '2026-09-17T20:00:00Z';
  assert.throws(() => validatePersistentEntityBundle(timestamp), /created_at|timestamp/i);
});

test('portable skills must remain disabled by default', () => {
  const bundle = validBundle();
  bundle.records.find(record => record.kind === 'skill_ref').disabled_by_default = false;
  assert.throws(() => validatePersistentEntityBundle(bundle), /disabled/i);
});

test('relationship projections cannot declare third-party private data', () => {
  const bundle = validBundle();
  bundle.records.find(record => record.kind === 'relationship_projection').third_party_private_data = true;
  assert.throws(() => validatePersistentEntityBundle(bundle), /third-party|third_party/i);
});

test('bundle cannot widen authority network runtime or credential boundaries', () => {
  for (const [field, value] of [
    ['authority_effect', 'grant'],
    ['network_effect', 'egress'],
    ['runtime_activation', true],
    ['credential_material', true]
  ]) {
    const bundle = validBundle();
    bundle[field] = value;
    assert.throws(() => validatePersistentEntityBundle(bundle), /boundary|authority|network|runtime|credential/i);
  }
});

test('forbidden credential authority and implementation-lock-in field names fail recursively', () => {
  for (const [field, value] of [
    ['credentials', { token: 'secret' }],
    ['standing_approvals', ['all']],
    ['delegation', { scope: '*' }],
    ['embeddings', [0.1, 0.2]],
    ['server_id', 'server.source']
  ]) {
    const bundle = validBundle();
    bundle.records[1][field] = value;
    assert.throws(() => validatePersistentEntityBundle(bundle), /forbidden|unknown field/i);
  }
});

test('bounded cardinality and text limits fail closed', () => {
  const records = validBundle();
  records.records = Array.from({ length: 129 }, (_, index) => ({
    kind: 'private_memory_ref', memory_ref: `memory.owner.${index}`, content_digest: A
  }));
  records.scopes = ['private_memory_ref'];
  assert.throws(() => validatePersistentEntityBundle(records), /128|records/i);
  const text = validBundle();
  text.records.find(record => record.kind === 'character').text = 'x'.repeat(16 * 1024 + 1);
  assert.throws(() => validatePersistentEntityBundle(text), /character|16384/i);
});

test('validator module imports only the local canonical helper', async () => {
  const sourceUrl = new URL('../src/lib/persistent-entity-bundle.mjs', import.meta.url);
  const source = await readFile(sourceUrl, 'utf8');
  const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1]);
  assert.deepEqual(imports, ['./canonical.mjs']);
});
