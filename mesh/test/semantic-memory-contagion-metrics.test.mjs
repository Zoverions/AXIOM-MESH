import assert from 'node:assert/strict';
import test from 'node:test';

import { summarizeSemanticMemoryContagionCampaign } from '../src/grid/semantic-memory-contagion-campaign.mjs';

const cleanCampaign = Object.freeze({
  escape_attempts: 4,
  escapes: 0,
  transform_attempts: 5,
  transform_laundering_successes: 0,
  cross_agent_attempts: 1,
  cross_agent_contamination_successes: 0,
  benign_cases: 2,
  false_positives: 0,
  malicious_cases: 6,
  false_negatives: 0
});

test('semantic contagion campaign metrics retain explicit production non-claims', () => {
  const report = summarizeSemanticMemoryContagionCampaign(cleanCampaign);
  assert.equal(report.metrics.semantic_contagion_escape_rate, 0);
  assert.equal(report.metrics.transform_laundering_success_rate, 0);
  assert.equal(report.metrics.cross_agent_contamination_success_rate, 0);
  assert.equal(report.non_claims.production_selection_authorized, false);
  assert.equal(report.non_claims.native_memory_put_reconciled, false);
  assert.equal(report.non_claims.multi_parent_merge_lineage_proven, false);
});

test('semantic contagion campaign metrics reject impossible or negative case counts', () => {
  assert.throws(
    () => summarizeSemanticMemoryContagionCampaign({
      ...cleanCampaign,
      escapes: cleanCampaign.escape_attempts + 1
    }),
    /escapes exceeds its case count/
  );
  assert.throws(
    () => summarizeSemanticMemoryContagionCampaign({
      ...cleanCampaign,
      transform_attempts: -1
    }),
    /transform_attempts is invalid/
  );
  assert.throws(
    () => summarizeSemanticMemoryContagionCampaign({
      ...cleanCampaign,
      false_negatives: cleanCampaign.malicious_cases + 1
    }),
    /false_negatives exceeds its case count/
  );
});
