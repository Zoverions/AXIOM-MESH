import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import { buildAgentReadiness } from '../../agent-readiness/build.mjs';

async function buildHub(t, origin) {
  const output = await mkdtemp(resolve(tmpdir(), 'axiom-public-agent-hub-'));
  t.after(async () => {
    await rm(output, { recursive: true, force: true });
  });
  const result = await buildAgentReadiness({ outDir: output, ...(origin ? { origin } : {}) });
  const [html, markdown, manifestText, sitemap] = await Promise.all([
    readFile(resolve(output, 'index.html'), 'utf8'),
    readFile(resolve(output, 'index.md'), 'utf8'),
    readFile(resolve(output, '.well-known/agent-skills/index.json'), 'utf8'),
    readFile(resolve(output, 'sitemap.xml'), 'utf8')
  ]);
  return { result, html, markdown, manifest: JSON.parse(manifestText), sitemap };
}

test('default public discovery hub stays under the existing zoverions.com/agents mount', async t => {
  const { result, html, manifest, sitemap } = await buildHub(t);

  assert.equal(result.origin, 'https://zoverions.com/agents');
  assert.equal(result.deployment_status, 'prepared_not_published');
  assert.match(html, /<link rel="canonical" href="https:\/\/zoverions\.com\/agents\/">/);
  assert.equal(
    manifest.skills[0].url,
    '/agents/.well-known/agent-skills/axiom-authority-auditor/SKILL.md'
  );
  for (const [, url] of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    assert.equal(url.startsWith('https://zoverions.com/agents/'), true);
  }
});

test('path-mounted skill discovery never escapes a reviewed custom publication prefix', async t => {
  const { result, manifest } = await buildHub(t, 'https://example.test/nested/axiom-agents/');

  assert.equal(result.origin, 'https://example.test/nested/axiom-agents');
  assert.equal(
    manifest.skills[0].url,
    '/nested/axiom-agents/.well-known/agent-skills/axiom-authority-auditor/SKILL.md'
  );
});

test('public agent hub exposes only reviewed projects and GitHub contribution lanes', async t => {
  const { html, markdown } = await buildHub(t);

  assert.match(html, /aria-label="ZOVERIONS green-eyed cat"/);
  assert.match(html, /AXIOM One/);
  assert.match(html, /experimental local preview/i);
  assert.match(html, /href="https:\/\/github\.com\/Zoverions\/Axiom-Education"/);
  assert.match(html, /runtime-provider-catalog\.v0\.json/);
  assert.match(html, /github\.com\/Zoverions\/AXIOM-MESH\/issues\/1185/);
  assert.match(html, /github\.com\/Zoverions\/AXIOM-MESH\/issues\/1199/);
  assert.match(html, /agent-contribution-proposal\.yml/);
  assert.match(markdown, /## Project ecosystem/);
  assert.match(markdown, /Axiom Education/);
  assert.match(markdown, /## Contribute through GitHub/);
});

test('public project hub remains static, non-authorizing, and free of credential collection', async t => {
  const { html } = await buildHub(t);

  assert.match(html, /production candidate, not production-promoted/i);
  assert.match(html, /Capability is not authority\. Discovery is not permission\./);
  assert.match(html, /prepared, not published/i);
  assert.doesNotMatch(html, /<(?:form|input|iframe|object|embed)\b/i);
  assert.doesNotMatch(html, /(?:onload|onclick|onsubmit)\s*=/i);
  assert.doesNotMatch(html, /(?:href|src)\s*=\s*["']\s*javascript:/i);
  assert.doesNotMatch(html, /(?:api[_-]?key|bearer\s+[a-z0-9._-]+|access[_-]?token)/i);
  const scripts = [...html.matchAll(/<script\b([^>]*)>/gi)];
  assert.equal(scripts.length, 1);
  assert.match(scripts[0][1], /type="application\/ld\+json"/);
});
