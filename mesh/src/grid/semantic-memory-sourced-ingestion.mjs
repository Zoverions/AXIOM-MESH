import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject
} from '../lib/canonical.mjs';
import { normalizeSemanticMemoryProvenance } from '../lib/semantic-memory-provenance.mjs';
import {
  verifyAcceptedOwnerMemoryIntent
} from './semantic-memory-authenticated-ingestion.mjs';
import {
  SemanticMemorySourceEvidenceGridStore
} from './semantic-memory-source-evidence-store.mjs';
import {
  SEMANTIC_MEMORY_STATE_EVENT,
  SemanticMemoryStateGridStore
} from './semantic-memory-state-store.mjs';

export const AUTHENTICATED_SOURCED_MEMORY_INGESTION_SCHEMA =
  'axiom-semantic-memory-sourced-ingestion.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const MEMORY_KIND = /^[a-z][a-z0-9.-]+$/;
const SEMANTIC_CLASS = /^(knowledge|preference|procedure|instruction-candidate)$/;
const SEMANTIC_CLASS_KEY = 'axiom_semantic_class';
const SOURCE_EVIDENCE_KEY = 'axiom_semantic_source_evidence_digest';

export class AuthenticatedSourcedMemoryGridStore extends SemanticMemorySourceEvidenceGridStore {
  getStatus() {
    return {
      ...super.getStatus(),
      authenticated_sourced_memory_ingestion: Object.freeze({
        schema: AUTHENTICATED_SOURCED_MEMORY_INGESTION_SCHEMA,
        activation_state: 'opt-in-local-laboratory',
        accepted_action: 'memory.put',
        persistence_authority: 'human-owner-intent',
        provenance_authority: 'retained-source-evidence-only',
        source_evidence_binding: `memory.metadata.${SOURCE_EVIDENCE_KEY}`,
        semantic_class_binding: `memory.metadata.${SEMANTIC_CLASS_KEY}`,
        owner_authorization_changes_origin: false,
        initial_authority_tier: 'untrusted-data',
        initial_review_state: 'unreviewed',
        source_identity_verified: false,
        artifact_authenticity_verified: false,
        public_routes: false,
        production_store_selected: false,
        provider_autowrites: false,
        downstream_effect_authority: false
      })
    };
  }

  recordAuthenticatedOwnerMemory(args) {
    const metadata = args?.memoryPutEvent?.payload?.metadata;
    if (
      metadata
      && typeof metadata === 'object'
      && !Array.isArray(metadata)
      && Object.hasOwn(metadata, SOURCE_EVIDENCE_KEY)
    ) {
      throw new ValidationError(
        'Memory with a retained source-evidence digest must use recordAuthenticatedSourcedMemory'
      );
    }
    return super.recordAuthenticatedOwnerMemory(args);
  }

  recordAuthenticatedSourcedMemory({
    traceId,
    actor,
    intentId,
    memoryPutEvent,
    completedEvent
  }) {
    const trace = assertString(traceId, 'sourced memory traceId', {
      max: 160,
      pattern: ID
    });
    const owner = assertString(actor, 'sourced memory actor', {
      max: 160,
      pattern: ID
    });
    const intent = assertString(intentId, 'sourced memory intentId', {
      max: 160,
      pattern: ID
    });

    const accepted = verifyAcceptedOwnerMemoryIntent(this, {
      traceId: trace,
      actor: owner,
      intentId: intent
    });
    const memory = normalizeBoundSourcedMemoryPut(memoryPutEvent, {
      traceId: trace,
      actor: owner,
      intentId: intent,
      accepted
    });
    const sourceReceipt = this.getSemanticMemorySourceEvidence(
      owner,
      memory.source_evidence_digest,
      { verify: true }
    );
    const sourceEvidence = sourceReceipt.evidence;

    if (sourceEvidence.content_payload_digest !== digestObject(memory.payload.content)) {
      throw new ValidationError(
        'Retained semantic source evidence does not bind the exact memory content payload'
      );
    }
    if (sourceEvidence.semantic_class !== memory.semantic_class) {
      throw new ValidationError(
        'Retained semantic source evidence semantic class does not match memory metadata'
      );
    }

    const completion = normalizeBoundSourcedMemoryCompletion(completedEvent, {
      traceId: trace,
      intentId: intent,
      accepted,
      memory
    });
    const semanticRecord = normalizeSemanticMemoryProvenance({
      object_id: memory.payload.object_id,
      owner,
      content_digest: memory.payload.content_digest,
      origin_class: sourceEvidence.source_class,
      ...(sourceEvidence.source_principal
        ? { origin_principal: sourceEvidence.source_principal }
        : {}),
      ...(sourceEvidence.source_runtime_id
        ? { origin_runtime_id: sourceEvidence.source_runtime_id }
        : {}),
      origin_artifact_digest: sourceEvidence.evidence_digest,
      semantic_class: sourceEvidence.semantic_class,
      authority_tier: 'untrusted-data',
      review_state: 'unreviewed',
      ingestion_intent_id: intent,
      request_digest: accepted.payload.request_digest,
      may_affect_authority: false
    });

    const appended = SemanticMemoryStateGridStore.prototype.appendEvents.call(this, {
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
      schema: AUTHENTICATED_SOURCED_MEMORY_INGESTION_SCHEMA,
      object_id: semanticRecord.object_id,
      content_digest: semanticRecord.content_digest,
      source_evidence_digest: sourceEvidence.evidence_digest,
      semantic_record: semanticRecord,
      event_ids: Object.freeze(appended.map(event => event.event_id)),
      downstream_effect_authorized: false
    });
  }
}

function normalizeBoundSourcedMemoryPut(rawEvent, {
  traceId,
  actor,
  intentId,
  accepted
}) {
  const event = assertPlainObject(rawEvent, 'authenticated sourced memory.put event');
  assertExactKeys(event, ['kind', 'subject', 'payload'], 'authenticated sourced memory.put event');
  if (event.kind !== 'memory.put') {
    throw new ValidationError('Authenticated sourced ingestion requires memory.put mutation');
  }
  const payload = assertPlainObject(event.payload, 'authenticated sourced memory.put payload');
  assertExactKeys(
    payload,
    ['object_id', 'owner', 'kind', 'content', 'metadata', 'content_digest', 'evidence'],
    'authenticated sourced memory.put payload'
  );
  const owner = assertString(payload.owner, 'sourced memory.put owner', {
    max: 160,
    pattern: ID
  });
  if (owner !== actor) {
    throw new ValidationError('Sourced memory.put owner must equal authenticated owner actor');
  }
  const kind = assertString(payload.kind, 'sourced memory.put kind', {
    max: 128,
    pattern: MEMORY_KIND
  });
  const content = structuredClone(
    assertPlainObject(payload.content, 'sourced memory.put content')
  );
  const metadata = structuredClone(
    assertPlainObject(payload.metadata, 'sourced memory.put metadata')
  );
  const semanticClass = assertString(
    metadata[SEMANTIC_CLASS_KEY],
    `sourced memory metadata.${SEMANTIC_CLASS_KEY}`,
    { max: 64, pattern: SEMANTIC_CLASS }
  );
  const sourceEvidenceDigest = assertString(
    metadata[SOURCE_EVIDENCE_KEY],
    `sourced memory metadata.${SOURCE_EVIDENCE_KEY}`,
    { min: 64, max: 64, pattern: DIGEST }
  );

  const contentDigest = digestObject({ owner, kind, content, metadata });
  const objectId = `memory_${contentDigest}`;
  if (
    payload.content_digest !== contentDigest
    || payload.object_id !== objectId
    || event.subject !== objectId
  ) {
    throw new ValidationError('Sourced memory.put object identity does not match exact content');
  }

  const acceptedInputDigest = requiredDigest(
    accepted.payload.input_digest,
    'accepted sourced memory input_digest'
  );
  if (digestObject({ kind, content, metadata }) !== acceptedInputDigest) {
    throw new ValidationError(
      'Sourced memory.put mutation cannot be reconstructed from the exact accepted input'
    );
  }

  const evidence = assertPlainObject(
    payload.evidence,
    'sourced memory.put execution evidence'
  );
  assertExactKeys(
    evidence,
    ['plan_digest', 'invocation_digest', 'execution'],
    'sourced memory.put execution evidence'
  );
  const planDigest = requiredDigest(evidence.plan_digest, 'sourced memory.put plan_digest');
  const invocationDigest = requiredDigest(
    evidence.invocation_digest,
    'sourced memory.put invocation_digest'
  );
  if (invocationDigest !== accepted.payload.invocation_digest) {
    throw new ValidationError('Sourced memory execution evidence uses the wrong invocation');
  }

  const execution = assertPlainObject(
    evidence.execution,
    'sourced memory execution attestation'
  );
  assertExactKeys(execution, ['statement', 'signature'], 'sourced memory execution attestation');
  const statement = assertPlainObject(
    execution.statement,
    'sourced memory execution statement'
  );
  const signature = assertPlainObject(
    execution.signature,
    'sourced memory execution signature'
  );
  if (Object.keys(signature).length === 0) {
    throw new ValidationError('Sourced memory execution signature cannot be empty');
  }
  if (
    statement.trace_id !== traceId
    || statement.intent_id !== intentId
    || requiredDigest(
      statement.invocation_digest,
      'sourced memory execution statement invocation_digest'
    ) !== invocationDigest
    || statement.tool !== 'builtin.validate-mutation'
    || statement.policy_digest !== accepted.payload.policy_digest
  ) {
    throw new ValidationError('Sourced memory execution statement is not bound to this ingestion');
  }
  const assurance = structuredClone(
    assertPlainObject(statement.assurance, 'sourced memory execution assurance')
  );
  const resultDigest = requiredDigest(
    statement.result_digest,
    'sourced memory execution result_digest'
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
    throw new ValidationError(
      'Sourced memory execution result digest does not match the exact mutation'
    );
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
    semantic_class: semanticClass,
    source_evidence_digest: sourceEvidenceDigest,
    assurance,
    result_digest: resultDigest
  };
}

function normalizeBoundSourcedMemoryCompletion(rawEvent, {
  traceId,
  intentId,
  accepted,
  memory
}) {
  const event = assertPlainObject(rawEvent, 'authenticated sourced memory completion event');
  assertExactKeys(
    event,
    ['kind', 'subject', 'payload'],
    'authenticated sourced memory completion event'
  );
  if (event.kind !== 'intent.completed' || event.subject !== intentId) {
    throw new ValidationError(
      'Authenticated sourced ingestion requires matching intent.completed event'
    );
  }
  const payload = assertPlainObject(
    event.payload,
    'authenticated sourced memory completion payload'
  );
  assertExactKeys(
    payload,
    ['intent_id', 'result'],
    'authenticated sourced memory completion payload'
  );
  if (payload.intent_id !== intentId) {
    throw new ValidationError('Sourced memory completion payload intent_id is mismatched');
  }
  const result = assertPlainObject(
    payload.result,
    'authenticated sourced memory completion result'
  );
  assertExactKeys(
    result,
    ['object_id', 'content_digest', 'status', 'assurance', 'intent_id', 'trace_id', 'evidence'],
    'authenticated sourced memory completion result'
  );
  if (
    result.object_id !== memory.payload.object_id
    || result.content_digest !== memory.payload.content_digest
    || result.status !== 'completed'
    || result.intent_id !== intentId
    || result.trace_id !== traceId
    || canonicalJson(result.assurance) !== canonicalJson(memory.assurance)
  ) {
    throw new ValidationError('Sourced memory completion result does not match exact mutation');
  }

  const evidence = assertPlainObject(
    result.evidence,
    'authenticated sourced memory completion evidence'
  );
  assertExactKeys(
    evidence,
    ['plan_digest', 'invocation_digest', 'execution_digest', 'policy_digest'],
    'authenticated sourced memory completion evidence'
  );
  if (
    requiredDigest(evidence.plan_digest, 'sourced completion plan_digest')
      !== memory.payload.evidence.plan_digest
    || requiredDigest(evidence.invocation_digest, 'sourced completion invocation_digest')
      !== accepted.payload.invocation_digest
    || requiredDigest(evidence.execution_digest, 'sourced completion execution_digest')
      !== memory.result_digest
    || requiredDigest(evidence.policy_digest, 'sourced completion policy_digest')
      !== accepted.payload.policy_digest
  ) {
    throw new ValidationError('Sourced memory completion evidence does not match accepted execution');
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
