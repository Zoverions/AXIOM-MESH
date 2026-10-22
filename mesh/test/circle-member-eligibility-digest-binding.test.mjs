import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';

const policyUrl = new URL('../config/circle-member-eligibility-lifecycle.v0.json', import.meta.url);
const sourceUrl = new URL('../../packages/axiom-circle-member-eligibility/index.mjs', import.meta.url);

test('eligibility contract binds exact lifecycle, ledger, credential, charter, and use-time state', async () => {
  const [policy, source] = await Promise.all([
    readFile(policyUrl, 'utf8').then(JSON.parse),
    readFile(sourceUrl, 'utf8')
  ]);

  assert.equal(policy.output.policy_digest_required, true);
  assert.equal(policy.output.historical_ledger_digest_required, true);
  assert.equal(policy.output.membership_lifecycle_digest_required, true);
  assert.equal(policy.output.credential_lifecycle_digest_required_for_credential_use, true);

  for (const required of [
    'policy_digest: digestObject(policy)',
    'historical_ledger_digest:',
    'membership_lifecycle_digest:',
    'credential_lifecycle_digest:',
    'governing_charter_digest:',
    'as_of: asOfIso',
    'credential_possession_verified: false'
  ]) assert.ok(source.includes(required), `missing exact eligibility binding: ${required}`);
});

test('policy digest changes when a promotion-critical requirement is changed', async () => {
  const policy = JSON.parse(await readFile(policyUrl, 'utf8'));
  const original = digestObject(policy);
  const weakened = structuredClone(policy);
  weakened.requirements.membership_resume_supported = true;
  assert.notEqual(digestObject(weakened), original);
});
