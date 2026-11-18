import assert from 'node:assert/strict';
import { appendFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { finalizeEpistemicProposal } from '../src/lib/epistemic-contracts.mjs';

const NOW = '2026-09-08T12:00:00.000Z';
const SHA = `sha256:${'1'.repeat(64)}`;

async function loadStore() {
  const module = await import('../src/lib/epistemic-proposal-store.mjs');
  assert.equal(typeof module.openEpistemicProposalStore, 'function', 'E1 proposal store API unavailable');
  assert.equal(module.EPISTEMIC_PROPOSAL_STORE_FILENAME, 'epistemic-proposals.v0.jsonl');
  assert.equal(module.EPISTEMIC_PROPOSAL_STORE_LIMITS.object_count, 1024);
  assert.equal(module.EPISTEMIC_PROPOSAL_STORE_LIMITS.export_bytes, 8 * 1024 * 1024);
  assert.equal(module.EPISTEMIC_PROPOSAL_STORE_LIMITS.graph_depth, 8);
  return module;
}

function sourceProposal({ id = 'source:store', revision = 1, previous_revision, provenance_refs = [], ...overrides } = {}) {
  return finalizeEpistemicProposal({
    schema: 'axiom-epistemic-record.v0',
    id,
    object_type: 'source',
    schema_version: '0.1.0',
    created_at: NOW,
    created_by: 'fixture:human',
    revision,
    ...(previous_revision ? { previous_revision } : {}),
    provenance_refs,
    canonical_state: 'proposal',
    machine_generated: false,
    authority_effect: 'none',
    source_type: 'paper',
    retrieved_at: NOW,
    original_content_digest: SHA,
    title: `Proposal ${id} revision ${revision}`,
    ...overrides
  });
}

async function withTempStore(run) {
  const directory = await mkdtemp(join(tmpdir(), 'axiom-epistemic-e1-'));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('E1 requires an explicit absolute disposable directory and exposes no ambient store', async () => {
  const { openEpistemicProposalStore } = await loadStore();
  await assert.rejects(() => openEpistemicProposalStore(), /directory|disposable/i);
  await assert.rejects(() => openEpistemicProposalStore({ directory: 'relative/path', disposable: true }), /absolute/i);
  await withTempStore(async (directory) => {
    await assert.rejects(() => openEpistemicProposalStore({ directory }), /disposable/i);
    const store = await openEpistemicProposalStore({ directory, disposable: true });
    assert.equal(store.directory, directory);
    assert.equal(store.authority_effect, 'none');
    assert.equal(store.canonical_state, 'proposal');
  });
});

test('proposal heads persist across reopen without becoming canonical state', async () => {
  const { openEpistemicProposalStore } = await loadStore();
  await withTempStore(async (directory) => {
    const proposal = sourceProposal({ id: 'source:persist' });
    const store = await openEpistemicProposalStore({ directory, disposable: true });
    assert.deepEqual(await store.put(proposal), proposal);
    assert.deepEqual(await store.getHead(proposal.id), proposal);

    const reopened = await openEpistemicProposalStore({ directory, disposable: true });
    assert.deepEqual(await reopened.getHead(proposal.id), proposal);
    assert.equal((await reopened.getHead(proposal.id)).canonical_state, 'proposal');
    assert.equal((await reopened.getHead(proposal.id)).authority_effect, 'none');
  });
});

test('exact replay is idempotent while stale or conflicting revision heads fail closed', async () => {
  const { openEpistemicProposalStore } = await loadStore();
  await withTempStore(async (directory) => {
    const store = await openEpistemicProposalStore({ directory, disposable: true });
    const first = sourceProposal({ id: 'source:revision' });
    assert.deepEqual(await store.put(first), first);
    assert.deepEqual(await store.put(first), first);

    const second = sourceProposal({
      id: first.id,
      revision: 2,
      previous_revision: first.content_digest,
      title: 'Second revision'
    });
    assert.deepEqual(await store.put(second), second);
    assert.deepEqual(await store.getHead(first.id), second);

    const stale = sourceProposal({
      id: first.id,
      revision: 3,
      previous_revision: first.content_digest,
      title: 'Stale third revision'
    });
    await assert.rejects(() => store.put(stale), /stale|previous|head/i);

    const conflict = sourceProposal({
      id: first.id,
      revision: 2,
      previous_revision: first.content_digest,
      title: 'Conflicting second revision'
    });
    await assert.rejects(() => store.put(conflict), /conflict|revision/i);
  });
});

test('deterministic export is byte-identical across repeated runs and contains proposals only', async () => {
  const { openEpistemicProposalStore } = await loadStore();
  await withTempStore(async (directory) => {
    const store = await openEpistemicProposalStore({ directory, disposable: true });
    await store.put(sourceProposal({ id: 'source:zeta' }));
    await store.put(sourceProposal({ id: 'source:alpha' }));

    const first = await store.exportSnapshot();
    const second = await store.exportSnapshot();
    assert.equal(typeof first, 'string');
    assert.equal(first, second);
    assert.ok(first.endsWith('\n'));

    const snapshot = JSON.parse(first);
    assert.equal(snapshot.schema, 'axiom-epistemic-proposal-snapshot.v0');
    assert.equal(snapshot.canonical_state, 'proposal');
    assert.equal(snapshot.authority_effect, 'none');
    assert.equal(snapshot.record_count, 2);
    assert.deepEqual(snapshot.records.map((item) => item.id), ['source:alpha', 'source:zeta']);

    const reopened = await openEpistemicProposalStore({ directory, disposable: true });
    assert.equal(await reopened.exportSnapshot(), first);
  });
});

test('corrupted proposal state produces explicit failure instead of partial recovery', async () => {
  const { openEpistemicProposalStore, EPISTEMIC_PROPOSAL_STORE_FILENAME } = await loadStore();
  await withTempStore(async (directory) => {
    const store = await openEpistemicProposalStore({ directory, disposable: true });
    await store.put(sourceProposal({ id: 'source:corrupt' }));
    await appendFile(join(directory, EPISTEMIC_PROPOSAL_STORE_FILENAME), '{"truncated":', 'utf8');
    await assert.rejects(
      () => openEpistemicProposalStore({ directory, disposable: true }),
      /corrupt|invalid|canonical|state|truncated/i
    );
  });
});

test('store object-count ceiling is exact and fails before a 1025th append', async () => {
  const { openEpistemicProposalStore } = await loadStore();
  await withTempStore(async (directory) => {
    const store = await openEpistemicProposalStore({ directory, disposable: true });
    for (let index = 0; index < 1024; index += 1) {
      await store.put(sourceProposal({ id: `source:count:${index}` }));
    }
    await assert.rejects(
      () => store.put(sourceProposal({ id: 'source:count:overflow' })),
      /1024|count|capacity/i
    );
  });
});

test('proposal dependency traversal is bounded to depth eight', async () => {
  const { openEpistemicProposalStore } = await loadStore();
  await withTempStore(async (directory) => {
    const store = await openEpistemicProposalStore({ directory, disposable: true });
    let previous = null;
    for (let index = 0; index < 9; index += 1) {
      const proposal = sourceProposal({
        id: `source:depth:${index}`,
        provenance_refs: previous ? [previous.id] : []
      });
      await store.put(proposal);
      previous = proposal;
    }
    await assert.rejects(
      () => store.put(sourceProposal({ id: 'source:depth:9', provenance_refs: [previous.id] })),
      /depth|8/i
    );
  });
});

function largeProposal(index) {
  return sourceProposal({
    id: `source:large:${index}`,
    title: 't'.repeat(1024),
    authors: Array.from({ length: 64 }, (_, item) => `author:${index}:${item}:${'a'.repeat(180)}`),
    external_identifiers: Array.from({ length: 32 }, (_, item) => `urn:large:${index}:${item}:${'e'.repeat(850)}`),
    parent_source_refs: Array.from({ length: 32 }, (_, item) => `source:external:${index}:${item}:${'p'.repeat(170)}`),
    provenance_refs: Array.from({ length: 64 }, (_, item) => `provenance:external:${index}:${item}:${'v'.repeat(120)}`),
    raw_artifact_ref: `artifact:${index}:${'r'.repeat(1400)}`
  });
}

test('deterministic export refuses to exceed the eight MiB ceiling', async () => {
  const { openEpistemicProposalStore } = await loadStore();
  await withTempStore(async (directory) => {
    const store = await openEpistemicProposalStore({ directory, disposable: true });
    for (let index = 0; index < 160; index += 1) await store.put(largeProposal(index));
    await assert.rejects(() => store.exportSnapshot(), /8 MiB|8388608|export/i);
  });
});
