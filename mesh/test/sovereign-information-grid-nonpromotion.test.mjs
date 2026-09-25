import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const PARENT_BLOBS = Object.freeze({
  capabilities: 'fd34c4b1836654bb7eeb7dda0f8be748ee124db8',
  // Updated deliberately for optional `cursor` and `limit` on `sync.list` and
  // the other paged collections (scalability audit S-10). No route, access
  // rule or response schema changed.
  gateway_contract: '612f1a9d0ec0af6d272165ee8438109d4e31851d',
  // Updated deliberately for the online-sync head (signed, nonce-bound count
  // of an owner's sync bundle events on /internal/v1/events) and for keyset
  // paging of sync state and the other collections (`cursor` and `limit`).
  // The server still composes no SIEA store; the assertions below are
  // unchanged.
  grid_server: '2a4a5a5b0ebce7069b47957835d5ff162506a616',
  // Updated deliberately for core migration 11 (index-only: composite
  // indexes for the paged collections, scalability audit S-11). No table or
  // column changed.
  core_migrations: 'ef5fbf579a85c50968f370a7b47f285a019f02ac'
});

async function gitBlobSha(relative) {
  const bytes = await readFile(new URL(relative, import.meta.url));
  return createHash('sha1')
    .update(Buffer.from(`blob ${bytes.length}\0`))
    .update(bytes)
    .digest('hex');
}

test('Slice 2 leaves capability registry byte-identical to approved Slice 1 parent', async () => {
  assert.equal(await gitBlobSha('../config/capabilities.json'), PARENT_BLOBS.capabilities);
});

test('Slice 2 leaves Gateway client contract byte-identical to approved Slice 1 parent', async () => {
  assert.equal(await gitBlobSha('../config/gateway-client-contract.json'), PARENT_BLOBS.gateway_contract);
});

test('Slice 2 leaves core Grid migrations byte-identical to approved Slice 1 parent', async () => {
  assert.equal(await gitBlobSha('../src/grid/migrations.mjs'), PARENT_BLOBS.core_migrations);
});

test('Slice 2 leaves current Grid server composition byte-identical and does not make SIEA store the runtime default', async () => {
  assert.equal(await gitBlobSha('../src/grid/server.mjs'), PARENT_BLOBS.grid_server);
  const source = await readFile(new URL('../src/grid/server.mjs', import.meta.url), 'utf8');
  assert.equal(source.includes('SovereignInformationGridStore'), false);
  assert.equal(source.includes('SovereignInformationPortabilityGridStore'), false);
});
