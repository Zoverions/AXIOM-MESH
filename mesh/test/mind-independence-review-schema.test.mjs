import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl = new URL('../config/mind-independence-review-v0.schema.json', import.meta.url);

test('Mind Independence Review v0 remains evidence-only and model-non-authorizing', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));

  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.schema.const, 'axiom-mind-independence-review.v0');
  assert.equal(schema.properties.developmental_stage.const, 'candidate-independent');
  assert.equal(
    schema.properties.developmental_state_evidence_digest.pattern,
    '^[a-f0-9]{64}$'
  );
  assert.equal(
    schema.properties.continuity_evidence_digest.pattern,
    '^[a-f0-9]{64}$'
  );
  assert.equal(schema.properties.criteria_profile.const, 'axiom-independence-criteria.v0');

  const policy = schema.$defs.policy.properties;
  assert.equal(policy.sponsor_veto.const, false);
  assert.equal(policy.independent_opposition_blocks.const, true);
  assert.equal(policy.candidate_self_decision.const, false);
  assert.equal(policy.model_final_authority.const, false);
  assert.equal(policy.appeal_required.const, true);

  assert.equal(schema.properties.status_effect.const, 'none');
  assert.equal(schema.properties.governance_effect.const, 'none');
  assert.equal(schema.properties.genesis_eligibility_effect.const, 'none');
  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.network_effect.const, 'none');
  assert.equal(schema.properties.runtime_activation.const, false);

  assert.equal(
    schema['x-axiom-semantic-validator'],
    'mesh/src/lib/mind-independence-review.mjs'
  );
});
