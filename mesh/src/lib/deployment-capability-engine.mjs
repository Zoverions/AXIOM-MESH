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
  evaluateContribution,
  normalizeContributionPolicy,
  normalizeHostProfile,
  normalizeSovereigntyReserve
} from './host-sovereignty.mjs';
import { validateRuntimeConnectorCatalogEntry } from './runtime-connector-fabric-contracts.mjs';

export const DESIRED_DEPLOYMENT_SCHEMA = 'axiom-desired-deployment.v0';
export const DEPLOYMENT_PROVIDER_BINDING_SCHEMA = 'axiom-deployment-provider-binding.v0';
export const DEPLOYMENT_SPEC_SCHEMA = 'axiom-deployment-spec.v0';
export const DEPLOYMENT_PLAN_SCHEMA = 'axiom-deployment-plan.v0';

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
    deployment_spec_digest: semanticDeploymentSpecDigest(document),
    execution_authorized: false,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  });
}

export function deploymentSpecDigest(document, context = {}) {
  validateDeploymentSpec(document, context);
  return semanticDeploymentSpecDigest(document);
}

export function resolveDeploymentPlan(document, context = {}) {
  const validation = validateDeploymentSpec(document, context);
  const desired = document.desired;
  const rejected = [];
  const rejectedIds = new Set();
  const globalReasons = new Set();

  for (const binding of [...document.provider_bindings].sort(compareBindingId)) {
    const reasons = new Set(hardConstraintReasons(binding, document));
    const hostDecision = evaluateHostSovereigntyIfPresent(context, binding);
    if (hostDecision !== null && !hostDecision.allowed) {
      reasons.add('host-sovereignty-conflict');
    }
    const reasonCodes = [...reasons].sort();
    if (reasonCodes.length === 0) continue;
    rejectedIds.add(binding.binding_id);
    for (const reason of reasonCodes) globalReasons.add(reason);
    rejected.push(Object.freeze({
      binding_id: binding.binding_id,
      reason_codes: Object.freeze(reasonCodes)
    }));
  }

  const satisfiedExisting = new Set();
  const selectedBindings = new Set();
  const unsatisfiedCapabilities = new Set();
  const ownerChoices = [];
  const bindings = [...document.provider_bindings].sort(compareBindingId);

  for (const capabilityId of [...desired.required_capabilities].sort()) {
    const compatible = bindings.filter((binding) => (
      !rejectedIds.has(binding.binding_id)
      && binding.capability_ids.includes(capabilityId)
      && ['installed-available', 'available-not-installed'].includes(
        binding.presence_state
      )
    ));
    const installed = compatible.filter(
      (binding) => binding.presence_state === 'installed-available'
    );

    if (desired.preferences.reuse_existing && installed.length === 1) {
      satisfiedExisting.add(capabilityId);
      globalReasons.add('existing-capability-reused');
      continue;
    }

    const candidates = desired.preferences.reuse_existing
      ? compatible.filter(
        (binding) => binding.presence_state === 'available-not-installed'
      )
      : compatible;

    if (desired.preferences.reuse_existing && installed.length > 1) {
      addOwnerChoice(ownerChoices, capabilityId, installed, globalReasons);
      continue;
    }

    if (candidates.length === 1) {
      selectedBindings.add(candidates[0].binding_id);
      continue;
    }
    if (candidates.length > 1) {
      addOwnerChoice(ownerChoices, capabilityId, candidates, globalReasons);
      continue;
    }

    unsatisfiedCapabilities.add(capabilityId);
    globalReasons.add('no-compatible-provider');
  }

  const projected = projectDownstreamPlans(
    bindings.filter((binding) => selectedBindings.has(binding.binding_id)),
    context,
    globalReasons
  );

  const draft = Object.freeze({
    schema: DEPLOYMENT_PLAN_SCHEMA,
    version: 0,
    deployment_id: desired.deployment_id,
    target_host_ref: desired.target_host_ref,
    deployment_spec_digest: validation.deployment_spec_digest,
    satisfied_existing: Object.freeze([...satisfiedExisting].sort()),
    selected_bindings: Object.freeze([...selectedBindings].sort()),
    unsatisfied_capabilities: Object.freeze(
      [...unsatisfiedCapabilities].sort()
    ),
    rejected_bindings: Object.freeze(rejected),
    downstream_plan_requests: projected.requests,
    consequences: projected.consequences,
    owner_choices: Object.freeze(ownerChoices),
    reason_codes: Object.freeze([...globalReasons].sort()),
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    execution_authorized: false
  });

  return Object.freeze({
    ...draft,
    plan_digest: digestObject(draft)
  });
}

function projectDownstreamPlans(bindings, context, globalReasons) {
  const requests = [];
  const consequences = [];
  const providerArtifacts = plainObject(
    context.provider_artifacts,
    'context.provider_artifacts'
  );

  for (const binding of [...bindings].sort(compareBindingId)) {
    consequences.push(Object.freeze({
      binding_id: binding.binding_id,
      provider_ref: binding.provider_ref,
      presence_state: binding.presence_state,
      requires_network: binding.requires_network,
      requires_privileged_change: binding.requires_privileged_change,
      requires_reboot: binding.requires_reboot,
      data_egress_possible: binding.data_egress_possible,
      replacement_required: binding.replacement_required
    }));

    const requestKinds = [];
    if (
      binding.provider_kind === 'install-profile'
      || binding.requires_privileged_change
    ) {
      requestKinds.push([
        'host-install-plan',
        'downstream-install-plan-required'
      ]);
    }

    if (binding.provider_kind === 'runtime-catalog-entry') {
      const artifact = providerArtifacts[binding.provider_ref];
      validateRuntimeConnectorCatalogEntry(artifact);
      if (artifact.integration_class === 'agent-runtime') {
        requestKinds.push([
          'runtime-acquisition-plan',
          'downstream-runtime-plan-required'
        ]);
      } else if (artifact.integration_class === 'model-provider') {
        requestKinds.push([
          'model-acquisition-plan',
          'downstream-model-plan-required'
        ]);
      }
    }

    if (binding.provider_kind === 'adapter') {
      requestKinds.push([
        'adapter-configuration-plan',
        'downstream-adapter-plan-required'
      ]);
    }

    for (const [kind, reason] of requestKinds) {
      globalReasons.add(reason);
      requests.push(Object.freeze({
        kind,
        binding_id: binding.binding_id,
        provider_ref: binding.provider_ref,
        provider_digest: binding.provider_digest,
        capability_ids: Object.freeze([...binding.capability_ids].sort()),
        evidence_refs: Object.freeze([...binding.evidence_refs].sort()),
        requirements: Object.freeze({
          presence_state: binding.presence_state,
          requires_network: binding.requires_network,
          requires_privileged_change: binding.requires_privileged_change,
          requires_reboot: binding.requires_reboot,
          data_egress_possible: binding.data_egress_possible,
          replacement_required: binding.replacement_required
        })
      }));
    }
  }

  requests.sort(compareDownstreamRequest);
  return Object.freeze({
    requests: Object.freeze(requests),
    consequences: Object.freeze(consequences)
  });
}

function compareDownstreamRequest(left, right) {
  return (
    left.binding_id.localeCompare(right.binding_id)
    || left.kind.localeCompare(right.kind)
  );
}

function evaluateHostSovereigntyIfPresent(context, binding) {
  const collection = context.host_sovereignty_evidence;
  if (collection === undefined) return null;
  const evidenceByBinding = plainObject(
    collection,
    'context.host_sovereignty_evidence'
  );
  if (!Object.hasOwn(evidenceByBinding, binding.binding_id)) return null;
  const evidence = plainObject(
    evidenceByBinding[binding.binding_id],
    `context.host_sovereignty_evidence.${binding.binding_id}`
  );
  return evaluateContribution({
    policy: evidence.policy,
    reserve: evidence.reserve,
    runtime: evidence.runtime,
    request: evidence.request,
    guardianState: evidence.guardian_state,
    remoteConstraints: evidence.remote_constraints
  });
}

function addOwnerChoice(ownerChoices, capabilityId, bindings, globalReasons) {
  const reasonCodes = Object.freeze([
    'insufficient-ranking-evidence',
    'owner-choice-required'
  ]);
  ownerChoices.push(Object.freeze({
    capability_id: capabilityId,
    binding_ids: Object.freeze(bindings.map((item) => item.binding_id).sort()),
    reason_codes: reasonCodes
  }));
  globalReasons.add('insufficient-ranking-evidence');
  globalReasons.add('owner-choice-required');
}

function hardConstraintReasons(binding, document) {
  const reasons = new Set();
  const preferences = document.desired.preferences;

  if (preferences.offline_required && binding.requires_network) {
    reasons.add('offline-conflict');
  }
  if (
    preferences.locality === 'local-only'
    && binding.provider_kind === 'external-service'
  ) {
    reasons.add('locality-conflict');
  }
  if (binding.replacement_required && !preferences.allow_replacement) {
    reasons.add('replacement-forbidden');
  }
  if (RESOURCE_FIELDS.some((field) => (
    binding.resource_request[field]
    > document.resource_envelope.hard_ceilings[field]
  ))) {
    reasons.add('resource-envelope-conflict');
  }

  return [...reasons].sort();
}

function semanticDeploymentSpecDigest(document) {
  const normalized = {
    ...document,
    desired: {
      ...document.desired,
      roles: [...document.desired.roles].sort(),
      required_capabilities: [...document.desired.required_capabilities].sort()
    },
    resource_envelope: normalizeResourceEnvelopeForDigest(
      document.resource_envelope
    ),
    resource_observations: [...document.resource_observations]
      .map((observation) => digestObject(observation))
      .sort(),
    host_policy_refs: [...document.host_policy_refs]
      .map((item) => ({ ...item }))
      .sort(compareHostPolicyRef),
    provider_bindings: [...document.provider_bindings]
      .map((binding) => ({
        ...binding,
        capability_ids: [...binding.capability_ids].sort(),
        evidence_refs: [...binding.evidence_refs].sort()
      }))
      .sort(compareBindingId)
  };
  return digestObject(normalized);
}

function normalizeResourceEnvelopeForDigest(envelope) {
  return {
    ...envelope,
    required_observation_kinds: [
      ...envelope.required_observation_kinds
    ].sort(),
    degradation_policy_refs: [...envelope.degradation_policy_refs].sort(),
    fallback_refs: [...envelope.fallback_refs].sort()
  };
}

function compareBindingId(left, right) {
  return left.binding_id.localeCompare(right.binding_id);
}

function compareHostPolicyRef(left, right) {
  return (
    left.policy_kind.localeCompare(right.policy_kind)
    || left.policy_ref.localeCompare(right.policy_ref)
  );
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
