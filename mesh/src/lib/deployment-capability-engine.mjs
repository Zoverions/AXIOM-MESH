import { digestObject, ValidationError } from './canonical.mjs';
import { validateResourceEnvelope } from './resource-envelope.mjs';
import {
  requireFreshResourceObservations,
  validateResourceObservation
} from './resource-observation.mjs';
import {
  capabilitySurfacesDigest,
  validateCapabilitySurfaceRegistry
} from './capability-surfaces.mjs';
import {
  normalizeContributionPolicy,
  normalizeHostProfile,
  normalizeSovereigntyReserve
} from './host-sovereignty.mjs';
import { validateRuntimeConnectorCatalogEntry } from './runtime-connector-fabric-contracts.mjs';

export const DESIRED_DEPLOYMENT_SCHEMA = 'axiom-desired-deployment.v0';
export const DEPLOYMENT_PROVIDER_BINDING_SCHEMA = 'axiom-deployment-provider-binding.v0';
export const DEPLOYMENT_SPEC_SCHEMA = 'axiom-deployment-spec.v0';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const ROLES = new Set([
  'personal-node',
  'cognition-provider',
  'storage-provider',
  'backup-provider',
  'compute-worker',
  'agent-execution-worker',
  'interface-endpoint',
  'embodiment-endpoint',
  'infrastructure-only'
]);
const LOCALITIES = new Set([
  'local-only',
  'prefer-local',
  'hybrid',
  'cloud-allowed'
]);
const PRIORITIES = new Set([
  'cost',
  'balanced',
  'performance',
  'intelligence'
]);
const PROVIDER_KINDS = new Set([
  'existing-host-component',
  'runtime-catalog-entry',
  'local-service',
  'external-service',
  'adapter',
  'install-profile'
]);
const PRESENCE_STATES = new Set([
  'installed-available',
  'installed-unavailable',
  'available-not-installed',
  'unknown'
]);
const HOST_POLICY_KINDS = new Set([
  'host-profile',
  'contribution-policy',
  'sovereignty-reserve'
]);
const RESOURCE_FIELDS = Object.freeze([
  'cpu_millis',
  'memory_bytes',
  'accelerator_memory_bytes',
  'durable_storage_bytes',
  'scratch_storage_bytes',
  'io_bytes',
  'network_bytes',
  'network_requests',
  'model_calls',
  'input_units',
  'output_units',
  'concurrency',
  'wall_time_ms',
  'monetary_cost_units',
  'energy_millijoules',
  'process_count',
  'thread_count',
  'file_descriptors'
]);

export function validateDesiredDeployment(document) {
  validateDesiredShape(document);
  return Object.freeze({
    valid: true,
    schema: DESIRED_DEPLOYMENT_SCHEMA,
    deployment_id: document.deployment_id,
    target_host_ref: document.target_host_ref,
    desired_digest: digestObject(document),
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  });
}

export function validateDeploymentProviderBinding(document) {
  validateBindingShape(document);
  return Object.freeze({
    valid: true,
    schema: DEPLOYMENT_PROVIDER_BINDING_SCHEMA,
    binding_id: document.binding_id,
    provider_ref: document.provider_ref,
    binding_digest: digestObject(document),
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  });
}

export function validateDeploymentSpec(document, context = {}) {
  validateSpecShape(document);
  const desired = validateDesiredDeployment(document.desired);
  validateResourceEnvelope(document.resource_envelope);
  if (document.resource_envelope.host_ref !== desired.target_host_ref) {
    throw new ValidationError(
      'resource envelope host does not match desired deployment host'
    );
  }

  for (const observation of document.resource_observations) {
    validateResourceObservation(observation);
  }
  const asOf = canonicalDate(context.as_of, 'context.as_of');
  requireFreshResourceObservations(
    document.resource_envelope,
    document.resource_observations,
    asOf
  );

  const capabilitySurface = plainObject(
    context.capability_surface,
    'context.capability_surface'
  );
  validateCapabilitySurfaceRegistry(capabilitySurface);
  if (capabilitySurface.registry_id !== document.capability_surface_ref.registry_id) {
    throw new ValidationError('capability surface registry identity mismatch');
  }
  if (
    capabilitySurfacesDigest(capabilitySurface)
    !== document.capability_surface_ref.registry_digest
  ) {
    throw new ValidationError('capability surface registry digest mismatch');
  }

  const providerArtifacts = plainObject(
    context.provider_artifacts,
    'context.provider_artifacts'
  );
  const bindingIds = new Set();
  const providerIdentities = new Map();
  for (const binding of document.provider_bindings) {
    validateDeploymentProviderBinding(binding);
    if (binding.host_ref !== desired.target_host_ref) {
      throw new ValidationError(
        `provider binding host does not match desired deployment host for ${binding.binding_id}`
      );
    }
    if (bindingIds.has(binding.binding_id)) {
      throw new ValidationError(
        `duplicate deployment provider binding ${binding.binding_id}`
      );
    }
    bindingIds.add(binding.binding_id);

    const priorProviderDigest = providerIdentities.get(binding.provider_ref);
    if (
      priorProviderDigest !== undefined
      && priorProviderDigest !== binding.provider_digest
    ) {
      throw new ValidationError(
        `provider identity conflict for ${binding.provider_ref}`
      );
    }
    providerIdentities.set(binding.provider_ref, binding.provider_digest);

    if (!Object.hasOwn(providerArtifacts, binding.provider_ref)) {
      throw new ValidationError(
        `provider artifact is missing for ${binding.provider_ref}`
      );
    }
    const artifact = providerArtifacts[binding.provider_ref];
    if (digestObject(artifact) !== binding.provider_digest) {
      throw new ValidationError(
        `provider artifact digest mismatch for ${binding.provider_ref}`
      );
    }
    if (binding.provider_kind === 'runtime-catalog-entry') {
      validateRuntimeConnectorCatalogEntry(artifact);
    }
  }

  const hostPolicyArtifacts = plainObject(
    context.host_policy_artifacts,
    'context.host_policy_artifacts'
  );
  for (const policyRef of document.host_policy_refs) {
    const artifact = hostPolicyArtifacts[policyRef.policy_ref];
    if (artifact === undefined) {
      throw new ValidationError(
        `host policy artifact is missing for ${policyRef.policy_ref}`
      );
    }
    validateHostPolicyArtifact(policyRef.policy_kind, artifact);
    if (digestObject(artifact) !== policyRef.policy_digest) {
      throw new ValidationError(
        `host policy artifact digest mismatch for ${policyRef.policy_ref}`
      );
    }
  }

  return Object.freeze({
    valid: true,
    schema: DEPLOYMENT_SPEC_SCHEMA,
    deployment_id: desired.deployment_id,
    target_host_ref: desired.target_host_ref,
    deployment_spec_digest: digestObject(document),
    execution_authorized: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  });
}

export function deploymentSpecDigest(document, context = {}) {
  validateDeploymentSpec(document, context);
  return digestObject(document);
}

function validateDesiredShape(document) {
  exactObject(document, 'DesiredDeployment', [
    'schema',
    'version',
    'status',
    'deployment_id',
    'target_host_ref',
    'roles',
    'required_capabilities',
    'preferences',
    'created_at',
    'contains_secret_material',
    'authority_effect',
    'network_effect',
    'runtime_activation'
  ]);
  if (
    document.schema !== DESIRED_DEPLOYMENT_SCHEMA
    || document.version !== 0
    || document.status !== 'inert-desire'
  ) {
    throw new ValidationError(
      'DesiredDeployment schema/version/status is invalid'
    );
  }
  id(document.deployment_id, 'deployment_id');
  id(document.target_host_ref, 'target_host_ref');
  uniqueEnums(document.roles, 'roles', ROLES, 1, 16);
  uniqueIds(
    document.required_capabilities,
    'required_capabilities',
    1,
    32
  );
  validatePreferences(document.preferences);
  canonicalDate(document.created_at, 'created_at');
  inertBoundary(document, 'DesiredDeployment');
}

function validatePreferences(value) {
  exactObject(value, 'preferences', [
    'locality',
    'priority',
    'reuse_existing',
    'offline_required',
    'allow_replacement'
  ]);
  enumValue(value.locality, 'preferences.locality', LOCALITIES);
  enumValue(value.priority, 'preferences.priority', PRIORITIES);
  booleanValue(value.reuse_existing, 'preferences.reuse_existing');
  booleanValue(value.offline_required, 'preferences.offline_required');
  booleanValue(value.allow_replacement, 'preferences.allow_replacement');
}

function validateBindingShape(document) {
  exactObject(document, 'DeploymentProviderBinding', [
    'schema',
    'version',
    'status',
    'binding_id',
    'provider_kind',
    'provider_ref',
    'provider_digest',
    'capability_ids',
    'host_ref',
    'presence_state',
    'resource_request',
    'requires_network',
    'requires_privileged_change',
    'requires_reboot',
    'data_egress_possible',
    'replacement_required',
    'evidence_refs',
    'contains_secret_material',
    'authority_effect',
    'network_effect',
    'runtime_activation'
  ]);
  if (
    document.schema !== DEPLOYMENT_PROVIDER_BINDING_SCHEMA
    || document.version !== 0
    || document.status !== 'inert-provider-binding'
  ) {
    throw new ValidationError(
      'DeploymentProviderBinding schema/version/status is invalid'
    );
  }
  id(document.binding_id, 'binding_id');
  enumValue(document.provider_kind, 'provider_kind', PROVIDER_KINDS);
  id(document.provider_ref, 'provider_ref');
  digest(document.provider_digest, 'provider_digest');
  uniqueIds(document.capability_ids, 'capability_ids', 1, 32);
  id(document.host_ref, 'host_ref');
  enumValue(document.presence_state, 'presence_state', PRESENCE_STATES);
  validateResourceRequest(document.resource_request);
  for (const field of [
    'requires_network',
    'requires_privileged_change',
    'requires_reboot',
    'data_egress_possible',
    'replacement_required'
  ]) {
    booleanValue(document[field], field);
  }
  uniqueIds(document.evidence_refs, 'evidence_refs', 1, 32);
  inertBoundary(document, 'DeploymentProviderBinding');
}

function validateResourceRequest(value) {
  exactObject(value, 'resource_request', RESOURCE_FIELDS);
  for (const field of RESOURCE_FIELDS) {
    finiteInteger(
      value[field],
      `resource_request.${field}`,
      0,
      Number.MAX_SAFE_INTEGER
    );
  }
}

function validateSpecShape(document) {
  exactObject(document, 'DeploymentSpec', [
    'schema',
    'version',
    'status',
    'desired',
    'resource_envelope',
    'resource_observations',
    'host_policy_refs',
    'capability_surface_ref',
    'provider_bindings',
    'created_at',
    'contains_secret_material',
    'authority_effect',
    'network_effect',
    'runtime_activation',
    'execution_authorized'
  ]);
  if (
    document.schema !== DEPLOYMENT_SPEC_SCHEMA
    || document.version !== 0
    || document.status !== 'inert-deployment-spec'
  ) {
    throw new ValidationError('DeploymentSpec schema/version/status is invalid');
  }
  if (
    !Array.isArray(document.resource_observations)
    || document.resource_observations.length < 1
    || document.resource_observations.length > 64
  ) {
    throw new ValidationError(
      'resource_observations must contain 1-64 items'
    );
  }
  validateHostPolicyRefs(document.host_policy_refs);
  validateCapabilitySurfaceRef(document.capability_surface_ref);
  if (
    !Array.isArray(document.provider_bindings)
    || document.provider_bindings.length < 1
    || document.provider_bindings.length > 128
  ) {
    throw new ValidationError('provider_bindings must contain 1-128 items');
  }
  for (const binding of document.provider_bindings) {
    validateBindingShape(binding);
  }
  canonicalDate(document.created_at, 'created_at');
  inertBoundary(document, 'DeploymentSpec');
  if (document.execution_authorized !== false) {
    throw new ValidationError(
      'DeploymentSpec execution_authorized must be false'
    );
  }
}

function validateHostPolicyRefs(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 16) {
    throw new ValidationError('host_policy_refs must contain 1-16 items');
  }
  const kinds = new Set();
  const refs = new Set();
  for (const item of value) {
    exactObject(item, 'host_policy_ref', [
      'policy_kind',
      'policy_ref',
      'policy_digest'
    ]);
    enumValue(item.policy_kind, 'policy_kind', HOST_POLICY_KINDS);
    id(item.policy_ref, 'policy_ref');
    digest(item.policy_digest, 'policy_digest');
    if (kinds.has(item.policy_kind)) {
      throw new ValidationError(
        `host_policy_refs contains duplicate policy_kind ${item.policy_kind}`
      );
    }
    if (refs.has(item.policy_ref)) {
      throw new ValidationError(
        `host_policy_refs contains duplicate policy_ref ${item.policy_ref}`
      );
    }
    kinds.add(item.policy_kind);
    refs.add(item.policy_ref);
  }
}

function validateCapabilitySurfaceRef(value) {
  exactObject(value, 'capability_surface_ref', [
    'registry_id',
    'registry_digest'
  ]);
  id(value.registry_id, 'capability_surface_ref.registry_id');
  digest(value.registry_digest, 'capability_surface_ref.registry_digest');
}

function validateHostPolicyArtifact(kind, artifact) {
  if (kind === 'host-profile') return normalizeHostProfile(artifact);
  if (kind === 'contribution-policy') {
    return normalizeContributionPolicy(artifact);
  }
  if (kind === 'sovereignty-reserve') {
    return normalizeSovereigntyReserve(artifact);
  }
  throw new ValidationError(`Unsupported host policy kind ${kind}`);
}

function inertBoundary(document, label) {
  if (document.contains_secret_material !== false) {
    throw new ValidationError(
      `${label} contains_secret_material must be false`
    );
  }
  if (document.authority_effect !== 'none') {
    throw new ValidationError(`${label} authority_effect must be none`);
  }
  if (document.network_effect !== 'none') {
    throw new ValidationError(`${label} network_effect must be none`);
  }
  if (document.runtime_activation !== false) {
    throw new ValidationError(`${label} runtime_activation must be false`);
  }
}

function exactObject(value, label, fields) {
  plainObject(value, label);
  const allowed = new Set(fields);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new ValidationError(`${label} contains unknown field ${key}`);
    }
  }
  for (const key of fields) {
    if (!Object.hasOwn(value, key)) {
      throw new ValidationError(`${label} is missing required field ${key}`);
    }
  }
}

function plainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${label} must be a plain object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new ValidationError(`${label} must be a plain object`);
  }
  return value;
}

function id(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) {
    throw new ValidationError(`${label} is invalid`);
  }
  return value;
}

function digest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) {
    throw new ValidationError(`${label} must be a lowercase SHA-256 digest`);
  }
  return value;
}

function enumValue(value, label, allowed) {
  if (typeof value !== 'string' || !allowed.has(value)) {
    throw new ValidationError(`${label} has an invalid value`);
  }
  return value;
}

function uniqueEnums(value, label, allowed, min, max) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new ValidationError(`${label} must contain ${min}-${max} items`);
  }
  const seen = new Set();
  for (const item of value) {
    enumValue(item, label, allowed);
    if (seen.has(item)) {
      throw new ValidationError(`${label} contains duplicate ${item}`);
    }
    seen.add(item);
  }
}

function uniqueIds(value, label, min, max) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new ValidationError(`${label} must contain ${min}-${max} items`);
  }
  const seen = new Set();
  for (const item of value) {
    id(item, label);
    if (seen.has(item)) {
      throw new ValidationError(`${label} contains duplicate ${item}`);
    }
    seen.add(item);
  }
}

function finiteInteger(value, label, minimum, maximum) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new ValidationError(
      `${label} must be an integer between ${minimum} and ${maximum}`
    );
  }
}

function booleanValue(value, label) {
  if (typeof value !== 'boolean') {
    throw new ValidationError(`${label} must be a boolean`);
  }
}

function canonicalDate(value, label) {
  if (typeof value !== 'string' || value.length > 64) {
    throw new ValidationError(`${label} must be a canonical ISO timestamp`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new ValidationError(`${label} must be a canonical ISO timestamp`);
  }
  return value;
}
