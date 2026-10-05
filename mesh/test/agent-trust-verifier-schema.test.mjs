import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { AGENT_TRUST_VERIFICATION_REPORT_SCHEMA } from '../src/lib/agent-trust-verifier.mjs';

const schemaUrl = new URL(
  '../../agent-commons/contracts/agent-trust-verification-report.v2.schema.json',
  import.meta.url
);

test('A10b report JSON Schema stays synchronized with runtime profile and nonclaims', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));
  assert.equal(schema.properties.schema.const, AGENT_TRUST_VERIFICATION_REPORT_SCHEMA);
  assert.equal(
    schema.properties.verification_profile.const,
    'a1-a2-a3a-a4a-a5a-a6a-live-reverification'
  );
  assert.equal(schema.properties.report_authentication.const, 'none');
  assert.equal(schema.properties.portable_assurance.const, false);

  const claims = schema.properties.claims.properties;
  for (const field of [
    'authority_granted',
    'execution_authorized',
    'delegation_authority_verified',
    'global_currentness_verified',
    'effect_boundary_currentness_verified',
    'task_success_verified',
    'effect_execution_verified',
    'effect_specific_receipt_verified',
    'artifact_availability_verified',
    'memory_provenance_verified',
    'legal_identity_verified',
    'truth_verified',
    'network_effect',
    'filesystem_effect'
  ]) assert.equal(claims[field].const, false, `${field} must remain false in schema`);
  assert.equal(claims.authority_effect.const, 'none');
  assert.equal(claims.delegation_effect.const, 'none');

  const currentness = schema.properties.retained_currentness.properties;
  assert.equal(
    currentness.context.const,
    'grid-intent-start-not-proven-first-effect-boundary'
  );
  assert.equal(currentness.relationship_between_principals_verified.const, false);
  assert.equal(currentness.global_currentness_verified.const, false);
  assert.equal(currentness.effect_boundary_currentness_verified.const, false);

  const receipt = schema.properties.portable_work_receipt.properties;
  assert.equal(receipt.effect_specific_receipt_bound.const, false);
  assert.equal(receipt.task_success_claimed.const, false);
});
