import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { AGENT_TRUST_PROMOTION_LEDGER_SCHEMA } from '../src/lib/agent-trust-promotion-ledger.mjs';

const schemaUrl = new URL(
  '../../agent-commons/contracts/agent-trust-promotion-ledger.v1.schema.json',
  import.meta.url
);

test('A11a promotion-ledger JSON Schema stays synchronized with runtime promotion gates', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));
  assert.equal(schema.properties.schema.const, AGENT_TRUST_PROMOTION_LEDGER_SCHEMA);
  assert.equal(schema.properties.protocol.const, 'agent-trust-protocol-v1');
  assert.equal(schema.properties.authoritative_registry_path.const, 'mesh/config/capabilities.json');
  assert.equal(schema.properties.authoritative_registry_mutated_by_laboratory.const, false);
  assert.equal(schema.properties.documentation_alone_satisfies_promotion.const, false);
  assert.equal(schema.properties.protected_ci_required.const, true);
  assert.equal(schema.properties.independent_review_required.const, true);
  assert.equal(schema.properties.exact_registry_evidence_binding_required.const, true);
  assert.equal(schema.properties.post_registry_change_ci_required.const, true);
  assert.equal(schema.properties.entries.minItems, 10);
  assert.equal(schema.properties.entries.maxItems, 10);

  const ready = schema.$defs.entryBase.allOf[0].then.properties;
  assert.equal(ready.composition_state.const, 'in-candidate-tree');
  assert.equal(ready.laboratory_state.const, 'green');
  assert.equal(ready.readiness_recorded.const, true);
  assert.equal(ready.independent_review_complete.const, true);
  assert.equal(ready.authoritative_registry_present.const, true);
  assert.equal(ready.exact_registry_evidence_binding_complete.const, true);
  assert.equal(ready.production_claims_allowed.const, true);
  assert.equal(ready.blockers.maxItems, 0);

  const notReady = schema.$defs.entryBase.allOf[0].else.properties;
  assert.equal(notReady.production_claims_allowed.const, false);
  assert.equal(notReady.blockers.minItems, 1);
});
