import {
  ValidationError,
  digestObject,
  sha256
} from './canonical.mjs';
import {
  normalizeMachinePrincipalAuthoritySnapshot
} from './machine-principal.mjs';
import {
  assertMachineAuthorityAttenuation,
  assertMachineAuthorityTimeActive
} from './machine-principal-attenuation.mjs';

export const MACHINE_MUTATION_AUTHORIZATION_SCHEMA =
  'axiom-machine-principal-mutation-authorization.v1';
export const MACHINE_LIFECYCLE_TRANSITION_SCHEMA =
  'axiom-machine-principal-lifecycle-transition.v1';
export const MACHINE_CURRENTNESS_PROJECTION_SCHEMA =
  'axiom-machine-principal-currentness-projection.v1';
export const MACHINE_EFFECT_RELEASE_SCHEMA =
  'axiom-machine-effect-release.v1';
export const MACHINE_CURRENTNESS_PRODUCTION_PREFLIGHT_EVALUATION_SCHEMA =
  'axiom-machine-currentness-production-preflight-evaluation.v1';

export const MACHINE_CURRENTNESS_EVENT_KINDS = Object.freeze([
  'machine.currentness.compromised',
  'machine.currentness.expired',
  'machine.currentness.initialized',
  'machine.currentness.narrowed',
  'machine.currentness.revoked'
]);

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const INTENT_ID = /^intent_[a-f0-9]{64}$/;
const COMMAND_ID = /^machine_cmd_[a-f0-9]{64}$/;
const RELEASE_ID = /^machine_release_[a-f0-9]{64}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const ACTION = /^[a-z][a-z0-9.-]{1,127}$/;
const DESTINATION = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,255}$/;
const MACHINE_TYPES = new Set(['agent', 'service']);
const TRANSITIONS = new Set([
  'initialize',
  'narrow',
  'revoke',
  'compromise',
  'expire'
]);
const STATUSES = new Set([
  'active',
  'narrowed',
  'revoked',
  'compromised',
  'expired'
]);
const TERMINAL = new Set(['revoked', 'compromised', 'expired']);
const PREFLIGHT_ENUMERATION_FIELDS = Object.freeze([
  'source_available',
  'source_verified',
  'complete',
  'expected_page_count',
  'observed_page_numbers'
]);
const PREFLIGHT_SEMANTICS = deepFreeze({
  evaluation_scope: 'pure-configured-principal-retained-grid-comparison',
  production_activation_authorized: false,
  registry_mutation_authorized: false,
  grid_mutation_authorized: false,
  authority_effect: 'none'
});

const MUTATION_FIELDS = Object.freeze([
  'schema',
  'actor_id',
  'target_principal_id',
  'target_principal_type',
  'root_authority_digest',
  'predecessor_lifecycle_seq',
  'predecessor_lifecycle_head_digest',
  'predecessor_authority_digest',
  'transition_kind',
  'successor_authority_digest',
  'reason',
  'policy_version',
  'policy_digest',
  'operation',
  'intent_id',
  'issued_at',
  'effective_at',
  'expires_at',
  'command_id'
]);

const TRANSITION_FIELDS = Object.freeze([
  'schema',
  'principal_id',
  'principal_type',
  'root_authority_digest',
  'predecessor_lifecycle_seq',
  'predecessor_lifecycle_head_digest',
  'predecessor_authority_digest',
  'successor_lifecycle_seq',
  'successor_status',
  'successor_authority_digest',
  'successor_authority',
  'command_id',
  'command_digest',
  'mutation_authorization_digest',
  'actor_id',
  'policy_version',
  'policy_digest',
  'reason',
  'effective_at'
]);

const PROJECTION_FIELDS = Object.freeze([
  'schema',
  'principal_id',
  'principal_type',
  'root_authority_digest',
  'retained_status',
  'effective_status',
  'lifecycle_seq',
  'lifecycle_head_event_id',
  'lifecycle_head_event_hash',
  'lifecycle_head_digest',
  'effective_authority_digest',
  'effective_authority',
  'grid_chain_seq',
  'grid_chain_head',
  'observed_at',
  'authority_effect'
]);

const RELEASE_FIELDS = Object.freeze([
  'schema',
  'release_id',
  'principal_id',
  'principal_type',
  'capability_id',
  'execution_attempt_id',
  'sandbox_execution_epoch',
  'intent_id',
  'plan_digest',
  'action',
  'destination',
  'root_authority_digest',
  'lifecycle_seq',
  'lifecycle_head_digest',
  'effective_authority_digest',
  'consumption_receipt_digest',
  'released_at',
  'authority_effect'
]);

export function normalizeMachineMutationAuthorization(raw) {
  const value = exactObject(raw, 'Machine mutation authorization', MUTATION_FIELDS);
  requireSchema(value.schema, MACHINE_MUTATION_AUTHORIZATION_SCHEMA);

  const transitionKind = enumValue(
    value.transition_kind,
    TRANSITIONS,
    'transition_kind'
  );
  const intentId = identifier(value.intent_id, 'intent_id', INTENT_ID);
  const commandId = identifier(value.command_id, 'command_id', COMMAND_ID);
  const expectedCommandId = `machine_cmd_${sha256(intentId)}`;
  if (commandId !== expectedCommandId) {
    throw new ValidationError(
      'Machine mutation command_id must derive from the accepted intent_id'
    );
  }

  const predecessorSeq = nullablePositiveInteger(
    value.predecessor_lifecycle_seq,
    'predecessor_lifecycle_seq'
  );
  const predecessorHead = nullableDigest(
    value.predecessor_lifecycle_head_digest,
    'predecessor_lifecycle_head_digest'
  );
  const predecessorAuthority = nullableDigest(
    value.predecessor_authority_digest,
    'predecessor_authority_digest'
  );
  const successorAuthority = nullableDigest(
    value.successor_authority_digest,
    'successor_authority_digest'
  );

  const operation = identifier(value.operation, 'operation', ACTION);
  if (transitionKind === 'initialize') {
    if (
      predecessorSeq !== null
      || predecessorHead !== null
      || predecessorAuthority !== null
    ) {
      throw new ValidationError(
        'Machine lifecycle initialize must use a null predecessor'
      );
    }
    if (operation !== 'machine.principal.lifecycle.initialize') {
      throw new ValidationError(
        'Machine lifecycle initialize authorization operation is invalid'
      );
    }
    if (successorAuthority === null) {
      throw new ValidationError(
        'Machine lifecycle initialize requires successor_authority_digest'
      );
    }
  } else {
    if (
      predecessorSeq === null
      || predecessorHead === null
      || predecessorAuthority === null
    ) {
      throw new ValidationError(
        'Machine lifecycle mutation requires an exact predecessor'
      );
    }
    if (operation !== 'machine.principal.lifecycle.mutate') {
      throw new ValidationError(
        'Machine lifecycle mutation authorization operation is invalid'
      );
    }
    if (transitionKind === 'narrow' && successorAuthority === null) {
      throw new ValidationError(
        'Machine lifecycle narrow requires successor_authority_digest'
      );
    }
    if (TERMINAL.has(statusForTransition(transitionKind))
      && successorAuthority !== null) {
      throw new ValidationError(
        'Terminal machine lifecycle mutation must not create successor authority'
      );
    }
  }

  const issuedAt = timestamp(value.issued_at, 'issued_at');
  const effectiveAt = timestamp(value.effective_at, 'effective_at');
  const expiresAt = timestamp(value.expires_at, 'expires_at');
  if (effectiveAt.valueOf() < issuedAt.valueOf()) {
    throw new ValidationError(
      'Machine mutation effective_at must not precede issued_at'
    );
  }
  if (expiresAt.valueOf() <= issuedAt.valueOf()
    || expiresAt.valueOf() < effectiveAt.valueOf()) {
    throw new ValidationError(
      'Machine mutation expires_at must follow issued_at and effective_at'
    );
  }

  return deepFreeze({
    schema: MACHINE_MUTATION_AUTHORIZATION_SCHEMA,
    actor_id: identifier(value.actor_id, 'actor_id', ID),
    target_principal_id: identifier(
      value.target_principal_id,
      'target_principal_id',
      ID
    ),
    target_principal_type: machineType(
      value.target_principal_type,
      'target_principal_type'
    ),
    root_authority_digest: digest(value.root_authority_digest, 'root_authority_digest'),
    predecessor_lifecycle_seq: predecessorSeq,
    predecessor_lifecycle_head_digest: predecessorHead,
    predecessor_authority_digest: predecessorAuthority,
    transition_kind: transitionKind,
    successor_authority_digest: successorAuthority,
    reason: boundedText(value.reason, 'reason', 1, 1000),
    policy_version: boundedText(value.policy_version, 'policy_version', 1, 160),
    policy_digest: digest(value.policy_digest, 'policy_digest'),
    operation,
    intent_id: intentId,
    issued_at: issuedAt.toISOString(),
    effective_at: effectiveAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    command_id: commandId
  });
}

export function normalizeMachineLifecycleTransition(raw) {
  const value = exactObject(raw, 'Machine lifecycle transition', TRANSITION_FIELDS);
  requireSchema(value.schema, MACHINE_LIFECYCLE_TRANSITION_SCHEMA);

  const predecessorSeq = nullablePositiveInteger(
    value.predecessor_lifecycle_seq,
    'predecessor_lifecycle_seq'
  );
  const predecessorHead = nullableDigest(
    value.predecessor_lifecycle_head_digest,
    'predecessor_lifecycle_head_digest'
  );
  const predecessorAuthority = nullableDigest(
    value.predecessor_authority_digest,
    'predecessor_authority_digest'
  );
  const successorSeq = positiveInteger(
    value.successor_lifecycle_seq,
    'successor_lifecycle_seq'
  );
  const successorStatus = enumValue(
    value.successor_status,
    STATUSES,
    'successor_status'
  );

  const initializing = successorStatus === 'active';
  if (initializing) {
    if (
      predecessorSeq !== null
      || predecessorHead !== null
      || predecessorAuthority !== null
      || successorSeq !== 1
    ) {
      throw new ValidationError(
        'Machine lifecycle initialization sequence is invalid'
      );
    }
  } else {
    if (
      predecessorSeq === null
      || predecessorHead === null
      || predecessorAuthority === null
      || successorSeq !== predecessorSeq + 1
    ) {
      throw new ValidationError(
        'Machine lifecycle successor sequence must advance the exact predecessor'
      );
    }
  }

  let successorAuthority = null;
  let successorAuthorityDigest = nullableDigest(
    value.successor_authority_digest,
    'successor_authority_digest'
  );

  if (TERMINAL.has(successorStatus)) {
    if (value.successor_authority !== null || successorAuthorityDigest !== null) {
      throw new ValidationError(
        'Terminal machine lifecycle transition must not contain successor authority'
      );
    }
  } else {
    successorAuthority = normalizeMachinePrincipalAuthoritySnapshot(
      value.successor_authority
    );
    if (
      successorAuthorityDigest === null
      || successorAuthorityDigest !== successorAuthority.authority_digest
    ) {
      throw new ValidationError(
        'Machine lifecycle successor_authority_digest does not match successor authority'
      );
    }
  }

  return deepFreeze({
    schema: MACHINE_LIFECYCLE_TRANSITION_SCHEMA,
    principal_id: identifier(value.principal_id, 'principal_id', ID),
    principal_type: machineType(value.principal_type, 'principal_type'),
    root_authority_digest: digest(value.root_authority_digest, 'root_authority_digest'),
    predecessor_lifecycle_seq: predecessorSeq,
    predecessor_lifecycle_head_digest: predecessorHead,
    predecessor_authority_digest: predecessorAuthority,
    successor_lifecycle_seq: successorSeq,
    successor_status: successorStatus,
    successor_authority_digest: successorAuthorityDigest,
    successor_authority: successorAuthority,
    command_id: identifier(value.command_id, 'command_id', COMMAND_ID),
    command_digest: digest(value.command_digest, 'command_digest'),
    mutation_authorization_digest: digest(
      value.mutation_authorization_digest,
      'mutation_authorization_digest'
    ),
    actor_id: identifier(value.actor_id, 'actor_id', ID),
    policy_version: boundedText(value.policy_version, 'policy_version', 1, 160),
    policy_digest: digest(value.policy_digest, 'policy_digest'),
    reason: boundedText(value.reason, 'reason', 1, 1000),
    effective_at: timestamp(value.effective_at, 'effective_at').toISOString()
  });
}

export function normalizeMachineCurrentnessProjection(raw) {
  const value = exactObject(raw, 'Machine currentness projection', PROJECTION_FIELDS);
  requireSchema(value.schema, MACHINE_CURRENTNESS_PROJECTION_SCHEMA);

  const retainedStatus = enumValue(
    value.retained_status,
    STATUSES,
    'retained_status'
  );
  const effectiveStatus = enumValue(
    value.effective_status,
    STATUSES,
    'effective_status'
  );

  if (TERMINAL.has(retainedStatus) && effectiveStatus !== retainedStatus) {
    throw new ValidationError(
      'Terminal retained machine currentness status cannot change at read time'
    );
  }
  if (
    !TERMINAL.has(retainedStatus)
    && effectiveStatus !== retainedStatus
    && effectiveStatus !== 'expired'
  ) {
    throw new ValidationError(
      'Machine currentness effective_status is inconsistent with retained_status'
    );
  }
  if (value.authority_effect !== 'none') {
    throw new ValidationError(
      'Machine currentness projection authority_effect must be none'
    );
  }

  let effectiveAuthority = null;
  let effectiveAuthorityDigest = nullableDigest(
    value.effective_authority_digest,
    'effective_authority_digest'
  );

  if (TERMINAL.has(retainedStatus)) {
    if (value.effective_authority !== null || effectiveAuthorityDigest !== null) {
      throw new ValidationError(
        'Terminal retained machine currentness must not expose effective authority'
      );
    }
  } else {
    effectiveAuthority = normalizeMachinePrincipalAuthoritySnapshot(
      value.effective_authority
    );
    if (
      effectiveAuthorityDigest === null
      || effectiveAuthorityDigest !== effectiveAuthority.authority_digest
    ) {
      throw new ValidationError(
        'Machine currentness effective_authority_digest does not match authority'
      );
    }
  }

  return deepFreeze({
    schema: MACHINE_CURRENTNESS_PROJECTION_SCHEMA,
    principal_id: identifier(value.principal_id, 'principal_id', ID),
    principal_type: machineType(value.principal_type, 'principal_type'),
    root_authority_digest: digest(value.root_authority_digest, 'root_authority_digest'),
    retained_status: retainedStatus,
    effective_status: effectiveStatus,
    lifecycle_seq: positiveInteger(value.lifecycle_seq, 'lifecycle_seq'),
    lifecycle_head_event_id: identifier(
      value.lifecycle_head_event_id,
      'lifecycle_head_event_id',
      ID
    ),
    lifecycle_head_event_hash: digest(
      value.lifecycle_head_event_hash,
      'lifecycle_head_event_hash'
    ),
    lifecycle_head_digest: digest(
      value.lifecycle_head_digest,
      'lifecycle_head_digest'
    ),
    effective_authority_digest: effectiveAuthorityDigest,
    effective_authority: effectiveAuthority,
    grid_chain_seq: nonNegativeInteger(value.grid_chain_seq, 'grid_chain_seq'),
    grid_chain_head: digest(value.grid_chain_head, 'grid_chain_head'),
    observed_at: timestamp(value.observed_at, 'observed_at').toISOString(),
    authority_effect: 'none'
  });
}

export function normalizeMachineEffectRelease(raw) {
  const value = exactObject(raw, 'Machine effect release', RELEASE_FIELDS);
  requireSchema(value.schema, MACHINE_EFFECT_RELEASE_SCHEMA);
  if (value.authority_effect !== 'exact-machine-effect-release') {
    throw new ValidationError(
      'Machine effect release authority_effect must be exact-machine-effect-release'
    );
  }

  return deepFreeze({
    schema: MACHINE_EFFECT_RELEASE_SCHEMA,
    release_id: identifier(value.release_id, 'release_id', RELEASE_ID),
    principal_id: identifier(value.principal_id, 'principal_id', ID),
    principal_type: machineType(value.principal_type, 'principal_type'),
    capability_id: identifier(value.capability_id, 'capability_id', ID),
    execution_attempt_id: identifier(
      value.execution_attempt_id,
      'execution_attempt_id',
      ID
    ),
    sandbox_execution_epoch: identifier(
      value.sandbox_execution_epoch,
      'sandbox_execution_epoch',
      ID
    ),
    intent_id: identifier(value.intent_id, 'intent_id', INTENT_ID),
    plan_digest: digest(value.plan_digest, 'plan_digest'),
    action: identifier(value.action, 'action', ACTION),
    destination: identifier(value.destination, 'destination', DESTINATION),
    root_authority_digest: digest(value.root_authority_digest, 'root_authority_digest'),
    lifecycle_seq: positiveInteger(value.lifecycle_seq, 'lifecycle_seq'),
    lifecycle_head_digest: digest(
      value.lifecycle_head_digest,
      'lifecycle_head_digest'
    ),
    effective_authority_digest: digest(
      value.effective_authority_digest,
      'effective_authority_digest'
    ),
    consumption_receipt_digest: digest(
      value.consumption_receipt_digest,
      'consumption_receipt_digest'
    ),
    released_at: timestamp(value.released_at, 'released_at').toISOString(),
    authority_effect: 'exact-machine-effect-release'
  });
}

export function evaluateMachineCurrentnessProductionPreflight({
  configuredPrincipals,
  retainedProjections,
  enumeration
} = {}) {
  if (!Array.isArray(configuredPrincipals)) {
    throw new ValidationError('configuredPrincipals must be an array');
  }
  if (!Array.isArray(retainedProjections)) {
    throw new ValidationError('retainedProjections must be an array');
  }

  const configured = configuredPrincipals
    .map(item => normalizeMachinePrincipalAuthoritySnapshot(item))
    .sort(comparePrincipalBinding);
  const retained = retainedProjections
    .map(item => normalizeMachineCurrentnessProjection(item))
    .sort(comparePrincipalBinding);
  const enumerationEvidence = normalizePreflightEnumeration(enumeration);

  const configuredById = firstByPrincipalId(configured);
  const retainedById = firstByPrincipalId(retained);
  const configuredIds = [...configuredById.keys()].sort();
  const retainedIds = [...retainedById.keys()].sort();
  const observedPages = [...enumerationEvidence.observed_page_numbers].sort((a, b) => a - b);
  const observedPageSet = new Set(observedPages);

  const details = deepFreeze({
    configured_only_ids: configuredIds.filter(id => !retainedById.has(id)),
    retained_only_ids: retainedIds.filter(id => !configuredById.has(id)),
    duplicate_configured_ids: duplicatePrincipalIds(configured),
    duplicate_retained_ids: duplicatePrincipalIds(retained),
    principal_type_mismatch_ids: configuredIds.filter(id => (
      retainedById.has(id)
      && configuredById.get(id).type !== retainedById.get(id).principal_type
    )),
    root_authority_digest_mismatch_ids: configuredIds.filter(id => (
      retainedById.has(id)
      && configuredById.get(id).authority_digest
        !== retainedById.get(id).root_authority_digest
    )),
    duplicate_page_numbers: duplicateNumbers(observedPages),
    missing_page_numbers: integerRange(1, enumerationEvidence.expected_page_count)
      .filter(page => !observedPageSet.has(page)),
    unexpected_page_numbers: [...observedPageSet]
      .filter(page => page > enumerationEvidence.expected_page_count)
      .sort((a, b) => a - b)
  });

  const blockers = [];
  if (!enumerationEvidence.source_available) blockers.push('grid-enumeration-unavailable');
  if (!enumerationEvidence.source_verified) blockers.push('grid-enumeration-unverified');
  if (!enumerationEvidence.complete) blockers.push('grid-enumeration-incomplete');
  if (details.duplicate_page_numbers.length) blockers.push('duplicate-grid-page-number');
  if (details.missing_page_numbers.length || details.unexpected_page_numbers.length) {
    blockers.push('grid-pagination-gap');
  }
  if (details.duplicate_configured_ids.length) {
    blockers.push('duplicate-configured-principal-id');
  }
  if (details.duplicate_retained_ids.length) blockers.push('duplicate-retained-principal-id');
  if (details.configured_only_ids.length) blockers.push('configured-principal-missing-from-grid');
  if (details.retained_only_ids.length) blockers.push('orphan-retained-grid-principal');
  if (details.principal_type_mismatch_ids.length) blockers.push('principal-type-mismatch');
  if (details.root_authority_digest_mismatch_ids.length) {
    blockers.push('root-authority-digest-mismatch');
  }
  blockers.sort();

  const body = deepFreeze({
    schema: MACHINE_CURRENTNESS_PRODUCTION_PREFLIGHT_EVALUATION_SCHEMA,
    ready: blockers.length === 0,
    blockers,
    configured_principal_count: configured.length,
    retained_projection_count: retained.length,
    enumeration: enumerationEvidence,
    configured_bindings: configured.map(item => ({
      principal_id: item.id,
      principal_type: item.type,
      root_authority_digest: item.authority_digest
    })),
    retained_bindings: retained.map(item => ({
      principal_id: item.principal_id,
      principal_type: item.principal_type,
      root_authority_digest: item.root_authority_digest
    })),
    details,
    semantics: PREFLIGHT_SEMANTICS
  });

  return deepFreeze({
    ...body,
    evidence_digest: digestObject(body)
  });
}

export function enumerateConfiguredMachinePrincipalAuthorities(principals) {
  if (!(principals instanceof Map)) {
    throw new ValidationError(
      'Configured machine principal enumeration requires a normalized API principal Map'
    );
  }

  const configured = [];
  const principalIds = new Set();
  for (const principal of principals.values()) {
    if (principal?.schema !== 'axiom-machine-principal.v1') {
      if (principal?.type === 'agent') {
        throw new ValidationError(
          'Configured agent principal must use axiom-machine-principal.v1'
        );
      }
      continue;
    }
    const snapshot = normalizeMachinePrincipalAuthoritySnapshot(principal);
    if (principalIds.has(snapshot.id)) {
      throw new ValidationError(
        `Duplicate configured machine principal id: ${snapshot.id}`
      );
    }
    principalIds.add(snapshot.id);
    configured.push(snapshot);
  }
  configured.sort(comparePrincipalBinding);

  return deepFreeze({
    source_available: true,
    source_verified: true,
    complete: true,
    principal_count: configured.length,
    principals: configured,
    production_activation_authorized: false,
    authority_effect: 'none'
  });
}

export function resolveEffectiveMachinePrincipal(
  rootPrincipal,
  currentnessInput,
  { observedAt = new Date() } = {}
) {
  const root = normalizeMachinePrincipalAuthoritySnapshot(rootPrincipal);
  const currentness = normalizeMachineCurrentnessProjection(currentnessInput);

  if (currentness.principal_id !== root.id
    || currentness.principal_type !== root.type) {
    throw new ValidationError(
      'Machine currentness principal binding does not match root principal'
    );
  }
  if (currentness.root_authority_digest !== root.authority_digest) {
    throw new ValidationError('Machine currentness root authority digest mismatch');
  }
  if (TERMINAL.has(currentness.retained_status)) {
    throw new ValidationError(
      `Machine currentness is terminal: ${currentness.retained_status}`
    );
  }

  let effective = normalizeMachinePrincipalAuthoritySnapshot(
    currentness.effective_authority
  );
  if (effective.authority_digest === root.authority_digest) {
    assertMachineAuthorityTimeActive(effective, observedAt);
  } else {
    effective = assertMachineAuthorityAttenuation(root, effective, {
      now: observedAt
    });
  }
  if (currentness.effective_status === 'expired') {
    throw new ValidationError('Machine currentness effective authority is expired');
  }
  assertMachineAuthorityTimeActive(effective, observedAt);

  return deepFreeze({
    effective_principal: effective,
    currentness_binding: {
      root_authority_digest: root.authority_digest,
      effective_authority_digest: effective.authority_digest,
      lifecycle_seq: currentness.lifecycle_seq,
      lifecycle_head_digest: currentness.lifecycle_head_digest
    }
  });
}

function statusForTransition(kind) {
  switch (kind) {
    case 'initialize': return 'active';
    case 'narrow': return 'narrowed';
    case 'revoke': return 'revoked';
    case 'compromise': return 'compromised';
    case 'expire': return 'expired';
    default: throw new ValidationError('Machine lifecycle transition kind is invalid');
  }
}

function normalizePreflightEnumeration(raw) {
  const value = exactObject(
    raw,
    'Machine currentness production preflight enumeration',
    PREFLIGHT_ENUMERATION_FIELDS
  );
  for (const field of ['source_available', 'source_verified', 'complete']) {
    if (typeof value[field] !== 'boolean') {
      throw new ValidationError(`Machine currentness production preflight ${field} must be boolean`);
    }
  }
  const expectedPageCount = nonNegativeInteger(
    value.expected_page_count,
    'Machine currentness production preflight expected_page_count'
  );
  if (expectedPageCount > 10_000) {
    throw new ValidationError(
      'Machine currentness production preflight expected_page_count exceeds 10000'
    );
  }
  if (!Array.isArray(value.observed_page_numbers) || value.observed_page_numbers.length > 10_000) {
    throw new ValidationError(
      'Machine currentness production preflight observed_page_numbers must contain at most 10000 values'
    );
  }
  const observedPageNumbers = value.observed_page_numbers.map((page, index) => positiveInteger(
    page,
    `Machine currentness production preflight observed_page_numbers[${index}]`
  ));
  return deepFreeze({
    source_available: value.source_available,
    source_verified: value.source_verified,
    complete: value.complete,
    expected_page_count: expectedPageCount,
    observed_page_numbers: [...observedPageNumbers].sort((a, b) => a - b)
  });
}

function comparePrincipalBinding(left, right) {
  const leftId = left.id ?? left.principal_id;
  const rightId = right.id ?? right.principal_id;
  if (leftId !== rightId) return leftId.localeCompare(rightId);
  const leftType = left.type ?? left.principal_type;
  const rightType = right.type ?? right.principal_type;
  if (leftType !== rightType) return leftType.localeCompare(rightType);
  const leftDigest = left.authority_digest ?? left.root_authority_digest;
  const rightDigest = right.authority_digest ?? right.root_authority_digest;
  return leftDigest.localeCompare(rightDigest);
}

function firstByPrincipalId(values) {
  const byId = new Map();
  for (const value of values) {
    const id = value.id ?? value.principal_id;
    if (!byId.has(id)) byId.set(id, value);
  }
  return byId;
}

function duplicatePrincipalIds(values) {
  const counts = new Map();
  for (const value of values) {
    const id = value.id ?? value.principal_id;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts]
    .filter(([, count]) => count > 1)
    .map(([id]) => id)
    .sort();
}

function duplicateNumbers(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts]
    .filter(([, count]) => count > 1)
    .map(([value]) => value)
    .sort((a, b) => a - b);
}

function integerRange(first, last) {
  return Array.from({ length: Math.max(0, last - first + 1) }, (_, index) => first + index);
}

function exactObject(value, label, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${label} must be an object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new ValidationError(`${label} must be a plain object`);
  }
  const actual = Object.keys(value).sort().join(',');
  const expected = [...fields].sort().join(',');
  if (actual !== expected) {
    throw new ValidationError(`${label} fields are invalid`);
  }
  return value;
}

function requireSchema(value, expected) {
  if (value !== expected) {
    throw new ValidationError(`Schema must be ${expected}`);
  }
}

function machineType(value, label) {
  if (!MACHINE_TYPES.has(value)) {
    throw new ValidationError(`${label} must be agent or service`);
  }
  return value;
}

function enumValue(value, allowed, label) {
  if (!allowed.has(value)) {
    throw new ValidationError(`${label} is invalid`);
  }
  return value;
}

function identifier(value, label, pattern) {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new ValidationError(`${label} is invalid`);
  }
  return value;
}

function digest(value, label) {
  return identifier(value, label, DIGEST);
}

function nullableDigest(value, label) {
  if (value === null) return null;
  return digest(value, label);
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new ValidationError(`${label} must be a positive safe integer`);
  }
  return value;
}

function nonNegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ValidationError(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function nullablePositiveInteger(value, label) {
  if (value === null) return null;
  return positiveInteger(value, label);
}

function boundedText(value, label, min, max) {
  if (
    typeof value !== 'string'
    || value.length < min
    || value.length > max
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
  ) {
    throw new ValidationError(`${label} is invalid`);
  }
  return value;
}

function timestamp(value, label) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 64) {
    throw new ValidationError(`${label} must be a timestamp`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.valueOf()) || date.toISOString() !== value) {
    throw new ValidationError(`${label} must be an ISO timestamp`);
  }
  return date;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
