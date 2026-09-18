import assert from 'node:assert/strict';
import test from 'node:test';
import { digestObject } from '../src/lib/canonical.mjs';
import {
  canonicalSharedArtifactDigest,
  validateCanonicalSharedArtifact
} from '../src/lib/canonical-shared-artifact.mjs';
import {
  CO_CREATIVE_WORKSPACE_PROPOSAL_SCHEMA,
  createCoCreativeEditProposal,
  createCoCreativeRevertProposal,
  reviewCoCreativeWorkspaceProposal,
  validateCoCreativeWorkspaceProposal
} from '../src/lib/co-creative-workspace.mjs';

function contentDigest(payload) {
  return digestObject({ content_type: 'text/plain', payload });
}

function authorization(seed = 'b') {
  return {
    request_digest: 'a'.repeat(64),
    evidence_ref: `receipt:${seed}`,
    evidence_digest: seed.repeat(64)
  };
}

function artifact() {
  return {
    schema: 'axiom-canonical-shared-artifact.v0',
    version: 0,
    status: 'inert-shared-artifact-contract',
    artifact_id: 'artifact:workspace',
    owner_ref: 'principal:owner',
    authority_domain: { kind: 'owner', ref: 'principal:owner' },
    content_type: 'text/plain',
    revisions: [{
      revision_id: 'rev:1',
      parents: [],
      operation: 'put',
      actor_principal: 'principal:owner',
      actor_kind: 'human',
      authorization: authorization(),
      payload: 'original',
      content_digest: contentDigest('original'),
      resolves: [],
      work_graph: null,
      occurred_at: '2026-09-17T16:00:00.000Z'
    }],
    current_heads: ['rev:1'],
    state: 'active',
    current_content_digest: contentDigest('original'),
    sharing: { state: 'private', projection_refs: [] },
    created_at: '2026-09-17T16:00:00.000Z',
    updated_at: '2026-09-17T16:00:00.000Z',
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

function editProposal(base, overrides = {}) {
  return createCoCreativeEditProposal({
    artifact: base,
    proposalId: 'proposal:edit-1',
    actorPrincipal: 'principal:agent-one',
    actorKind: 'agent',
    payload: 'agent suggestion',
    rationale: 'Improve the wording while preserving the same artifact.',
    proposedAt: '2026-09-17T16:01:00.000Z',
    ...overrides
  });
}

test('human and agent edits use the same inert proposal contract', () => {
  const base = artifact();
  const agent = editProposal(base);
  const human = editProposal(base, {
    proposalId: 'proposal:human-1',
    actorPrincipal: 'principal:owner',
    actorKind: 'human',
    payload: 'human suggestion'
  });

  for (const proposal of [agent, human]) {
    const result = validateCoCreativeWorkspaceProposal(proposal);
    assert.equal(result.valid, true);
    assert.equal(result.schema, CO_CREATIVE_WORKSPACE_PROPOSAL_SCHEMA);
    assert.equal(result.artifact_id, 'artifact:workspace');
    assert.deepEqual(result.base_heads, ['rev:1']);
    assert.equal(result.base_artifact_digest, canonicalSharedArtifactDigest(base));
    assert.equal(result.authority_effect, 'none');
    assert.equal(result.network_effect, 'none');
    assert.equal(result.runtime_activation, false);
  }
  assert.equal(agent.actor_kind, 'agent');
  assert.equal(human.actor_kind, 'human');
});

test('rejecting a proposal leaves the canonical artifact unchanged', () => {
  const base = artifact();
  const before = canonicalSharedArtifactDigest(base);
  const proposal = editProposal(base);
  const reviewed = reviewCoCreativeWorkspaceProposal({
    artifact: base,
    proposal,
    decision: 'reject'
  });

  assert.equal(reviewed.decision, 'rejected');
  assert.equal(reviewed.changed, false);
  assert.equal(reviewed.artifact_digest, before);
  assert.equal(canonicalSharedArtifactDigest(base), before);
  assert.equal(base.revisions.length, 1);
});

test('acceptance fails closed without explicit authorization evidence', () => {
  const base = artifact();
  const proposal = editProposal(base);
  assert.throws(() => reviewCoCreativeWorkspaceProposal({
    artifact: base,
    proposal,
    decision: 'accept',
    acceptedAt: '2026-09-17T16:02:00.000Z'
  }), /explicit authorization evidence/i);
});

test('authorized acceptance appends an agent revision without creating authority', () => {
  const base = artifact();
  const before = canonicalSharedArtifactDigest(base);
  const proposal = editProposal(base);
  const reviewed = reviewCoCreativeWorkspaceProposal({
    artifact: base,
    proposal,
    decision: 'accept',
    authorization: authorization('c'),
    acceptedAt: '2026-09-17T16:02:00.000Z'
  });

  assert.equal(reviewed.decision, 'accepted');
  assert.equal(reviewed.changed, true);
  assert.notEqual(reviewed.artifact_digest, before);
  assert.equal(reviewed.authority_effect, 'none');
  assert.equal(reviewed.network_effect, 'none');
  assert.equal(reviewed.runtime_activation, false);
  assert.deepEqual(reviewed.current_heads, ['revision:proposal:edit-1']);
  assert.equal(reviewed.artifact.revisions.length, 2);
  assert.equal(reviewed.artifact.revisions[1].actor_principal, 'principal:agent-one');
  assert.equal(reviewed.artifact.revisions[1].actor_kind, 'agent');
  assert.equal(reviewed.artifact.revisions[1].payload, 'agent suggestion');
  assert.deepEqual(reviewed.artifact.revisions[1].authorization, authorization('c'));
  assert.equal(reviewed.artifact.authority_effect, 'none');
  assert.equal(reviewed.artifact.network_effect, 'none');
  assert.equal(reviewed.artifact.runtime_activation, false);
  assert.doesNotThrow(() => validateCanonicalSharedArtifact(reviewed.artifact));
  assert.equal(base.revisions.length, 1, 'review must not mutate the input artifact');
});

test('stale proposals cannot silently overwrite a newer canonical head', () => {
  const base = artifact();
  const stale = editProposal(base);
  const newer = reviewCoCreativeWorkspaceProposal({
    artifact: base,
    proposal: createCoCreativeEditProposal({
      artifact: base,
      proposalId: 'proposal:human-newer',
      actorPrincipal: 'principal:owner',
      actorKind: 'human',
      payload: 'newer human edit',
      rationale: 'Create a newer canonical head first.',
      proposedAt: '2026-09-17T16:01:30.000Z'
    }),
    decision: 'accept',
    authorization: authorization('d'),
    acceptedAt: '2026-09-17T16:02:00.000Z'
  }).artifact;

  assert.throws(() => reviewCoCreativeWorkspaceProposal({
    artifact: newer,
    proposal: stale,
    decision: 'accept',
    authorization: authorization('e'),
    acceptedAt: '2026-09-17T16:03:00.000Z'
  }), /base is stale/i);
});

test('revert is an explicit new reviewed revision, not history deletion', () => {
  const base = artifact();
  const edited = reviewCoCreativeWorkspaceProposal({
    artifact: base,
    proposal: editProposal(base),
    decision: 'accept',
    authorization: authorization('f'),
    acceptedAt: '2026-09-17T16:02:00.000Z'
  }).artifact;

  const revert = createCoCreativeRevertProposal({
    artifact: edited,
    proposalId: 'proposal:revert-1',
    actorPrincipal: 'principal:owner',
    actorKind: 'human',
    sourceRevisionId: 'rev:1',
    rationale: 'Restore the earlier content while retaining the full history.',
    proposedAt: '2026-09-17T16:03:00.000Z'
  });
  assert.equal(revert.kind, 'revert');
  assert.equal(revert.source_revision_id, 'rev:1');
  assert.equal(revert.payload, 'original');

  const reverted = reviewCoCreativeWorkspaceProposal({
    artifact: edited,
    proposal: revert,
    decision: 'accept',
    authorization: authorization('1'),
    acceptedAt: '2026-09-17T16:04:00.000Z'
  }).artifact;
  assert.equal(reverted.revisions.length, 3);
  assert.equal(reverted.revisions[2].payload, 'original');
  assert.equal(reverted.revisions[0].payload, 'original');
  assert.equal(reverted.revisions[1].payload, 'agent suggestion');
  assert.doesNotThrow(() => validateCanonicalSharedArtifact(reverted));
});

test('v0 fails closed on conflicts, service actors, and tampered accepted payloads', () => {
  const base = artifact();
  assert.throws(() => editProposal(base, { actorKind: 'service' }), /human or agent/i);

  const conflict = structuredClone(base);
  conflict.revisions.push({
    ...structuredClone(conflict.revisions[0]),
    revision_id: 'rev:2',
    parents: ['rev:1'],
    actor_principal: 'principal:agent-one',
    actor_kind: 'agent',
    payload: 'branch one',
    content_digest: contentDigest('branch one'),
    occurred_at: '2026-09-17T16:01:00.000Z'
  });
  conflict.revisions.push({
    ...structuredClone(conflict.revisions[0]),
    revision_id: 'rev:3',
    parents: ['rev:1'],
    payload: 'branch two',
    content_digest: contentDigest('branch two'),
    occurred_at: '2026-09-17T16:02:00.000Z'
  });
  conflict.current_heads = ['rev:2', 'rev:3'];
  conflict.state = 'conflict';
  conflict.current_content_digest = null;
  conflict.updated_at = '2026-09-17T16:02:00.000Z';
  assert.doesNotThrow(() => validateCanonicalSharedArtifact(conflict));
  assert.throws(() => editProposal(conflict), /one active canonical artifact head/i);

  const proposal = structuredClone(editProposal(base));
  proposal.payload = 'tampered after review';
  assert.throws(() => reviewCoCreativeWorkspaceProposal({
    artifact: base,
    proposal,
    decision: 'accept',
    authorization: authorization('2'),
    acceptedAt: '2026-09-17T16:03:00.000Z'
  }), /content digest/i);
});
