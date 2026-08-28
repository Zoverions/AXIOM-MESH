import assert from 'node:assert/strict';
import test from 'node:test';

import { digestObject } from '../src/lib/canonical.mjs';
import { LOCAL_CONTEXT_CANDIDATE_SCHEMA } from '../src/lib/context-claim-resolution.mjs';
import {
  LOCAL_CONTEXT_SEMANTIC_SOURCE_EVIDENCE_MEMORY_KIND,
  createLocalContextSemanticSourceEvidence,
  localContextSemanticSourceEvidenceMemoryDigest,
  projectLocalContextSemanticSourceEvidenceMemoryPut,
  verifyLocalContextSemanticSourceEvidence
} from '../src/lib/context-semantic-source-evidence.mjs';

function candidate({
  claimId = 'claim.semantic.source.1',
  value = { preference: 'concise' }
} = {}) {
  return {
    schema: LOCAL_CONTEXT_CANDIDATE_SCHEMA,
    claim_id: claimId,
    owner_subject_ref: 'owner.alice',
    semantic_type: 'preference.communication-style',
    value,
    disclosure_type: 'verbatim-approved',
    sensitivity: 'ordinary-private',
    confidence: 0.9,
    limitations: 'Fixture data for bounded semantic source evidence.',
    source_vault_id: 'vault.personal',
    source_resource_refs: ['resource.external.note.1'],
    observed_at: '2026-08-24T12:00:00.000Z',
    valid_from: '2026-08-24T12:00:00.000Z',
    valid_until: null,
    supersedes: [],
    contradicts: [],
    authority_effect: 'none'
  };
}

test('non-owner source evidence is candidate-bound, content-addressable and non-authorizing', () => {
  const value = candidate();
  const evidence = createLocalContextSemanticSourceEvidence(value, {
    source_class: 'retrieved-external',
    source_artifact_digest: 'b'.repeat(64)
  });

  assert.equal(evidence.owner_subject_ref, value.owner_subject_ref);
  assert.equal(evidence.candidate_digest, digestObject(value));
  assert.equal(evidence.content_payload_digest, digestObject(value.value));
  assert.equal(evidence.source_class, 'retrieved-external');
  assert.equal(evidence.source_principal_ref, null);
  assert.equal(evidence.source_runtime_id, null);
  assert.equal(evidence.evidence_basis, 'owner-observed-artifact');
  assert.equal(evidence.source_identity_verified, false);
  assert.equal(evidence.artifact_authenticity_verified, false);
  assert.equal(evidence.raw_source_bytes_embedded, false);
  assert.equal(evidence.authority_effect, 'none');
  assert.equal(evidence.downstream_effect_authorized, false);
  assert.equal(evidence.may_authorize_tools, false);
  assert.equal(evidence.may_modify_policy, false);
  assert.equal(evidence.may_self_persist, false);
  assert.equal(evidence.may_retransmit, false);
  assert.match(evidence.evidence_digest, /^[a-f0-9]{64}$/);

  const memory = projectLocalContextSemanticSourceEvidenceMemoryPut(evidence);
  assert.equal(memory.kind, LOCAL_CONTEXT_SEMANTIC_SOURCE_EVIDENCE_MEMORY_KIND);
  assert.deepEqual(memory.content, evidence);
  assert.equal(memory.metadata.evidence_digest, evidence.evidence_digest);
  assert.equal(memory.metadata.candidate_digest, evidence.candidate_digest);
  assert.equal(memory.metadata.source_class, evidence.source_class);
  assert.equal(memory.metadata.authority_effect, 'none');
  assert.match(localContextSemanticSourceEvidenceMemoryDigest(evidence), /^[a-f0-9]{64}$/);
});

test('generic source evidence cannot self-assert identity, authenticity, authority or hidden fields', () => {
  const value = candidate();
  const evidence = createLocalContextSemanticSourceEvidence(value, {
    source_class: 'retrieved-external',
    source_artifact_digest: 'c'.repeat(64)
  });

  for (const mutation of [
    { source_identity_verified: true },
    { artifact_authenticity_verified: true },
    { raw_source_bytes_embedded: true },
    { authority_effect: 'tool-authority' },
    { downstream_effect_authorized: true },
    { may_authorize_tools: true },
    { may_modify_policy: true },
    { may_self_persist: true },
    { may_retransmit: true },
    { hidden_authority: true }
  ]) {
    assert.throws(
      () => verifyLocalContextSemanticSourceEvidence({ ...evidence, ...mutation }, value),
      /source evidence|authority|unsupported|must remain/i
    );
  }
});

test('source classes require the minimum source principal or runtime binding', () => {
  const value = candidate();

  assert.throws(
    () => createLocalContextSemanticSourceEvidence(value, {
      source_class: 'local-model-generated',
      source_artifact_digest: 'd'.repeat(64)
    }),
    /source_runtime_id/
  );

  for (const sourceClass of ['remote-agent', 'remote-social', 'tool-output']) {
    assert.throws(
      () => createLocalContextSemanticSourceEvidence(value, {
        source_class: sourceClass,
        source_artifact_digest: 'e'.repeat(64)
      }),
      /source_principal_ref/
    );
  }

  const modelEvidence = createLocalContextSemanticSourceEvidence(value, {
    source_class: 'local-model-generated',
    source_runtime_id: 'runtime.local.1',
    source_artifact_digest: 'f'.repeat(64)
  });
  assert.equal(modelEvidence.source_runtime_id, 'runtime.local.1');

  const remoteEvidence = createLocalContextSemanticSourceEvidence(value, {
    source_class: 'remote-agent',
    source_principal_ref: 'agent.remote.1',
    source_artifact_digest: '1'.repeat(64)
  });
  assert.equal(remoteEvidence.source_principal_ref, 'agent.remote.1');

  assert.throws(
    () => createLocalContextSemanticSourceEvidence(value, {
      source_class: 'owner-authored',
      source_artifact_digest: '2'.repeat(64)
    }),
    /non-owner source class/
  );
  assert.throws(
    () => createLocalContextSemanticSourceEvidence(value, {
      source_class: 'system-derived',
      source_artifact_digest: '3'.repeat(64)
    }),
    /non-owner source class/
  );
});
