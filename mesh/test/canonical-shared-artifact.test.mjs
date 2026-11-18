import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { digestObject } from '../src/lib/canonical.mjs';
import {
  CANONICAL_SHARED_ARTIFACT_SCHEMA,
  canonicalSharedArtifactDigest,
  validateCanonicalSharedArtifact
} from '../src/lib/canonical-shared-artifact.mjs';

function contentDigest(contentType, payload) {
  return digestObject({ content_type: contentType, payload });
}

function authorization(overrides = {}) {
  return {
    request_digest: 'a'.repeat(64),
    evidence_ref: 'receipt:1',
    evidence_digest: 'b'.repeat(64),
    ...overrides
  };
}

function revision(overrides = {}) {
  return {
    revision_id: 'rev:1',
    parents: [],
    operation: 'put',
    actor_principal: 'principal:owner',
    actor_kind: 'human',
    authorization: authorization(),
    payload: 'hello',
    content_digest: contentDigest('text/plain', 'hello'),
    resolves: [],
    work_graph: null,
    occurred_at: '2026-09-17T16:00:00.000Z',
    ...overrides
  };
}

function validArtifact(overrides = {}) {
  return {
    schema: 'axiom-canonical-shared-artifact.v0',
    version: 0,
    status: 'inert-shared-artifact-contract',
    artifact_id: 'artifact:demo',
    owner_ref: 'principal:owner',
    authority_domain: { kind: 'owner', ref: 'principal:owner' },
    content_type: 'text/plain',
    revisions: [revision()],
    current_heads: ['rev:1'],
    state: 'active',
    current_content_digest: contentDigest('text/plain', 'hello'),
    sharing: { state: 'private', projection_refs: [] },
    created_at: '2026-09-17T16:00:00.000Z',
    updated_at: '2026-09-17T16:00:00.000Z',
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    ...overrides
  };
}

function conflictArtifact() {
  const revisions = [
    revision(),
    revision({
      revision_id: 'rev:2',
      parents: ['rev:1'],
      actor_kind: 'agent',
      payload: 'agent edit',
      content_digest: contentDigest('text/plain', 'agent edit'),
      occurred_at: '2026-09-17T16:01:00.000Z'
    }),
    revision({
      revision_id: 'rev:3',
      parents: ['rev:1'],
      actor_principal: 'principal:owner',
      actor_kind: 'human',
      payload: 'human edit',
      content_digest: contentDigest('text/plain', 'human edit'),
      occurred_at: '2026-09-17T16:02:00.000Z'
    })
  ];
  return validArtifact({
    revisions,
    current_heads: ['rev:2', 'rev:3'],
    state: 'conflict',
    current_content_digest: null,
    updated_at: '2026-09-17T16:02:00.000Z'
  });
}

function resolvedArtifact() {
  const artifact = conflictArtifact();
  artifact.revisions.push(revision({
    revision_id: 'rev:4',
    parents: ['rev:2', 'rev:3'],
    operation: 'resolve',
    actor_kind: 'agent',
    payload: 'resolved edit',
    content_digest: contentDigest('text/plain', 'resolved edit'),
    resolves: ['rev:2', 'rev:3'],
    work_graph: { graph_id: 'graph:1', graph_digest: 'c'.repeat(64) },
    occurred_at: '2026-09-17T16:03:00.000Z'
  }));
  artifact.current_heads = ['rev:4'];
  artifact.state = 'active';
  artifact.current_content_digest = contentDigest('text/plain', 'resolved edit');
  artifact.updated_at = '2026-09-17T16:03:00.000Z';
  return artifact;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function clone(value) {
  return structuredClone(value);
}

function expectValidationFailure(artifact, pattern) {
  assert.throws(() => validateCanonicalSharedArtifact(artifact), pattern);
}

test('validates an inert canonical shared artifact', () => {
  const result = validateCanonicalSharedArtifact(validArtifact());
  assert.equal(result.valid, true);
  assert.equal(result.schema, CANONICAL_SHARED_ARTIFACT_SCHEMA);
  assert.equal(result.artifact_id, 'artifact:demo');
  assert.equal(result.state, 'active');
  assert.deepEqual(result.current_heads, ['rev:1']);
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.network_effect, 'none');
  assert.equal(result.runtime_activation, false);
});

test('digest is deterministic across object key order', () => {
  const artifact = validArtifact();
  const reordered = Object.fromEntries(Object.entries(artifact).reverse());
  reordered.authority_domain = Object.fromEntries(Object.entries(artifact.authority_domain).reverse());
  reordered.revisions = artifact.revisions.map(item => Object.fromEntries(Object.entries(item).reverse()));
  assert.equal(canonicalSharedArtifactDigest(artifact), canonicalSharedArtifactDigest(reordered));
});

test('validation does not mutate a deeply frozen artifact', () => {
  const artifact = deepFreeze(validArtifact());
  assert.doesNotThrow(() => validateCanonicalSharedArtifact(artifact));
});

test('unknown fields fail closed at every contract boundary', () => {
  const variants = [];
  let artifact = validArtifact(); artifact.unknown = true; variants.push(artifact);
  artifact = validArtifact(); artifact.authority_domain.unknown = true; variants.push(artifact);
  artifact = validArtifact(); artifact.sharing.unknown = true; variants.push(artifact);
  artifact = validArtifact(); artifact.revisions[0].unknown = true; variants.push(artifact);
  artifact = validArtifact(); artifact.revisions[0].authorization.unknown = true; variants.push(artifact);
  artifact = resolvedArtifact(); artifact.revisions[3].work_graph.unknown = true; variants.push(artifact);
  for (const variant of variants) expectValidationFailure(variant, /unknown field/i);
});

test('content digest must match canonical payload', () => {
  const artifact = validArtifact();
  artifact.revisions[0].content_digest = 'd'.repeat(64);
  expectValidationFailure(artifact, /content digest/i);
});

test('unsupported content types operations actors and authority domains fail closed', () => {
  const cases = [
    ['content type', () => { const a = validArtifact(); a.content_type = 'text/html'; return a; }],
    ['operation', () => { const a = validArtifact(); a.revisions[0].operation = 'merge'; return a; }],
    ['actor', () => { const a = validArtifact(); a.revisions[0].actor_kind = 'root'; return a; }],
    ['authority', () => { const a = validArtifact(); a.authority_domain.kind = 'server'; return a; }]
  ];
  for (const [name, build] of cases) assert.throws(() => validateCanonicalSharedArtifact(build()), new RegExp(name, 'i'));
});

test('revision identifiers and parent references are bounded and causal', () => {
  let artifact = validArtifact();
  artifact.revisions[0].revision_id = ' bad';
  expectValidationFailure(artifact, /revision.*id|invalid format/i);

  artifact = conflictArtifact();
  artifact.revisions[1].parents = ['rev:missing'];
  expectValidationFailure(artifact, /missing|earlier/i);

  artifact = conflictArtifact();
  artifact.revisions[1].parents = ['rev:2'];
  expectValidationFailure(artifact, /self|earlier/i);

  artifact = conflictArtifact();
  artifact.revisions[1].parents = ['rev:1', 'rev:1'];
  expectValidationFailure(artifact, /duplicate|exactly one parent/i);
});

test('stale-parent edit creates visible concurrent heads', () => {
  const result = validateCanonicalSharedArtifact(conflictArtifact());
  assert.equal(result.state, 'conflict');
  assert.deepEqual(result.current_heads, ['rev:2', 'rev:3']);
  assert.equal(result.current_content_digest, null);
});

test('complete resolution names every current head and converges conflict', () => {
  const result = validateCanonicalSharedArtifact(resolvedArtifact());
  assert.equal(result.state, 'active');
  assert.deepEqual(result.current_heads, ['rev:4']);
  assert.equal(result.current_content_digest, contentDigest('text/plain', 'resolved edit'));
});

test('partial phantom duplicate and unsorted resolution heads fail closed', () => {
  let artifact = resolvedArtifact();
  artifact.revisions[3].parents = ['rev:2'];
  artifact.revisions[3].resolves = ['rev:2'];
  expectValidationFailure(artifact, /every current head|complete|resolution/i);

  artifact = resolvedArtifact();
  artifact.revisions[3].parents = ['rev:2', 'rev:missing'];
  artifact.revisions[3].resolves = ['rev:2', 'rev:missing'];
  expectValidationFailure(artifact, /missing|current head|resolution/i);

  artifact = resolvedArtifact();
  artifact.revisions[3].parents = ['rev:2', 'rev:2'];
  artifact.revisions[3].resolves = ['rev:2', 'rev:2'];
  expectValidationFailure(artifact, /duplicate|resolution/i);

  artifact = resolvedArtifact();
  artifact.revisions[3].parents = ['rev:3', 'rev:2'];
  artifact.revisions[3].resolves = ['rev:3', 'rev:2'];
  expectValidationFailure(artifact, /sorted|resolution/i);
});

test('retraction is a contentless tombstone and remains historical', () => {
  const artifact = validArtifact();
  artifact.revisions.push(revision({
    revision_id: 'rev:2',
    parents: ['rev:1'],
    operation: 'retract',
    payload: null,
    content_digest: null,
    occurred_at: '2026-09-17T16:01:00.000Z'
  }));
  artifact.current_heads = ['rev:2'];
  artifact.state = 'retracted';
  artifact.current_content_digest = null;
  artifact.updated_at = '2026-09-17T16:01:00.000Z';
  const result = validateCanonicalSharedArtifact(artifact);
  assert.equal(result.state, 'retracted');
  assert.equal(result.revision_count, 2);

  const invalid = clone(artifact);
  invalid.revisions[1].payload = 'still here';
  expectValidationFailure(invalid, /retract|tombstone|content/i);
});

test('artifact state and current content digest must match derived heads', () => {
  let artifact = conflictArtifact(); artifact.state = 'active';
  expectValidationFailure(artifact, /state/i);
  artifact = conflictArtifact(); artifact.current_content_digest = 'e'.repeat(64);
  expectValidationFailure(artifact, /current content digest/i);
  artifact = conflictArtifact(); artifact.current_heads = ['rev:3'];
  expectValidationFailure(artifact, /current heads/i);
});

test('sharing projection state is explicit and internally consistent', () => {
  let artifact = validArtifact();
  artifact.sharing = { state: 'private', projection_refs: ['projection:1'] };
  expectValidationFailure(artifact, /private|projection/i);
  artifact = validArtifact();
  artifact.sharing = { state: 'projected', projection_refs: [] };
  expectValidationFailure(artifact, /projected|projection/i);
  artifact = validArtifact();
  artifact.sharing = { state: 'projected', projection_refs: ['projection:2', 'projection:1'] };
  expectValidationFailure(artifact, /sorted/i);
});

test('owner authority domain must match owner reference', () => {
  const artifact = validArtifact();
  artifact.authority_domain.ref = 'principal:other';
  expectValidationFailure(artifact, /owner|authority domain/i);
});

test('authorization evidence is required but grants no authority effect', () => {
  let artifact = validArtifact();
  artifact.revisions[0].authorization.evidence_ref = '';
  expectValidationFailure(artifact, /authorization|evidence/i);
  artifact = validArtifact({ authority_effect: 'write' });
  expectValidationFailure(artifact, /authority effect/i);
  artifact = validArtifact({ network_effect: 'send' });
  expectValidationFailure(artifact, /network effect/i);
  artifact = validArtifact({ runtime_activation: true });
  expectValidationFailure(artifact, /runtime activation/i);
});

test('optional verified-work binding is provenance only', () => {
  const artifact = validArtifact();
  artifact.revisions[0].work_graph = { graph_id: 'graph:1', graph_digest: 'c'.repeat(64) };
  const result = validateCanonicalSharedArtifact(artifact);
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.runtime_activation, false);
});

test('structured JSON payloads are canonical bounded data', () => {
  const payload = { title: 'demo', blocks: [{ type: 'paragraph', text: 'hello' }] };
  const artifact = validArtifact({
    content_type: 'application/json',
    revisions: [revision({ payload, content_digest: contentDigest('application/json', payload) })],
    current_content_digest: contentDigest('application/json', payload)
  });
  assert.doesNotThrow(() => validateCanonicalSharedArtifact(artifact));

  const invalid = clone(artifact);
  invalid.revisions[0].payload = { value: undefined };
  expectValidationFailure(invalid, /canonical|payload/i);
});

test('timestamps are canonical monotonic and bind artifact boundaries', () => {
  let artifact = validArtifact(); artifact.created_at = '2026-09-17T16:00:01.000Z';
  expectValidationFailure(artifact, /created_at|created at/i);
  artifact = conflictArtifact(); artifact.revisions[2].occurred_at = '2026-09-17T15:59:00.000Z';
  expectValidationFailure(artifact, /timestamp|monotonic/i);
  artifact = validArtifact(); artifact.revisions[0].occurred_at = '2026-09-17T16:00:00Z';
  artifact.created_at = '2026-09-17T16:00:00Z'; artifact.updated_at = '2026-09-17T16:00:00Z';
  expectValidationFailure(artifact, /timestamp|canonical/i);
});

test('revision and projection cardinality limits fail closed', () => {
  const artifact = validArtifact();
  artifact.sharing = { state: 'projected', projection_refs: Array.from({ length: 65 }, (_, i) => `projection:${String(i).padStart(2, '0')}`) };
  expectValidationFailure(artifact, /projection|64/i);
});

test('validator module imports only canonical helper', async () => {
  const source = await readFile(new URL('../src/lib/canonical-shared-artifact.mjs', import.meta.url), 'utf8');
  const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1]);
  assert.deepEqual(imports, ['./canonical.mjs']);
});
