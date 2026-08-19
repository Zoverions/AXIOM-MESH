import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const repositoryRoot = resolve(import.meta.dirname, '../..');
const laneIds = [
  'review-falsification',
  'implementation-pr',
  'interoperability-adapter',
  'hardware-validation',
  'infrastructure-validation',
  'claim-audit',
  'benchmark-compatibility'
];
const falseAuthorityClaimKeys = [
  'security_certification_claimed',
  'production_promotion_claimed',
  'merge_authority_claimed',
  'deployment_authority_claimed',
  'runtime_authority_claimed',
  'protocol_activation_authority_claimed',
  'credential_access_authority_claimed',
  'spending_or_purchase_authority_claimed',
  'shipping_or_hardware_custody_authority_claimed'
];

async function text(path) {
  return readFile(resolve(repositoryRoot, path), 'utf8');
}

test('agent contribution result package is evidence-only, exact-context, and discoverable', async () => {
  const [schemaRaw, exampleRaw, lanesRaw, discoveryRaw, llms, issueForm, triage] = await Promise.all([
    text('agent-readiness/CONTRIBUTION-RESULT.schema.json'),
    text('agent-readiness/CONTRIBUTION-RESULT.example.json'),
    text('agent-readiness/contributions.json'),
    text('agent-discovery.json'),
    text('llms.txt'),
    text('.github/ISSUE_TEMPLATE/agent-contribution-proposal.yml'),
    text('agent-readiness/CONTRIBUTION-TRIAGE.txt')
  ]);

  const schema = JSON.parse(schemaRaw);
  const example = JSON.parse(exampleRaw);
  const lanes = JSON.parse(lanesRaw);
  const discovery = JSON.parse(discoveryRaw);

  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.type, 'object');
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.schema.const, 'axiom-agent-contribution-result.v1');
  assert.equal(schema.properties.project.const, 'AXIOM-MESH');
  assert.equal(schema.properties.supported_build.const, '0.12.0-dev.3');
  assert.deepEqual(schema.properties.contribution_lane.enum, laneIds);
  assert.equal(schema.properties.commit_sha.pattern, '^[0-9a-f]{40}$');
  assert.equal(schema.properties.requested_triage_state.const, 'EVIDENCE_SUBMITTED');

  for (const field of [
    'environment',
    'methodology',
    'evidence',
    'observations',
    'negative_results',
    'limitations',
    'safety',
    'authority_nonclaims'
  ]) {
    assert.ok(schema.required.includes(field), `result schema must require ${field}`);
  }

  assert.equal(schema.properties.environment.additionalProperties, false);
  assert.deepEqual(schema.properties.environment.properties.ownership.enum, [
    'repository-owned',
    'contributor-owned',
    'explicitly-disposable-authorized'
  ]);
  assert.equal(schema.properties.evidence.minItems, 1);
  assert.equal(schema.properties.evidence.items.additionalProperties, false);
  assert.equal(schema.properties.evidence.items.properties.sha256.pattern, '^[0-9a-f]{64}$');
  assert.equal(schema.properties.evidence.items.properties.contains_sensitive_data.const, false);
  assert.equal(schema.properties.limitations.minItems, 1);

  const safety = schema.properties.safety.properties;
  assert.equal(safety.environment_authorized.const, true);
  assert.equal(safety.contains_secrets_or_credentials.const, false);
  assert.equal(safety.contains_private_data.const, false);
  assert.equal(safety.third_party_testing_performed.const, false);

  const nonclaims = schema.properties.authority_nonclaims.properties;
  for (const key of falseAuthorityClaimKeys) {
    assert.equal(nonclaims[key].const, false, `${key} must remain false`);
  }
  assert.equal(nonclaims.evidence_scope_limited_to_tested_environment.const, true);

  const submittedGuard = schema.allOf.find(
    item => item?.if?.properties?.record_status?.const === 'submitted'
  );
  assert.ok(submittedGuard, 'submitted packages must have a dedicated guard');
  assert.equal(submittedGuard.then.properties.commit_sha.not.pattern, '^0{40}$');

  assert.equal(example.schema, 'axiom-agent-contribution-result.v1');
  assert.equal(example.record_status, 'example');
  assert.equal(example.commit_sha, '0'.repeat(40));
  assert.equal(example.requested_triage_state, 'EVIDENCE_SUBMITTED');
  assert.equal(example.safety.environment_authorized, true);
  assert.equal(example.safety.contains_secrets_or_credentials, false);
  assert.equal(example.safety.contains_private_data, false);
  assert.equal(example.safety.third_party_testing_performed, false);
  assert.ok(example.limitations.some(item => /format example only/i.test(item)));
  assert.ok(example.negative_results.some(item => /No real measurement/i.test(item)));
  assert.ok(example.evidence.every(item => item.contains_sensitive_data === false));
  for (const key of falseAuthorityClaimKeys) {
    assert.equal(example.authority_nonclaims[key], false, `example ${key} must remain false`);
  }
  assert.equal(example.authority_nonclaims.evidence_scope_limited_to_tested_environment, true);

  assert.deepEqual(lanes.lanes.map(lane => lane.id), laneIds);
  assert.equal(
    lanes.intake.result_package_schema,
    'agent-readiness/CONTRIBUTION-RESULT.schema.json'
  );
  assert.equal(
    lanes.intake.result_package_example,
    'agent-readiness/CONTRIBUTION-RESULT.example.json'
  );
  assert.equal(
    discovery.community.contribution_result_schema,
    'agent-readiness/CONTRIBUTION-RESULT.schema.json'
  );
  assert.equal(
    discovery.community.contribution_result_example,
    'agent-readiness/CONTRIBUTION-RESULT.example.json'
  );

  assert.match(llms, /CONTRIBUTION-RESULT\.schema\.json/);
  assert.match(llms, /CONTRIBUTION-RESULT\.example\.json/);
  assert.match(llms, /placeholder digests are not empirical evidence/i);

  assert.match(issueForm, /CONTRIBUTION-RESULT\.schema\.json/);
  assert.match(issueForm, /requests `EVIDENCE_SUBMITTED`/);
  assert.match(issueForm, /does not assign `EVIDENCE_ACCEPTED`/);
  assert.match(issueForm, /records evidence only and cannot assign acceptance or authority/i);

  assert.match(triage, /Contribution result packages/);
  assert.match(triage, /CONTRIBUTION-RESULT\.schema\.json/);
  assert.match(triage, /requests EVIDENCE_SUBMITTED only/i);
  assert.match(triage, /cannot self-assign EVIDENCE_ACCEPTED/i);
  assert.match(triage, /placeholder values are not empirical evidence/i);
});
