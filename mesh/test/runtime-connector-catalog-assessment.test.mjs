import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import { assessCatalogCandidate } from '../src/lib/runtime-connector-catalog-assessment.mjs';

const FIXTURES = new URL('./fixtures/runtime-connector-fabric/', import.meta.url);
const NOW = '2026-09-24T12:00:00.000Z';

function fixture(name = 'catalog-minimal.json') {
  return JSON.parse(readFileSync(new URL(name, FIXTURES), 'utf8'));
}

test('a valid catalogue entry with no assurance stays inert and unverified', () => {
  const candidate = fixture();
  const first = assessCatalogCandidate({ candidate, asOf: NOW });
  const second = assessCatalogCandidate({ candidate, asOf: NOW });
  assert.deepEqual(first, second);
  assert.equal(first.schema, 'axiom-catalog-candidate-assessment.v0');
  assert.equal(first.entry_id, candidate.entry_id);
  assert.match(first.entry_digest, /^[a-f0-9]{64}$/);
  assert.equal(first.disposition, 'quarantined_inert');
  assert.equal(first.assurance_status, 'unverified');
  assert.deepEqual(first.reason_codes, [
    'artifact_digest_missing',
    'artifact_unverified',
    'assurance_missing',
    'needs_review',
    'sbom_digest_missing',
    'sbom_unverified',
    'signature_unverified'
  ]);
  assert.equal(first.authority_effect, 'none');
  assert.equal(first.runtime_activation, false);
  assert.equal(first.capability_promoted, false);
  assert.equal(Object.hasOwn(first, 'approved'), false);
});

test('a structurally valid stale observation is reported, without fabricating verification', () => {
  const candidate = fixture('catalog-maximal.json');
  const result = assessCatalogCandidate({ candidate, asOf: NOW });
  assert.equal(result.assurance_status, 'unverified');
  assert.ok(result.reason_codes.includes('assurance_stale'));
  assert.ok(result.reason_codes.includes('assurance_nonpassing'));
  assert.ok(result.reason_codes.includes('artifact_unverified'));
  assert.ok(result.reason_codes.includes('sbom_unverified'));
  assert.ok(result.reason_codes.includes('needs_review'));
  assert.equal(result.disposition, 'quarantined_inert');
});

test('declared digests and a fresh passing observation still do not verify external facts', () => {
  const candidate = fixture('catalog-maximal.json');
  candidate.assurance.evidence_fresh_until = '2026-10-24T12:00:00Z';
  candidate.assurance.observations[0].fresh_until = '2026-10-24T12:00:00Z';
  candidate.assurance.observations[0].result = 'pass';
  const result = assessCatalogCandidate({ candidate, asOf: NOW });
  assert.equal(result.assurance_status, 'unverified');
  assert.ok(result.reason_codes.includes('artifact_unverified'));
  assert.ok(result.reason_codes.includes('sbom_unverified'));
  assert.ok(result.reason_codes.includes('signature_unverified'));
  assert.equal(result.reason_codes.includes('assurance_stale'), false);
  assert.equal(result.reason_codes.includes('assurance_nonpassing'), false);
});

test('the same immutable entry ID and version cannot silently change canonical content', () => {
  const previousEntry = fixture();
  const candidate = structuredClone(previousEntry);
  candidate.requested_access.actions.push('memory.create');
  assert.throws(
    () => assessCatalogCandidate({ candidate, previousEntry, expectedPriorDigest: digestObject(previousEntry), asOf: NOW }),
    /same entry ID and version|immutable/i
  );
  const replay = assessCatalogCandidate({ candidate: previousEntry, previousEntry, expectedPriorDigest: digestObject(previousEntry), asOf: NOW });
  assert.equal(replay.prior_entry_digest, replay.entry_digest);
  assert.deepEqual(replay.permission_diff.actions.added, []);
});

test('a new version exposes permission changes separately from provenance and orchestration', () => {
  const previousEntry = fixture();
  const candidate = structuredClone(previousEntry);
  candidate.entry_version = '0.2.0';
  candidate.requested_access.actions = ['memory.create'];
  candidate.requested_access.credential_classes = ['opaque-provider-handle'];
  candidate.requested_access.network_required = true;
  candidate.requested_access.network_destinations = ['https://example.invalid'];
  candidate.requested_access.resource_bounds = { max_concurrency: 2 };
  candidate.provenance.source_commit = '2'.repeat(40);
  candidate.provenance.sbom_sha256 = 'b'.repeat(64);
  candidate.compatibility.adapter_contracts = [{
    contract_id: 'axiom.agent-runtime-adapter',
    contract_version: '1.0.0',
    contract_sha256: 'a'.repeat(64)
  }];
  candidate.orchestration.may_spawn_workers = true;
  const result = assessCatalogCandidate({ candidate, previousEntry, expectedPriorDigest: digestObject(previousEntry), asOf: NOW });
  assert.deepEqual(result.permission_diff.actions.added, ['memory.create']);
  assert.deepEqual(result.permission_diff.credential_classes.added, ['opaque-provider-handle']);
  assert.deepEqual(result.permission_diff.network_destinations.added, ['https://example.invalid']);
  assert.deepEqual(result.permission_diff.network_required, { from: false, to: true });
  assert.deepEqual(result.permission_diff.resource_bounds, { from: null, to: { max_concurrency: 2 } });
  assert.deepEqual(result.review_changes, [
    'compatibility.adapter_contracts',
    'entry_version',
    'orchestration.may_spawn_workers',
    'provenance.sbom_sha256',
    'provenance.source_commit'
  ]);
  assert.equal(result.disposition, 'quarantined_inert');
  assert.ok(result.reason_codes.includes('needs_review'));
  assert.equal(Object.isFrozen(result.permission_diff), true);
  assert.equal(Object.isFrozen(result.permission_diff.actions.added), true);
  assert.equal(Object.isFrozen(result.permission_diff.resource_bounds.to), true);
  assert.throws(() => result.permission_diff.actions.added.push('system.echo'), TypeError);
  assert.throws(() => { result.permission_diff.resource_bounds.to.max_concurrency = 99; }, TypeError);
});

test('removed permissions and reduced network reachability remain visible', () => {
  const previousEntry = fixture('catalog-maximal.json');
  const candidate = structuredClone(previousEntry);
  candidate.entry_version = '0.2.0';
  candidate.requested_access.actions = ['system.echo'];
  candidate.requested_access.credential_classes = [];
  candidate.requested_access.network_required = false;
  candidate.requested_access.network_destinations = [];
  const result = assessCatalogCandidate({ candidate, previousEntry, expectedPriorDigest: digestObject(previousEntry), asOf: NOW });
  assert.deepEqual(result.permission_diff.actions.removed, ['memory.create']);
  assert.deepEqual(result.permission_diff.credential_classes.removed, ['opaque-provider-handle']);
  assert.deepEqual(result.permission_diff.network_destinations.removed, ['https://example.invalid']);
  assert.deepEqual(result.permission_diff.network_required, { from: true, to: false });
  assert.equal(result.disposition, 'quarantined_inert');
});

test('review surface names lifecycle and non-claim changes even without access widening', () => {
  const previousEntry = fixture();
  const candidate = structuredClone(previousEntry);
  candidate.entry_version = '0.2.0';
  candidate.subject.display_name = 'A newly named synthetic runtime';
  candidate.assurance.cataloged_at = '2026-08-21T23:30:00Z';
  candidate.lifecycle.rollback_available = false;
  candidate.non_claims = ['A narrower but still unverified claim.'];
  const result = assessCatalogCandidate({ candidate, previousEntry, expectedPriorDigest: digestObject(previousEntry), asOf: NOW });
  assert.deepEqual(result.review_changes, [
    'assurance.cataloged_at', 'entry_version', 'lifecycle.rollback_available',
    'non_claims', 'subject.display_name'
  ]);
  assert.equal(result.disposition, 'quarantined_inert');
});

test('malformed, impossible, and cross-subject comparisons fail closed', () => {
  const candidate = fixture();
  assert.throws(() => assessCatalogCandidate({ candidate, asOf: 'not-a-time' }), /asOf/);
  assert.throws(() => assessCatalogCandidate({ candidate, asOf: NOW, activate: true }), /unsupported/);
  assert.throws(() => assessCatalogCandidate({ candidate, expectedPriorDigest: '0'.repeat(64), asOf: NOW }), /prior/i);
  assert.throws(() => assessCatalogCandidate({ candidate, previousEntry: fixture(), asOf: NOW }), /expectedPriorDigest/);
  assert.throws(() => assessCatalogCandidate({ candidate, previousEntry: fixture(), expectedPriorDigest: '0'.repeat(64), asOf: NOW }), /prior digest/i);
  const unknown = structuredClone(candidate);
  unknown.trusted = true;
  assert.throws(() => assessCatalogCandidate({ candidate: unknown, asOf: NOW }), /unsupported|unknown/i);
  const active = structuredClone(candidate);
  active.requested_access.install_grants_authority = true;
  assert.throws(() => assessCatalogCandidate({ candidate: active, asOf: NOW }), /install authority/);
  const other = structuredClone(candidate);
  other.subject.subject_id = 'runtime:other';
  assert.throws(() => assessCatalogCandidate({ candidate, previousEntry: other, expectedPriorDigest: digestObject(other), asOf: NOW }), /subject/);
});
