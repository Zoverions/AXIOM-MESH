import {
  AxiomError,
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject
} from './canonical.mjs';
import {
  EXTERNAL_EFFECT_PREPARED_SCHEMA,
  EXTERNAL_EFFECT_RECEIPT_SCHEMA,
  REPOSITORY_DOCS_EFFECT_POLICY,
  repositoryDocsEffectBranch
} from './repository-docs-effect.mjs';

export const EXTERNAL_EFFECT_PREPARED_EVENT = 'external.effect.prepared';
export const EXTERNAL_EFFECT_COMPLETED_EVENT = 'external.effect.completed';
export const EXTERNAL_EFFECT_GRID_STATE_SCHEMA = 'axiom-external-effect-grid-state.v1';

const DIGEST = /^[a-f0-9]{64}$/;
const EFFECT_ID = /^effect:[a-f0-9]{64}$/;
const RECEIPT_ID = /^receipt:[a-f0-9]{64}$/;

function digest(value, name) {
  return assertString(value, name, { min: 64, max: 64, pattern: DIGEST });
}

function contentAddressed(raw, {
  name,
  schema,
  idField,
  digestField,
  idPattern,
  idPrefix
}) {
  const value = assertPlainObject(raw, name);
  if (value.schema !== schema) throw new ValidationError(`${name} schema must be ${schema}`);
  const id = assertString(value[idField], `${name}.${idField}`, { max: 256, pattern: idPattern });
  const suppliedDigest = digest(value[digestField], `${name}.${digestField}`);
  const attestation = assertPlainObject(value.attestation, `${name}.attestation`);
  assertString(attestation.algorithm, `${name}.attestation.algorithm`, { max: 32, pattern: /^Ed25519$/ });
  assertString(attestation.key_id, `${name}.attestation.key_id`, { max: 192 });
  assertString(attestation.signature, `${name}.attestation.signature`, { max: 512 });
  const { [idField]: ignoredId, [digestField]: ignoredDigest, attestation: ignoredAttestation, ...body } = value;
  const expectedDigest = digestObject(body);
  if (suppliedDigest !== expectedDigest || id !== `${idPrefix}:${expectedDigest}`) {
    throw new ValidationError(`${name} is not content-addressed`);
  }
  return {
    ...JSON.parse(canonicalJson(body)),
    [idField]: id,
    [digestField]: suppliedDigest,
    attestation: JSON.parse(canonicalJson(attestation))
  };
}

function validatePreparedSemantics(prepared) {
  if (
    prepared.issuer !== 'hypervisor'
    || prepared.effect_class !== 'repository.docs.pull-request'
    || prepared.semantic_action !== REPOSITORY_DOCS_EFFECT_POLICY.semantic_action
    || prepared.target_action !== REPOSITORY_DOCS_EFFECT_POLICY.target_action
    || prepared.tool !== REPOSITORY_DOCS_EFFECT_POLICY.tool
    || prepared.capability_id !== REPOSITORY_DOCS_EFFECT_POLICY.capability_id
  ) {
    throw new ValidationError('prepared external effect is outside the repository-docs ceiling');
  }
  if (
    prepared.external_effect_executed !== false
    || prepared.execution_authorized !== false
    || prepared.merge_authorized !== false
  ) {
    throw new ValidationError('prepared external effect must remain unexecuted and non-authorizing');
  }
  const source = assertPlainObject(prepared.source_bindings, 'prepared.source_bindings');
  assertString(source.principal, 'prepared.source_bindings.principal', { max: 160 });
  const plan = assertPlainObject(prepared.plan, 'prepared.plan');
  if (
    plan.repository !== REPOSITORY_DOCS_EFFECT_POLICY.repository
    || plan.base_branch !== REPOSITORY_DOCS_EFFECT_POLICY.base_branch
    || plan.read_only_observation !== true
    || plan.mutations_performed !== false
  ) {
    throw new ValidationError('prepared external effect plan violates repository-docs boundary');
  }
  return prepared;
}

export function normalizePreparedExternalEffect(raw) {
  const prepared = contentAddressed(raw, {
    name: 'prepared external effect',
    schema: EXTERNAL_EFFECT_PREPARED_SCHEMA,
    idField: 'effect_id',
    digestField: 'effect_digest',
    idPattern: EFFECT_ID,
    idPrefix: 'effect'
  });
  return validatePreparedSemantics(prepared);
}

export function normalizeExternalEffectReceipt(raw, preparedEffect) {
  const prepared = normalizePreparedExternalEffect(preparedEffect);
  const receipt = contentAddressed(raw, {
    name: 'external effect receipt',
    schema: EXTERNAL_EFFECT_RECEIPT_SCHEMA,
    idField: 'receipt_id',
    digestField: 'receipt_digest',
    idPattern: RECEIPT_ID,
    idPrefix: 'receipt'
  });
  if (receipt.effect_id !== prepared.effect_id || receipt.effect_digest !== prepared.effect_digest) {
    throw new ValidationError('external effect receipt is not bound to the prepared effect');
  }
  if (
    receipt.plan_id !== prepared.plan.plan_id
    || receipt.plan_digest !== prepared.plan.plan_digest
    || receipt.repository !== prepared.plan.repository
    || receipt.base_branch !== prepared.plan.base_branch
    || receipt.base_sha !== prepared.plan.base_sha
    || receipt.branch !== repositoryDocsEffectBranch(prepared.effect_digest)
  ) {
    throw new ValidationError('external effect receipt does not match the prepared repository plan');
  }
  if (
    receipt.external_effect_executed !== true
    || receipt.pull_request_created_observed !== true
    || receipt.merge_performed !== false
    || receipt.base_branch_content_changed !== false
    || receipt.execution_authorized !== false
    || receipt.remediation_converged !== false
  ) {
    throw new ValidationError('external effect receipt contains invalid authority or completion claims');
  }
  if (!Array.isArray(receipt.applied_files) || receipt.applied_files.length !== prepared.plan.changes.length) {
    throw new ValidationError('external effect receipt must exactly cover the prepared file set');
  }
  const planned = new Map(prepared.plan.changes.map(change => [change.path, change.new_content_sha256]));
  for (const file of receipt.applied_files) {
    const item = assertPlainObject(file, 'receipt.applied_file');
    const path = assertString(item.path, 'receipt.applied_file.path', { max: 240 });
    if (!planned.has(path) || item.new_content_sha256 !== planned.get(path)) {
      throw new ValidationError('external effect receipt applied-file digest does not match the prepared plan');
    }
    planned.delete(path);
  }
  if (planned.size) throw new ValidationError('external effect receipt omits a prepared file');
  return receipt;
}

export function buildExternalEffectPreparedEvent(preparedEffect) {
  const prepared = normalizePreparedExternalEffect(preparedEffect);
  return {
    kind: EXTERNAL_EFFECT_PREPARED_EVENT,
    subject: prepared.effect_id,
    payload: { prepared_effect: prepared }
  };
}

export function buildExternalEffectCompletedEvent(preparedEffect, receipt) {
  const prepared = normalizePreparedExternalEffect(preparedEffect);
  const verifiedReceipt = normalizeExternalEffectReceipt(receipt, prepared);
  return {
    kind: EXTERNAL_EFFECT_COMPLETED_EVENT,
    subject: prepared.effect_id,
    payload: {
      effect_id: prepared.effect_id,
      effect_digest: prepared.effect_digest,
      receipt: verifiedReceipt
    }
  };
}

function normalizePersistedEvent(raw) {
  const value = assertPlainObject(raw, 'external effect event');
  const kind = assertString(value.kind, 'external effect event kind', { max: 128 });
  if (![EXTERNAL_EFFECT_PREPARED_EVENT, EXTERNAL_EFFECT_COMPLETED_EVENT].includes(kind)) {
    throw new ValidationError('unsupported external effect event kind');
  }
  const subject = assertString(value.subject, 'external effect event subject', { max: 160, pattern: EFFECT_ID });
  const payload = assertPlainObject(value.payload, 'external effect event payload');
  const event = {
    kind,
    subject,
    payload,
    ...(Number.isSafeInteger(value.seq) ? { seq: value.seq } : {}),
    ...(typeof value.event_id === 'string' ? { event_id: value.event_id } : {}),
    ...(typeof value.event_hash === 'string' ? { event_hash: value.event_hash } : {}),
    ...(typeof value.actor === 'string' ? { actor: value.actor } : {})
  };
  return event;
}

export function deriveExternalEffectGridState(rawEvents, expectedEffectId) {
  if (!Array.isArray(rawEvents)) throw new ValidationError('external effect events must be an array');
  const events = rawEvents.map(normalizePersistedEvent);
  if (!events.length) return null;
  const effectId = assertString(expectedEffectId ?? events[0].subject, 'effect_id', {
    max: 160,
    pattern: EFFECT_ID
  });
  if (events.some(event => event.subject !== effectId)) {
    throw new ValidationError('external effect state contains mixed subjects');
  }
  if (events.filter(event => event.kind === EXTERNAL_EFFECT_PREPARED_EVENT).length !== 1) {
    throw new ValidationError('external effect must have exactly one durable prepared event');
  }
  if (events.filter(event => event.kind === EXTERNAL_EFFECT_COMPLETED_EVENT).length > 1) {
    throw new ValidationError('external effect may have at most one completed event');
  }
  const preparedEvent = events.find(event => event.kind === EXTERNAL_EFFECT_PREPARED_EVENT);
  const prepared = normalizePreparedExternalEffect(preparedEvent.payload.prepared_effect);
  if (prepared.effect_id !== effectId) throw new ValidationError('prepared effect id does not match event subject');
  if (preparedEvent.actor && preparedEvent.actor !== prepared.source_bindings.principal) {
    throw new ValidationError('prepared external effect actor does not match source principal');
  }
  const completedEvent = events.find(event => event.kind === EXTERNAL_EFFECT_COMPLETED_EVENT) ?? null;
  let receipt = null;
  if (completedEvent) {
    if (Number.isSafeInteger(preparedEvent.seq) && Number.isSafeInteger(completedEvent.seq) && completedEvent.seq <= preparedEvent.seq) {
      throw new ValidationError('external effect completion must follow durable preparation');
    }
    if (
      completedEvent.payload.effect_id !== prepared.effect_id
      || completedEvent.payload.effect_digest !== prepared.effect_digest
    ) {
      throw new ValidationError('external effect completion payload does not match prepared effect');
    }
    if (completedEvent.actor && completedEvent.actor !== prepared.source_bindings.principal) {
      throw new ValidationError('completed external effect actor does not match source principal');
    }
    receipt = normalizeExternalEffectReceipt(completedEvent.payload.receipt, prepared);
  }
  return {
    schema: EXTERNAL_EFFECT_GRID_STATE_SCHEMA,
    effect_id: prepared.effect_id,
    effect_digest: prepared.effect_digest,
    status: completedEvent ? 'completed' : 'prepared',
    prepared_effect: prepared,
    prepared_event: preparedEvent,
    receipt,
    completed_event: completedEvent,
    external_effect_executed_observed: Boolean(completedEvent),
    merge_performed: false,
    execution_authorized: false,
    remediation_converged: false
  };
}

export function preflightExternalEffectCommit({ actor, events, loadPersistedEvents }) {
  if (!Array.isArray(events)) return;
  const external = events.filter(event => typeof event?.kind === 'string' && event.kind.startsWith('external.effect.'));
  for (const event of external) {
    if (![EXTERNAL_EFFECT_PREPARED_EVENT, EXTERNAL_EFFECT_COMPLETED_EVENT].includes(event.kind)) {
      throw new ValidationError(`unsupported external effect transition: ${event.kind}`);
    }
  }
  const seenSubjects = new Set();
  for (const event of external) {
    if (seenSubjects.has(event.subject)) {
      throw new ValidationError('external effect transitions for one effect must be committed separately');
    }
    seenSubjects.add(event.subject);
    const persisted = loadPersistedEvents(event.subject);
    const current = persisted.length ? deriveExternalEffectGridState(persisted, event.subject) : null;
    if (event.kind === EXTERNAL_EFFECT_PREPARED_EVENT) {
      if (current) throw new AxiomError('external_effect_already_prepared', 'External effect is already prepared', 409);
      const prepared = normalizePreparedExternalEffect(event.payload?.prepared_effect);
      if (event.subject !== prepared.effect_id) throw new ValidationError('prepared event subject does not match effect id');
      if (actor !== prepared.source_bindings.principal) {
        throw new ValidationError('prepared external effect actor must match source principal');
      }
    } else {
      if (!current || current.status !== 'prepared') {
        throw new AxiomError(
          'external_effect_not_prepared',
          'External effect completion requires an already-durable prepared event',
          409
        );
      }
      const expected = buildExternalEffectCompletedEvent(
        current.prepared_effect,
        event.payload?.receipt
      );
      if (canonicalJson(expected) !== canonicalJson({
        kind: event.kind,
        subject: event.subject,
        payload: event.payload
      })) {
        throw new ValidationError('external effect completion event does not exactly match the prepared effect and receipt');
      }
      if (actor !== current.prepared_effect.source_bindings.principal) {
        throw new ValidationError('completed external effect actor must match source principal');
      }
    }
  }
}

export function assertExternalEffectCommitEvidence(response, expectedEvent) {
  const value = assertPlainObject(response, 'Grid commit response');
  if (!Array.isArray(value.events) || value.events.length !== 1) {
    throw new ValidationError('external effect Grid commit must return exactly one appended event');
  }
  const event = value.events[0];
  const expectedPayloadDigest = digestObject(expectedEvent.payload);
  if (
    event.kind !== expectedEvent.kind
    || event.subject !== expectedEvent.subject
    || digest(event.payload_digest, 'Grid external effect payload_digest') !== expectedPayloadDigest
  ) {
    throw new ValidationError('Grid commit evidence does not match the requested external effect transition');
  }
  assertString(event.event_id, 'Grid external effect event_id', { max: 192 });
  digest(event.event_hash, 'Grid external effect event_hash');
  if (!Number.isSafeInteger(event.seq) || event.seq <= 0) {
    throw new ValidationError('Grid external effect event sequence is invalid');
  }
  return event;
}
