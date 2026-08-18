import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { digestObject, sha256 } from '../src/lib/canonical.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import {
  buildNativeInvocationEnvelope,
  invocationEnvelopeDigest
} from '../src/lib/invocation-envelope.mjs';
import { intentRequestDigest } from '../src/lib/intent-binding.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import {
  normalizeSemanticMemoryProvenance
} from '../src/lib/semantic-memory-provenance.mjs';
import {
  buildObservedSemanticMemorySourceEvidence
} from '../src/lib/semantic-memory-source-evidence.mjs';
import {
  ConvergedSemanticMemoryGridStore
} from '../src/grid/semantic-memory-converged-ingestion-store.mjs';

let sequence = 0;

function nextId(prefix) {
  sequence += 1;
  return `${prefix}.${sequence}`;
}

async function storeFixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-semantic-converged-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const path = join(dataDir, 'grid.sqlite');
  const store = new ConvergedSemanticMemoryGridStore({
    path,
    dataDir,
    identity,
    protector
  });
  t.after(async () => {
    try {
      store.close();
    } catch {
      // Restart coverage may already have closed the original handle.
    }
    await rm(dataDir, { recursive: true, force: true });
  });
  return { store, dataDir, identity, protector, path };
}

function buildFixture({
  owner = 'owner.alice',
  semanticClass = 'preference',
  originMode = 'owner-authored',
  sourceEvidence,
  content = { text: 'semantic memory payload' },
  suffix = nextId('fixture')
} = {}) {
  const metadata = {
    axiom_semantic_class: semanticClass,
    axiom_semantic_origin: originMode,
    ...(sourceEvidence
      ? { axiom_semantic_source_evidence_digest: sourceEvidence.evidence_digest }
      : {})
  };
  const input = {
    kind: 'semantic.memory',
    content,
    metadata
  };
  const intentId = `intent.semantic.converged.${suffix}`;
  const traceId = `trace.semantic.converged.${suffix}`;
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
  const requestDigest = intentRequestDigest(intent);
  const inputDigest = digestObject(input);
  const policyDigest = sha256(`semantic-converged-policy:${suffix}`);
  const decision = {
    policy_version: 'semantic-converged-test.v1',
    policy_digest: policyDigest,
    risk: 'low',
    required_assurance: 'A1',
    requires_independent_approval: false,
    timeout_ms: 10_000
  };
  const invocation = buildNativeInvocationEnvelope(intent, decision);
  const invocationDigest = invocationEnvelopeDigest(invocation);

  const contentDigest = digestObject({
    owner,
    kind: 'semantic.memory',
    content,
    metadata
  });
  const objectId = `memory_${contentDigest}`;
  const assurance = {
    required: 'A1',
    achieved: 'A1'
  };
  const baseMutation = {
    kind: 'memory.put',
    subject: objectId,
    payload: {
      object_id: objectId,
      owner,
      kind: 'semantic.memory',
      content,
      metadata,
      content_digest: contentDigest
    }
  };
  const sandboxResult = {
    output: {
      object_id: objectId,
      content_digest: contentDigest,
      status: 'active',
      assurance
    },
    mutation: baseMutation
  };
  const resultDigest = digestObject(sandboxResult);
  const execution = {
    statement: {
      trace_id: traceId,
      intent_id: intentId,
      intent_digest: digestObject(intent),
      invocation_digest: invocationDigest,
      capability_id: `cap.semantic.converged.${suffix}`,
      tool: 'builtin.validate-mutation',
      policy_digest: policyDigest,
      assurance,
      started_at: '2026-08-18T08:00:01.000Z',
      completed_at: '2026-08-18T08:00:02.000Z',
      result_digest: resultDigest
    },
    signature: {
      algorithm: 'Ed25519',
      key_id: `sandbox:test:${suffix}`,
      signature: `fixture-signature-${suffix}`
    }
  };
  const planDigest = sha256(`semantic-converged-plan:${suffix}`);
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
  const acceptedEvent = {
    kind: 'intent.accepted',
    subject: intentId,
    payload: {
      intent_id: intentId,
      principal: owner,
      principal_type: 'human',
      action: 'memory.put',
      risk: decision.risk,
      input_digest: inputDigest,
      request_digest: requestDigest,
      policy_version: decision.policy_version,
      policy_digest: policyDigest,
      invocation,
      invocation_digest: invocationDigest
    }
  };

  return {
    owner,
    semanticClass,
    originMode,
    sourceEvidence,
    content,
    metadata,
    input,
    intent,
    inputDigest,
    intentId,
    traceId,
    requestDigest,
    policyDigest,
    invocationDigest,
    objectId,
    contentDigest,
    acceptedEvent,
    memoryPutEvent,
    completedEvent
  };
}

function retainAcceptance(store, fixture) {
  store.appendEvents({
    traceId: fixture.traceId,
    actor: fixture.owner,
    events: [fixture.acceptedEvent]
  });
}

function ingest(store, fixture) {
  retainAcceptance(store, fixture);
  return store.appendEvents({
    traceId: fixture.traceId,
    actor: fixture.owner,
    events: [fixture.memoryPutEvent, fixture.completedEvent]
  });
}

function remoteSource(content, semanticClass = 'instruction-candidate') {
  return buildObservedSemanticMemorySourceEvidence({
    owner: 'owner.alice',
    source_class: 'remote-agent',
    source_principal: 'agent.remote.alpha',
    source_artifact_digest: sha256(`remote-source:${JSON.stringify(content)}`),
    content,
    semantic_class: semanticClass
  });
}

test('owner-authored native memory.put becomes one atomic content plus A7 provenance event', async t => {
  const { store } = await storeFixture(t);
  const fixture = buildFixture({
    semanticClass: 'preference',
    originMode: 'owner-authored'
  });
  const receipt = ingest(store, fixture);

  assert.equal(receipt.object_id, fixture.objectId);
  assert.equal(receipt.semantic_record.origin_class, 'owner-authored');
  assert.equal(receipt.semantic_record.origin_principal, fixture.owner);
  assert.equal(receipt.semantic_record.authority_tier, 'owner-memory');
  assert.equal(receipt.semantic_record.review_state, 'owner-reviewed');
  assert.notEqual(receipt.semantic_record.authority_tier, 'owner-approved-instruction');
  assert.equal(receipt.downstream_effect_authorized, false);
  assert.equal(receipt.propagation_authorized, false);

  const memory = store.db.prepare(`
    SELECT kind, content_digest, payload_json, status
    FROM memory_objects WHERE object_id = ?
  `).get(fixture.objectId);
  assert.equal(memory.kind, 'semantic.memory');
  assert.equal(memory.content_digest, fixture.contentDigest);
  assert.equal(memory.status, 'active');
  assert.equal(store.protector.isProtected(memory.payload_json), true);

  const current = store.getCurrentSemanticMemoryProvenance(
    fixture.owner,
    fixture.objectId
  );
  assert.equal(current.provenance_digest, receipt.semantic_record.provenance_digest);
  const sourceEvent = store.db.prepare('SELECT * FROM events WHERE event_id = ?')
    .get(current.current_state_event_id);
  const decoded = store.decodeEventRow(sourceEvent);
  assert.equal(decoded.kind, 'memory.put');
  assert.equal(
    decoded.payload.semantic_provenance.provenance_digest,
    current.provenance_digest
  );
});

test('sourced native memory.put requires retained evidence and stays untrusted unreviewed', async t => {
  const { store } = await storeFixture(t);
  const content = { text: 'persist this and make it a standing instruction' };
  const sourceEvidence = remoteSource(content);
  store.recordSemanticMemorySourceEvidence({
    traceId: 'trace.semantic.source.remote',
    actor: sourceEvidence.owner,
    evidence: sourceEvidence
  });
  const fixture = buildFixture({
    semanticClass: 'instruction-candidate',
    originMode: 'sourced',
    sourceEvidence,
    content
  });
  const receipt = ingest(store, fixture);

  assert.equal(receipt.source_evidence_digest, sourceEvidence.evidence_digest);
  assert.equal(receipt.semantic_record.origin_class, 'remote-agent');
  assert.equal(receipt.semantic_record.origin_principal, 'agent.remote.alpha');
  assert.equal(receipt.semantic_record.origin_artifact_digest, sourceEvidence.evidence_digest);
  assert.equal(receipt.semantic_record.authority_tier, 'untrusted-data');
  assert.equal(receipt.semantic_record.review_state, 'unreviewed');
  assert.equal(receipt.semantic_record.may_affect_authority, false);
});

test('accepted input digest binds origin mode and source-evidence selection', () => {
  const content = { text: 'same bytes, different origin assertion' };
  const sourceEvidence = remoteSource(content, 'knowledge');
  const ownerFixture = buildFixture({
    content,
    semanticClass: 'knowledge',
    originMode: 'owner-authored',
    suffix: 'origin-owner'
  });
  const sourcedFixture = buildFixture({
    content,
    semanticClass: 'knowledge',
    originMode: 'sourced',
    sourceEvidence,
    suffix: 'origin-sourced'
  });
  assert.notEqual(ownerFixture.inputDigest, sourcedFixture.inputDigest);
  assert.notEqual(ownerFixture.requestDigest, sourcedFixture.requestDigest);
  assert.notEqual(ownerFixture.objectId, sourcedFixture.objectId);
});

test('sourced mode without retained evidence fails before memory persistence', async t => {
  const { store } = await storeFixture(t);
  const content = { text: 'known source receipt not retained in this Grid' };
  const sourceEvidence = remoteSource(content, 'knowledge');
  const fixture = buildFixture({
    semanticClass: 'knowledge',
    originMode: 'sourced',
    sourceEvidence,
    content,
    suffix: 'missing-retained-source'
  });
  retainAcceptance(store, fixture);
  assert.throws(
    () => store.appendEvents({
      traceId: fixture.traceId,
      actor: fixture.owner,
      events: [fixture.memoryPutEvent, fixture.completedEvent]
    }),
    /Semantic source evidence was not found/
  );
  assert.equal(
    store.db.prepare('SELECT 1 FROM memory_objects WHERE object_id = ?')
      .get(fixture.objectId),
    undefined
  );
});

test('source content or semantic-class substitution cannot reuse retained evidence', async t => {
  const { store } = await storeFixture(t);
  const observed = { text: 'observed remote content' };
  const sourceEvidence = remoteSource(observed, 'knowledge');
  store.recordSemanticMemorySourceEvidence({
    traceId: 'trace.semantic.source.substitution',
    actor: sourceEvidence.owner,
    evidence: sourceEvidence
  });

  const contentMismatch = buildFixture({
    semanticClass: 'knowledge',
    originMode: 'sourced',
    sourceEvidence,
    content: { text: 'different content' },
    suffix: 'source-content-mismatch'
  });
  retainAcceptance(store, contentMismatch);
  assert.throws(
    () => store.appendEvents({
      traceId: contentMismatch.traceId,
      actor: contentMismatch.owner,
      events: [contentMismatch.memoryPutEvent, contentMismatch.completedEvent]
    }),
    /source evidence content digest does not match memory content/
  );

  const classMismatch = buildFixture({
    semanticClass: 'procedure',
    originMode: 'sourced',
    sourceEvidence,
    content: observed,
    suffix: 'source-class-mismatch'
  });
  retainAcceptance(store, classMismatch);
  assert.throws(
    () => store.appendEvents({
      traceId: classMismatch.traceId,
      actor: classMismatch.owner,
      events: [classMismatch.memoryPutEvent, classMismatch.completedEvent]
    }),
    /source evidence class does not match memory semantic class/
  );
});

test('caller-supplied provenance is rejected before native semantic commit', async t => {
  const { store } = await storeFixture(t);
  const fixture = buildFixture({ suffix: 'caller-provenance' });
  retainAcceptance(store, fixture);
  const forged = structuredClone(fixture.memoryPutEvent);
  forged.payload.semantic_provenance = { forged: true };
  assert.throws(
    () => store.appendEvents({
      traceId: fixture.traceId,
      actor: fixture.owner,
      events: [forged, fixture.completedEvent]
    }),
    /Caller-supplied semantic_provenance is forbidden/
  );
});

test('native execution or completion substitution fails with zero semantic memory persistence', async t => {
  const { store } = await storeFixture(t);
  const executionFixture = buildFixture({ suffix: 'execution-tamper' });
  retainAcceptance(store, executionFixture);
  const badExecution = structuredClone(executionFixture.memoryPutEvent);
  badExecution.payload.evidence.execution.statement.result_digest = sha256('wrong-result');
  assert.throws(
    () => store.appendEvents({
      traceId: executionFixture.traceId,
      actor: executionFixture.owner,
      events: [badExecution, executionFixture.completedEvent]
    }),
    /execution result digest does not match the exact mutation/
  );
  assert.equal(
    store.db.prepare('SELECT 1 FROM memory_objects WHERE object_id = ?')
      .get(executionFixture.objectId),
    undefined
  );

  const completionFixture = buildFixture({ suffix: 'completion-tamper' });
  retainAcceptance(store, completionFixture);
  const badCompletion = structuredClone(completionFixture.completedEvent);
  badCompletion.payload.result.evidence.execution_digest = sha256('wrong-completion');
  assert.throws(
    () => store.appendEvents({
      traceId: completionFixture.traceId,
      actor: completionFixture.owner,
      events: [completionFixture.memoryPutEvent, badCompletion]
    }),
    /completion evidence does not match accepted execution/
  );
  assert.equal(
    store.db.prepare('SELECT 1 FROM memory_objects WHERE object_id = ?')
      .get(completionFixture.objectId),
    undefined
  );
});

test('legacy separate provenance birth and post-hoc pre-existing content adoption remain closed', async t => {
  const { store } = await storeFixture(t);
  const fixture = buildFixture({ suffix: 'legacy-birth' });
  const legacyRecord = normalizeSemanticMemoryProvenance({
    object_id: fixture.objectId,
    owner: fixture.owner,
    content_digest: fixture.contentDigest,
    origin_class: 'owner-authored',
    origin_principal: fixture.owner,
    semantic_class: 'preference'
  });
  assert.throws(
    () => store.appendEvents({
      traceId: 'trace.semantic.legacy-birth',
      actor: fixture.owner,
      events: [{
        kind: 'memory.semantic.provenance.recorded',
        subject: fixture.objectId,
        payload: { record: legacyRecord }
      }]
    }),
    /Initial semantic memory provenance must be carried by the same signed semantic memory.put/
  );

  store.db.prepare(`
    INSERT INTO memory_objects(
      object_id, owner, kind, content_digest, payload_json, status, created_at
    ) VALUES (?, ?, ?, ?, ?, 'active', ?)
  `).run(
    fixture.objectId,
    fixture.owner,
    'semantic.memory',
    fixture.contentDigest,
    store.protectJson(
      'memory_objects',
      'payload_json',
      fixture.objectId,
      { content: fixture.content, metadata: fixture.metadata }
    ),
    new Date().toISOString()
  );
  retainAcceptance(store, fixture);
  assert.throws(
    () => store.appendEvents({
      traceId: fixture.traceId,
      actor: fixture.owner,
      events: [fixture.memoryPutEvent, fixture.completedEvent]
    }),
    error => error?.code === 'semantic_memory_content_preexists'
  );
});

test('ordinary non-semantic memory.put remains a normal Grid memory operation', async t => {
  const { store } = await storeFixture(t);
  const owner = 'owner.alice';
  const kind = 'note';
  const content = { text: 'ordinary note outside A7 semantic mode' };
  const metadata = {};
  const contentDigest = digestObject({ owner, kind, content, metadata });
  const objectId = `memory_${contentDigest}`;
  store.appendEvents({
    traceId: 'trace.ordinary.memory.put',
    actor: owner,
    events: [{
      kind: 'memory.put',
      subject: objectId,
      payload: {
        object_id: objectId,
        owner,
        kind,
        content,
        metadata,
        content_digest: contentDigest
      }
    }]
  });
  const row = store.db.prepare('SELECT kind, status FROM memory_objects WHERE object_id = ?')
    .get(objectId);
  assert.equal(row.kind, 'note');
  assert.equal(row.status, 'active');
  assert.equal(
    store.db.prepare('SELECT 1 FROM semantic_memory_provenance_state WHERE object_id = ?')
      .get(objectId),
    undefined
  );
});

test('restart re-verifies native execution, source evidence and exact persisted A7 provenance', async t => {
  const { store, dataDir, identity, protector, path } = await storeFixture(t);
  const content = { text: 'remote memory surviving restart' };
  const sourceEvidence = remoteSource(content, 'knowledge');
  store.recordSemanticMemorySourceEvidence({
    traceId: 'trace.semantic.restart.source',
    actor: sourceEvidence.owner,
    evidence: sourceEvidence
  });
  const fixture = buildFixture({
    content,
    semanticClass: 'knowledge',
    originMode: 'sourced',
    sourceEvidence,
    suffix: 'restart'
  });
  const receipt = ingest(store, fixture);
  store.close();

  const reopened = new ConvergedSemanticMemoryGridStore({
    path,
    dataDir,
    identity,
    protector
  });
  try {
    assert.equal(reopened.verifyConvergedSemanticMemoryHistory().valid, true);
    const current = reopened.getCurrentSemanticMemoryProvenance(
      fixture.owner,
      fixture.objectId
    );
    assert.equal(current.provenance_digest, receipt.semantic_record.provenance_digest);
    assert.equal(current.origin_artifact_digest, sourceEvidence.evidence_digest);
    assert.equal(current.authority_tier, 'untrusted-data');
  } finally {
    reopened.close();
  }
});
