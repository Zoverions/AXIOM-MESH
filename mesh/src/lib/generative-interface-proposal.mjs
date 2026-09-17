import {
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject
} from './canonical.mjs';

export const GENERATIVE_INTERFACE_PROPOSAL_SCHEMA =
  'axiom-generative-interface-proposal.v0';

const VERSION = 0;
const STATUS = 'inert-generative-interface-proposal';
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const CANONICAL_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const RESERVED_AUTHORITY_FIELDS = new Set([
  'authorization',
  'approval',
  'grant',
  'credential',
  'token',
  'capability_proof'
]);

const PROPOSAL_FIELDS = Object.freeze([
  'schema',
  'version',
  'status',
  'proposal_id',
  'generator',
  'renderer',
  'component_registry_digest',
  'operation_catalog_digest',
  'context_projection_digest',
  'capability_snapshot_digest',
  'components',
  'components_digest',
  'action_requests',
  'action_requests_digest',
  'proposed_at',
  'authority_effect',
  'network_effect',
  'runtime_activation'
]);

const GENERATOR_FIELDS = Object.freeze([
  'provider_ref',
  'model_ref',
  'adapter_ref'
]);
const RENDERER_FIELDS = Object.freeze([
  'renderer_ref',
  'renderer_version'
]);
const COMPONENT_FIELDS = Object.freeze([
  'component_id',
  'type',
  'props',
  'action_request_id'
]);
const ACTION_REQUEST_FIELDS = Object.freeze([
  'request_id',
  'operation_ref',
  'arguments',
  'consequence',
  'confirmation',
  'authorization_claim',
  'execution_effect'
]);
const REGISTRY_FIELDS = Object.freeze(['type']);
const OPERATION_FIELDS = Object.freeze([
  'operation_ref',
  'consequence',
  'confirmation'
]);

function exactFields(value, fields, name) {
  const allowed = new Set(fields);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new ValidationError(`${name} contains unknown field ${key}`);
    }
  }
  for (const key of fields) {
    if (!Object.hasOwn(value, key)) {
      throw new ValidationError(`${name}.${key} is required`);
    }
  }
}

function identifier(value, name) {
  return assertString(value, name, { min: 1, max: 160, pattern: IDENTIFIER });
}

function digest(value, name) {
  return assertString(value, name, { min: 64, max: 64, pattern: DIGEST });
}

function timestamp(value, name) {
  assertString(value, name, { min: 24, max: 24, pattern: CANONICAL_TIMESTAMP });
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new ValidationError(`${name} must be a canonical UTC timestamp`);
  }
  return value;
}

function cloneCanonical(value, name) {
  try {
    digestObject(value);
    return structuredClone(value);
  } catch (error) {
    throw new ValidationError(`${name} must be canonical JSON data`, {
      cause: error?.message
    });
  }
}

function validateGenerator(input) {
  const value = assertPlainObject(input, 'generative interface generator');
  exactFields(value, GENERATOR_FIELDS, 'generative interface generator');
  return Object.freeze({
    provider_ref: identifier(value.provider_ref, 'generative interface generator.provider_ref'),
    model_ref: identifier(value.model_ref, 'generative interface generator.model_ref'),
    adapter_ref: identifier(value.adapter_ref, 'generative interface generator.adapter_ref')
  });
}

function validateRenderer(input) {
  const value = assertPlainObject(input, 'generative interface renderer');
  exactFields(value, RENDERER_FIELDS, 'generative interface renderer');
  return Object.freeze({
    renderer_ref: identifier(value.renderer_ref, 'generative interface renderer.renderer_ref'),
    renderer_version: assertString(
      value.renderer_version,
      'generative interface renderer.renderer_version',
      { min: 1, max: 80 }
    )
  });
}

function validateComponentRegistry(input) {
  if (!Array.isArray(input) || input.length === 0) {
    throw new ValidationError('component registry must be a non-empty array');
  }
  const types = new Set();
  for (const [index, entry] of input.entries()) {
    const value = assertPlainObject(entry, `component registry[${index}]`);
    exactFields(value, REGISTRY_FIELDS, `component registry[${index}]`);
    const type = identifier(value.type, `component registry[${index}].type`);
    if (!types.add(type)) {
      throw new ValidationError(`component registry contains duplicate type ${type}`);
    }
  }
  return types;
}

function validateOperationCatalog(input) {
  if (!Array.isArray(input) || input.length === 0) {
    throw new ValidationError('operation catalog must be a non-empty array');
  }
  const operations = new Map();
  for (const [index, entry] of input.entries()) {
    const value = assertPlainObject(entry, `operation catalog[${index}]`);
    exactFields(value, OPERATION_FIELDS, `operation catalog[${index}]`);
    const operationRef = identifier(
      value.operation_ref,
      `operation catalog[${index}].operation_ref`
    );
    const consequence = assertString(
      value.consequence,
      `operation catalog[${index}].consequence`,
      { min: 1, max: 80 }
    );
    const confirmation = assertString(
      value.confirmation,
      `operation catalog[${index}].confirmation`,
      { min: 1, max: 80 }
    );
    if (consequence === 'consequential' && confirmation !== 'canonical-required') {
      throw new ValidationError(
        `consequential operation ${operationRef} requires canonical confirmation`
      );
    }
    if (operations.has(operationRef)) {
      throw new ValidationError(`operation catalog contains duplicate operation ${operationRef}`);
    }
    operations.set(operationRef, Object.freeze({ consequence, confirmation }));
  }
  return operations;
}

function assertNoAuthorityFields(value, path = 'generated action arguments') {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      assertNoAuthorityFields(item, `${path}[${index}]`);
    }
    return;
  }
  if (value === null || typeof value !== 'object') return;
  const object = assertPlainObject(value, path);
  for (const [key, child] of Object.entries(object)) {
    if (RESERVED_AUTHORITY_FIELDS.has(key.toLowerCase())) {
      throw new ValidationError(`reserved authority field ${key} is not allowed in generated action arguments`);
    }
    assertNoAuthorityFields(child, `${path}.${key}`);
  }
}

function validateActionRequests(input, operations) {
  if (!Array.isArray(input)) {
    throw new ValidationError('generative interface action requests must be an array');
  }
  const ids = new Set();
  return input.map((entry, index) => {
    const value = assertPlainObject(entry, `generative interface action_requests[${index}]`);
    const creationShape = !Object.hasOwn(value, 'authorization_claim') &&
      !Object.hasOwn(value, 'execution_effect');
    const expectedFields = creationShape
      ? ACTION_REQUEST_FIELDS.slice(0, 5)
      : ACTION_REQUEST_FIELDS;
    exactFields(value, expectedFields, `generative interface action_requests[${index}]`);

    const requestId = identifier(
      value.request_id,
      `generative interface action_requests[${index}].request_id`
    );
    if (!ids.add(requestId)) {
      throw new ValidationError(`generative interface contains duplicate action request ${requestId}`);
    }
    const operationRef = identifier(
      value.operation_ref,
      `generative interface action_requests[${index}].operation_ref`
    );
    const catalogEntry = operations.get(operationRef);
    if (!catalogEntry) {
      throw new ValidationError(`operation ${operationRef} is not in the supplied catalog`);
    }
    if (value.consequence !== catalogEntry.consequence) {
      throw new ValidationError(`action request consequence must match the supplied catalog for ${operationRef}`);
    }
    if (value.confirmation !== catalogEntry.confirmation) {
      throw new ValidationError(`action request confirmation must match the supplied catalog for ${operationRef}`);
    }
    const argumentsValue = assertPlainObject(
      value.arguments,
      `generative interface action_requests[${index}].arguments`
    );
    assertNoAuthorityFields(argumentsValue);
    const args = cloneCanonical(
      argumentsValue,
      `generative interface action_requests[${index}].arguments`
    );
    if (!creationShape) {
      if (value.authorization_claim !== 'none') {
        throw new ValidationError('generated action request authorization claim must be none');
      }
      if (value.execution_effect !== 'none') {
        throw new ValidationError('generated action request execution effect must be none');
      }
    }
    return Object.freeze({
      request_id: requestId,
      operation_ref: operationRef,
      arguments: args,
      consequence: catalogEntry.consequence,
      confirmation: catalogEntry.confirmation,
      authorization_claim: 'none',
      execution_effect: 'none'
    });
  });
}

function validateComponents(input, componentTypes, actionRequestIds) {
  if (!Array.isArray(input) || input.length === 0) {
    throw new ValidationError('generative interface components must be a non-empty array');
  }
  const ids = new Set();
  return input.map((entry, index) => {
    const value = assertPlainObject(entry, `generative interface components[${index}]`);
    exactFields(value, COMPONENT_FIELDS, `generative interface components[${index}]`);
    const componentId = identifier(
      value.component_id,
      `generative interface components[${index}].component_id`
    );
    if (!ids.add(componentId)) {
      throw new ValidationError(`generative interface contains duplicate component ${componentId}`);
    }
    const type = identifier(value.type, `generative interface components[${index}].type`);
    if (!componentTypes.has(type)) {
      throw new ValidationError(`component type ${type} is not registered`);
    }
    const props = cloneCanonical(
      assertPlainObject(value.props, `generative interface components[${index}].props`),
      `generative interface components[${index}].props`
    );
    let actionRequestId = value.action_request_id;
    if (actionRequestId !== null) {
      actionRequestId = identifier(
        actionRequestId,
        `generative interface components[${index}].action_request_id`
      );
      if (!actionRequestIds.has(actionRequestId)) {
        throw new ValidationError(`component ${componentId} references unknown action request ${actionRequestId}`);
      }
    }
    return Object.freeze({
      component_id: componentId,
      type,
      props,
      action_request_id: actionRequestId
    });
  });
}

function validateBindings(value, context) {
  const componentTypes = validateComponentRegistry(context.componentRegistry);
  const operations = validateOperationCatalog(context.operationCatalog);
  cloneCanonical(context.contextProjection, 'context projection');
  cloneCanonical(context.capabilitySnapshot, 'capability snapshot');

  if (value.component_registry_digest !== digestObject(context.componentRegistry)) {
    throw new ValidationError('component registry digest does not match current registry');
  }
  if (value.operation_catalog_digest !== digestObject(context.operationCatalog)) {
    throw new ValidationError('operation catalog digest does not match current catalog');
  }
  if (value.context_projection_digest !== digestObject(context.contextProjection)) {
    throw new ValidationError('context projection digest does not match current projection');
  }
  if (value.capability_snapshot_digest !== digestObject(context.capabilitySnapshot)) {
    throw new ValidationError('capability snapshot digest does not match current snapshot');
  }

  const actionRequests = validateActionRequests(value.action_requests, operations);
  const actionIds = new Set(actionRequests.map(request => request.request_id));
  const components = validateComponents(value.components, componentTypes, actionIds);
  if (value.components_digest !== digestObject(value.components)) {
    throw new ValidationError('components digest does not match generated components');
  }
  if (value.action_requests_digest !== digestObject(value.action_requests)) {
    throw new ValidationError('action requests digest does not match generated action requests');
  }
  return { components, actionRequests };
}

export function createGenerativeInterfaceProposal(input) {
  const value = assertPlainObject(input, 'generative interface proposal input');
  const componentTypes = validateComponentRegistry(value.componentRegistry);
  const operations = validateOperationCatalog(value.operationCatalog);
  const contextProjection = cloneCanonical(value.contextProjection, 'context projection');
  const capabilitySnapshot = cloneCanonical(value.capabilitySnapshot, 'capability snapshot');
  const actionRequests = validateActionRequests(value.actionRequests, operations);
  const actionIds = new Set(actionRequests.map(request => request.request_id));
  const components = validateComponents(value.components, componentTypes, actionIds);

  const proposal = {
    schema: GENERATIVE_INTERFACE_PROPOSAL_SCHEMA,
    version: VERSION,
    status: STATUS,
    proposal_id: identifier(value.proposalId, 'generative interface proposal.proposal_id'),
    generator: validateGenerator(value.generator),
    renderer: validateRenderer(value.renderer),
    component_registry_digest: digestObject(value.componentRegistry),
    operation_catalog_digest: digestObject(value.operationCatalog),
    context_projection_digest: digestObject(contextProjection),
    capability_snapshot_digest: digestObject(capabilitySnapshot),
    components,
    components_digest: digestObject(components),
    action_requests: actionRequests,
    action_requests_digest: digestObject(actionRequests),
    proposed_at: timestamp(value.proposedAt, 'generative interface proposal.proposed_at'),
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };

  validateGenerativeInterfaceProposal(proposal, {
    componentRegistry: value.componentRegistry,
    operationCatalog: value.operationCatalog,
    contextProjection,
    capabilitySnapshot
  });
  return Object.freeze(proposal);
}

export function validateGenerativeInterfaceProposal(input, context) {
  const value = assertPlainObject(input, 'generative interface proposal');
  exactFields(value, PROPOSAL_FIELDS, 'generative interface proposal');
  if (value.schema !== GENERATIVE_INTERFACE_PROPOSAL_SCHEMA) {
    throw new ValidationError('generative interface proposal schema is unsupported');
  }
  if (value.version !== VERSION) {
    throw new ValidationError(`generative interface proposal version must be ${VERSION}`);
  }
  if (value.status !== STATUS) {
    throw new ValidationError(`generative interface proposal status must be ${STATUS}`);
  }
  if (value.authority_effect !== 'none') {
    throw new ValidationError('generative interface proposal authority effect must be none');
  }
  if (value.network_effect !== 'none') {
    throw new ValidationError('generative interface proposal network effect must be none');
  }
  if (value.runtime_activation !== false) {
    throw new ValidationError('generative interface proposal runtime activation must be false');
  }

  const proposalId = identifier(value.proposal_id, 'generative interface proposal.proposal_id');
  validateGenerator(value.generator);
  validateRenderer(value.renderer);
  digest(value.component_registry_digest, 'generative interface proposal.component_registry_digest');
  digest(value.operation_catalog_digest, 'generative interface proposal.operation_catalog_digest');
  digest(value.context_projection_digest, 'generative interface proposal.context_projection_digest');
  digest(value.capability_snapshot_digest, 'generative interface proposal.capability_snapshot_digest');
  digest(value.components_digest, 'generative interface proposal.components_digest');
  digest(value.action_requests_digest, 'generative interface proposal.action_requests_digest');
  const proposedAt = timestamp(value.proposed_at, 'generative interface proposal.proposed_at');

  const validationContext = assertPlainObject(context, 'generative interface validation context');
  const { components, actionRequests } = validateBindings(value, validationContext);

  return Object.freeze({
    valid: true,
    schema: GENERATIVE_INTERFACE_PROPOSAL_SCHEMA,
    proposal_id: proposalId,
    component_registry_digest: value.component_registry_digest,
    operation_catalog_digest: value.operation_catalog_digest,
    context_projection_digest: value.context_projection_digest,
    capability_snapshot_digest: value.capability_snapshot_digest,
    components_digest: digestObject(components),
    action_requests_digest: digestObject(actionRequests),
    proposed_at: proposedAt,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  });
}
