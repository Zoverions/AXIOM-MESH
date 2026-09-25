import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const PARENT_BLOBS = Object.freeze({
  // Updated deliberately: two capability summaries restate the route counts
  // (32 Gateway, 43 network) after `sync_bundles.list`. No capability state,
  // evidence path or activation changed.
  capabilities: '6516d91537120a36da20c5bbfa896606b06ec83e',
  // Updated deliberately for optional `cursor` and `limit` on `sync.list` and
  // the other paged collections, including accounting journals, and for the
  // read-only `sync_bundles.list` route over the owner's own bundle summaries
  // (scalability audit S-10). No existing route, access rule or response
  // schema changed.
  gateway_contract: '0287595b88109be83e10fb56db396b241c05b60b',
  // Updated deliberately for the online-sync head (signed, nonce-bound count
  // of an owner's sync bundle events on /internal/v1/events) and for keyset
  // paging of sync state and the other collections, including accounting
  // journals and bundle summaries (`cursor` and `limit`). The server still
  // composes no SIEA store; the assertions below are unchanged.
  grid_server: 'b4e33a2b9e47fcdfc0f4d815c2375caf33313dfd',
  // Updated deliberately for core migration 11 (index-only: composite
  // indexes for the paged collections, accounting journals, node schedules
  // and sync bundles, scalability audit S-11). No table or column changed.
  core_migrations: 'ad4e0902dbbdd5a0070a1ef373b9af181884ef0c'
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
