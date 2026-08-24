import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  LOCAL_CONTEXT_SEMANTIC_REVIEW_EVIDENCE_SCHEMA
} from '../src/lib/context-semantic-review-evidence.mjs';

const schemaUrl = new URL(
  '../../agent-commons/contracts/local-context-semantic-review-evidence.v1.schema.json',
  import.meta.url
);

test('A7 owner semantic-review evidence schema requires completed full-Grid evidence and stays non-authorizing', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));
  assert.equal(schema.properties.schema.const, LOCAL_CONTEXT_SEMANTIC_REVIEW_EVIDENCE_SCHEMA);
  assert.deepEqual(schema.properties.decision.enum, ['accept-data', 'quarantine', 'reject']);
  assert.deepEqual(
    schema.properties.target_semantic_class.enum,
    ['knowledge', 'preference', 'procedure', 'instruction-candidate']
  );
  assert.equal(schema.properties.verification_scope.const, 'local-grid-full-chain-completed-review');
  for (const field of [
    'accepted_intent_verified',
    'completed_intent_verified',
    'materialized_completed_intent_verified',
    'terminal_history_unambiguous',
    'full_grid_chain_verified',
    'review_evidence_verified'
  ]) {
    assert.equal(schema.properties[field].const, true, `${field} must remain true`);
  }
  for (const field of [
    'retained_external_head_verified',
    'review_applied_to_store',
    'instruction_semantics',
    'owner_instruction_use_enabled',
    'grants_vault_access',
    'grants_execution_authority',
    'may_authorize_tools',
    'may_modify_policy',
    'may_self_persist'
  ]) {
    assert.equal(schema.properties[field].const, false, `${field} must remain false`);
  }
  assert.equal(schema.properties.classification_effect.const, 'evidence-only');
  assert.equal(schema.properties.authority_effect.const, 'none');
});
