import assert from 'node:assert/strict';
import test from 'node:test';

import {
  RESEARCH_CLAIM_ADJUDICATION_SCHEMA,
  researchContractDigest
} from '../src/lib/research-capsule-contracts.mjs';
import {
  RESEARCH_CONTRIBUTION_SCHEMA,
  buildResearchCompositionGraph
} from '../src/lib/research-composition-graph.mjs';

function contribution() {
  const base = {
    schema: RESEARCH_CONTRIBUTION_SCHEMA,
    contribution_id: 'research:bounded-adjudication-input',
    contribution_kind: 'synthesis',
    created_at: '2026-09-19T20:00:00.000Z',
    contributor_ref: 'fixture:bounded-adjudication-input',
    artifact_refs: [],
    evidence_refs: [],
    summary: 'Bounded composition-graph adjudication input fixture.',
    truth_established: false,
    authority_effect: 'none'
  };
  return {
    ...base,
    contribution_digest: researchContractDigest(base, 'contribution_digest')
  };
}

function adjudication(index) {
  const base = {
    schema: RESEARCH_CLAIM_ADJUDICATION_SCHEMA,
    adjudication_id: `adjudication:bounded:${index}`,
    source_manifest_digest: `sha256:${'a'.repeat(64)}`,
    knowledge_projection_digest: `sha256:${'b'.repeat(64)}`,
    entry_id: `entry:bounded:${index}`,
    entry_content_digest: `sha256:${'c'.repeat(64)}`,
    assessed_at: '2026-09-19T20:00:00.000Z',
    adjudication_method: 'synthetic_bound_check',
    evidence_refs: [`evidence:${index}`],
    evidence_digests: [`sha256:${index.toString(16).padStart(64, '0')}`],
    status: 'contested',
    correction_summary: null,
    source_statement_mutation: 'none',
    truth_established: false,
    instruction_authority: 'none',
    authority_effect: 'none'
  };
  return {
    ...base,
    adjudication_digest: researchContractDigest(base, 'adjudication_digest')
  };
}

test('composition graph fails closed above the bounded claim-adjudication input ceiling', () => {
  const claimAdjudications = Array.from({ length: 1_025 }, (_, index) => adjudication(index));

  assert.throws(
    () => buildResearchCompositionGraph({
      contributions: [contribution()],
      relations: [],
      claim_adjudications: claimAdjudications
    }),
    /claim_adjudications.*at most 1024/i
  );
});
