import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const PARENT_BLOBS = Object.freeze({
  capabilities: 'fd34c4b1836654bb7eeb7dda0f8be748ee124db8',
  // Updated deliberately for optional `cursor` and `limit` on `sync.list` and
  // the other paged collections, including accounting journals (scalability
  // audit S-10). No route, access rule or response schema changed.
  gateway_contract: '60556683e559507985a528aeae516dccf22de853',
  // Updated deliberately for the online-sync head (signed, nonce-bound count
  // of an owner's sync bundle events on /internal/v1/events) and for keyset
  // paging of sync state and the other collections, including accounting
  // journals (`cursor` and `limit`). The server still composes no SIEA store;
  // the assertions below are unchanged.
  grid_server: '277723ab8e62b5ed5e59d4fa46e05578b3eaa97c',
  // Updated deliberately for core migration 11 (index-only: composite
  // indexes for the paged collections, accounting journals and node
  // schedules, scalability audit S-11). No table or column changed.
  core_migrations: 'f470d2c900692ed8ed41f6e79b1c4721013029cf'
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
