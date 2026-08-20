import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  AGENT_CHALLENGE_REGISTRY_MAX_BYTES,
  validateAgentChallengeRegistry
} from '../src/lib/agent-challenge-registry.mjs';

const REGISTRY_URL = new URL('../../agent-commons/challenges.json', import.meta.url);

async function committedRegistry() {
  return JSON.parse(await readFile(REGISTRY_URL, 'utf8'));
}

test('Agent Commons challenge registry validates the committed public-discovery surface', async () => {
  const result = validateAgentChallengeRegistry(await committedRegistry());

  assert.equal(result.valid, true);
  assert.equal(result.schema, 'axiom-agent-challenge-registry.v1');
  assert.equal(result.project, 'AXIOM-MESH');
  assert.equal(result.supported_build, '0.12.0-dev.3');
  assert.equal(result.repository, 'Zoverions/AXIOM-MESH');
  assert.equal(result.base_ref, 'main');
  assert.equal(result.base_sha, '5b6d1d4dd39881924ea7c3e8f21582da0acee399');
  assert.equal(result.challenges, 1);
  assert.equal(result.counts.open, 1);
  assert.equal(result.public_discovery_only, true);
  assert.equal(result.authority_granted, false);
  assert.equal(result.payment_promised, false);
  assert.equal(result.evidence_certified, false);
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

test('Agent Commons challenge registry rejects a fabricated-evidence field fixture', async () => {
  const registry = structuredClone(await committedRegistry());
  registry.challenges[0].challenge.evidence_verified = true;

  assert.throws(
    () => validateAgentChallengeRegistry(registry),
    /unsupported field: evidence_verified/
  );
});

test('Agent Commons challenge registry rejects authority, payment, evidence, or compensation elevation', async () => {
  const authority = structuredClone(await committedRegistry());
  authority.authority_granted = true;
  assert.throws(
    () => validateAgentChallengeRegistry(authority),
    /authority\/evidence boundary is invalid/
  );

  const payment = structuredClone(await committedRegistry());
  payment.payment_promised = true;
  assert.throws(
    () => validateAgentChallengeRegistry(payment),
    /authority\/evidence boundary is invalid/
  );

  const certification = structuredClone(await committedRegistry());
  certification.evidence_certified = true;
  assert.throws(
    () => validateAgentChallengeRegistry(certification),
    /authority\/evidence boundary is invalid/
  );

  const compensation = structuredClone(await committedRegistry());
  compensation.challenges[0].challenge.authority_nonclaims.compensation_committed = true;
  assert.throws(
    () => validateAgentChallengeRegistry(compensation),
    /cannot grant or imply authority: compensation_committed/
  );
});

test('Agent Commons challenge registry rejects third-party environment widening', async () => {
  const registry = structuredClone(await committedRegistry());
  registry.challenges[0].challenge.scope.environment_boundary = ['third-party-unapproved'];

  assert.throws(
    () => validateAgentChallengeRegistry(registry),
    /environment boundary is invalid/
  );
});

test('Agent Commons challenge registry rejects open challenges already expired at generation time', async () => {
  const registry = structuredClone(await committedRegistry());
  registry.challenges[0].challenge.issued_at = '2026-08-20T20:07:00Z';
  registry.challenges[0].challenge.expires_at = '2026-08-20T20:07:59Z';

  assert.throws(
    () => validateAgentChallengeRegistry(registry),
    /already expired/
  );
});

test('Agent Commons challenge registry rejects duplicate challenge identifiers', async () => {
  const registry = structuredClone(await committedRegistry());
  registry.challenges.push(structuredClone(registry.challenges[0]));

  assert.throws(
    () => validateAgentChallengeRegistry(registry),
    /Duplicate Agent Commons challenge/
  );
});
