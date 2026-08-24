import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  validateAgentChallengeRegistry,
  validateAgentCommonsDiscovery,
  validateRepositoryPath
} from '../src/lib/agent-challenge-registry.mjs';
import { checkAgentChallengeRegistry } from '../src/check-agent-challenge-registry.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const MESH_ROOT = resolve(HERE, '..');
const REPO_ROOT = resolve(MESH_ROOT, '..');

async function committedJson(path) {
  return JSON.parse(await readFile(resolve(REPO_ROOT, path), 'utf8'));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test('committed Agent Commons registry and discovery manifest validate against current contracts', async () => {
  const result = await checkAgentChallengeRegistry();
  assert.equal(result.ok, true);
  assert.equal(result.registry_schema, 'axiom-agent-challenge-registry.v2');
  assert.equal(result.discovery_schema, 'axiom-agent-commons-discovery.v2');
  assert.equal(result.canonical_result_contract, 'agent-readiness/CONTRIBUTION-RESULT.schema.json');
  assert.equal(result.authority_effect, 'none');
  assert.equal(result.open_challenges, 1);
});

test('open challenges are exact-base bound and cannot silently drift', async () => {
  const registry = await committedJson('agent-commons/challenges.json');
  const stale = clone(registry);
  stale.challenges[0].challenge.base_sha = '0'.repeat(40);
  assert.throws(
    () => validateAgentChallengeRegistry(stale),
    /stale base SHA/
  );
});

test('challenge authority and third-party testing cannot be elevated', async () => {
  const registry = await committedJson('agent-commons/challenges.json');
  for (const field of [
    'runtime_authority_granted',
    'merge_authority_granted',
    'deployment_authority_granted',
    'credential_authority_granted',
    'spending_authority_granted',
    'hardware_custody_granted',
    'production_promotion_granted',
    'third_party_testing_authorized',
    'compensation_committed'
  ]) {
    const elevated = clone(registry);
    elevated.challenges[0].challenge.authority_nonclaims[field] = true;
    assert.throws(
      () => validateAgentChallengeRegistry(elevated),
      new RegExp(field)
    );
  }
});

test('registry refuses the obsolete generic contribution contract', async () => {
  const registry = await committedJson('agent-commons/challenges.json');
  const stale = clone(registry);
  stale.challenges[0].challenge.result_contract =
    'docs/architecture/contracts/agent-contribution.v1.schema.json';
  assert.throws(
    () => validateAgentChallengeRegistry(stale),
    /result contract is invalid/
  );

  const discovery = await committedJson('agent-commons/manifest.json');
  const staleDiscovery = clone(discovery);
  staleDiscovery.contribution_result_contract =
    'docs/architecture/contracts/agent-contribution.v1.schema.json';
  assert.throws(
    () => validateAgentCommonsDiscovery(staleDiscovery),
    /contribution_result_contract is invalid/
  );
});

test('challenge paths remain repository-relative and traversal-safe', () => {
  assert.equal(
    validateRepositoryPath('docs/architecture/AGENT-COMMONS.md'),
    'docs/architecture/AGENT-COMMONS.md'
  );
  for (const invalid of [
    '../outside',
    'docs/../SECURITY.md',
    '/absolute/path',
    'docs\\windows\\escape',
    'docs//double'
  ]) {
    assert.throws(() => validateRepositoryPath(invalid), /invalid|escapes/);
  }
});

test('legacy v1 registry/discovery fields cannot be mixed into v2', async () => {
  const registry = await committedJson('agent-commons/challenges.json');
  const mixed = clone(registry);
  mixed.authority_granted = false;
  assert.throws(
    () => validateAgentChallengeRegistry(mixed),
    /unsupported field: authority_granted/
  );

  const discovery = await committedJson('agent-commons/manifest.json');
  const mixedDiscovery = clone(discovery);
  mixedDiscovery.contribution_contract = 'docs/architecture/contracts/agent-contribution.v1.schema.json';
  assert.throws(
    () => validateAgentCommonsDiscovery(mixedDiscovery),
    /unsupported field: contribution_contract/
  );
});
