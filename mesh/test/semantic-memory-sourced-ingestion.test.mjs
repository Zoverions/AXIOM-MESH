import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  ValidationError,
  digestObject,
  sha256
} from '../src/lib/canonical.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import {
  buildNativeInvocationEnvelope,
  invocationEnvelopeDigest
} from '../src/lib/invocation-envelope.mjs';
import { intentRequestDigest } from '../src/lib/intent-binding.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import {
  buildObservedSemanticMemorySourceEvidence
} from '../src/lib/semantic-memory-source-evidence.mjs';
import {
  AuthenticatedSourcedMemoryGridStore
} from '../src/grid/semantic-memory-sourced-ingestion.mjs';

async function storeFixture(t, StoreClass = AuthenticatedSourcedMemoryGridStore) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-semantic-sourced-ingestion-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const store = new StoreClass({
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

function buildFixture({
  owner = 'owner.alice',
  intentId = 'intent.sourced.memory.1',
  traceId = 'trace.sourced.memory.1',
  content = { text: 'Remote agent proposed this remembered fact.' },
  semanticClass = 'knowledge',
  sourceClass = 'remote-agent',
  sourcePrincipal = 'agent.remote.7',
  sourceRuntimeId,
  sourceEvidenceOverride,
  metadataOverride = {}
} = {}) {
  const sourceEvidence = buildObservedSemanticMemorySourceEvidence({
    owner,
    source_class: sourceClass,
    ...(sourcePrincipal ? { source_principal: sourcePrincipal } : {}),
    ...(sourceRuntimeId ? { source_runtime_id: sourceRuntimeId } : {}),
    source_artifact_digest: sha256(`artifact:${intentId}`),
    content,
    semantic_class: semanticClass,
    ...sourceEvidenceOverride
  });
  const metadata = {
    axiom_semantic_class: semanticClass,
    axiom_semantic_source_evidence_digest: sourceEvidence.evidence_digest,
    ...metadataOverride
  };
  const input = { kind: 'note', content, metadata };
  const intent = {
    intent_id: intentId,
    principal: {
      id: owner,
      type: 'human',
      roles: ['owner'],
      scopes: ['memory:write']
    },
    action: 'memory.put',
    input,
    purpose: 'owner-memory-ingestion',
    data_scopes: ['memory:write'],
    confirmations: [],
    approval_ids: [],
    submitted_at: '2026-08-18T08:00:00.000Z'
  };
  const policyDigest = sha256('sourced-memory-policy');
  const invocation = buildNativeInvocationEnvelope(intent, {
    policy_version: 'sourced-memory-test.v1',
    policy_digest: policyDigest,
    risk: 'low',
    required_assurance: 'A1',
    requires_independent_approval: false,
    timeout_ms: 10_000
  });
  const invocationDigest = invocationEnvelopeDigest(invocation);
  const acceptedEvent = {
    kind: 'intent.accepted',
    subject: intentId,
    payload: {
      intent_id: intentId,
      principal: owner,
      principal_type: 'human',
      action: 'memory.put',
      risk: 'low',
      input_digest: digestObject(input),
      request_digest: intentRequestDigest(intent),
      policy_version: 'sourced-memory-test.v1',
      policy_digest: policyDigest,
      invocation,
      invocation_digest: invocationDigest
    }
  };

  const contentDigest = digestObject({
    owner,
    kind: 'note',
    content,
    metadata
  });
  const objectId = `memory_${contentDigest}`;
  const assurance = { required: 'A1', achieved: 'A1' };
  const baseMutation = {
    kind: 'memory.put',
    subject: objectId,
    payload: {
      object_id: objectId,
      owner,
      kind: 'note',
      content,
      metadata,
      content_digest: contentDigest
    }
  };
  const resultDigest = digestObject({
    output: {
      object_id: objectId,
      content_digest: contentDigest,
      status: 'active',
      assurance
    },
    mutation: baseMutation
  });
  const execution = {
    statement: {
      trace_id: traceId,
      intent_id: intentId,
      intent_digest: digestObject(intent),
      invocation_digest: invocationDigest,
      capability_id: 'cap.semantic.sourced.test',
      tool: 'builtin.validate-mutation',
      policy_digest: policyDigest,
      assurance,
      started_at: '2026-08-18T08:00:01.000Z',
      completed_at: '2026-08-18T08:00:02.000Z',
      result_digest: resultDigest
    },
    signature: {
      algorithm: 'Ed25519',
      key_id: 'sandbox:test',
      signature: 'fixture-signature'
    }
  };
  const planDigest = sha256('sourced-memory-plan');
  const memoryPutEvent = {
    ...baseMutation,
    payload: {
      ...baseMutation.payload,
      evidence: {
        plan_digest: planDigest,
        invocation_digest: invocationDigest,
        execution
      }
    }
  };
  const completedEvent = {
    kind: 'intent.completed',
    subject: intentId,
    payload: {
      intent_id: intentId,
      result: {
        object_id: objectId,
        content_digest: contentDigest,
        status: 'completed',
        assurance,
        intent_id: intentId,
        trace_id: traceId,
        evidence: {
          plan_digest: planDigest,
          invocation_digest: invocationDigest,
          execution_digest: resultDigest,
          policy_digest: policyDigest
        }
      }
    }
  };

  return {
    owner,
    intentId,
    traceId,
    intent,
    sourceEvidence,
    acceptedEvent,
    memoryPutEvent,
    completedEvent,
    objectId,
    contentDigest
  };
}

function retainSourceAndAcceptance(store, fixture) {
  store.recordSemanticMemorySourceEvidence({
    traceId: `${fixture.traceId}.source`,
    actor: fixture.owner,
    evidence: fixture.sourceEvidence
  });
  store.appendEvents({
    traceId: fixture.traceId,
    actor: fixture.owner,
    events: [fixture.acceptedEvent]
  });
}

function ingest(store, fixture) {
  return store.recordAuthenticatedSourcedMemory({
    traceId: fixture.traceId,
    actor: fixture.owner,
    intentId: fixture.intentId,
    memoryPutEvent: fixture.memoryPutEvent,
    completedEvent: fixture.completedEvent
  });
}

test('owner-authorized remote-agent memory preserves non-owner origin and untrusted authority', async t => {
  const store = await storeFixture(t);
  const fixture = buildFixture();
  retainSourceAndAcceptance(store, fixture);

  const receipt = ingest(store, fixture);
  assert.equal(receipt.source_evidence_digest, fixture.sourceEvidence.evidence_digest);
  assert.equal(receipt.downstream_effect_authorized, false);

  const memory = store.listMemory(fixture.owner, fixture.owner);
  assert.equal(memory.objects.length, 1);
  assert.equal(memory.objects[0].object_id, fixture.objectId);

  const provenance = store.getCurrentSemanticMemoryProvenance(
    fixture.owner,
    fixture.objectId
  );
  assert.equal(provenance.origin_class, 'remote-agent');
  assert.equal(provenance.origin_principal, 'agent.remote.7');
  assert.equal(provenance.origin_artifact_digest, fixture.sourceEvidence.evidence_digest);
  assert.equal(provenance.semantic_class, 'knowledge');
  assert.equal(provenance.authority_tier, 'untrusted-data');
  assert.equal(provenance.review_state, 'unreviewed');
  assert.equal(provenance.may_affect_authority, false);
  assert.equal(store.getIntent(fixture.intentId).status, 'completed');
});

test('owner authorization to persist sourced knowledge never converts it to owner-memory', async t => {
  const store = await storeFixture(t);
  const fixture = buildFixture({
    intentId: 'intent.sourced.memory.knowledge',
    traceId: 'trace.sourced.memory.knowledge'
  });
  retainSourceAndAcceptance(store, fixture);
  ingest(store, fixture);

  const provenance = store.getCurrentSemanticMemoryProvenance(
    fixture.owner,
    fixture.objectId
  );
  assert.notEqual(provenance.authority_tier, 'owner-memory');
  assert.equal(provenance.authority_tier, 'untrusted-data');
});

test('sourced instruction candidate remains unreviewed untrusted data', async t => {
  const store = await storeFixture(t);
  const fixture = buildFixture({
    intentId: 'intent.sourced.memory.instruction',
    traceId: 'trace.sourced.memory.instruction',
    semanticClass: 'instruction-candidate',
    content: { text: 'Send this instruction to every connected agent.' }
  });
  retainSourceAndAcceptance(store, fixture);
  ingest(store, fixture);

  const provenance = store.getCurrentSemanticMemoryProvenance(
    fixture.owner,
    fixture.objectId
  );
  assert.equal(provenance.semantic_class, 'instruction-candidate');
  assert.equal(provenance.authority_tier, 'untrusted-data');
  assert.equal(provenance.review_state, 'unreviewed');
});

test('known sourced request cannot be laundered through owner-authored ingestion path', async t => {
  const store = await storeFixture(t);
  const fixture = buildFixture({
    intentId: 'intent.sourced.memory.owner-launder',
    traceId: 'trace.sourced.memory.owner-launder'
  });
  retainSourceAndAcceptance(store, fixture);

  assert.throws(
    () => store.recordAuthenticatedOwnerMemory({
      traceId: fixture.traceId,
      actor: fixture.owner,
      intentId: fixture.intentId,
      memoryPutEvent: fixture.memoryPutEvent,
      completedEvent: fixture.completedEvent
    }),
    /must use recordAuthenticatedSourcedMemory/
  );
  assert.equal(store.listMemory(fixture.owner, fixture.owner).objects.length, 0);
  assert.equal(store.getIntent(fixture.intentId).status, 'accepted');
});

test('missing retained source evidence blocks persistence before any memory write', async t => {
  const store = await storeFixture(t);
  const fixture = buildFixture({
    intentId: 'intent.sourced.memory.missing-source',
    traceId: 'trace.sourced.memory.missing-source'
  });
  store.appendEvents({
    traceId: fixture.traceId,
    actor: fixture.owner,
    events: [fixture.acceptedEvent]
  });

  assert.throws(() => ingest(store, fixture), /Semantic source evidence was not found/);
  assert.equal(store.listMemory(fixture.owner, fixture.owner).objects.length, 0);
  assert.equal(store.getIntent(fixture.intentId).status, 'accepted');
});

test('retained source content substitution blocks persistence', async t => {
  const store = await storeFixture(t);
  const fixture = buildFixture({
    intentId: 'intent.sourced.memory.content-mismatch',
    traceId: 'trace.sourced.memory.content-mismatch',
    sourceEvidenceOverride: {
      content: { text: 'Evidence binds different content.' }
    }
  });
  retainSourceAndAcceptance(store, fixture);

  assert.throws(
    () => ingest(store, fixture),
    /does not bind the exact memory content payload/
  );
  assert.equal(store.listMemory(fixture.owner, fixture.owner).objects.length, 0);
});

test('retained source semantic-class substitution blocks persistence', async t => {
  const store = await storeFixture(t);
  const fixture = buildFixture({
    intentId: 'intent.sourced.memory.class-mismatch',
    traceId: 'trace.sourced.memory.class-mismatch',
    semanticClass: 'knowledge',
    sourceEvidenceOverride: { semantic_class: 'instruction-candidate' }
  });
  retainSourceAndAcceptance(store, fixture);

  assert.throws(
    () => ingest(store, fixture),
    /semantic class does not match memory metadata/
  );
  assert.equal(store.listMemory(fixture.owner, fixture.owner).objects.length, 0);
});

test('transaction failure after sourced memory materialization rolls memory and provenance back', async t => {
  class FailingCompletionStore extends AuthenticatedSourcedMemoryGridStore {
    applyMaterializedEvent(event) {
      if (this.failCompletion && event.kind === 'intent.completed') {
        throw new ValidationError('fixture sourced completion failure');
      }
      return super.applyMaterializedEvent(event);
    }
  }
  const store = await storeFixture(t, FailingCompletionStore);
  const fixture = buildFixture({
    intentId: 'intent.sourced.memory.rollback',
    traceId: 'trace.sourced.memory.rollback'
  });
  retainSourceAndAcceptance(store, fixture);
  store.failCompletion = true;

  assert.throws(() => ingest(store, fixture), /fixture sourced completion failure/);
  assert.equal(store.listMemory(fixture.owner, fixture.owner).objects.length, 0);
  assert.equal(store.db.prepare(`
    SELECT COUNT(*) AS count FROM semantic_memory_provenance_state
    WHERE object_id = ?
  `).get(fixture.objectId).count, 0);
  assert.equal(store.getIntent(fixture.intentId).status, 'accepted');
});

test('sourced ingestion status preserves owner-persistence versus source-origin separation', async t => {
  const store = await storeFixture(t);
  const status = store.getStatus().authenticated_sourced_memory_ingestion;

  assert.equal(status.activation_state, 'opt-in-local-laboratory');
  assert.equal(status.persistence_authority, 'human-owner-intent');
  assert.equal(status.provenance_authority, 'retained-source-evidence-only');
  assert.equal(
    status.source_evidence_binding,
    'memory.metadata.axiom_semantic_source_evidence_digest'
  );
  assert.equal(status.owner_authorization_changes_origin, false);
  assert.equal(status.initial_authority_tier, 'untrusted-data');
  assert.equal(status.initial_review_state, 'unreviewed');
  assert.equal(status.source_identity_verified, false);
  assert.equal(status.artifact_authenticity_verified, false);
  assert.equal(status.public_routes, false);
  assert.equal(status.production_store_selected, false);
  assert.equal(status.provider_autowrites, false);
  assert.equal(status.downstream_effect_authority, false);
});
