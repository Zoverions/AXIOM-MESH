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
    graphApi.RESEARCH_CONTRIBUTION_SCHEMA,
    'axiom-research-contribution.v0'
  );
  assert.equal(
    graphApi.RESEARCH_RELATION_SCHEMA,
    'axiom-research-relation.v0'
  );

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
  // s1 builds_on independently-reproduced r1 and has no problem edge → covered, not attention
  assert.equal(graph.attention_candidate_digests.includes(byId.s1.contribution_digest), false);
  // verification frontier tip without problem force-include stays excluded
  assert.equal(graph.attention_candidate_digests.includes(byId.v1.contribution_digest), false);
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

  const widenedRelationBase = {
    ...relations[0],
    authority_effect: 'execute'
  };
  widenedRelationBase.relation_digest = digest(
    widenedRelationBase,
    'relation_digest'
  );
  assert.throws(
    () => graphApi.verifyResearchRelation(widenedRelationBase),
    /authority_effect/
  );

  assert.throws(
    () => graphApi.verifyResearchContribution({
      ...contributions[0],
      frontier: true
    }),
    /unsupported field/
  );

  assert.throws(
    () => graphApi.buildResearchCompositionGraph({
      contributions,
      relations,
      merge_authorized: true
    }),
    /unsupported field/
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
          id: 'relation:duplicate-edge',
          subject: byId.e1.contribution_digest,
          predicate: 'builds_on',
          object: byId.h1.contribution_digest
        })
      ]
    }),
    /duplicate relation/
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

test('independent reproduction coverage suppresses descendant frontier attention without granting reputation', async () => {
  const graphApi = await api();

  const h1 = contribution({
    id: 'research:cov-h1',
    kind: 'hypothesis',
    createdAt: '2026-09-18T00:00:00.000Z',
    summary: 'Coverage root'
  });
  const rCovered = contribution({
    id: 'research:cov-r',
    kind: 'result',
    createdAt: '2026-09-18T01:00:00.000Z',
    summary: 'Independently reproduced result'
  });
  const rNeglected = contribution({
    id: 'research:neg-r',
    kind: 'result',
    createdAt: '2026-09-18T01:30:00.000Z',
    summary: 'Uncovered sibling result'
  });
  const vIndependent = contribution({
    id: 'research:cov-v',
    kind: 'verification',
    createdAt: '2026-09-18T02:00:00.000Z',
    summary: 'Independent reproduction of covered result'
  });
  const sCovered = contribution({
    id: 'research:cov-s',
    kind: 'synthesis',
    createdAt: '2026-09-18T03:00:00.000Z',
    summary: 'Builds on covered result'
  });
  const sNeglected = contribution({
    id: 'research:neg-s',
    kind: 'synthesis',
    createdAt: '2026-09-18T03:30:00.000Z',
    summary: 'Builds on uncovered sibling'
  });
  const sProblem = contribution({
    id: 'research:prob-s',
    kind: 'synthesis',
    createdAt: '2026-09-18T04:00:00.000Z',
    summary: 'Covered lineage but contradicted tip'
  });
  const nContra = contribution({
    id: 'research:prob-n',
    kind: 'negative_result',
    createdAt: '2026-09-18T04:30:00.000Z',
    summary: 'Contradiction against covered tip'
  });

  const relations = [
    relation({
      id: 'relation:cov-r-builds-h',
      subject: rCovered.contribution_digest,
      predicate: 'builds_on',
      object: h1.contribution_digest
    }),
    relation({
      id: 'relation:neg-r-builds-h',
      subject: rNeglected.contribution_digest,
      predicate: 'builds_on',
      object: h1.contribution_digest
    }),
    relation({
      id: 'relation:v-reproduces-r',
      subject: vIndependent.contribution_digest,
      predicate: 'reproduces',
      object: rCovered.contribution_digest,
      independence: 'independent'
    }),
    relation({
      id: 'relation:s-builds-covered-r',
      subject: sCovered.contribution_digest,
      predicate: 'builds_on',
      object: rCovered.contribution_digest
    }),
    relation({
      id: 'relation:s-builds-neglected-r',
      subject: sNeglected.contribution_digest,
      predicate: 'builds_on',
      object: rNeglected.contribution_digest
    }),
    relation({
      id: 'relation:prob-s-builds-covered-r',
      subject: sProblem.contribution_digest,
      predicate: 'builds_on',
      object: rCovered.contribution_digest
    }),
    relation({
      id: 'relation:n-contradicts-prob-s',
      subject: nContra.contribution_digest,
      predicate: 'contradicts',
      object: sProblem.contribution_digest,
      independence: 'independent'
    })
  ];

  const graph = graphApi.buildResearchCompositionGraph({
    contributions: [h1, rCovered, rNeglected, vIndependent, sCovered, sNeglected, sProblem, nContra],
    relations
  });

  assert.equal(graph.metrics.independent_reproduction_count, 1);
  assert.equal(
    graph.attention_candidate_digests.includes(sCovered.contribution_digest),
    false,
    'descendant of independently covered result must leave attention'
  );
  assert.ok(
    graph.attention_candidate_digests.includes(sNeglected.contribution_digest),
    'sibling lineage without independent coverage stays in attention'
  );
  assert.ok(
    graph.attention_candidate_digests.includes(sProblem.contribution_digest),
    'problem override keeps covered tip in attention'
  );
  assert.ok(
    graph.attention_candidate_digests.includes(nContra.contribution_digest),
    'contradiction subject stays in attention'
  );
  assert.equal(
    graph.attention_candidate_digests.includes(vIndependent.contribution_digest),
    false,
    'verification kind remains excluded from attention'
  );
  for (const item of [h1, rCovered, rNeglected, vIndependent, sCovered, sNeglected, sProblem, nContra]) {
    assert.equal(item.authority_effect, 'none');
  }
  for (const item of relations) {
    assert.equal(item.authority_effect, 'none');
  }
});


test('adverse claim adjudications force-include covered frontier tips without granting coverage or truth', async () => {
  const graphApi = await api();
  const capsuleApi = await import(new URL('../src/lib/research-capsule-contracts.mjs', import.meta.url).href);

  const h1 = contribution({
    id: 'research:adj-h1',
    kind: 'hypothesis',
    createdAt: '2026-09-18T10:00:00.000Z',
    summary: 'Adjudication bridge root'
  });
  const r1 = contribution({
    id: 'research:adj-r1',
    kind: 'result',
    createdAt: '2026-09-18T10:10:00.000Z',
    summary: 'Independently covered result'
  });
  const v1 = contribution({
    id: 'research:adj-v1',
    kind: 'verification',
    createdAt: '2026-09-18T10:20:00.000Z',
    summary: 'Independent reproduction'
  });

  function adjudication({ id, status, evidence = true }) {
    const base = {
      schema: 'axiom-research-claim-adjudication.v0',
      adjudication_id: id,
      source_manifest_digest: 'sha256:' + 'a'.repeat(64),
      knowledge_projection_digest: 'sha256:' + 'b'.repeat(64),
      entry_id: 'entry:1',
      entry_content_digest: 'sha256:' + 'c'.repeat(64),
      assessed_at: '2026-09-18T11:00:00.000Z',
      adjudication_method: 'manual_review',
      evidence_refs: evidence ? ['evidence:1'] : [],
      evidence_digests: evidence ? ['sha256:' + 'd'.repeat(64)] : [],
      status,
      correction_summary: status === 'corrected' ? 'Corrected reading' : null,
      source_statement_mutation: 'none',
      truth_established: false,
      instruction_authority: 'none',
      authority_effect: 'none'
    };
    return {
      ...base,
      adjudication_digest: capsuleApi.researchContractDigest(base, 'adjudication_digest')
    };
  }

  const contested = adjudication({ id: 'adj:contested', status: 'contested' });
  const supported = adjudication({ id: 'adj:supported', status: 'supported' });
  const insufficient = adjudication({
    id: 'adj:insufficient',
    status: 'insufficient_evidence',
    evidence: false
  });

  const sAdverseBound = contribution({
    id: 'research:adj-s-adverse',
    kind: 'synthesis',
    createdAt: '2026-09-18T10:30:00.000Z',
    summary: 'Covered tip with contested adjudication',
    artifacts: [contested.adjudication_digest]
  });
  const sSupportedBound = contribution({
    id: 'research:adj-s-supported',
    kind: 'synthesis',
    createdAt: '2026-09-18T10:40:00.000Z',
    summary: 'Covered tip with supported adjudication only',
    artifacts: [supported.adjudication_digest]
  });
  const sInsufficient = contribution({
    id: 'research:adj-s-insufficient',
    kind: 'synthesis',
    createdAt: '2026-09-18T10:50:00.000Z',
    summary: 'Covered tip with insufficient_evidence only',
    evidence: [insufficient.adjudication_digest]
  });

  const relations = [
    relation({
      id: 'relation:adj-r-builds-h',
      subject: r1.contribution_digest,
      predicate: 'builds_on',
      object: h1.contribution_digest
    }),
    relation({
      id: 'relation:adj-v-repro-r',
      subject: v1.contribution_digest,
      predicate: 'reproduces',
      object: r1.contribution_digest,
      independence: 'independent'
    }),
    relation({
      id: 'relation:adj-sa-builds-r',
      subject: sAdverseBound.contribution_digest,
      predicate: 'builds_on',
      object: r1.contribution_digest
    }),
    relation({
      id: 'relation:adj-ss-builds-r',
      subject: sSupportedBound.contribution_digest,
      predicate: 'builds_on',
      object: r1.contribution_digest
    }),
    relation({
      id: 'relation:adj-si-builds-r',
      subject: sInsufficient.contribution_digest,
      predicate: 'builds_on',
      object: r1.contribution_digest
    })
  ];

  const graph = graphApi.buildResearchCompositionGraph({
    contributions: [h1, r1, v1, sAdverseBound, sSupportedBound, sInsufficient],
    relations,
    claim_adjudications: [contested, supported, insufficient]
  });

  assert.equal(graph.metrics.independent_reproduction_count, 1);
  assert.ok(
    graph.attention_candidate_digests.includes(sAdverseBound.contribution_digest),
    'contested adjudication must force-include covered tip'
  );
  assert.equal(
    graph.attention_candidate_digests.includes(sSupportedBound.contribution_digest),
    false,
    'supported adjudication must not keep covered tip in attention'
  );
  assert.equal(
    graph.attention_candidate_digests.includes(sInsufficient.contribution_digest),
    false,
    'insufficient_evidence must not invent attention or suppress coverage'
  );
  assert.equal(contested.truth_established, false);
  assert.equal(contested.authority_effect, 'none');
  assert.equal(supported.authority_effect, 'none');
});
