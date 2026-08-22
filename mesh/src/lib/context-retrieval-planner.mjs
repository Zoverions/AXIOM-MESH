import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject
} from './canonical.mjs';
import { validateContextRequest } from './context-broker-compiler.mjs';

export const CONTEXT_VAULT_CATALOG_ENTRY_V1_SCHEMA =
  'axiom-context-vault-catalog-entry.v1';
export const CONTEXT_RETRIEVAL_PLAN_V1_SCHEMA =
  'axiom-context-retrieval-plan.v1';

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const SENSITIVITY = Object.freeze({
  'ordinary-private': 0,
  sensitive: 1,
  restricted: 2,
  'critical-secret': 3
});
const LOCAL_ACCESS = new Set([
  'none',
  'metadata-only',
  'lease-read',
  'lease-read-derive'
]);
const OPERATIONS = new Set(['read', 'derive']);
const CATALOG_KEYS = Object.freeze([
  'schema',
  'vault_id',
  'owner_subject_ref',
  'domain',
  'sensitivity_ceiling',
  'local_companion_access',
  'local_lease_required',
  'max_local_lease_seconds',
  'cross_vault_synthesis',
  'raw_external_disclosure',
  'allowed_purposes',
  'high_risk_disclosure_requires_owner_confirmation',
  'semantic_capabilities',
  'secret_material_in_catalog'
]);
const CAPABILITY_KEYS = Object.freeze([
  'semantic_type',
  'resource_refs',
  'sensitivity',
  'operations'
]);

export function validateContextVaultCatalogEntry(input) {
  const entry = cloneCanonical(input, 'context vault catalog entry');
  exactKeys(entry, CATALOG_KEYS, 'context vault catalog entry');
  if (entry.schema !== CONTEXT_VAULT_CATALOG_ENTRY_V1_SCHEMA) {
    throw new ValidationError('Context vault catalog entry schema is invalid');
  }
  assertId(entry.vault_id, 'context vault catalog vault_id');
  assertId(entry.owner_subject_ref, 'context vault catalog owner_subject_ref');
  assertString(entry.domain, 'context vault catalog domain', {
    min: 1,
    max: 160
  });
  assertSensitivity(
    entry.sensitivity_ceiling,
    'context vault catalog sensitivity_ceiling'
  );
  if (!LOCAL_ACCESS.has(entry.local_companion_access)) {
    throw new ValidationError(
      'Context vault catalog local_companion_access is invalid'
    );
  }
  assertConst(
    entry.local_lease_required,
    true,
    'context vault catalog local_lease_required'
  );
  assertBoundedInteger(
    entry.max_local_lease_seconds,
    'context vault catalog max_local_lease_seconds',
    1,
    86400
  );
  assertBoolean(
    entry.cross_vault_synthesis,
    'context vault catalog cross_vault_synthesis'
  );
  assertBoolean(
    entry.raw_external_disclosure,
    'context vault catalog raw_external_disclosure'
  );
  assertStringArray(entry.allowed_purposes, 'context vault catalog allowed_purposes', {
    min: 1,
    max: 128,
    maxStringLength: 160
  });
  assertBoolean(
    entry.high_risk_disclosure_requires_owner_confirmation,
    'context vault catalog high_risk_disclosure_requires_owner_confirmation'
  );
  assertConst(
    entry.secret_material_in_catalog,
    false,
    'context vault catalog secret_material_in_catalog'
  );

  if (
    !Array.isArray(entry.semantic_capabilities)
    || entry.semantic_capabilities.length < 1
    || entry.semantic_capabilities.length > 128
  ) {
    throw new ValidationError(
      'Context vault catalog semantic_capabilities must contain 1-128 items'
    );
  }
  const semanticTypes = new Set();
  for (let index = 0; index < entry.semantic_capabilities.length; index += 1) {
    const capability = assertPlainObject(
      entry.semantic_capabilities[index],
      `context vault catalog semantic_capabilities[${index}]`
    );
    exactKeys(
      capability,
      CAPABILITY_KEYS,
      `context vault catalog semantic_capabilities[${index}]`
    );
    const semanticType = assertString(
      capability.semantic_type,
      `context vault catalog semantic_capabilities[${index}].semantic_type`,
      { min: 1, max: 240 }
    );
    if (semanticTypes.has(semanticType)) {
      throw new ValidationError(
        'Context vault catalog contains duplicate semantic capability type'
      );
    }
    semanticTypes.add(semanticType);
    assertIdArray(
      capability.resource_refs,
      `context vault catalog semantic_capabilities[${index}].resource_refs`,
      { min: 1, max: 128 }
    );
    assertSensitivity(
      capability.sensitivity,
      `context vault catalog semantic_capabilities[${index}].sensitivity`
    );
    if (
      SENSITIVITY[capability.sensitivity]
      > SENSITIVITY[entry.sensitivity_ceiling]
    ) {
      throw new ValidationError(
        'Context vault catalog capability sensitivity exceeds vault ceiling'
      );
    }
    assertEnumArray(
      capability.operations,
      OPERATIONS,
      `context vault catalog semantic_capabilities[${index}].operations`,
      { min: 1, max: 2 }
    );
  }

  return deepFreeze(entry);
}

export function buildContextRetrievalPlan({
  request,
  vaultCatalog,
  brokerPrincipalRef,
  createdAt,
  maxPlanLifetimeSeconds = 300,
  maxRequestedLeaseSeconds = 300
} = {}) {
  validateContextRequest(request);
  const broker = assertId(
    brokerPrincipalRef,
    'context retrieval planner brokerPrincipalRef'
  );
  const createdAtMs = parseDateTime(
    createdAt,
    'context retrieval planner createdAt'
  );
  const requestIssuedAtMs = Date.parse(request.issued_at);
  const requestExpiresAtMs = Date.parse(request.expires_at);
  if (createdAtMs < requestIssuedAtMs || createdAtMs >= requestExpiresAtMs) {
    throw new ValidationError(
      'Context retrieval plan must be created during the request validity window'
    );
  }
  assertBoundedInteger(
    maxPlanLifetimeSeconds,
    'context retrieval planner maxPlanLifetimeSeconds',
    1,
    3600
  );
  assertBoundedInteger(
    maxRequestedLeaseSeconds,
    'context retrieval planner maxRequestedLeaseSeconds',
    1,
    86400
  );

  if (!Array.isArray(vaultCatalog) || vaultCatalog.length < 1 || vaultCatalog.length > 128) {
    throw new ValidationError(
      'Context retrieval planner vaultCatalog must contain 1-128 entries'
    );
  }
  const catalog = vaultCatalog.map(validateContextVaultCatalogEntry);
  const vaultIds = new Set();
  for (const entry of catalog) {
    if (vaultIds.has(entry.vault_id)) {
      throw new ValidationError('Context retrieval planner vaultCatalog contains duplicate vault_id');
    }
    vaultIds.add(entry.vault_id);
  }

  const needCandidates = request.semantic_needs.map(need => ({
    need,
    candidates: eligibleCandidates(request, need, catalog)
  }));
  const required = needCandidates
    .filter(item => item.need.required)
    .sort((left, right) => (
      left.candidates.length - right.candidates.length
      || left.need.semantic_type.localeCompare(right.need.semantic_type)
    ));
  const optional = needCandidates
    .filter(item => !item.need.required)
    .sort((left, right) => left.need.semantic_type.localeCompare(right.need.semantic_type));

  const selections = [];
  for (const item of required) {
    const candidate = item.candidates.find(value =>
      crossVaultCompatible([...selections, { need: item.need, candidate: value }])
    );
    if (!candidate) {
      throw new ValidationError(
        `Required semantic need cannot be minimally planned: ${item.need.semantic_type}`
      );
    }
    selections.push({ need: item.need, candidate });
  }

  const unresolvedOptional = [];
  for (const item of optional) {
    const candidate = item.candidates.find(value =>
      crossVaultCompatible([...selections, { need: item.need, candidate: value }])
    );
    if (!candidate) {
      unresolvedOptional.push(item.need.semantic_type);
      continue;
    }
    selections.push({ need: item.need, candidate });
  }

  const remainingRequestSeconds = Math.floor(
    (requestExpiresAtMs - createdAtMs) / 1000
  );
  if (remainingRequestSeconds < 1) {
    throw new ValidationError('Context retrieval request has no usable lifetime remaining');
  }
  const planLifetimeSeconds = Math.min(
    maxPlanLifetimeSeconds,
    remainingRequestSeconds
  );
  const planExpiresAt = new Date(
    createdAtMs + planLifetimeSeconds * 1000
  ).toISOString();

  const needPlans = selections
    .map(({ need, candidate }) => ({
      semantic_type: need.semantic_type,
      required: need.required,
      vault_id: candidate.entry.vault_id,
      domain: candidate.entry.domain,
      resource_refs: [...candidate.capability.resource_refs].sort(),
      requested_operation: candidate.required_operation,
      capability_sensitivity: candidate.capability.sensitivity,
      owner_confirmation_required:
        candidate.entry.high_risk_disclosure_requires_owner_confirmation,
      selection_basis: 'exact-semantic-minimum-resource-scope'
    }))
    .sort((left, right) => left.semantic_type.localeCompare(right.semantic_type));

  const leaseRequests = consolidateLeaseRequests({
    selections,
    request,
    brokerPrincipalRef: broker,
    remainingRequestSeconds,
    maxRequestedLeaseSeconds
  });

  const planCore = {
    schema: CONTEXT_RETRIEVAL_PLAN_V1_SCHEMA,
    request_id: request.request_id,
    owner_subject_ref: request.owner_subject_ref,
    broker_principal_ref: broker,
    created_at: new Date(createdAtMs).toISOString(),
    expires_at: planExpiresAt,
    need_plans: needPlans,
    unresolved_optional_semantic_types: unresolvedOptional.sort(),
    lease_requests: leaseRequests,
    minimum_necessary_by_construction: true,
    exact_semantic_matching_only: true,
    model_ranking_used: false,
    local_only: true,
    recipient_visible: false,
    contains_vault_topology: true,
    contains_raw_vault_content: false,
    reads_vaults: false,
    issues_leases: false,
    commits_access_receipts: false,
    grants_vault_access: false,
    grants_execution_authority: false
  };
  const plan = {
    ...planCore,
    plan_sha256: digestObject(planCore)
  };
  const planId = `context_plan_${digestObject({
    request_id: request.request_id,
    owner_subject_ref: request.owner_subject_ref,
    broker_principal_ref: broker,
    plan_sha256: plan.plan_sha256
  })}`;
  return deepFreeze({
    ...plan,
    plan_id: planId
  });
}

function eligibleCandidates(request, need, catalog) {
  const operation = operationForNeed(need);
  const candidates = [];
  for (const entry of catalog) {
    if (entry.owner_subject_ref !== request.owner_subject_ref) continue;
    if (!entry.allowed_purposes.includes(request.purpose)) continue;
    if (!accessAllows(entry.local_companion_access, operation)) continue;
    if (operation === 'read' && !entry.raw_external_disclosure) continue;
    const capability = entry.semantic_capabilities.find(
      value => value.semantic_type === need.semantic_type
    );
    if (!capability) continue;
    if (!capability.operations.includes(operation)) continue;
    if (
      SENSITIVITY[capability.sensitivity]
      > SENSITIVITY[need.maximum_sensitivity]
    ) continue;
    candidates.push({
      entry,
      capability,
      required_operation: operation
    });
  }
  candidates.sort(compareCandidates);
  return candidates;
}

function operationForNeed(need) {
  const transformed = need.acceptable_disclosure_modes.some(
    mode => mode !== 'owner-approved-verbatim'
  );
  return transformed ? 'derive' : 'read';
}

function accessAllows(access, operation) {
  if (access === 'lease-read-derive') return true;
  return access === 'lease-read' && operation === 'read';
}

function compareCandidates(left, right) {
  return (
    left.capability.resource_refs.length - right.capability.resource_refs.length
    || SENSITIVITY[left.capability.sensitivity]
      - SENSITIVITY[right.capability.sensitivity]
    || SENSITIVITY[left.entry.sensitivity_ceiling]
      - SENSITIVITY[right.entry.sensitivity_ceiling]
    || left.entry.vault_id.localeCompare(right.entry.vault_id)
  );
}

function crossVaultCompatible(selections) {
  const byVault = new Map();
  for (const selection of selections) {
    byVault.set(selection.candidate.entry.vault_id, selection.candidate.entry);
  }
  if (byVault.size <= 1) return true;
  return [...byVault.values()].every(entry => entry.cross_vault_synthesis);
}

function consolidateLeaseRequests({
  selections,
  request,
  brokerPrincipalRef,
  remainingRequestSeconds,
  maxRequestedLeaseSeconds
}) {
  const byVault = new Map();
  for (const { need, candidate } of selections) {
    const vaultId = candidate.entry.vault_id;
    let aggregate = byVault.get(vaultId);
    if (!aggregate) {
      aggregate = {
        entry: candidate.entry,
        semanticTypes: new Set(),
        resourceRefs: new Set(),
        operations: new Set(),
        maximumSensitivity: 'ordinary-private',
        ownerConfirmationRequired: false
      };
      byVault.set(vaultId, aggregate);
    }
    aggregate.semanticTypes.add(need.semantic_type);
    for (const resourceRef of candidate.capability.resource_refs) {
      aggregate.resourceRefs.add(resourceRef);
    }
    aggregate.operations.add(candidate.required_operation);
    if (
      SENSITIVITY[candidate.capability.sensitivity]
      > SENSITIVITY[aggregate.maximumSensitivity]
    ) {
      aggregate.maximumSensitivity = candidate.capability.sensitivity;
    }
    aggregate.ownerConfirmationRequired ||=
      candidate.entry.high_risk_disclosure_requires_owner_confirmation;
  }

  return [...byVault.entries()]
    .map(([vaultId, aggregate]) => ({
      vault_id: vaultId,
      owner_subject_ref: request.owner_subject_ref,
      holder_principal_ref: brokerPrincipalRef,
      purpose: request.purpose,
      task_class: request.task_class,
      semantic_types: [...aggregate.semanticTypes].sort(),
      resource_refs: [...aggregate.resourceRefs].sort(),
      requested_operations: [...aggregate.operations].sort(),
      maximum_sensitivity: aggregate.maximumSensitivity,
      requested_lease_seconds: Math.min(
        remainingRequestSeconds,
        maxRequestedLeaseSeconds,
        aggregate.entry.max_local_lease_seconds
      ),
      owner_confirmation_required: aggregate.ownerConfirmationRequired,
      exact_scope: true,
      wildcard_scope: false,
      delegable_requested: false,
      raw_key_material_requested: false,
      grants_vault_access: false,
      grants_execution_authority: false
    }))
    .sort((left, right) => left.vault_id.localeCompare(right.vault_id));
}

function cloneCanonical(value, label) {
  try {
    return JSON.parse(canonicalJson(value));
  } catch {
    throw new ValidationError(`${label} must be canonical JSON`);
  }
}

function exactKeys(value, keys, label) {
  assertPlainObject(value, label);
  const expected = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) {
      throw new ValidationError(`${label} contains unknown field ${key}`);
    }
  }
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) {
      throw new ValidationError(`${label} is missing required field ${key}`);
    }
  }
}

function assertId(value, label) {
  assertString(value, label, { min: 1, max: 160 });
  if (!ID_PATTERN.test(value)) {
    throw new ValidationError(`${label} has an invalid identifier`);
  }
  return value;
}

function assertIdArray(value, label, { min, max }) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new ValidationError(`${label} must contain ${min}-${max} identifiers`);
  }
  const seen = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const item = assertId(value[index], `${label}[${index}]`);
    if (seen.has(item)) throw new ValidationError(`${label} contains a duplicate identifier`);
    seen.add(item);
  }
}

function assertSensitivity(value, label) {
  if (!Object.hasOwn(SENSITIVITY, value)) {
    throw new ValidationError(`${label} is invalid`);
  }
}

function assertBoundedInteger(value, label, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ValidationError(`${label} must be an integer between ${min} and ${max}`);
  }
}

function assertBoolean(value, label) {
  if (typeof value !== 'boolean') {
    throw new ValidationError(`${label} must be boolean`);
  }
}

function assertConst(value, expected, label) {
  if (value !== expected) {
    throw new ValidationError(`${label} must equal ${JSON.stringify(expected)}`);
  }
}

function assertStringArray(value, label, {
  min,
  max,
  maxStringLength
}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new ValidationError(`${label} must contain ${min}-${max} strings`);
  }
  const seen = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const item = assertString(value[index], `${label}[${index}]`, {
      min: 1,
      max: maxStringLength
    });
    if (seen.has(item)) throw new ValidationError(`${label} contains a duplicate value`);
    seen.add(item);
  }
}

function assertEnumArray(value, allowed, label, { min, max }) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new ValidationError(`${label} must contain ${min}-${max} values`);
  }
  const seen = new Set();
  for (const item of value) {
    if (!allowed.has(item)) throw new ValidationError(`${label} contains an invalid value`);
    if (seen.has(item)) throw new ValidationError(`${label} contains a duplicate value`);
    seen.add(item);
  }
}

function parseDateTime(value, label) {
  assertString(value, label, { min: 20, max: 40 });
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new ValidationError(`${label} must be a valid date-time`);
  }
  return parsed;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}
