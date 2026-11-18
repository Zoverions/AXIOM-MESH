import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  SEMANTIC_OPERATION_PROPOSAL_SCHEMA,
  SEMANTIC_OPERATION_PROPOSAL_SCHEMA_ID,
  validateSemanticOperationProposalSchema
} from '../src/lib/semantic-operation-proposal.mjs';

const schemaUrl = new URL(
  '../../docs/architecture/contracts/semantic-operation-proposal.v0.schema.json',
  import.meta.url
);

test('Semantic Operation Proposal v0 schema mirrors closed-world invariants', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));
  assert.equal(validateSemanticOperationProposalSchema(schema), true);
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.$id, SEMANTIC_OPERATION_PROPOSAL_SCHEMA_ID);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.schema.const, SEMANTIC_OPERATION_PROPOSAL_SCHEMA);
  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.equal(schema.properties.assurance_effect.const, 'none');
  assert.equal(schema.properties.currentness_effect.const, 'none');
  assert.equal(schema.properties.execution_effect.const, 'none');
  assert.equal(schema.properties.runtime_activation.const, false);
  assert.equal(schema.properties.network_effect.const, 'none');
  assert.equal(schema.properties.selection_effect.const, 'proposal-only');
  assert.equal(schema.properties.provider.additionalProperties, false);
  assert.equal(schema.properties.proposed.items.additionalProperties, false);
  assert.equal(schema.properties.withheld.items.additionalProperties, false);
  assert.equal(schema.properties.suppressed.items.additionalProperties, false);
  assert.equal(schema.properties.usage_evidence.additionalProperties, false);
});
