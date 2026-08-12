import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { sha256 } from '../src/lib/canonical.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import {
  SOURCE_CONTENT_ADDRESS_PROFILE,
  SOURCE_STATE_SCHEMA,
  SOURCE_TRANSITION_SCHEMA,
  normalizeSourceState,
  normalizeSourceTransition
} from '../src/lib/source-continuity.mjs';
import {
  SOURCE_STATE_RECORDED_EVENT,
  SOURCE_TRANSITION_ACCEPTED_EVENT,
  SourceContinuityGridStore
} from '../src/grid/source-continuity-store.mjs';

const oid = value => sha256(value).slice(0, 40);

function stateFixture() {
  return normalizeSourceState({
    schema: SOURCE_STATE_SCHEMA,
    repository_id: 'axiom-mesh',
    vcs: 'git',
    object_format: 'sha1',
    commit_oid: oid('forgery-commit'),
    tree_oid: oid('forgery-tree'),
    source_manifest_digest: sha256('forgery-manifest'),
    build: {
      kernel_version: '0.12.0-dev.3',
      capability_registry_digest: sha256('forgery-registry'),
      capability_evidence_digest: sha256('forgery-evidence'),
      release_boundary_digest: sha256('forgery-release')
    },
    content_address_profile: SOURCE_CONTENT_ADDRESS_PROFILE
  });
}

test('a generic Grid append cannot forge accepted source lineage', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-source-forgery-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const store = new SourceContinuityGridStore({
    path: join(dataDir, 'grid.sqlite'),
    dataDir,
    identity,
    protector
  });
  t.after(async () => {
    store.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  const state = stateFixture();
  const transition = normalizeSourceTransition({
    schema: SOURCE_TRANSITION_SCHEMA,
    repository_id: state.repository_id,
    parent_state_digest: null,
    child_state_digest: state.state_digest,
    transition_type: 'genesis',
    sequence: 0,
    authority_digest: sha256('forged-authority'),
    evidence_digest: sha256('forged-evidence'),
    accepted_at: new Date().toISOString(),
    content_address_profile: SOURCE_CONTENT_ADDRESS_PROFILE
  });

  store.appendEvents({
    traceId: 'trace:forged-source-state',
    actor: 'service:untrusted-recorder',
    events: [{
      kind: SOURCE_STATE_RECORDED_EVENT,
      subject: state.state_id,
      payload: { state }
    }]
  });
  store.appendEvents({
    traceId: 'trace:forged-source-acceptance',
    actor: 'service:untrusted-recorder',
    events: [{
      kind: SOURCE_TRANSITION_ACCEPTED_EVENT,
      subject: transition.transition_id,
      payload: {
        transition,
        governance_proposal_id: 'proposal:invented',
        governance_decision_digest: sha256('invented-decision'),
        governance_verification_digest: sha256('invented-verification')
      }
    }]
  });

  assert.equal(store.verifyChain().valid, true);
  assert.throws(
    () => store.getSourceContinuity('axiom-mesh'),
    /governance decision is not verified/
  );
});
