import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { startAxiomOnePreview } from '../../apps/axiom-one/server.mjs';

const STATIC_MODULES = Object.freeze([
  {
    path: '/social-feed-preview.mjs',
    source: new URL('../src/lib/axiom-one-social-feed-preview.mjs', import.meta.url),
    marker: 'buildAxiomOneSocialFeedPreview'
  },
  {
    path: '/social-feed-ranking-core.mjs',
    source: new URL('../src/lib/social-feed-ranking-core.mjs', import.meta.url),
    marker: 'rankSocialFeedCore'
  }
]);

test('AXIOM One serves the reviewed social feed modules byte-for-byte from the loopback shell', async t => {
  const preview = await startAxiomOnePreview({ port: 0 });
  t.after(async () => preview.stop());

  for (const module of STATIC_MODULES) {
    const response = await fetch(`${preview.url}${module.path}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /^text\/javascript/);
    const served = await response.text();
    const source = await readFile(module.source, 'utf8');
    assert.equal(served, source);
    assert.match(served, new RegExp(module.marker));
  }
});

test('the feed-module seam is a static shell asset only and adds no Gateway route or browser persistence', async () => {
  const [policySource, serviceWorkerSource] = await Promise.all([
    readFile(new URL('../../apps/axiom-one/app-policy.json', import.meta.url), 'utf8'),
    readFile(new URL('../../apps/axiom-one/sw.mjs', import.meta.url), 'utf8')
  ]);
  const policy = JSON.parse(policySource);

  assert.equal(policy.gateway_routes.includes('social-feed-preview'), false);
  assert.equal(policy.gateway_routes.includes('social-feed-ranking-core'), false);
  assert.equal(policy.security.remote_origins_allowed, false);
  assert.equal(policy.security.secret_or_user_data_storage, false);
  assert.equal(policy.security.token_persistence, 'memory-only');

  for (const module of STATIC_MODULES) {
    assert.match(serviceWorkerSource, new RegExp(module.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(serviceWorkerSource, /localStorage|sessionStorage|indexedDB|document\.cookie/);
});
