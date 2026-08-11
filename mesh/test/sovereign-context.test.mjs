import assert from 'node:assert/strict';
import test from 'node:test';
import { digestObject } from '../src/lib/canonical.mjs';
import {
  CONTEXT_AUTHORITY_EFFECT,
  CONTEXT_MEMORY_KIND,
  compileContextView,
  contextClaimMemoryPutPayload,
  normalizeContextClaim
} from '../src/lib/sovereign-context.mjs';

const AS_OF = '2026-08-11T20:00:00.000Z';

function claim(overrides = {}) {
  const base = {
    schema: 'axiom-context-claim.v1',
    claim_id: 'claim.default',
    owner: 'owner.zov',
    subject: 'project.axiom',
    predicate: 'project.priority',
    value: 'security-first',
    claim_type: 'decision',
    cardinality: 'single',
    confidence_ppm: 1_000_000,
    source: {
      type: 'human',
      ref: 'conversation:decision-1',
      digest: '1'.repeat(64),
      observed_at: '2026-08-11T18:00:00.000Z'
    },
    validity: {
      from: '2026-08-11T18:00:00.000Z',
      until: null
    },
    disclosure: {
      principals: ['agent.primary'],
      purposes: ['project.execution'],
      scopes: ['context.project']
    },
    sensitivity: 'internal',
    supersedes: [],
    contradicts: [],
    authority_effect: 'none'
  };
  return {
    ...base,
    ...overrides,
    source: { ...base.source, ...(overrides.source ?? {}) },
    validity: { ...base.validity, ...(overrides.validity ?? {}) },
    disclosure: { ...base.disclosure, ...(overrides.disclosure ?? {}) }
  };
}

test('context claims cannot create authority', () => {
  const normalized = normalizeContextClaim(claim());
  assert.equal(normalized.authority_effect, CONTEXT_AUTHORITY_EFFECT);
  assert.throws(
    () => normalizeContextClaim(claim({ authority_effect: 'grant' })),
    /authority_effect must be none/
  );
});

test('context claim memory binding preserves existing content addressing', () => {
  const payload = contextClaimMemoryPutPayload(claim());
  assert.equal(payload.kind, CONTEXT_MEMORY_KIND);
  assert.equal(payload.object_id, `memory_${payload.content_digest}`);
  assert.equal(payload.metadata.authority_effect, 'none');
  assert.equal(
    payload.content_digest,
    digestObject({
      owner: payload.owner,
      kind: payload.kind,
      content: payload.content,
      metadata: payload.metadata
    })
  );
});

test('context compiler enforces principal purpose scope and temporal validity', () => {
  const visible = claim({ claim_id: 'claim.visible' });
  const wrongPurpose = claim({
    claim_id: 'claim.wrong-purpose',
    predicate: 'project.owner',
    disclosure: { purposes: ['project.audit'] }
  });
  const missingScope = claim({
    claim_id: 'claim.missing-scope',
    predicate: 'project.budget',
    disclosure: { scopes: ['context.financial'] }
  });
  const expired = claim({
    claim_id: 'claim.expired',
    predicate: 'project.phase',
    validity: { until: '2026-08-11T19:00:00.000Z' }
  });

  const view = compileContextView({
    claims: [wrongPurpose, expired, visible, missingScope],
    principal: 'agent.primary',
    purpose: 'project.execution',
    scopes: ['context.project'],
    asOf: AS_OF
  });

  assert.deepEqual(view.usable_claims.map(item => item.claim_id), ['claim.visible']);
  assert.equal(view.summary.eligible_claims, 1);
  assert.equal(view.summary.usable_claims, 1);
  assert.equal(view.authority_effect, 'none');
  assert.match(view.non_claim, /does not grant authority/);
});

test('newer same-slot context supersedes older context without rewriting history', () => {
  const older = claim({
    claim_id: 'claim.priority-old',
    value: 'speed-first',
    source: {
      digest: '2'.repeat(64),
      observed_at: '2026-08-11T17:00:00.000Z'
    },
    validity: { from: '2026-08-11T17:00:00.000Z' }
  });
  const newer = claim({
    claim_id: 'claim.priority-new',
    value: 'security-first',
    source: {
      digest: '3'.repeat(64),
      observed_at: '2026-08-11T19:00:00.000Z'
    },
    validity: { from: '2026-08-11T19:00:00.000Z' },
    supersedes: ['claim.priority-old']
  });

  const view = compileContextView({
    claims: [older, newer],
    principal: 'agent.primary',
    purpose: 'project.execution',
    scopes: ['context.project'],
    asOf: AS_OF
  });

  assert.deepEqual(view.usable_claims.map(item => item.claim_id), ['claim.priority-new']);
  assert.equal(view.summary.superseded_claims, 1);
});

test('single-valued disagreement is withheld as an unresolved conflict', () => {
  const left = claim({
    claim_id: 'claim.priority-a',
    value: 'speed-first',
    source: { digest: '4'.repeat(64) }
  });
  const right = claim({
    claim_id: 'claim.priority-b',
    value: 'security-first',
    source: { digest: '5'.repeat(64) }
  });

  const view = compileContextView({
    claims: [left, right],
    principal: 'agent.primary',
    purpose: 'project.execution',
    scopes: ['context.project'],
    asOf: AS_OF
  });

  assert.equal(view.usable_claims.length, 0);
  assert.equal(view.conflicts.length, 1);
  assert.equal(view.conflicts[0].reason, 'single_value_disagreement');
  assert.deepEqual(view.conflicts[0].claim_ids, ['claim.priority-a', 'claim.priority-b']);
  assert.equal(view.summary.conflicted_claims, 2);
});

test('explicit contradiction is withheld even when values serialize identically', () => {
  const left = claim({
    claim_id: 'claim.constraint-a',
    predicate: 'project.constraint',
    value: 'local-only',
    cardinality: 'multi',
    source: { digest: '6'.repeat(64) },
    contradicts: ['claim.constraint-b']
  });
  const right = claim({
    claim_id: 'claim.constraint-b',
    predicate: 'project.constraint',
    value: 'local-only',
    cardinality: 'multi',
    source: { digest: '7'.repeat(64) }
  });

  const view = compileContextView({
    claims: [left, right],
    principal: 'agent.primary',
    purpose: 'project.execution',
    scopes: ['context.project'],
    asOf: AS_OF
  });

  assert.equal(view.usable_claims.length, 0);
  assert.equal(view.conflicts[0].reason, 'explicit_contradiction');
});

test('context view digest is deterministic across claim input ordering', () => {
  const first = claim({
    claim_id: 'claim.tooling',
    predicate: 'project.tooling',
    value: ['node', 'sqlite'],
    cardinality: 'multi',
    source: { digest: '8'.repeat(64) }
  });
  const second = claim({
    claim_id: 'claim.region',
    predicate: 'project.region',
    value: 'canada',
    source: { digest: '9'.repeat(64) }
  });
  const request = {
    principal: 'agent.primary',
    purpose: 'project.execution',
    scopes: ['context.project'],
    asOf: AS_OF
  };

  const forward = compileContextView({ claims: [first, second], ...request });
  const reverse = compileContextView({ claims: [second, first], ...request });

  assert.equal(forward.view_digest, reverse.view_digest);
  assert.deepEqual(forward, reverse);
});

test('context compiler refuses silent truncation', () => {
  const first = claim({ claim_id: 'claim.one', predicate: 'project.one' });
  const second = claim({ claim_id: 'claim.two', predicate: 'project.two' });
  assert.throws(
    () => compileContextView({
      claims: [first, second],
      principal: 'agent.primary',
      purpose: 'project.execution',
      scopes: ['context.project'],
      asOf: AS_OF,
      maxClaims: 1
    }),
    /refusing silent truncation/
  );
});

test('context relationships cannot suppress a different owner or semantic slot', () => {
  const target = claim({ claim_id: 'claim.target' });
  const attacker = claim({
    claim_id: 'claim.attacker',
    owner: 'owner.other',
    supersedes: ['claim.target'],
    source: { digest: 'a'.repeat(64) }
  });
  assert.throws(
    () => compileContextView({
      claims: [target, attacker],
      principal: 'agent.primary',
      purpose: 'project.execution',
      scopes: ['context.project'],
      asOf: AS_OF
    }),
    /same owner\/subject\/predicate slot/
  );
});
