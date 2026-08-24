import { createPublicKey } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  AxiomError,
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject,
  sha256
} from '../lib/canonical.mjs';
import { verifyObjectSignature } from '../lib/identity.mjs';
import {
  invocationEnvelopeDigest,
  validateInvocationEnvelope
} from '../lib/invocation-envelope.mjs';
import {
  capabilityConsumptionEventId,
  normalizeCapabilityConsumptionStatement
} from '../lib/capability-consumption.mjs';
import {
  projectLocalContextSemanticStateMemoryPut,
  verifyLocalContextSemanticStateRecord
} from '../lib/context-semantic-state.mjs';

export const LOCAL_CONTEXT_SEMANTIC_NATIVE_INGESTION_SCHEMA =
  'axiom-local-context-semantic-native-ingestion.v1';

const DIGEST = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const MEMORY_EVENT_KEYS = Object.freeze([
  'object_id',
  'owner',
  'kind',
  'content',
  'metadata',
  'content_digest',
  'evidence'
]);
const ACCEPTED_KEYS = Object.freeze([
  'intent_id',
  'principal',
  'principal_type',
  'action',
  'risk',
  'input_digest',
  'request_digest',
  'policy_version',
  'policy_digest',
  'invocation',
  'invocation_digest'
]);
const MUTATION_EVIDENCE_KEYS = Object.freeze([
  'plan_digest',
  'invocation_digest',
  'capability_consumption_receipt_digest',
  'execution'
]);
const EXECUTION_STATEMENT_KEYS = Object.freeze([
  'trace_id',
  'intent_id',
  'intent_digest',
  'invocation_digest',
  'capability_id',
  'capability_consumption_receipt_digest',
  'sandbox_execution_epoch',
  'tool',
  'policy_digest',
  'assurance',
  'started_at',
  'completed_at',
  'result_digest'
]);
const SIGNATURE_KEYS = Object.freeze([
  'algorithm',
  'key_id',
  'digest',
  'signature'
]);
const COMPLETION_RESULT_KEYS = Object.freeze([
  'object_id',
  'content_digest',
  'status',
  'assurance',
  'intent_id',
  'trace_id',
  'evidence'
]);
const COMPLETION_EVIDENCE_KEYS = Object.freeze([
  'plan_digest',
  'invocation_digest',
  'capability_consumption_receipt_digest',
  'execution_digest',
  'policy_digest'
]);

function exactKeys(value, allowed, label) {
  assertPlainObject(value, label);
  const actual = Object.keys(value).sort();
  const expected = [...allowed].sort();
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) {
    throw new ValidationError(`${label} contains unsupported or missing fields`);
  }
}

function requiredId(value, label) {
  return assertString(value, label, { min: 1, max: 160, pattern: ID });
}

function requiredDigest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function requireStore(store) {
  if (
    !store
    || !store.db
    || typeof store.dataDir !== 'string'
    || typeof store.requireIntentEvidenceChain !== 'function'
    || typeof store.decodeEventRow !== 'function'
    || !(store.verificationKeys instanceof Map)
  ) {
    throw new TypeError('Semantic native-ingestion verification requires a Grid store');
  }
}

function nativeMissing(message = 'Native semantic ingestion evidence was not found') {
  throw new AxiomError(
    'context_semantic_native_ingestion_missing',
    message,
    409
  );
}

function loadPinnedServiceKey(store, service) {
  const path = join(store.dataDir, 'trust', `${service}.pub.pem`);
  try {
    const stat = lstatSync(path);
    if (!stat.isFile()) {
      throw new Error('trusted service key path is not a regular file');
    }
    const pem = readFileSync(path, 'utf8');
    const key = createPublicKey(pem);
    const normalizedPem = key.export({ type: 'spki', format: 'pem' });
    return Object.freeze({
      key,
      key_id: `${service}:${sha256(normalizedPem).slice(0, 16)}`
    });
  } catch {
    throw new AxiomError(
      'context_semantic_native_ingestion_trust_unavailable',
      `Pinned ${service} trust material is unavailable`,
      503
    );
  }
}

function eventRows(store, kind, subject) {
  return store.db.prepare(`
    SELECT * FROM events
    WHERE kind = ? AND subject = ?
    ORDER BY seq
  `).all(kind, subject).map(row => store.decodeEventRow(row));
}

function semanticMemoryBinding(rawState) {
  const state = verifyLocalContextSemanticStateRecord(rawState);
  const input = projectLocalContextSemanticStateMemoryPut(state);
  const contentDigest = digestObject({
    owner: state.owner_subject_ref,
    kind: input.kind,
    content: input.content,
    metadata: input.metadata
  });
  return Object.freeze({
    state,
    input,
    content_digest: contentDigest,
    object_id: `memory_${contentDigest}`
  });
}

function verifyBirthEvent(store, binding) {
  const rows = eventRows(store, 'memory.put', binding.object_id);
  if (!rows.length) nativeMissing();
  const birth = rows[0];
  const payload = assertPlainObject(birth.payload, 'semantic native memory.put payload');

  // Birth semantics are intentionally first-event semantics. A later native retry
  // cannot retroactively turn an earlier direct/laboratory append into native ingestion.
  if (!Object.hasOwn(payload, 'evidence')) {
    nativeMissing(
      'The semantic state was retained without native execution evidence at its first birth event'
    );
  }

  exactKeys(payload, MEMORY_EVENT_KEYS, 'semantic native memory.put payload');
  if (
    birth.actor !== binding.state.owner_subject_ref
    || birth.subject !== binding.object_id
    || payload.object_id !== binding.object_id
    || payload.owner !== binding.state.owner_subject_ref
    || payload.kind !== binding.input.kind
    || payload.content_digest !== binding.content_digest
    || canonicalJson(payload.content) !== canonicalJson(binding.input.content)
    || canonicalJson(payload.metadata) !== canonicalJson(binding.input.metadata)
  ) {
    throw new ValidationError(
      'semantic native memory.put does not bind the exact semantic state content address'
    );
  }
  return birth;
}

function verifyAcceptedIntent(store, birth, binding, intentId) {
  const rows = eventRows(store, 'intent.accepted', intentId);
  if (!rows.length) nativeMissing('Native semantic ingestion has no retained accepted intent');
  if (rows.length !== 1) {
    throw new ValidationError('Native semantic ingestion requires exactly one accepted intent');
  }
  const accepted = rows[0];
  const payload = assertPlainObject(accepted.payload, 'semantic native accepted intent payload');
  exactKeys(payload, ACCEPTED_KEYS, 'semantic native accepted intent payload');
  if (
    accepted.seq >= birth.seq
    || accepted.trace_id !== birth.trace_id
    || accepted.actor !== binding.state.owner_subject_ref
    || payload.intent_id !== intentId
    || payload.principal !== binding.state.owner_subject_ref
    || payload.principal_type !== 'human'
    || payload.action !== 'memory.put'
  ) {
    throw new ValidationError(
      'semantic native accepted intent does not bind the owner, trace, action, or birth ordering'
    );
  }

  const inputDigest = requiredDigest(payload.input_digest, 'accepted semantic memory input_digest');
  if (inputDigest !== digestObject(binding.input)) {
    throw new ValidationError('accepted semantic memory input digest does not match the exact state input');
  }
  const requestDigest = requiredDigest(payload.request_digest, 'accepted semantic memory request_digest');
  const policyDigest = requiredDigest(payload.policy_digest, 'accepted semantic memory policy_digest');
  const storedInvocationDigest = requiredDigest(
    payload.invocation_digest,
    'accepted semantic memory invocation_digest'
  );
  const invocation = validateInvocationEnvelope(
    assertPlainObject(payload.invocation, 'accepted semantic memory invocation')
  );
  if (
    invocationEnvelopeDigest(invocation) !== storedInvocationDigest
    || invocation.caller.principal_id !== binding.state.owner_subject_ref
    || invocation.caller.principal_type !== 'human'
    || invocation.request.intent_id !== intentId
    || invocation.request.action !== 'memory.put'
    || invocation.request.input_digest !== inputDigest
    || invocation.request.request_digest !== requestDigest
    || invocation.authority.policy_digest !== policyDigest
    || invocation.authority.policy_version !== payload.policy_version
    || invocation.authority.risk !== payload.risk
    || invocation.authority.effect_destination !== undefined
  ) {
    throw new ValidationError('accepted semantic memory invocation is not the exact supported human path');
  }
  return Object.freeze({
    accepted,
    invocation,
    inputDigest,
    requestDigest,
    policyDigest,
    invocationDigest: storedInvocationDigest
  });
}

function isoMillis(value, label) {
  const text = assertString(value, label, { min: 20, max: 64 });
  const time = Date.parse(text);
  if (!Number.isFinite(time)) throw new ValidationError(`${label} must be an ISO timestamp`);
  return time;
}

function verifyCapabilityConsumption(store, birth, binding, acceptedFacts, statement, {
  planDigest,
  receiptDigest,
  startedAt,
  completedAt
}) {
  const capabilityId = requiredId(statement.capability_id, 'semantic native capability_id');
  const rows = eventRows(store, 'capability.consumed', capabilityId);
  if (!rows.length) nativeMissing('Native semantic ingestion has no durable capability consumption receipt');
  if (rows.length !== 1) {
    throw new ValidationError('Native semantic ingestion requires one capability consumption receipt');
  }
  const consumed = rows[0];
  const payload = assertPlainObject(consumed.payload, 'semantic native capability consumption payload');
  exactKeys(payload, ['receipt', 'receipt_digest'], 'semantic native capability consumption payload');
  if (
    consumed.event_id !== capabilityConsumptionEventId(capabilityId)
    || consumed.seq <= acceptedFacts.accepted.seq
    || consumed.seq >= birth.seq
    || consumed.trace_id !== birth.trace_id
    || consumed.actor !== binding.state.owner_subject_ref
  ) {
    throw new ValidationError('capability consumption history is not bound to semantic native ingestion');
  }

  const storedReceiptDigest = requiredDigest(
    payload.receipt_digest,
    'semantic native retained capability receipt digest'
  );
  if (
    storedReceiptDigest !== receiptDigest
    || storedReceiptDigest !== digestObject(payload.receipt)
  ) {
    throw new ValidationError('retained Grid capability receipt digest does not match native execution');
  }

  const receipt = assertPlainObject(payload.receipt, 'semantic native capability receipt');
  exactKeys(receipt, ['statement', 'signature'], 'semantic native capability receipt');
  const receiptStatement = normalizeCapabilityConsumptionStatement(receipt.statement);
  const receiptSignature = assertPlainObject(
    receipt.signature,
    'semantic native capability receipt signature'
  );
  exactKeys(receiptSignature, SIGNATURE_KEYS, 'semantic native capability receipt signature');
  const gridKey = store.verificationKeys.get(receiptSignature.key_id);
  if (!gridKey || !verifyObjectSignature(receiptStatement, receiptSignature, gridKey)) {
    throw new ValidationError('semantic native Grid capability consumption receipt signature is invalid');
  }

  if (
    receiptStatement.jti !== capabilityId
    || receiptStatement.subject !== binding.state.owner_subject_ref
    || receiptStatement.issuer !== 'hypervisor'
    || receiptStatement.audience !== 'sandbox'
    || receiptStatement.intent_digest !== statement.intent_digest
    || receiptStatement.plan_digest !== planDigest
    || receiptStatement.policy_digest !== acceptedFacts.policyDigest
    || receiptStatement.invocation_digest !== acceptedFacts.invocationDigest
    || receiptStatement.tool !== 'builtin.validate-mutation'
    || receiptStatement.execution_epoch !== statement.sandbox_execution_epoch
  ) {
    throw new ValidationError('Grid capability consumption receipt does not bind the exact semantic execution');
  }

  const consumedAt = isoMillis(
    receiptStatement.consumed_at,
    'semantic native capability consumed_at'
  );
  if (
    consumedAt > startedAt
    || completedAt >= receiptStatement.expires_at * 1_000
  ) {
    throw new ValidationError('semantic native execution falls outside retained capability-consumption bounds');
  }

  return Object.freeze({
    event: consumed,
    receipt: Object.freeze({
      statement: receiptStatement,
      signature: structuredClone(receiptSignature)
    }),
    receiptDigest: storedReceiptDigest
  });
}

function verifyExecution(store, birth, binding, acceptedFacts) {
  const evidence = assertPlainObject(birth.payload.evidence, 'semantic native mutation evidence');
  exactKeys(evidence, MUTATION_EVIDENCE_KEYS, 'semantic native mutation evidence');
  const planDigest = requiredDigest(evidence.plan_digest, 'semantic native plan_digest');
  const invocationDigest = requiredDigest(
    evidence.invocation_digest,
    'semantic native mutation invocation_digest'
  );
  const receiptDigest = requiredDigest(
    evidence.capability_consumption_receipt_digest,
    'semantic native capability consumption receipt digest'
  );
  if (invocationDigest !== acceptedFacts.invocationDigest) {
    throw new ValidationError('semantic native mutation uses a different accepted invocation');
  }

  const execution = assertPlainObject(evidence.execution, 'semantic native execution attestation');
  exactKeys(execution, ['statement', 'signature'], 'semantic native execution attestation');
  const statement = assertPlainObject(execution.statement, 'semantic native execution statement');
  exactKeys(statement, EXECUTION_STATEMENT_KEYS, 'semantic native execution statement');
  const signature = assertPlainObject(execution.signature, 'semantic native execution signature');
  exactKeys(signature, SIGNATURE_KEYS, 'semantic native execution signature');

  const sandbox = loadPinnedServiceKey(store, 'sandbox');
  if (
    signature.key_id !== sandbox.key_id
    || !verifyObjectSignature(statement, signature, sandbox.key)
  ) {
    throw new ValidationError('semantic native Sandbox execution attestation is invalid');
  }
  if (
    statement.trace_id !== birth.trace_id
    || statement.intent_id !== acceptedFacts.accepted.subject
    || requiredDigest(statement.intent_digest, 'semantic native execution intent_digest').length !== 64
    || statement.invocation_digest !== acceptedFacts.invocationDigest
    || statement.capability_consumption_receipt_digest !== receiptDigest
    || statement.tool !== 'builtin.validate-mutation'
    || statement.policy_digest !== acceptedFacts.policyDigest
    || Object.hasOwn(statement, 'effect_destination')
  ) {
    throw new ValidationError('Sandbox execution statement is not bound to semantic native ingestion');
  }
  const assurance = structuredClone(
    assertPlainObject(statement.assurance, 'semantic native execution assurance')
  );
  const startedAt = isoMillis(statement.started_at, 'semantic native execution started_at');
  const completedAt = isoMillis(statement.completed_at, 'semantic native execution completed_at');
  if (completedAt < startedAt) {
    throw new ValidationError('semantic native execution completion predates start');
  }
  const resultDigest = requiredDigest(statement.result_digest, 'semantic native execution result_digest');

  const consumption = verifyCapabilityConsumption(
    store,
    birth,
    binding,
    acceptedFacts,
    statement,
    { planDigest, receiptDigest, startedAt, completedAt }
  );

  const baseMutation = {
    kind: 'memory.put',
    subject: binding.object_id,
    payload: {
      object_id: binding.object_id,
      owner: binding.state.owner_subject_ref,
      kind: binding.input.kind,
      content: binding.input.content,
      metadata: binding.input.metadata,
      content_digest: binding.content_digest
    }
  };
  const expectedSandboxResult = {
    output: {
      object_id: binding.object_id,
      content_digest: binding.content_digest,
      status: 'active',
      assurance
    },
    mutation: baseMutation
  };
  if (digestObject(expectedSandboxResult) !== resultDigest) {
    throw new ValidationError('Sandbox result digest does not match the exact semantic memory mutation');
  }

  return Object.freeze({
    planDigest,
    invocationDigest,
    receiptDigest,
    resultDigest,
    assurance,
    statement,
    capabilityConsumption: consumption
  });
}

function verifyCompletion(store, birth, binding, acceptedFacts, executionFacts) {
  const intentId = acceptedFacts.accepted.subject;
  const rows = eventRows(store, 'intent.completed', intentId);
  if (!rows.length) nativeMissing('Native semantic ingestion has no retained terminal completion');
  if (rows.length !== 1) {
    throw new ValidationError('Native semantic ingestion requires exactly one terminal completion');
  }
  const completed = rows[0];
  const payload = assertPlainObject(completed.payload, 'semantic native completion payload');
  exactKeys(payload, ['intent_id', 'result'], 'semantic native completion payload');
  if (
    completed.seq !== birth.seq + 1
    || completed.trace_id !== birth.trace_id
    || completed.actor !== binding.state.owner_subject_ref
    || payload.intent_id !== intentId
  ) {
    throw new ValidationError('semantic native completion is not adjacent and bound to the birth event');
  }
  const result = assertPlainObject(payload.result, 'semantic native completion result');
  exactKeys(result, COMPLETION_RESULT_KEYS, 'semantic native completion result');
  if (
    result.object_id !== binding.object_id
    || result.content_digest !== binding.content_digest
    || result.status !== 'completed'
    || result.intent_id !== intentId
    || result.trace_id !== birth.trace_id
    || canonicalJson(result.assurance) !== canonicalJson(executionFacts.assurance)
  ) {
    throw new ValidationError('semantic native completion result does not bind the exact execution');
  }
  const evidence = assertPlainObject(result.evidence, 'semantic native completion evidence');
  exactKeys(evidence, COMPLETION_EVIDENCE_KEYS, 'semantic native completion evidence');
  if (
    evidence.plan_digest !== executionFacts.planDigest
    || evidence.invocation_digest !== acceptedFacts.invocationDigest
    || evidence.capability_consumption_receipt_digest !== executionFacts.receiptDigest
    || evidence.execution_digest !== executionFacts.resultDigest
    || evidence.policy_digest !== acceptedFacts.policyDigest
  ) {
    throw new ValidationError('semantic native completion evidence does not match accepted execution');
  }
  return completed;
}

export function verifyLocalContextSemanticNativeIngestionFromGrid(store, {
  state
} = {}) {
  requireStore(store);
  const chain = store.requireIntentEvidenceChain();
  const binding = semanticMemoryBinding(state);
  const birth = verifyBirthEvent(store, binding);

  const executionPreview = assertPlainObject(
    assertPlainObject(birth.payload.evidence, 'semantic native mutation evidence').execution,
    'semantic native execution attestation'
  );
  const statementPreview = assertPlainObject(
    executionPreview.statement,
    'semantic native execution statement'
  );
  const intentId = requiredId(statementPreview.intent_id, 'semantic native intent_id');
  const acceptedFacts = verifyAcceptedIntent(store, birth, binding, intentId);
  const executionFacts = verifyExecution(store, birth, binding, acceptedFacts);
  const completed = verifyCompletion(store, birth, binding, acceptedFacts, executionFacts);

  return Object.freeze({
    schema: LOCAL_CONTEXT_SEMANTIC_NATIVE_INGESTION_SCHEMA,
    owner_subject_ref: binding.state.owner_subject_ref,
    state_digest: binding.state.state_digest,
    object_id: binding.object_id,
    content_digest: binding.content_digest,
    intent_id: intentId,
    accepted_event_id: acceptedFacts.accepted.event_id,
    accepted_event_seq: acceptedFacts.accepted.seq,
    capability_consumption_event_id: executionFacts.capabilityConsumption.event.event_id,
    capability_consumption_event_seq: executionFacts.capabilityConsumption.event.seq,
    birth_event_id: birth.event_id,
    birth_event_seq: birth.seq,
    birth_event_hash: birth.event_hash,
    completed_event_id: completed.event_id,
    completed_event_seq: completed.seq,
    sandbox_attestation_verified: true,
    grid_capability_consumption_receipt_verified: true,
    hypervisor_capability_token_retained: false,
    hypervisor_capability_signature_reverified: false,
    native_ingestion_verified: true,
    full_grid_chain_verified: chain.valid === true,
    gateway_request_signature_retained: false,
    content_truth_verified: false,
    downstream_effect_authorized: false,
    execution_authorized: false,
    semantic_instruction_authorized: false,
    propagation_authorized: false
  });
}
