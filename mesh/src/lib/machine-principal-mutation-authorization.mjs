import { types } from 'node:util';

import {
  AxiomError,
  ValidationError,
  assertContractDepth,
  assertPlainObject,
  assertString,
  digestObject,
  sha256
} from './canonical.mjs';
import { verifyObjectSignature } from './identity.mjs';
import {
  normalizeMachineCurrentnessProjection,
  normalizeMachineMutationAuthorization
} from './machine-principal-currentness.mjs';
import { normalizeMachinePrincipalAuthoritySnapshot } from './machine-principal.mjs';
import { assertMachineAuthorityAttenuation } from './machine-principal-attenuation.mjs';

const AUTHORIZATION_TTL_MS = 30_000;
const HUMAN_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const LIFECYCLE_ACTIONS = new Set([
  'machine.principal.lifecycle.initialize',
  'machine.principal.lifecycle.mutate'
]);
const TRANSITIONS = new Set(['initialize', 'narrow', 'revoke', 'compromise', 'expire']);

export function isMachineLifecycleAction(action) {
  return LIFECYCLE_ACTIONS.has(action);
}

export function buildMachineMutationAuthorization(identity, input) {
  if (!identity || identity.service !== 'hypervisor' || typeof identity.signObject !== 'function') {
    throw new ValidationError('Machine mutation authorization requires Hypervisor identity');
  }
  const value = assertPlainObject(input, 'machine mutation authorization input');
  const actor = assertPlainObject(value.actor, 'machine mutation actor');
  if (actor.type !== 'human') {
    throw new ValidationError('Machine lifecycle mutation actor must be human');
  }
  const actorId = assertString(actor.id, 'machine mutation actor id', {
    max: 160,
    pattern: HUMAN_ID
  });
  const root = normalizeMachinePrincipalAuthoritySnapshot(value.target_root);
  const transitionKind = assertString(
    value.transition_kind,
    'machine lifecycle transition kind',
    { max: 16 }
  );
  if (!TRANSITIONS.has(transitionKind)) {
    throw new ValidationError('Machine lifecycle transition kind is invalid');
  }
  const operation = transitionKind === 'initialize'
    ? 'machine.principal.lifecycle.initialize'
    : 'machine.principal.lifecycle.mutate';
  const currentness = value.currentness === null
    ? null
    : normalizeMachineCurrentnessProjection(value.currentness);
  if (transitionKind === 'initialize') {
    if (currentness !== null) {
      throw new ValidationError('Machine lifecycle initialization requires absent currentness');
    }
  } else if (currentness === null) {
    throw new ValidationError('Machine lifecycle mutation requires retained currentness');
  }
  if (currentness && (
    currentness.principal_id !== root.id
    || currentness.principal_type !== root.type
    || currentness.root_authority_digest !== root.authority_digest
  )) {
    throw new ValidationError('Machine lifecycle currentness does not bind the configured root');
  }

  let successorAuthorityDigest = null;
  if (transitionKind === 'initialize') {
    successorAuthorityDigest = root.authority_digest;
  } else if (transitionKind === 'narrow') {
    successorAuthorityDigest = normalizeMachinePrincipalAuthoritySnapshot(
      value.successor_authority
    ).authority_digest;
  } else if (value.successor_authority !== undefined && value.successor_authority !== null) {
    throw new ValidationError('Terminal machine lifecycle mutation cannot contain successor authority');
  }

  const policy = assertPlainObject(value.policy, 'machine mutation policy');
  const issuedAt = timestamp(value.issued_at, 'machine mutation issued_at');
  const intentId = assertString(value.intent_id, 'machine mutation intent_id', {
    max: 71,
    pattern: /^intent_[a-f0-9]{64}$/
  });
  const statement = normalizeMachineMutationAuthorization({
    schema: 'axiom-machine-principal-mutation-authorization.v1',
    actor_id: actorId,
    target_principal_id: root.id,
    target_principal_type: root.type,
    root_authority_digest: root.authority_digest,
    predecessor_lifecycle_seq: currentness?.lifecycle_seq ?? null,
    predecessor_lifecycle_head_digest: currentness?.lifecycle_head_digest ?? null,
    predecessor_authority_digest: currentness?.effective_authority_digest ?? null,
    transition_kind: transitionKind,
    successor_authority_digest: successorAuthorityDigest,
    reason: assertString(value.reason, 'machine lifecycle reason', { min: 1, max: 1000 }),
    policy_version: assertString(policy.version, 'machine mutation policy version', {
      min: 1,
      max: 160
    }),
    policy_digest: assertString(policy.digest, 'machine mutation policy digest', {
      min: 64,
      max: 64,
      pattern: /^[a-f0-9]{64}$/
    }),
    operation,
    intent_id: intentId,
    issued_at: issuedAt.toISOString(),
    effective_at: issuedAt.toISOString(),
    expires_at: new Date(issuedAt.valueOf() + AUTHORIZATION_TTL_MS).toISOString(),
    command_id: `machine_cmd_${sha256(intentId)}`
  });
  return Object.freeze({
    statement,
    signature: identity.signObject(statement),
    digest: digestObject(statement)
  });
}

export function verifyMachineMutationAuthorization(value, options = {}) {
  assertContractDepth(value, 'machine mutation authorization envelope');
  const { hypervisorPublicKey, now = new Date() } = exactVerificationOptions(options);
  const envelope = exactEnvelope(value);
  const statement = normalizeMachineMutationAuthorization(envelope.statement);
  if (envelope.digest !== digestObject(statement)) {
    throw new ValidationError('Machine mutation authorization digest is invalid');
  }
  if (!verifyObjectSignature(statement, envelope.signature, hypervisorPublicKey)) {
    throw new ValidationError('Machine mutation authorization signature is invalid');
  }
  const issuedAt = new Date(statement.issued_at);
  const expiresAt = new Date(statement.expires_at);
  if (expiresAt.valueOf() - issuedAt.valueOf() !== AUTHORIZATION_TTL_MS) {
    throw new ValidationError('Machine mutation authorization TTL is invalid');
  }
  const observed = timestamp(now, 'machine mutation verification time');
  if (observed.valueOf() < issuedAt.valueOf()) {
    throw new ValidationError('Machine mutation authorization is not yet active');
  }
  if (observed.valueOf() >= expiresAt.valueOf()) {
    throw new ValidationError('Machine mutation authorization is expired');
  }
  return statement;
}

export async function handleMachineLifecycleIntent({
  intent,
  traceId,
  decision,
  identity,
  gridGet,
  mutateCurrentness,
  commit,
  now = new Date()
}) {
  if (intent?.principal?.type !== 'human') {
    throw new AxiomError(
      'forbidden',
      'Machine lifecycle mutations require a human principal',
      403
    );
  }
  const root = normalizeMachinePrincipalAuthoritySnapshot(
    intent.input.resolved_machine_root
  );
  const transitionKind = intent.action === 'machine.principal.lifecycle.initialize'
    ? 'initialize'
    : assertString(intent.input.transition, 'machine lifecycle transition', { max: 16 });
  if (!TRANSITIONS.has(transitionKind) || transitionKind === 'initialize' && (
    intent.action !== 'machine.principal.lifecycle.initialize'
  )) {
    throw new ValidationError('Machine lifecycle action and transition are inconsistent');
  }

  let currentness = null;
  try {
    currentness = await gridGet(
      `/internal/v1/machine-currentness/${encodeURIComponent(root.id)}`,
      traceId
    );
  } catch (error) {
    if (error?.code !== 'machine_currentness_not_found') throw error;
  }
  if (transitionKind === 'initialize' && currentness !== null) {
    throw new AxiomError(
      'machine_currentness_already_initialized',
      'Machine principal currentness is already initialized',
      409
    );
  }
  if (transitionKind !== 'initialize' && currentness === null) {
    throw new AxiomError(
      'machine_currentness_not_found',
      'Machine principal currentness must be initialized before mutation',
      404
    );
  }
  if (currentness && currentness.root_authority_digest !== root.authority_digest) {
    throw new AxiomError(
      'machine_currentness_root_mismatch',
      'Configured machine root does not match retained currentness',
      409
    );
  }

  let successor = null;
  if (transitionKind === 'initialize') {
    successor = root;
  } else if (transitionKind === 'narrow') {
    successor = normalizeMachinePrincipalAuthoritySnapshot(
      intent.input.successor_authority
    );
    if (currentness.effective_authority === null) {
      throw new AxiomError(
        'machine_currentness_terminal',
        'Terminal machine currentness cannot be narrowed',
        409
      );
    }
    assertMachineAuthorityAttenuation(currentness.effective_authority, successor, { now });
  }

  const authorization = buildMachineMutationAuthorization(identity, {
    actor: intent.principal,
    target_root: root,
    currentness,
    transition_kind: transitionKind,
    ...(successor ? { successor_authority: successor } : {}),
    reason: intent.input.reason,
    policy: {
      version: decision.policy_version,
      digest: decision.policy_digest
    },
    intent_id: intent.intent_id,
    issued_at: now
  });
  const successorStatus = {
    initialize: 'active',
    narrow: 'narrowed',
    revoke: 'revoked',
    compromise: 'compromised',
    expire: 'expired'
  }[transitionKind];
  const transition = {
    schema: 'axiom-machine-principal-lifecycle-transition.v1',
    principal_id: root.id,
    principal_type: root.type,
    root_authority_digest: root.authority_digest,
    predecessor_lifecycle_seq: currentness?.lifecycle_seq ?? null,
    predecessor_lifecycle_head_digest: currentness?.lifecycle_head_digest ?? null,
    predecessor_authority_digest: currentness?.effective_authority_digest ?? null,
    successor_lifecycle_seq: (currentness?.lifecycle_seq ?? 0) + 1,
    successor_status: successorStatus,
    successor_authority_digest: successor?.authority_digest ?? null,
    successor_authority: successor,
    command_id: authorization.statement.command_id,
    command_digest: authorization.digest,
    mutation_authorization_digest: authorization.digest,
    actor_id: intent.principal.id,
    policy_version: authorization.statement.policy_version,
    policy_digest: authorization.statement.policy_digest,
    reason: authorization.statement.reason,
    effective_at: authorization.statement.effective_at
  };
  const projection = await mutateCurrentness({
    actor: intent.principal.id,
    authorization: authorization.statement,
    authorization_signature: authorization.signature,
    transition
  }, traceId);
  const lifecycle = {
    principal_id: projection.principal_id,
    principal_type: projection.principal_type,
    root_authority_digest: projection.root_authority_digest,
    status: projection.effective_status,
    lifecycle_seq: projection.lifecycle_seq,
    lifecycle_head_digest: projection.lifecycle_head_digest,
    effective_authority_digest: projection.effective_authority_digest,
    authority_effect: 'none'
  };
  const result = {
    intent_id: intent.intent_id,
    trace_id: traceId,
    status: 'completed',
    lifecycle,
    evidence: {
      policy_digest: decision.policy_digest,
      mutation_authorization_digest: authorization.digest
    }
  };
  await commit(traceId, intent.principal.id, [{
    kind: 'intent.completed',
    subject: intent.intent_id,
    payload: { intent_id: intent.intent_id, result }
  }]);
  return { httpStatus: 201, body: result };
}

function exactEnvelope(value) {
  const envelope = assertPlainObject(value, 'machine mutation authorization envelope');
  if (Object.keys(envelope).sort().join(',') !== 'digest,signature,statement') {
    throw new ValidationError('Machine mutation authorization envelope fields are invalid');
  }
  return envelope;
}

function exactVerificationOptions(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || types.isProxy(value)) {
    throw new ValidationError('Machine mutation verification options must be a plain object');
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new ValidationError('Machine mutation verification options must be a plain object');
  }
  const allowed = new Set(['hypervisorPublicKey', 'now']);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !allowed.has(key)) {
      throw new ValidationError('Machine mutation verification option fields are invalid');
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!Object.hasOwn(descriptor, 'value')) {
      throw new ValidationError('Machine mutation verification options must use data properties');
    }
  }
  if (!Object.hasOwn(value, 'hypervisorPublicKey')) {
    throw new ValidationError('Machine mutation verification requires Hypervisor public key');
  }
  return value;
}

function timestamp(value, label) {
  const date = value instanceof Date ? new Date(value.valueOf()) : new Date(value);
  if (Number.isNaN(date.valueOf())) throw new ValidationError(`${label} is invalid`);
  return date;
}
