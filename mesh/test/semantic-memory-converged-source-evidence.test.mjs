import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { sha256 } from '../src/lib/canonical.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import {
  normalizeSemanticMemoryOriginMetadata
} from '../src/lib/semantic-memory-origin-mode.mjs';
import {
  buildObservedSemanticMemorySourceEvidence,
  normalizeSemanticMemorySourceEvidence
} from '../src/lib/semantic-memory-source-evidence.mjs';
import { ConvergedSemanticMemoryGridStore } from '../src/grid/semantic-memory-converged-ingestion-store.mjs';

async function storeFixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-semantic-converged-source-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const store = new ConvergedSemanticMemoryGridStore({
    path: join(dataDir, 'grid.sqlite'),
    dataDir,
    identity,
    protector
  });
  t.after(async () => {
    store.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  return store;
}

function sourceEvidence(content = { text: 'remote semantic payload' }) {
  return buildObservedSemanticMemorySourceEvidence({
    owner: 'owner.alice',
    source_class: 'remote-agent',
    source_principal: 'agent.remote.alpha',
    source_artifact_digest: sha256('remote-agent-receipt'),
    content,
    semantic_class: 'instruction-candidate'
  });
}

test('generic source evidence remains owner-observed and explicitly non-authenticating', () => {
  const evidence = sourceEvidence();
  assert.equal(evidence.evidence_basis, 'owner-observed-artifact');
  assert.equal(evidence.source_identity_verified, false);
  assert.equal(evidence.artifact_authenticity_verified, false);
  assert.equal(evidence.non_authorizing, true);

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

test('retained source evidence is signed, owner-bound and exact-replay idempotent', async t => {
  const store = await storeFixture(t);
  const evidence = sourceEvidence();
  const input = {
    traceId: 'trace.semantic.source.1',
    actor: evidence.owner,
    evidence
  };
  const first = store.recordSemanticMemorySourceEvidence(input);
  const replay = store.recordSemanticMemorySourceEvidence(input);

  assert.equal(first.exact_replay, false);
  assert.equal(replay.exact_replay, true);
  assert.equal(first.evidence.evidence_digest, replay.evidence.evidence_digest);
  assert.equal(first.downstream_effect_authorized, false);
  assert.equal(store.getSemanticMemorySourceEvidence(
    evidence.owner,
    evidence.evidence_digest
  ).evidence.evidence_digest, evidence.evidence_digest);
});

test('bare source-evidence event cannot bypass the dedicated retention path', async t => {
  const store = await storeFixture(t);
  const evidence = sourceEvidence();
  assert.throws(
    () => store.appendEvents({
      traceId: 'trace.semantic.source.bare',
      actor: evidence.owner,
      events: [{
        kind: 'memory.semantic.source.observed',
        subject: evidence.evidence_digest,
        payload: { evidence }
      }]
    }),
    /Bare semantic source evidence append is denied/
  );
});

test('origin mode is explicit and cannot silently collapse sourced content into owner-authored memory', () => {
  const evidence = sourceEvidence();
  assert.deepEqual(
    normalizeSemanticMemoryOriginMetadata({
      axiom_semantic_origin: 'sourced',
      axiom_semantic_source_evidence_digest: evidence.evidence_digest
    }),
    {
      origin_mode: 'sourced',
      source_evidence_digest: evidence.evidence_digest
    }
  );
  assert.deepEqual(
    normalizeSemanticMemoryOriginMetadata({
      axiom_semantic_origin: 'owner-authored'
    }),
    { origin_mode: 'owner-authored' }
  );
  assert.throws(
    () => normalizeSemanticMemoryOriginMetadata({
      axiom_semantic_origin: 'sourced'
    }),
    /requires retained source evidence/
  );
  assert.throws(
    () => normalizeSemanticMemoryOriginMetadata({
      axiom_semantic_origin: 'owner-authored',
      axiom_semantic_source_evidence_digest: evidence.evidence_digest
    }),
    /cannot carry sourced evidence/
  );
});

test('converged source status keeps source authenticity and production selection false', async t => {
  const store = await storeFixture(t);
  const status = store.getStatus();
  assert.equal(status.semantic_memory_source_evidence.source_identity_verified, false);
  assert.equal(status.semantic_memory_source_evidence.artifact_authenticity_verified, false);
  assert.equal(status.semantic_memory_source_evidence.non_authorizing, true);
  assert.equal(status.semantic_memory_source_evidence.production_store_selected, false);

  const converged = status.converged_semantic_memory_ingestion;
  assert.equal(converged.activation_state, 'opt-in-local-laboratory');
  assert.equal(converged.accepted_action, 'memory.put');
  assert.equal(converged.explicit_origin_mode_required, true);
  assert.equal(converged.native_invocation_binding, true);
  assert.equal(converged.hypervisor_verified_execution_binding, true);
  assert.equal(converged.atomic_content_provenance_binding, true);
  assert.equal(converged.caller_supplied_provenance_allowed, false);
  assert.equal(converged.production_store_selected, false);
  assert.equal(converged.downstream_effect_authority, false);
  assert.equal(converged.propagation_authority, false);
});
