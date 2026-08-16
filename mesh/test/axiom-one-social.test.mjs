import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const indexUrl = new URL('../../apps/axiom-one/index.html', import.meta.url);

async function socialAssets() {
  const html = await readFile(indexUrl, 'utf8');
  const moduleMatch = html.match(/<script[^>]+type=["']module["'][^>]+src=["']([^"']+)["']/i)
    ?? html.match(/<script[^>]+src=["']([^"']+\.mjs)["']/i);
  const styleMatch = html.match(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/i);
  assert.ok(moduleMatch, 'AXIOM One module script must remain explicit');
  assert.ok(styleMatch, 'AXIOM One stylesheet must remain explicit');
  const module = await readFile(new URL(moduleMatch[1], indexUrl), 'utf8');
  const stylesheet = await readFile(new URL(styleMatch[1], indexUrl), 'utf8');
  return { html, module, stylesheet };
}

test('AXIOM One local social surface names the local-only boundary', async () => {
  const { html } = await socialAssets();
  assert.match(html, /id=["']social-surface["']/);
  assert.match(html, /LOCAL SOCIAL CORPUS/);
  assert.match(html, /LOCAL ONLY/);
  assert.match(html, /not distributed off-node|not distributed to a network/i);
  assert.match(html, /Following/);
  assert.match(html, /Not enabled/i);
  assert.match(html, /no accepted remote exchange\/federation layer/i);
  assert.match(html, /id=["']social-status["'][^>]+aria-live=["']polite["']/);

  const personaSelect = html.match(/<select id=["']social-persona-mode["']>[\s\S]*?<\/select>/i)?.[0] ?? '';
  assert.match(personaSelect, /pseudonymous/);
  assert.match(personaSelect, /public-identifiable/);
  assert.match(personaSelect, /anonymous/);
  assert.match(personaSelect, /selectively-attributable/);
  assert.doesNotMatch(personaSelect, /organization-delegated/);
});

test('AXIOM One social browser code preserves memory-only same-origin behavior', async () => {
  const { module } = await socialAssets();
  assert.match(module, /AXIOM_ONE_LOCAL_SOCIAL_V1/);
  assert.match(module, /request\('\/v1\/social\?publication_limit=100'/);
  assert.match(module, /request\('\/v1\/intents'/);
  assert.match(module, /cache:\s*['"]no-store['"]/);
  assert.match(module, /credentials:\s*['"]same-origin['"]/);
  assert.doesNotMatch(module, /\blocalStorage\b/);
  assert.doesNotMatch(module, /\bsessionStorage\b/);
  assert.doesNotMatch(module, /\bindexedDB\b/i);
  assert.doesNotMatch(module, /https?:\/\//i);
});

test('AXIOM One social UI reaches only the accepted local social action family', async () => {
  const { module } = await socialAssets();
  for (const action of [
    'social.actor.create',
    'social.persona.create',
    'social.publication.create',
    'social.publication.supersede',
    'social.publication.retract'
  ]) assert.match(module, new RegExp(action.replaceAll('.', '\\.')));

  assert.match(module, /confirm:social\.publication\.retract/);
  assert.match(module, /third-party copies/i);
  assert.match(module, /network_effect\s*!==\s*['"]none['"]/);
  assert.doesNotMatch(module, /social\.(follow|federate|message|recommend|relay)/i);
});

test('AXIOM One local social styling stays inside the existing stylesheet', async () => {
  const { stylesheet } = await socialAssets();
  assert.match(stylesheet, /AXIOM_ONE_LOCAL_SOCIAL_V1/);
  assert.match(stylesheet, /\.social-surface/);
  assert.match(stylesheet, /\.social-history/);
  assert.match(stylesheet, /@media\s*\(max-width:/);
});
