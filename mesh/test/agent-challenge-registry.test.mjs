import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  AGENT_CHALLENGE_REGISTRY_MAX_BYTES,
  validateAgentChallengeRegistry
} from '../src/lib/agent-challenge-registry.mjs';

const REGISTRY_URL = new URL('../../agent-commons/challenges.json', import.meta.url);
const MANIFEST_URL = new URL('../../agent-commons/manifest.json', import.meta.url);

async function committedRegistry() {
  return JSON.parse(await readFile(REGISTRY_URL, 'utf8'));
}

async function committedManifest() {
  return JSON.parse(await readFile(MANIFEST_URL, 'utf8'));
}

test('Agent Commons discovery manifest stays canonical and non-authoritative', async () => {
  const manifest = await committedManifest();
  assert.deepEqual(Object.keys(manifest).sort(), [
    'agent_entrypoint',
    'authority_granted',
    'canonical_repository_url',
    'challenge_contract',
    'challenge_registry',
    'contribution_contract',
    'feedback_contract',
    'human_entrypoint',
    'public_discovery_only',
    'repository',
    'schema',
    'security_policy'
  ]);
  assert.equal(manifest.schema, 'axiom-agent-commons-discovery.v1');
  assert.equal(manifest.repository, 'Zoverions/AXIOM-MESH');
  assert.equal(manifest.canonical_repository_url, 'https://github.com/Zoverions/AXIOM-MESH');
  assert.equal(manifest.challenge_registry, 'agent-commons/challenges.json');
  assert.equal(manifest.security_policy, 'SECURITY.md');
  assert.equal(manifest.public_discovery_only, true);
  assert.equal(manifest.authority_granted, false);
});

test('Agent Commons challenge registry validates the committed discovery surface', async () => {
  const registry = await committedRegistry();
  const result = validateAgentChallengeRegistry(registry);

  assert.equal(result.valid, true);
  assert.equal(result.repository, 'Zoverions/AXIOM-MESH');
  assert.equal(result.base_sha, 'b698344d546ff4c7f051c0a089b500559bbe4b43');
  assert.equal(result.challenges, 1);
  assert.equal(result.counts.open, 1);
  assert.equal(result.authority_granted, false);
  assert.equal(result.payment_promised, false);
});

test('Agent Commons challenge registry rejects a stale open-challenge base fixture', async () => {
  const registry = structuredClone(await committedRegistry());
  registry.challenges[0].challenge.base_sha = '1'.repeat(40);

  assert.throws(
    () => validateAgentChallengeRegistry(registry),
    /stale base SHA/
  );
});

test('Agent Commons challenge registry rejects an oversized-input fixture', async () => {
  const registry = structuredClone(await committedRegistry());
  registry.challenges[0].challenge.problem = 'x'.repeat(AGENT_CHALLENGE_REGISTRY_MAX_BYTES + 1);

  assert.throws(
    () => validateAgentChallengeRegistry(registry),
    /exceeds the maximum encoded size/
  );
});

test('Agent Commons challenge registry rejects a path-escape fixture', async () => {
  const registry = structuredClone(await committedRegistry());
  registry.challenges[0].challenge.scope.allowed_paths[0] = '../SECURITY.md';

  assert.throws(
    () => validateAgentChallengeRegistry(registry),
    /allowed path.*(?:invalid|escapes)/
  );
});

test('Agent Commons challenge registry rejects a forged publisher identity fixture', async () => {
  const registry = structuredClone(await committedRegistry());
  registry.publisher.id = 'untrusted-agent';

  assert.throws(
    () => validateAgentChallengeRegistry(registry),
    /publisher identity is invalid/
  );
});

test('Agent Commons challenge registry rejects a fabricated-evidence claim fixture', async () => {
  const registry = structuredClone(await committedRegistry());
  registry.challenges[0].challenge.evidence_verified = true;

  assert.throws(
    () => validateAgentChallengeRegistry(registry),
    /unsupported field: evidence_verified/
  );
});

test('Agent Commons challenge registry rejects authority or payment elevation', async () => {
  const authority = structuredClone(await committedRegistry());
  authority.authority_granted = true;
  assert.throws(
    () => validateAgentChallengeRegistry(authority),
    /authority boundary is invalid/
  );

  const payment = structuredClone(await committedRegistry());
  payment.payment_promised = true;
  assert.throws(
    () => validateAgentChallengeRegistry(payment),
    /authority boundary is invalid/
  );
});
