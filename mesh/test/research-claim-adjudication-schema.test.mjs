import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schemaUrl = new URL(
  '../../docs/architecture/contracts/research-knowledge-projection.v0.schema.json',
  import.meta.url
);

test('Research Claim Adjudication v0 schema mirrors the closed non-authorizing semantic contract', async () => {
  const knowledgeSchema = JSON.parse(await readFile(schemaUrl, 'utf8'));
  const schema = knowledgeSchema.$defs?.researchClaimAdjudication;

  assert.ok(schema, 'Research Claim Adjudication v0 nested schema is not implemented');
  assert.equal(knowledgeSchema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.$id, 'https://axiom.invalid/schemas/research-claim-adjudication.v0.schema.json');
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.schema.const, 'axiom-research-claim-adjudication.v0');
  assert.deepEqual(schema.properties.status.enum, [
    'supported',
    'corrected',
    'contested',
    'unsupported',
    'insufficient_evidence'
  ]);
  assert.equal(schema.properties.source_statement_mutation.const, 'none');
  assert.equal(schema.properties.truth_established.const, false);
  assert.equal(schema.properties.instruction_authority.const, 'none');
  assert.equal(schema.properties.authority_effect.const, 'none');
  assert.ok(schema.required.includes('knowledge_projection_digest'));
  assert.ok(schema.required.includes('entry_content_digest'));
  assert.ok(schema.required.includes('adjudication_digest'));
  assert.ok(Array.isArray(schema.allOf), 'schema must encode correction-summary status semantics');

  const evidenceRule = schema.allOf.find(
    rule => rule.if?.properties?.status?.enum?.includes('supported')
  );
  assert.ok(evidenceRule, 'schema must require evidence for substantive adjudication statuses');
  assert.equal(evidenceRule.then.properties.evidence_refs.minItems, 1);
  assert.equal(evidenceRule.then.properties.evidence_digests.minItems, 1);
});
