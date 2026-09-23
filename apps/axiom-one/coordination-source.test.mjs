import assert from 'node:assert/strict';
import { mkdtemp, writeFile, chmod, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { readMeshStatus } from './coordination-source.mjs';

const SOURCE = { format: 'MESH_STATUS v1', updated_at: '2026-09-23T12:00:00.000Z',
  agents: { 'agent-a': { state: 'online', enc: 'g2-verified', heartbeat_slot: ':00/:30',
    last_heartbeat: '2026-09-23T11:59:00.000Z', lease: 'standing', work: 'Review', blockers: 'none' } } };

async function withTokenFile(run) {
  const dir = await mkdtemp(join(tmpdir(), 'axiom-one-feed-'));
  const file = join(dir, 'feed-token');
  try {
    await writeFile(file, 'example-read-only-token-123456\n', { mode: 0o600 });
    await run(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('server-side reader uses a distinct file-backed bearer on an exact loopback URL', async () => {
  await withTokenFile(async tokenFile => {
    let called = 0;
    const snapshot = await readMeshStatus({
      sourceUrl: 'http://127.0.0.1:3999/mesh-status', tokenFile,
      sourceId: 'cosmo', audienceId: 'owner-1',
      fetchImpl: async (url, options) => {
        called++;
        assert.equal(url, 'http://127.0.0.1:3999/mesh-status');
        assert.equal(options.headers.authorization, 'Bearer example-read-only-token-123456');
        assert.equal(options.redirect, 'error');
        assert.equal(options.method, 'GET');
        return new Response(JSON.stringify(SOURCE), { status: 200,
          headers: { 'content-type': 'application/json', 'x-mesh-revision': '7' } });
      }
    });
    assert.equal(called, 1);
    assert.equal(snapshot.revision, 7);
    assert.match(snapshot.content_digest, /^[a-f0-9]{64}$/);
    assert.equal(snapshot.agents[0].id, 'agent-a');
    assert.equal(snapshot.agents[0].lease.state, 'unknown');
  });
});

test('source reader refuses remote origins, URL credentials, queries, and unsafe token permissions', async () => {
  await withTokenFile(async tokenFile => {
    const neverFetch = () => { throw new Error('should not fetch'); };
    for (const sourceUrl of ['https://example.com/status', 'http://localhost:3999/status',
      'http://user:pass@127.0.0.1:3999/status', 'http://127.0.0.1:3999/status?token=bad']) {
      await assert.rejects(readMeshStatus({ sourceUrl, tokenFile, sourceId: 'cosmo', audienceId: 'owner-1', fetchImpl: neverFetch }), /loopback source URL/);
    }
    await chmod(tokenFile, 0o644);
    await assert.rejects(readMeshStatus({ sourceUrl: 'http://127.0.0.1:3999/status', tokenFile,
      sourceId: 'cosmo', audienceId: 'owner-1', fetchImpl: neverFetch }), /token file permissions/);
    await chmod(tokenFile, 0o600);
    const link = `${tokenFile}.link`;
    await symlink(tokenFile, link);
    await assert.rejects(readMeshStatus({ sourceUrl: 'http://127.0.0.1:3999/status', tokenFile: link,
      sourceId: 'cosmo', audienceId: 'owner-1', fetchImpl: neverFetch }), /token file permissions/);
  });
});

test('source reader rejects ambiguous numeric revision headers', async () => {
  await withTokenFile(async tokenFile => {
    for (const header of ['', '0x10', '1e2', '-1']) {
      await assert.rejects(readMeshStatus({
        sourceUrl: 'http://127.0.0.1:3999/status', tokenFile, sourceId: 'cosmo', audienceId: 'owner-1',
        fetchImpl: async () => new Response(JSON.stringify(SOURCE), { status: 200,
          headers: { 'content-type': 'application/json', 'x-mesh-revision': header } })
      }), /revision/);
    }
  });
});

test('source reader fails closed on unauthorized or oversized responses without echoing the token', async () => {
  await withTokenFile(async tokenFile => {
    const base = { sourceUrl: 'http://127.0.0.1:3999/status', tokenFile, sourceId: 'cosmo', audienceId: 'owner-1' };
    await assert.rejects(readMeshStatus({ ...base, fetchImpl: async () => new Response('', { status: 401 }) }),
      error => error.message.includes('unauthorized') && !error.message.includes('example-read-only-token'));
    await assert.rejects(readMeshStatus({ ...base, fetchImpl: async () => new Response('x'.repeat(70_000),
      { status: 200, headers: { 'content-type': 'application/json', 'x-mesh-revision': '8' } }) }), /too large/);
  });
});
