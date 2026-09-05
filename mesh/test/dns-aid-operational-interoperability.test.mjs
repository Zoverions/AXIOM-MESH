import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const fixtureUrl = new URL('../../agent-commons/dns-aid-operational-interoperability-fixtures.v1.json', import.meta.url);
const profileUrl = new URL('../../agent-commons/dns-aid-operational-interoperability-profile.v1.json', import.meta.url);

async function loadJson(url) {
  return JSON.parse(await readFile(url, 'utf8'));
}

test('DNS-AID operational interoperability remains non-authorizing and reports independent evidence states', async () => {
  const fixtures = await loadJson(fixtureUrl);
  const profile = await loadJson(profileUrl);

  assert.equal(fixtures.schema, 'axiom-dns-aid-operational-interoperability-fixtures.v1');
  assert.equal(fixtures.target, 'RT-AUTH-001');
  assert.equal(fixtures.portable, true);
  assert.equal(fixtures.production_conformance_claimed, false);
  assert.equal(fixtures.authority_granted, false);

  assert.equal(profile.schema, 'axiom-dns-aid-operational-interoperability-profile.v1');
  assert.equal(profile.status, 'experimental interoperability profile; no production promotion claimed');
  assert.match(profile.core_invariant, /publishable.*DNSSEC-valid.*TLSA-valid.*endpoint-resolved.*authorization-allowed/i);
  assert.deepEqual(profile.result_dimensions, [
    'publishable',
    'dnssec_valid',
    'tlsa_valid',
    'endpoint_resolved',
    'authorization_allowed'
  ]);

  for (const entry of fixtures.cases) {
    assert.equal(entry.expect.authorization_allowed, false, entry.id);
    assert.equal(entry.expect.authority, 'none', entry.id);
    for (const dimension of profile.result_dimensions) {
      assert.ok(dimension in entry.expect, `${entry.id}: missing ${dimension}`);
    }
  }
});

test('fixture set covers certificate renewal, SPKI continuity, overlap rotation, provider SVCB constraints, ALPN ambiguity and verifier parity', async () => {
  const fixtures = await loadJson(fixtureUrl);
  const ids = new Set(fixtures.cases.map(({ id }) => id));

  for (const required of [
    'tlsa-301-certificate-renewal-stale',
    'tlsa-311-same-key-certificate-renewal-valid',
    'tlsa-overlap-key-rotation',
    'svcparam-private-key-provider-rejection',
    'svcparam-stripped-after-publication',
    'alpn-multi-token-interpretation-divergence',
    'go-rust-selector-verifier-parity',
    'valid-discovery-without-local-grant'
  ]) assert.ok(ids.has(required), required);
});

test('full-certificate renewal can leave resolution intact while DANE validity fails and authorization remains absent', async () => {
  const fixtures = await loadJson(fixtureUrl);
  const cert = fixtures.cases.find(({ id }) => id === 'tlsa-301-certificate-renewal-stale');
  const spki = fixtures.cases.find(({ id }) => id === 'tlsa-311-same-key-certificate-renewal-valid');

  assert.ok(cert);
  assert.ok(spki);
  assert.equal(cert.expect.tlsa_valid, false);
  assert.equal(cert.expect.endpoint_resolved, true);
  assert.equal(spki.expect.tlsa_valid, true);
  assert.equal(spki.expect.endpoint_resolved, true);
  assert.equal(cert.expect.authorization_allowed, false);
  assert.equal(spki.expect.authorization_allowed, false);
});

test('provider publication compatibility and verifier parity are explicit rather than inferred from standards validity', async () => {
  const fixtures = await loadJson(fixtureUrl);
  const provider = fixtures.cases.find(({ id }) => id === 'svcparam-private-key-provider-rejection');
  const stripped = fixtures.cases.find(({ id }) => id === 'svcparam-stripped-after-publication');
  const parity = fixtures.cases.find(({ id }) => id === 'go-rust-selector-verifier-parity');

  assert.ok(provider);
  assert.ok(stripped);
  assert.ok(parity);
  assert.equal(provider.expect.publishable, false);
  assert.equal(provider.expect.dnssec_valid, null);
  assert.equal(stripped.expect.publishable, true);
  assert.equal(stripped.expect.endpoint_resolved, false);
  assert.equal(parity.expect.cross_implementation_result, 'same');
  assert.equal(parity.expect.authorization_allowed, false);
});
