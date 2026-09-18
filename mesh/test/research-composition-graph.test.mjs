import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { researchContractDigest } from '../src/lib/research-capsule-contracts.mjs';

const moduleUrl = new URL('../src/lib/research-composition-graph.mjs', import.meta.url);
const contributionSchemaUrl = new URL(
  '../../docs/architecture/contracts/research-contribution.v0.schema.json',
  import.meta.url
);
const relationSchemaUrl = new URL(
  '../../docs/architecture/contracts/research-relation.v0.schema.json',
  import.meta.url
);

function digest(value, field) {
  return researchContractDigest(value, field);
}

function contribution({
  id,
  kind,
  createdAt,
  summary,
  artifacts = [],
  evidence = [],
  contributor = 'principal:test'
}) {
  const base = {
    schema: 'axiom-research-contribution.v0',
    contribution_id: id,
    contribution_kind: kind,
    created_at: createdAt,
    contributor_ref: contributor,
    artifact_refs: artifacts,
    evidence_refs: evidence,
    summary,
    truth_established: false,
    authority_effect: 'none'
  };
  return {
    ...base,
    contribution_digest: digest(base, 'contribution_digest')
  };
}

function relation({
  id,
  subject,
  predicate,
  object,
  independence = 'unknown',
  evidence = []
}) {
  const base = {
    schema: 'axiom-research-relation.v0',
    relation_id: id,
    subject_contribution_digest: subject,
    predicate,
    object_contribution_digest: object,
    independence_state: independence,
    evidence_refs: evidence,
    authority_effect: 'none'
  };
  return {
    ...base,
    relation_digest: digest(base, 'relation_digest')
  };
}

async function api() {
  assert.equal(existsSync(moduleUrl), true, 'Research Composition Graph v0 verifier is not implemented');
  assert.equal(existsSync(contributionSchemaUrl), true, 'Research Contribution v0 schema is missing');
  assert.equal(existsSync(relationSchemaUrl), true, 'Research Relation v0 schema is missing');
  return import(moduleUrl.href);
}

function fixture() {
  const h1 = contribution({
    id: 'research:h1',
    kind: 'hypothesis',
    createdAt: '2026-09-16T00:00:00.000Z',
    summary: 'Hypothesis one'
  });
  const e1 = contribution({
    id: 'research:e1',
    kind: 'experiment',
    createdAt: '2026-09-16T01:00:00.000Z',
    summary: 'Experiment one'
  });
  const r1 = contribution({
    id: 'research:r1',
    kind: 'result',
    createdAt: '2026-09-16T02:00:00.000Z',
    summary: 'Result one'
  });
  const v1 = contribution({
    id: 'research:v1',
    kind: 'verification',
    createdAt: '2026-09-16T03:00:00.000Z',
    summary: 'Independent reproduction'
  });
  const s1 = contribution({
    id: 'research:s1',
    kind: 'synthesis',
    createdAt: '2026-09-16T04:00:00.000Z',
    summary: 'Synthesis over the result'
  });
  const n1 = contribution({
    id: 'research:n1',
    kind: 'negative_result',
    createdAt: '2026-09-16T05:00:00.000Z',
    summary: 'Contrary evidence'
  });
  const f1 = contribution({
    id: 'research:f1',
    kind: 'verification',
    createdAt: '2026-09-16T06:00:00.000Z',
    summary: 'Independent failed reproduction'
  });

  const relations = [
    relation({
      id: 'relation:e1-builds-h1',
      subject: e1.contribution_digest,
      predicate: 'builds_on',
      object: h1.contribution_digest
    }),
    relation({
      id: 'relation:r1-builds-e1',
      subject: r1.contribution_digest,
      predicate: 'builds_on',
      object: e1.contribution_digest
    }),
    relation({
      id: 'relation:v1-reproduces-r1',
      subject: v1.contribution_digest,
      predicate: 'reproduces',
      object: r1.contribution_digest,
      independence: 'independent'
    }),
    relation({
      id: 'relation:s1-builds-r1',
      subject: s1.contribution_digest,
      predicate: 'builds_on',
      object: r1.contribution_digest
    }),
    relation({
      id: 'relation:n1-builds-h1',
      subject: n1.contribution_digest,
      predicate: 'builds_on',
      object: h1.contribution_digest
    }),
    relation({
      id: 'relation:n1-contradicts-r1',
      subject: n1.contribution_digest,
      predicate: 'contradicts',
      object: r1.contribution_digest,
      independence: 'independent'
    }),
    relation({
      id: 'relation:f1-fails-r1',
      subject: f1.contribution_digest,
      predicate: 'failed_to_reproduce',
      object: r1.contribution_digest,
      independence: 'independent'
    })
  ];

  return {
    contributions: [h1, e1, r1, v1, s1, n1, f1],
    relations,
    byId: { h1, e1, r1, v1, s1, n1, f1 }
  };
}

test('Research Composition Graph v0 preserves lineage, disagreement, and zero-authority records', async () => {
  const graphApi = await api();
  const { contributions, relations, byId } = fixture();

  assert.equal(
    graphApi.verifyResearchContribution(contributions[0]).authority_effect,
    'none'
  );
  assert.equal(
    graphApi.verifyResearchRelation(relations[0]).authority_effect,
    'none'
  );

  const graph = graphApi.buildResearchCompositionGraph({ contributions, relations });

  assert.deepEqual(graph.root_contribution_digests, [byId.h1.contribution_digest]);
  assert.deepEqual(
    graph.frontier_contribution_digests,
    [
      byId.f1.contribution_digest,
      byId.n1.contribution_digest,
      byId.s1.contribution_digest,
      byId.v1.contribution_digest
    ].sort()
  );
  assert.equal(graph.metrics.contribution_count, 7);
  assert.equal(graph.metrics.relation_count, 7);
  assert.equal(graph.metrics.contradiction_count, 1);
  assert.equal(graph.metrics.failed_reproduction_count, 1);
  assert.equal(graph.metrics.independent_reproduction_count, 1);
  assert.equal(graph.metrics.max_lineage_depth, 3);
  assert.equal(graph.metrics.dominant_root_frontier_share, 1);
  assert.ok(graph.attention_candidate_digests.includes(byId.f1.contribution_digest));
  assert.ok(graph.attention_candidate_digests.includes(byId.n1.contribution_digest));
  assert.ok(graph.attention_candidate_digests.includes(byId.s1.contribution_digest));
});

test('Research Composition Graph v0 fails closed on authority, truth, reference, duplicate, self-edge, and lineage-cycle widening', async () => {
  const graphApi = await api();
  const { contributions, relations, byId } = fixture();

  const widenedContributionBase = {
    ...contributions[0],
    authority_effect: 'execute'
  };
  widenedContributionBase.contribution_digest = digest(
    widenedContributionBase,
    'contribution_digest'
  );
  assert.throws(
    () => graphApi.verifyResearchContribution(widenedContributionBase),
    /authority_effect/
  );

  const truthContributionBase = {
    ...contributions[0],
    truth_established: true
  };
  truthContributionBase.contribution_digest = digest(
    truthContributionBase,
    'contribution_digest'
  );
  assert.throws(
    () => graphApi.verifyResearchContribution(truthContributionBase),
    /truth_established/
  );

  assert.throws(
    () => graphApi.buildResearchCompositionGraph({
      contributions,
      relations: [
        ...relations,
        relation({
          id: 'relation:unknown',
          subject: byId.h1.contribution_digest,
          predicate: 'supports',
          object: 'sha256:0000000000000000000000000000000000000000000000000000000000000000'
        })
      ]
    }),
    /unknown contribution/
  );

  assert.throws(
    () => graphApi.buildResearchCompositionGraph({
      contributions: [...contributions, contributions[0]],
      relations
    }),
    /duplicate contribution/
  );

  assert.throws(
    () => graphApi.buildResearchCompositionGraph({
      contributions,
      relations: [
        ...relations,
        relation({
          id: 'relation:self',
          subject: byId.h1.contribution_digest,
          predicate: 'supports',
          object: byId.h1.contribution_digest
        })
      ]
    }),
    /self relation/
  );

  const cycleRelation = relation({
    id: 'relation:h1-builds-s1',
    subject: byId.h1.contribution_digest,
    predicate: 'builds_on',
    object: byId.s1.contribution_digest
  });

  assert.throws(
    () => graphApi.buildResearchCompositionGraph({
      contributions,
      relations: [...relations, cycleRelation]
    }),
    /lineage cycle/
  );
});

test('support and contradiction cycles remain visible semantic disagreement rather than lineage corruption', async () => {
  const graphApi = await api();
  const { contributions, relations, byId } = fixture();

  const semanticCycle = [
    relation({
      id: 'relation:h1-supports-n1',
      subject: byId.h1.contribution_digest,
      predicate: 'supports',
      object: byId.n1.contribution_digest
    }),
    relation({
      id: 'relation:n1-contradicts-h1',
      subject: byId.n1.contribution_digest,
      predicate: 'contradicts',
      object: byId.h1.contribution_digest
    })
  ];

  const graph = graphApi.buildResearchCompositionGraph({
    contributions,
    relations: [...relations, ...semanticCycle]
  });

  assert.equal(graph.metrics.contradiction_count, 2);
  assert.deepEqual(graph.root_contribution_digests, [byId.h1.contribution_digest]);
});

test('Research Composition Graph v0 contains no live network, process, capability, Git, or provider imports', async () => {
  await api();
  const source = await readFile(moduleUrl, 'utf8');
  for (const forbidden of [
    'node:child_process',
    'node:net',
    'node:http',
    'node:https',
    'node:dns',
    'node:tls',
    'process.env',
    'capabilities.json',
    'typesafe',
    'openai',
    'anthropic',
    'git '
  ]) {
    assert.equal(source.toLowerCase().includes(forbidden), false, `research graph module contains ${forbidden}`);
  }
});
