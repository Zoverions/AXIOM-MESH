import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('../../apps/axiom-one/app.mjs', import.meta.url), 'utf8');
const server = await readFile(new URL('../../apps/axiom-one/server.mjs', import.meta.url), 'utf8');
const serviceWorker = await readFile(new URL('../../apps/axiom-one/sw.mjs', import.meta.url), 'utf8');

const socialStart = app.indexOf('async function renderSocial()');
const socialEnd = app.indexOf('async function renderApprovals()');
const social = socialStart >= 0 && socialEnd > socialStart
  ? app.slice(socialStart, socialEnd)
  : '';

test('Axiom One Social shell loads only the reviewed local workflow module', () => {
  assert.match(app, /from '\/social-workflows\.mjs'/);
  for (const builder of [
    'buildSocialActorCreateRequest',
    'buildSocialPersonaCreateRequest',
    'buildSocialPublicationCreateRequest',
    'buildSocialPublicationSupersedeRequest',
    'buildSocialPublicationRetractRequest'
  ]) {
    assert.match(app, new RegExp(`\\b${builder}\\b`));
    assert.match(social, new RegExp(`\\b${builder}\\b`));
  }
  assert.doesNotMatch(social, /\bfetch\s*\(/);
  assert.doesNotMatch(social, /social\.(remote|follow|federat|relay)/i);
  assert.doesNotMatch(social, /localStorage|sessionStorage|indexedDB|document\.cookie|innerHTML/);
});

test('Axiom One Social mutations reuse reviewed intent submission and safe recovery', () => {
  assert.match(social, /human\.requestPreview\(pending\.body\)/);
  assert.match(social, /state\.client\.call\('intents\.submit'/);
  assert.match(social, /idempotencyKey:\s*`axiom-one:social:\$\{crypto\.randomUUID\(\)\}`/);
  assert.match(social, /Retry same request safely/);
  assert.match(social, /nothing has been sent/i);
  assert.match(social, /No federation|no federation/i);
  assert.doesNotMatch(social, /This tranche is read-only in AXIOM One/);
});

test('Axiom One Social exposes the bounded local lifecycle without widening product scope', () => {
  assert.match(social, /Create local Social actor/);
  assert.match(social, /Create pseudonymous persona/);
  assert.match(social, /Review local publication/);
  assert.match(social, /Review edit/);
  assert.match(social, /Review retraction/);
  assert.match(social, /maxlength:\s*'65536'/);
  assert.match(social, /text\/plain|plain-text/i);
  assert.match(social, /public/i);
  assert.match(social, /listed/i);
  assert.match(social, /human-authored/i);
});

test('Axiom One serves and offline-caches the Social workflow module as shell code', () => {
  assert.match(
    server,
    /\['\/social-workflows\.mjs',\s*asset\('social-workflows\.mjs', 'text\/javascript; charset=utf-8'\)\]/
  );
  assert.match(serviceWorker, /'\/social-workflows\.mjs'/);
  assert.match(serviceWorker, /axiom-one-shell-v5/);
});
