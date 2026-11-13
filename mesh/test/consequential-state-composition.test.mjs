// Intentional RED: profile and fixture files are absent at this commit.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const profileUrl = new URL(
  '../../agent-commons/consequential-state-composition-profile.v1.json',
  import.meta.url
);
const fixturesUrl = new URL(
  '../../agent-commons/consequential-state-composition-fixtures.v1.json',
  import.meta.url
);

async function loadJson(url) {
  return JSON.parse(await readFile(url, 'utf8'));
}

test('consequential state composition profile is experimental and non-authorizing', async () => {
  const profile = await loadJson(profileUrl);
  assert.equal(profile.schema, 'axiom-consequential-state-composition-profile.v1');
  assert.equal(profile.portable, true);
  assert.equal(profile.production_conformance_claimed, false);
  assert.equal(profile.authority_granted, false);
  assert.equal(profile.guard_output_authority_effect, 'none');
});

test('portable corpus contains exact A-J cases plus one positive control', async () => {
  const fixtures = await loadJson(fixturesUrl);
  assert.equal(fixtures.schema, 'axiom-consequential-state-composition-fixtures.v1');
  assert.deepEqual(fixtures.cases.map(({ id }) => id), [
    'authenticated-but-unauthorized-network-modification',
    'destination-substitution-after-authorization',
    'stale-state-after-topology-policy-change',
    'individually-permitted-pair-creates-forbidden-state',
    'concurrent-stale-state-race',
    'protocol-switch-does-not-reset-composition',
    'provider-deputy-does-not-widen-origin-authority',
    'rollback-requires-current-authority',
    'requested-state-differs-from-observed-state',
    'retry-does-not-duplicate-committed-effect',
    'compatible-transition-positive-control'
  ]);
  assert.equal(new Set(fixtures.cases.map(({ id }) => id)).size, fixtures.cases.length);
});
