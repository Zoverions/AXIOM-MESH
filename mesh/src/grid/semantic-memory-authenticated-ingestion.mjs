import {
  AxiomError,
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject
} from '../lib/canonical.mjs';
import {
  invocationEnvelopeDigest,
  validateInvocationEnvelope
} from '../lib/invocation-envelope.mjs';
import { normalizeSemanticMemoryProvenance } from '../lib/semantic-memory-provenance.mjs';
import {
  SEMANTIC_MEMORY_STATE_EVENT,
  SemanticMemoryStateGridStore
} from './semantic-memory-state-store.mjs';

export const AUTHENTICATED_SEMANTIC_MEMORY_INGESTION_SCHEMA =
  'axiom-semantic-memory-authenticated-ingestion.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const MEMORY_KIND = /^[a-z][a-z0-9.-]+$/;

export class AuthenticatedSemanticMemoryGridStore extends SemanticMemoryStateGridStore {
  getStatus() {
    return {
      ...super.getStatus(),
      authenticated_semantic_memory_ingestion: Object.freeze({
        schema: AUTHENTICATED_SEMANTIC_MEMORY_INGESTION_SCHEMA,
        activation_state: 'opt-in-local-laboratory',
        accepted_action: 'memory.put',
        accepted_principal_type: 'human',
        provenance_origin: 'owner-authored',
        atomic_memory_and_provenance: true,
        exact_invocation_binding: true,
        exact_mutation_completion_binding: true,
        public_routes: false,
        production_store_selected: false,
        provider_autowrites: false,
        legacy_memory_promotion: false,
        downstream_effect_authority: false
      })
    };
  }

  recordAuthenticatedOwnerMemory({
    traceId,
    actor,
    intentId,
    memoryPutEvent,
    completedEvent,
    semanticClass = 'knowledge'
  }) {
    const trace = assertString(traceId, 'semantic ingestion traceId', {
      max: 160,
      pattern: ID
    });
    const owner = assertString(actor, 'semantic ingestion actor', {
      max: 160,
      pattern: ID
    });
    const intent = assertString(intentId, 'semantic ingestion intentId', {
      max: 160,
      pattern: ID
    });

    const accepted = verifyAcceptedOwnerMemoryIntent(this, {
      traceId: trace,
      actor: owner,
      intentId: intent
    });
    const memory = normalizeBoundMemoryPut(memoryPutEvent, {
      traceId: trace,
      actor: owner,
      intentId: intent,
      accepted
    });
    const completion = normalizeBoundMemoryCompletion(completedEvent, {
      traceId: trace,
      actor: owner,
      intentId: intent,
      accepted,
      memory
    });

    const semanticRecord = normalizeSemanticMemoryProvenance({
      object_id: memory.payload.object_id,
      owner,
      content_digest: memory.payload.content_digest,
      origin_class: 'owner-authored',
      origin_principal: owner,
      origin_artifact_digest: digestObject(memory.payload.evidence.execution),
      semantic_class: semanticClass,
      ingestion_intent_id: intent,
      request_digest: accepted.payload.request_digest,
      may_affect_authority: false
    });

    const appended = super.appendEvents({
      traceId: trace,
      actor: owner,
      events: [
        memory.event,
        {
          kind: SEMANTIC_MEMORY_STATE_EVENT,
          subject: semanticRecord.object_id,
          payload: { record: semanticRecord }
        },
        completion.event
      ]
    });

    return Object.freeze({
      schema: AUTHENTICATED_SEMANTIC_MEMORY_INGESTION_SCHEMA,
      object_id: semanticRecord.object_id,
      content_digest: semanticRecord.content_digest,
      semantic_record: semanticRecord,
      event_ids: Object.freeze(appended.map(event => event.event_id)),
      downstream_effect_authorized: false
    });
  }
}

export function verifyAcceptedOwnerMemoryIntent(store, {
  traceId,
  actor,
  intentId
}) {
  requireGridStore(store);
  store.requireIntentEvidenceChain();

  const rows = store.db.prepare(`
    SELECT * FROM events
    WHERE kind = 'intent.accepted' AND subject = ?
    ORDER BY seq
  `).all(intentId);
  if (rows.length !== 1) {
    throw new AxiomError(
      'semantic_memory_ingestion_acceptance_missing',
      'Authenticated semantic ingestion requires exactly one accepted intent event',
      409
    );
  }
  const accepted = store.decodeEventRow(rows[0]);
  const payload = assertPlainObject(accepted.payload, 'accepted memory intent payload');
  if (
    accepted.trace_id !== traceId
    || accepted.actor !== actor
    || payload.intent_id !== intentId
    || payload.principal !== actor
    || payload.principal_type !== 'human'
    || payload.action !== 'memory.put'
  ) {
    throw new ValidationError(
      'Accepted memory intent does not match the authenticated owner ingestion request'
    );
  }

  const invocation = validateInvocationEnvelope(
    assertPlainObject(payload.invocation, 'accepted memory invocation')
  );
  const invocationDigest = requiredDigest(
    payload.invocation_digest,
    'accepted memory invocation_digest'
  );
  if (invocationEnvelopeDigest(invocation) !== invocationDigest) {
    throw new ValidationError('Accepted memory invocation digest does not match its envelope');
  }
  if (
    invocation.caller.principal_id !== actor
    || invocation.caller.principal_type !== 'human'
    || invocation.request.intent_id !== intentId
    || invocation.request.action !== 'memory.put'
    || invocation.request.request_digest !== payload.request_digest
    || invocation.request.input_digest !== payload.input_digest
  ) {
    throw new ValidationError('Accepted memory invocation does not match the signed intent evidence');
  }

  const materialized = store.getIntent(intentId);
  if (
    materialized.trace_id !== traceId
    || materialized.principal !== actor
    || materialized.action !== 'memory.put'
    || materialized.input_digest !== payload.input_digest
    || materialized.request_digest !== payload.request_digest
  ) {
    throw new ValidationError('Materialized memory intent does not match its accepted event');
  }
  if (materialized.status !== 'accepted') {
    throw new AxiomError(
      'semantic_memory_ingestion_intent_not_pending',
      'Authenticated semantic ingestion requires an accepted non-terminal memory intent',
      409
    );
  }

  return accepted;
}

function normalizeBoundMemoryPut(rawEvent, {
  traceId,
  actor,
  intentId,
  accepted
}) {
  const event = assertPlainObject(rawEvent, 'authenticated memory.put event');
  assertExactKeys(event, ['kind', 'subject', 'payload'], 'authenticated memory.put event');
  if (event.kind !== 'memory.put') {
    throw new ValidationError('Authenticated semantic ingestion requires memory.put mutation');
  }
  const payload = assertPlainObject(event.payload, 'authenticated memory.put payload');
  assertExactKeys(
    payload,
    ['object_id', 'owner', 'kind', 'content', 'metadata', 'content_digest', 'evidence'],
    'authenticated memory.put payload'
  );
  const owner = assertString(payload.owner, 'memory.put owner', { max: 160, pattern: ID });
  if (owner !== actor) {
    throw new ValidationError('memory.put owner must equal authenticated ingestion actor');
  }
  const kind = assertString(payload.kind, 'memory.put kind', {
    max: 128,
    pattern: MEMORY_KIND
  });
  const content = structuredClone(assertPlainObject(payload.content, 'memory.put content'));
  const metadata = structuredClone(assertPlainObject(payload.metadata, 'memory.put metadata'));
  const contentDigest = digestObject({ owner, kind, content, metadata });
  const objectId = `memory_${contentDigest}`;
  if (
    payload.content_digest !== contentDigest
    || payload.object_id !== objectId
    || event.subject !== objectId
  ) {
    throw new ValidationError('memory.put object identity does not match exact content');
  }

  const acceptedInputDigest = requiredDigest(
    accepted.payload.input_digest,
    'accepted memory input_digest'
  );
  const inputCandidates = [digestObject({ kind, content, metadata })];
  if (Object.keys(metadata).length === 0) {
    inputCandidates.push(digestObject({ kind, content }));
  }
  if (!inputCandidates.includes(acceptedInputDigest)) {
    throw new ValidationError(
      'memory.put mutation cannot be reconstructed from the exact accepted input'
    );
  }

  const evidence = assertPlainObject(payload.evidence, 'memory.put execution evidence');
  assertExactKeys(
    evidence,
    ['plan_digest', 'invocation_digest', 'execution'],
    'memory.put execution evidence'
  );
  const planDigest = requiredDigest(evidence.plan_digest, 'memory.put plan_digest');
  const invocationDigest = requiredDigest(
    evidence.invocation_digest,
    'memory.put invocation_digest'
  );
  if (invocationDigest !== accepted.payload.invocation_digest) {
    throw new ValidationError('memory.put execution evidence uses the wrong invocation');
  }

  const execution = assertPlainObject(evidence.execution, 'memory.put execution attestation');
  assertExactKeys(execution, ['statement', 'signature'], 'memory.put execution attestation');
  const statement = assertPlainObject(execution.statement, 'memory.put execution statement');
  const signature = assertPlainObject(execution.signature, 'memory.put execution signature');
  if (Object.keys(signature).length === 0) {
    throw new ValidationError('memory.put execution signature cannot be empty');
  }
  const statementInvocationDigest = requiredDigest(
    statement.invocation_digest,
    'memory.put execution statement invocation_digest'
  );
  if (
    statement.trace_id !== traceId
    || statement.intent_id !== intentId
    || statementInvocationDigest !== invocationDigest
    || statement.tool !== 'builtin.validate-mutation'
    || statement.policy_digest !== accepted.payload.policy_digest
  ) {
    throw new ValidationError('memory.put execution statement is not bound to this ingestion');
  }
  const assurance = structuredClone(
    assertPlainObject(statement.assurance, 'memory.put execution assurance')
  );
  const resultDigest = requiredDigest(
    statement.result_digest,
    'memory.put execution result_digest'
  );
  const baseMutation = {
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
  };
  const expectedSandboxResult = {
    output: {
      object_id: objectId,
      content_digest: contentDigest,
      status: 'active',
      assurance
    },
    mutation: baseMutation
  };
  if (digestObject(expectedSandboxResult) !== resultDigest) {
    throw new ValidationError('memory.put execution result digest does not match the exact mutation');
  }

  return {
    event: {
      kind: 'memory.put',
      subject: objectId,
      payload: {
        ...baseMutation.payload,
        evidence: {
          plan_digest: planDigest,
          invocation_digest: invocationDigest,
          execution: structuredClone(execution)
        }
      }
    },
    payload: {
      ...baseMutation.payload,
      evidence: {
        plan_digest: planDigest,
        invocation_digest: invocationDigest,
        execution: structuredClone(execution)
      }
    },
    assurance,
    result_digest: resultDigest
  };
}

function normalizeBoundMemoryCompletion(rawEvent, {
  traceId,
  intentId,
  accepted,
  memory
}) {
  const event = assertPlainObject(rawEvent, 'authenticated memory completion event');
  assertExactKeys(event, ['kind', 'subject', 'payload'], 'authenticated memory completion event');
  if (event.kind !== 'intent.completed' || event.subject !== intentId) {
    throw new ValidationError('Authenticated semantic ingestion requires matching intent.completed event');
  }
  const payload = assertPlainObject(event.payload, 'authenticated memory completion payload');
  assertExactKeys(payload, ['intent_id', 'result'], 'authenticated memory completion payload');
  if (payload.intent_id !== intentId) {
    throw new ValidationError('Memory completion payload intent_id is mismatched');
  }
  const result = assertPlainObject(payload.result, 'authenticated memory completion result');
  assertExactKeys(
    result,
    ['object_id', 'content_digest', 'status', 'assurance', 'intent_id', 'trace_id', 'evidence'],
    'authenticated memory completion result'
  );
  if (
    result.object_id !== memory.payload.object_id
    || result.content_digest !== memory.payload.content_digest
    || result.status !== 'completed'
    || result.intent_id !== intentId
    || result.trace_id !== traceId
    || canonicalJson(result.assurance) !== canonicalJson(memory.assurance)
  ) {
    throw new ValidationError('Memory completion result does not match the exact mutation');
  }

  const evidence = assertPlainObject(result.evidence, 'authenticated memory completion evidence');
  assertExactKeys(
    evidence,
    ['plan_digest', 'invocation_digest', 'execution_digest', 'policy_digest'],
    'authenticated memory completion evidence'
  );
  if (
    requiredDigest(evidence.plan_digest, 'completion plan_digest')
      !== memory.payload.evidence.plan_digest
    || requiredDigest(evidence.invocation_digest, 'completion invocation_digest')
      !== accepted.payload.invocation_digest
    || requiredDigest(evidence.execution_digest, 'completion execution_digest')
      !== memory.result_digest
    || requiredDigest(evidence.policy_digest, 'completion policy_digest')
      !== accepted.payload.policy_digest
  ) {
    throw new ValidationError('Memory completion evidence does not match accepted execution');
  }

  return {
    event: {
      kind: 'intent.completed',
      subject: intentId,
      payload: {
        intent_id: intentId,
        result: structuredClone(result)
      }
    }
  };
}

function requireGridStore(store) {
  if (
    !store
    || typeof store.requireIntentEvidenceChain !== 'function'
    || !store.db
    || typeof store.decodeEventRow !== 'function'
    || typeof store.getIntent !== 'function'
  ) {
    throw new TypeError('Authenticated semantic ingestion requires a Grid store');
  }
}

function requiredDigest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function assertExactKeys(value, allowed, label) {
  const actual = Object.keys(value).sort();
  const expected = [...allowed].sort();
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) {
    throw new ValidationError(`${label} contains unsupported or missing fields`);
  }
}
