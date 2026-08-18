import assert from 'node:assert/strict';
import test from 'node:test';

import { sha256 } from '../src/lib/canonical.mjs';
import {
  buildObservedSemanticMemorySourceEvidence,
  normalizeSemanticMemorySourceEvidence
} from '../src/lib/semantic-memory-source-evidence.mjs';

const OWNER = 'owner.alice';
const ARTIFACT = sha256('raw model artifact bytes');

function base(overrides = {}) {
  return buildObservedSemanticMemorySourceEvidence({
    owner: OWNER,
    source_class: 'local-model-generated',
    source_runtime_id: 'runtime.local.1',
    source_artifact_digest: ARTIFACT,
    content: { text: 'A model-generated memory candidate.' },
    semantic_class: 'knowledge',
    ...overrides
  });
}

test('local-model source evidence is content-addressed but explicitly non-authorizing and unverified', () => {
  const evidence = base();
  assert.equal(evidence.source_class, 'local-model-generated');
  assert.equal(evidence.source_runtime_id, 'runtime.local.1');
  assert.equal(evidence.evidence_basis, 'owner-observed-artifact');
  assert.equal(evidence.source_identity_verified, false);
  assert.equal(evidence.artifact_authenticity_verified, false);
  assert.equal(evidence.non_authorizing, true);
  assert.match(evidence.evidence_digest, /^[a-f0-9]{64}$/);
  assert.deepEqual(normalizeSemanticMemorySourceEvidence(evidence), evidence);
});

test('remote-agent source evidence requires an explicit claimed source principal', () => {
  assert.throws(
    () => buildObservedSemanticMemorySourceEvidence({
      owner: OWNER,
      source_class: 'remote-agent',
      source_artifact_digest: ARTIFACT,
      content: { text: 'Remote claim.' },
      semantic_class: 'knowledge'
    }),
    /requires source_principal/
  );

  const evidence = buildObservedSemanticMemorySourceEvidence({
    owner: OWNER,
    source_class: 'remote-agent',
    source_principal: 'agent.remote.7',
    source_artifact_digest: ARTIFACT,
    content: { text: 'Remote claim.' },
    semantic_class: 'knowledge'
  });
  assert.equal(evidence.source_principal, 'agent.remote.7');
  assert.equal(evidence.source_identity_verified, false);
});

test('tool-output source evidence requires a tool/source principal and remains unverified', () => {
  assert.throws(
    () => buildObservedSemanticMemorySourceEvidence({
      owner: OWNER,
      source_class: 'tool-output',
      source_artifact_digest: ARTIFACT,
      content: { text: 'Tool result.' },
      semantic_class: 'knowledge'
    }),
    /requires source_principal/
  );
  const evidence = buildObservedSemanticMemorySourceEvidence({
    owner: OWNER,
    source_class: 'tool-output',
    source_principal: 'tool.search.local',
    source_artifact_digest: ARTIFACT,
    content: { text: 'Tool result.' },
    semantic_class: 'knowledge'
  });
  assert.equal(evidence.non_authorizing, true);
});

test('generic evidence cannot self-assert source identity or artifact authenticity', () => {
  const evidence = base();
  assert.throws(
    () => normalizeSemanticMemorySourceEvidence({
      ...evidence,
      source_identity_verified: true,
      evidence_digest: undefined
    }),
    /cannot claim verified source identity/
  );
  assert.throws(
    () => normalizeSemanticMemorySourceEvidence({
      ...evidence,
      artifact_authenticity_verified: true,
      evidence_digest: undefined
    }),
    /cannot claim verified artifact authenticity/
  );
});

test('source, artifact, content and semantic-class substitution all change source evidence identity', () => {
  const evidence = base();
  const changedArtifact = base({ source_artifact_digest: sha256('other artifact') });
  const changedContent = base({ content: { text: 'Different generated content.' } });
  const changedClass = base({ semantic_class: 'instruction-candidate' });
  const changedRuntime = base({ source_runtime_id: 'runtime.local.2' });

  for (const candidate of [changedArtifact, changedContent, changedClass, changedRuntime]) {
    assert.notEqual(candidate.evidence_digest, evidence.evidence_digest);
  }
});

test('normalized source evidence rejects digest substitution and unknown authority-looking fields', () => {
  const evidence = base();
  assert.throws(
    () => normalizeSemanticMemorySourceEvidence({
      ...evidence,
      evidence_digest: sha256('forged evidence')
    }),
    /digest does not match/
  );
  assert.throws(
    () => normalizeSemanticMemorySourceEvidence({
      ...evidence,
      evidence_digest: undefined,
      authority_tier: 'owner-memory'
    }),
    /field is unsupported/
  );
});
