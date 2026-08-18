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

export const NATIVE_SEMANTIC_MEMORY_INGESTION_SCHEMA =
  'axiom-semantic-memory-native-ingestion.v1';
export const SEMANTIC_MEMORY_KIND = 'semantic.memory';
export const SEMANTIC_CLASS_METADATA_KEY = 'axiom_semantic_class';
export const SEMANTIC_SOURCE_EVIDENCE_METADATA_KEY =
  'axiom_semantic_source_evidence_digest';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const SEMANTIC_CLASS = /^(knowledge|preference|procedure|instruction-candidate)$/;

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
      'Native semantic ingestion requires exactly one accepted memory.put intent event',
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
      'Native semantic ingestion requires an accepted non-terminal memory.put intent',
      409
    );
  }

  return accepted;
}

export function normalizeNativeSemanticMemoryPut(rawEvent, {
  traceId,
  actor,
  intentId,
  accepted
}) {
  const event = assertPlainObject(rawEvent, 'native semantic memory.put event');
  assertExactKeys(event, ['kind', 'subject', 'payload'], 'native semantic memory.put event');
  if (event.kind !== 'memory.put') {
    throw new ValidationError('Native semantic ingestion requires memory.put mutation');
  }
  const payload = assertPlainObject(event.payload, 'native semantic memory.put payload');
  assertExactKeys(
    payload,
    ['object_id', 'owner', 'kind', 'content', 'metadata', 'content_digest', 'evidence'],
    'native semantic memory.put payload'
  );
  const owner = requiredId(payload.owner, 'memory.put owner');
  if (owner !== actor) {
    throw new ValidationError('memory.put owner must equal authenticated ingestion actor');
  }
  if (payload.kind !== SEMANTIC_MEMORY_KIND) {
    throw new ValidationError(`Native semantic ingestion requires kind ${SEMANTIC_MEMORY_KIND}`);
  }
  const content = structuredClone(assertPlainObject(payload.content, 'memory.put content'));
  const metadata = structuredClone(assertPlainObject(payload.metadata, 'memory.put metadata'));
  const semanticClass = assertString(
    metadata[SEMANTIC_CLASS_METADATA_KEY],
    `memory.put metadata.${SEMANTIC_CLASS_METADATA_KEY}`,
    { max: 64, pattern: SEMANTIC_CLASS }
  );
  const sourceEvidenceDigest = metadata[SEMANTIC_SOURCE_EVIDENCE_METADATA_KEY] === undefined
    ? undefined
    : requiredDigest(
        metadata[SEMANTIC_SOURCE_EVIDENCE_METADATA_KEY],
        `memory.put metadata.${SEMANTIC_SOURCE_EVIDENCE_METADATA_KEY}`
      );

  const contentDigest = digestObject({
    owner,
    kind: SEMANTIC_MEMORY_KIND,
    content,
    metadata
  });
  const objectId = `memory_${contentDigest}`;
  if (
    payload.content_digest !== contentDigest
    || payload.object_id !== objectId
    || event.subject !== objectId
  ) {
    throw new ValidationError('memory.put object identity does not match exact semantic content');
  }

  const acceptedInputDigest = requiredDigest(
    accepted.payload.input_digest,
    'accepted memory input_digest'
  );
  if (
    digestObject({ kind: SEMANTIC_MEMORY_KIND, content, metadata })
      !== acceptedInputDigest
  ) {
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
      kind: SEMANTIC_MEMORY_KIND,
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

  return Object.freeze({
    event: Object.freeze({
      kind: 'memory.put',
      subject: objectId,
      payload: Object.freeze({
        ...baseMutation.payload,
        evidence: Object.freeze({
          plan_digest: planDigest,
          invocation_digest: invocationDigest,
          execution: structuredClone(execution)
        })
      })
    }),
    payload: Object.freeze({
      ...baseMutation.payload,
      evidence: Object.freeze({
        plan_digest: planDigest,
        invocation_digest: invocationDigest,
        execution: structuredClone(execution)
      })
    }),
    semantic_class: semanticClass,
    source_evidence_digest: sourceEvidenceDigest,
    assurance: Object.freeze(assurance),
    result_digest: resultDigest
  });
}

export function normalizeNativeMemoryCompletion(rawEvent, {
  traceId,
  intentId,
  accepted,
  memory
}) {
  const event = assertPlainObject(rawEvent, 'native memory completion event');
  assertExactKeys(event, ['kind', 'subject', 'payload'], 'native memory completion event');
  if (event.kind !== 'intent.completed' || event.subject !== intentId) {
    throw new ValidationError('Native semantic ingestion requires matching intent.completed event');
  }
  const payload = assertPlainObject(event.payload, 'native memory completion payload');
  assertExactKeys(payload, ['intent_id', 'result'], 'native memory completion payload');
  if (payload.intent_id !== intentId) {
    throw new ValidationError('Memory completion payload intent_id is mismatched');
  }
  const result = assertPlainObject(payload.result, 'native memory completion result');
  assertExactKeys(
    result,
    ['object_id', 'content_digest', 'status', 'assurance', 'intent_id', 'trace_id', 'evidence'],
    'native memory completion result'
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

  const evidence = assertPlainObject(result.evidence, 'native memory completion evidence');
  assertExactKeys(
    evidence,
    ['plan_digest', 'invocation_digest', 'execution_digest', 'policy_digest'],
    'native memory completion evidence'
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

  return Object.freeze({
    event: Object.freeze({
      kind: 'intent.completed',
      subject: intentId,
      payload: Object.freeze({
        intent_id: intentId,
        result: structuredClone(result)
      })
    })
  });
}

export function isSemanticMemoryPutCandidate(eventInput) {
  if (!eventInput || typeof eventInput !== 'object' || eventInput.kind !== 'memory.put') {
    return false;
  }
  const payload = eventInput.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  const metadata = payload.metadata;
  return payload.kind === SEMANTIC_MEMORY_KIND
    || Boolean(
      metadata
      && typeof metadata === 'object'
      && !Array.isArray(metadata)
      && (
        Object.prototype.hasOwnProperty.call(metadata, SEMANTIC_CLASS_METADATA_KEY)
        || Object.prototype.hasOwnProperty.call(metadata, SEMANTIC_SOURCE_EVIDENCE_METADATA_KEY)
      )
    );
}

function requireGridStore(store) {
  if (
    !store
    || typeof store.requireIntentEvidenceChain !== 'function'
    || !store.db
    || typeof store.decodeEventRow !== 'function'
    || typeof store.getIntent !== 'function'
  ) {
    throw new TypeError('Native semantic ingestion requires a Grid store');
  }
}

function requiredId(value, label) {
  return assertString(value, label, { min: 1, max: 160, pattern: ID });
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
