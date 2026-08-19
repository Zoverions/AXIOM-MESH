import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '../..');

async function text(path) {
  return readFile(resolve(repositoryRoot, path), 'utf8');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('security agent cell preserves canonical triage and non-authority boundaries', async () => {
  const [manifestRaw, guide, triage, discoveryRaw, llms] = await Promise.all([
    text('agent-readiness/security-cell.json'),
    text('agent-readiness/SECURITY-CELL.txt'),
    text('RED-TEAM-TRIAGE.txt'),
    text('agent-discovery.json'),
    text('llms.txt')
  ]);

  const manifest = JSON.parse(manifestRaw);
  const discovery = JSON.parse(discoveryRaw);

  assert.equal(manifest.schema, 'axiom-security-agent-cell.v1');
  assert.equal(manifest.supported_build, '0.12.0-dev.3');
  assert.equal(manifest.status, 'repository_native_pilot_available');
  assert.equal(manifest.canonical_finding_lifecycle, 'RED-TEAM-TRIAGE.txt');
  assert.equal(manifest.private_security_route, 'SECURITY.md');
  assert.equal(manifest.pilot_issue, 'https://github.com/Zoverions/AXIOM-MESH/issues/1199');
  assert.equal(manifest.pilot_activation_requires_security_cell_merge, true);

  assert.deepEqual(
    manifest.roles.map((role) => role.id),
    ['scout', 'reproducer', 'verifier', 'patcher', 'triage_recorder']
  );

  assert.equal(manifest.independence_rules.scout_report_is_not_reproduction, true);
  assert.equal(manifest.independence_rules.reproduction_requires_fresh_evidence, true);
  assert.equal(manifest.independence_rules.verifier_must_check_underlying_evidence, true);
  assert.equal(
    manifest.independence_rules.same_principal_multiple_roles_do_not_count_as_independent_reproduction,
    true
  );
  assert.equal(manifest.independence_rules.model_vendor_or_popularity_is_not_assurance, true);
  assert.equal(manifest.independence_rules.contradictory_results_must_be_preserved, true);

  for (const state of manifest.disposition_states_referenced) {
    assert.match(triage, new RegExp(`^${escapeRegExp(state)}\\b`, 'm'));
  }

  const separateAuthority = manifest.separate_authority_required.join('\n');
  assert.match(separateAuthority, /merge/);
  assert.match(separateAuthority, /deployment_or_publication/);
  assert.match(separateAuthority, /credential_or_secret_access/);
  assert.match(separateAuthority, /production_promotion/);
  assert.match(separateAuthority, /third_party_security_testing/);

  assert.equal(discovery.community.security_cell_manifest, 'agent-readiness/security-cell.json');
  assert.equal(discovery.community.security_cell_guide, 'agent-readiness/SECURITY-CELL.txt');
  assert.equal(
    discovery.community.security_cell_pilot,
    'https://github.com/Zoverions/AXIOM-MESH/issues/1199'
  );

  assert.match(llms, /agent-readiness\/security-cell\.json/);
  assert.match(llms, /agent-readiness\/SECURITY-CELL\.txt/);
  assert.match(llms, /issues\/1199/);

  assert.match(guide, /Security participation is evidence, not authority/i);
  assert.match(guide, /A scout alone does not establish reproduction/i);
  assert.match(guide, /Contradictory results remain in the record/i);
  assert.match(guide, /do not need AXIOM runtime identity/i);
  assert.match(guide, /Do not test third-party systems without separate explicit authorization/i);
  assert.match(guide, /Use RED-TEAM-TRIAGE\.txt/);
  assert.match(guide, /issues\/1199/);
  assert.match(guide, /RT-AUTH-001/);
  assert.match(guide, /may not begin the cell workflow before this Security Agent Cell contract is merged/i);
});
