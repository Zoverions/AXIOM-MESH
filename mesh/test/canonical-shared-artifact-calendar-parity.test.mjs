import assert from 'node:assert/strict';
import test from 'node:test';
import { digestObject } from '../src/lib/canonical.mjs';
import { validateCanonicalSharedArtifact } from '../src/lib/canonical-shared-artifact.mjs';

function artifact(timestamp = '2026-09-17T20:00:00.000Z') {
  const payload = 'calendar parity';
  const contentDigest = digestObject({ content_type: 'text/plain', payload });
  return {
    schema: 'axiom-canonical-shared-artifact.v0',
    version: 0,
    status: 'inert-shared-artifact-contract',
    artifact_id: 'artifact:calendar-parity',
    owner_ref: 'principal:owner',
    authority_domain: { kind: 'owner', ref: 'principal:owner' },
    content_type: 'text/plain',
    revisions: [{
      revision_id: 'rev:1',
      parents: [],
      operation: 'put',
      actor_principal: 'principal:owner',
      actor_kind: 'human',
      authorization: {
        request_digest: 'a'.repeat(64),
        evidence_ref: 'receipt:calendar-parity',
        evidence_digest: 'b'.repeat(64)
      },
      payload,
      content_digest: contentDigest,
      resolves: [],
      work_graph: null,
      occurred_at: timestamp
    }],
    current_heads: ['rev:1'],
    state: 'active',
    current_content_digest: contentDigest,
    sharing: { state: 'private', projection_refs: [] },
    created_at: timestamp,
    updated_at: timestamp,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
}

test('semantic validator rejects lexically canonical but calendar-invalid timestamps', () => {
  assert.doesNotThrow(() => validateCanonicalSharedArtifact(artifact()));
  assert.throws(
    () => validateCanonicalSharedArtifact(artifact('2026-02-31T20:00:00.000Z')),
    /timestamp|canonical/i
  );
});
