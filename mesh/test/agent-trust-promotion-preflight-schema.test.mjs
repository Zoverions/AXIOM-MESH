import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  AGENT_TRUST_PROMOTION_PREFLIGHT_SCHEMA,
  AGENT_TRUST_PROMOTION_REQUIRED_EXTERNAL_GATES
} from '../src/lib/agent-trust-promotion-preflight.mjs';

const schemaUrl = new URL(
  '../../agent-commons/contracts/agent-trust-promotion-preflight.v1.schema.json',
  import.meta.url
);

test('A11 promotion preflight JSON Schema stays synchronized with runtime non-authority boundary', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));
  assert.equal(schema.properties.schema.const, AGENT_TRUST_PROMOTION_PREFLIGHT_SCHEMA);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.artifact_paths.additionalProperties, false);
  assert.equal(schema.properties.blockers.minItems, AGENT_TRUST_PROMOTION_REQUIRED_EXTERNAL_GATES.length);

  const semantics = schema.properties.semantics.properties;
  assert.equal(semantics.evaluation_scope.const, 'local-structural-promotion-preflight-only');
  assert.equal(semantics.documentation_alone_satisfies_promotion.const, false);
  assert.equal(semantics.local_preflight_is_promotion.const, false);
  assert.equal(semantics.candidate_record_mutates_registry.const, false);
  assert.equal(semantics.protected_ci_required.const, true);
  assert.equal(semantics.independent_review_required.const, true);
  assert.equal(semantics.explicit_promotion_decision_required.const, true);
  assert.equal(semantics.exact_registry_evidence_binding_required.const, true);
  assert.equal(semantics.post_registry_change_ci_required.const, true);
  assert.equal(semantics.promotion_authorized.const, false);
  assert.equal(semantics.registry_mutation_authorized.const, false);
  assert.equal(semantics.production_claims_allowed.const, false);
  assert.equal(semantics.authority_effect.const, 'none');
  assert.equal(semantics.capability_promotion_effect.const, 'none');
});
