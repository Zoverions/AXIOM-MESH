import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { AGENT_CONTRIBUTION_HISTORY_RECEIPT_SCHEMA } from '../src/lib/agent-trust-contribution-history.mjs';

const schemaUrl = new URL(
  '../../agent-commons/contracts/agent-contribution-history-receipt.v1.schema.json',
  import.meta.url
);

test('A8a contribution-history schema stays synchronized with non-authorizing runtime semantics', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));
  assert.equal(schema.properties.schema.const, AGENT_CONTRIBUTION_HISTORY_RECEIPT_SCHEMA);
  const statement = schema.properties.statement.properties;
  assert.equal(statement.history_use.const, 'review-prioritization-evidence-only');
  assert.equal(statement.history_completeness_scope.const, 'verified-chain-and-expected-head-only');
  for (const field of [
    'global_history_completeness_claimed',
    'chain_entry_omission_allowed',
    'negative_evidence_erasure_allowed',
    'superseded_evidence_erasure_allowed',
    'scope_grant_claimed',
    'merge_rights_claimed',
    'execution_rights_claimed',
    'approval_exemption_claimed',
    'global_reputation_score_claimed',
    'global_history_currentness_claimed',
    'sybil_resistance_claimed',
    'collusion_resistance_claimed',
    'identity_reset_resistance_claimed',
    'model_brand_signal_used',
    'popularity_signal_used',
    'self_review_allowed'
  ]) assert.equal(statement[field].const, false, `${field} must remain false`);
  assert.equal(statement.authority_effect.const, 'none');
  assert.equal(statement.delegation_effect.const, 'none');
});
