import {
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject
} from './canonical.mjs';
import { validateGenerativeInterfaceProposal } from './generative-interface-proposal.mjs';

export const GENERATIVE_INTERFACE_ACTION_HANDOFF_SCHEMA =
  'axiom-generative-interface-action-handoff.v0';

const STATUS = 'inert-action-handoff-candidate';
const DIGEST = /^[a-f0-9]{64}$/;
const VALUE_TYPES = new Set([
  'string',
  'boolean',
  'number',
  'integer',
  'null'
]);
const INPUT_FIELDS = Object.freeze([
  'proposal',
  'validationContext',
  'selectedRequestId',
  'trustedOperationManifest'
]);
const MANIFEST_FIELDS = Object.freeze([
  'operation_ref',
  'operation_version',
  'catalog_entry_digest',
  'consequence',
  'argument_schema',
  'argument_schema_digest',
  'confirmation_policy',
  'confirmation_policy_digest'
]);
const ARGUMENT_SCHEMA_FIELDS = Object.freeze([
  'schema_ref',
  'schema_version',
  'additional_args',
  'fields'
]);
const ARGUMENT_FIELD_FIELDS = Object.freeze(['name', 'type', 'required']);
const CONFIRMATION_POLICY_FIELDS = Object.freeze([
  'policy_ref',
  'policy_version',
  'required',
  'confirmation_ref'
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

function nonEmptyString(value, name, max = 160) {
  return assertString(value, name, { min: 1, max });
}

function digest(value, name) {
  return assertString(value, name, { min: 64, max: 64, pattern: DIGEST });
}

function valueMatchesType(value, expectedType) {
  switch (expectedType) {
    case 'string':
      return typeof value === 'string';
    case 'boolean':
      return typeof value === 'boolean';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return Number.isInteger(value);
    case 'null':
      return value === null;
    default:
      return false;
  }
}

function validateArgumentSchema(input) {
  const value = assertPlainObject(input, 'trusted operation argument schema');
  exactFields(value, ARGUMENT_SCHEMA_FIELDS, 'trusted operation argument schema');
  const schemaRef = nonEmptyString(
    value.schema_ref,
    'trusted operation argument schema.schema_ref'
  );
  const schemaVersion = nonEmptyString(
    value.schema_version,
    'trusted operation argument schema.schema_version',
    80
  );
  if (value.additional_args !== false) {
    throw new ValidationError(
      'trusted operation argument schema must fail closed on additional arguments'
    );
  }
  if (!Array.isArray(value.fields)) {
    throw new ValidationError('trusted operation argument schema.fields must be an array');
  }

  const fields = new Map();
  for (const [index, entry] of value.fields.entries()) {
    const field = assertPlainObject(
      entry,
      `trusted operation argument schema.fields[${index}]`
    );
    exactFields(
      field,
      ARGUMENT_FIELD_FIELDS,
      `trusted operation argument schema.fields[${index}]`
    );
    const name = nonEmptyString(
      field.name,
      `trusted operation argument schema.fields[${index}].name`
    );
    const type = nonEmptyString(
      field.type,
      `trusted operation argument schema.fields[${index}].type`,
      32
    );
    if (!VALUE_TYPES.has(type)) {
      throw new ValidationError(`trusted operation argument ${name} has unsupported argument type ${type}`);
    }
    if (field.required !== true && field.required !== false) {
      throw new ValidationError(`trusted operation argument ${name}.required must be boolean`);
    }
    if (fields.has(name)) {
      throw new ValidationError(`trusted operation argument schema contains duplicate argument ${name}`);
    }
    fields.set(name, Object.freeze({ type, required: field.required }));
  }

  return Object.freeze({ schemaRef, schemaVersion, fields });
}

function validateConfirmationPolicy(input) {
  const value = assertPlainObject(input, 'trusted operation confirmation policy');
  exactFields(
    value,
    CONFIRMATION_POLICY_FIELDS,
    'trusted operation confirmation policy'
  );
  const policyRef = nonEmptyString(
    value.policy_ref,
    'trusted operation confirmation policy.policy_ref'
  );
  const policyVersion = nonEmptyString(
    value.policy_version,
    'trusted operation confirmation policy.policy_version',
    80
  );
  if (value.required !== true && value.required !== false) {
    throw new ValidationError('trusted operation confirmation policy.required must be boolean');
  }

  let confirmationRef = value.confirmation_ref;
  if (value.required) {
    confirmationRef = nonEmptyString(
      confirmationRef,
      'trusted operation confirmation policy.confirmation_ref'
    );
  } else if (confirmationRef !== null) {
    throw new ValidationError(
      'trusted operation confirmation policy.confirmation_ref must be null when confirmation is not required'
    );
  }

  return Object.freeze({
    policyRef,
    policyVersion,
    required: value.required,
    confirmationRef
  });
}

function validateTrustedOperationManifest(input) {
  const value = assertPlainObject(input, 'trusted operation manifest');
  exactFields(value, MANIFEST_FIELDS, 'trusted operation manifest');

  const operationRef = nonEmptyString(
    value.operation_ref,
    'trusted operation manifest.operation_ref'
  );
  const operationVersion = nonEmptyString(
    value.operation_version,
    'trusted operation manifest.operation_version',
    80
  );
  const catalogEntryDigest = digest(
    value.catalog_entry_digest,
    'trusted operation manifest.catalog_entry_digest'
  );
  const consequence = nonEmptyString(
    value.consequence,
    'trusted operation manifest.consequence',
    80
  );

  const argumentSchema = validateArgumentSchema(value.argument_schema);
  const argumentSchemaDigest = digest(
    value.argument_schema_digest,
    'trusted operation manifest.argument_schema_digest'
  );
  if (argumentSchemaDigest !== digestObject(value.argument_schema)) {
    throw new ValidationError('trusted operation argument schema digest does not match schema');
  }

  const confirmationPolicy = validateConfirmationPolicy(value.confirmation_policy);
  const confirmationPolicyDigest = digest(
    value.confirmation_policy_digest,
    'trusted operation manifest.confirmation_policy_digest'
  );
  if (confirmationPolicyDigest !== digestObject(value.confirmation_policy)) {
    throw new ValidationError(
      'trusted operation confirmation policy digest does not match policy'
    );
  }

  return Object.freeze({
    operationRef,
    operationVersion,
    catalogEntryDigest,
    consequence,
    argumentSchema,
    argumentSchemaDigest,
    confirmationPolicy,
    confirmationPolicyDigest
  });
}

function validateArguments(argumentsValue, argumentSchema) {
  const args = assertPlainObject(argumentsValue, 'selected generated action arguments');
  for (const key of Object.keys(args)) {
    if (!argumentSchema.fields.has(key)) {
      throw new ValidationError(`selected generated action contains unknown argument ${key}`);
    }
  }
  for (const [name, rule] of argumentSchema.fields.entries()) {
    if (!Object.hasOwn(args, name)) {
      if (rule.required) {
        throw new ValidationError(`selected generated action is missing required argument ${name}`);
      }
      continue;
    }
    if (!valueMatchesType(args[name], rule.type)) {
      throw new ValidationError(`selected generated action argument ${name} must be ${rule.type}`);
    }
  }
  digestObject(args);
  return Object.freeze(structuredClone(args));
}

export function buildGenerativeInterfaceActionHandoff(input) {
  const value = assertPlainObject(input, 'generative interface action handoff input');
  exactFields(value, INPUT_FIELDS, 'generative interface action handoff input');

  validateGenerativeInterfaceProposal(value.proposal, value.validationContext);
  const selectedRequestId = nonEmptyString(
    value.selectedRequestId,
    'generative interface action handoff.selectedRequestId'
  );
  const selected = value.proposal.action_requests.find(
    request => request.request_id === selectedRequestId
  );
  if (!selected) {
    throw new ValidationError(
      `selected action request ${selectedRequestId} is not present in the proposal`
    );
  }

  const manifest = validateTrustedOperationManifest(value.trustedOperationManifest);
  if (manifest.operationRef !== selected.operation_ref) {
    throw new ValidationError(
      'selected action request operation does not match current trusted operation metadata'
    );
  }

  const catalogEntry = value.validationContext.operationCatalog.find(
    entry => entry.operation_ref === selected.operation_ref
  );
  if (!catalogEntry || manifest.catalogEntryDigest !== digestObject(catalogEntry)) {
    throw new ValidationError(
      'trusted operation catalog entry digest does not match the proposal catalog entry'
    );
  }
  if (manifest.consequence !== selected.consequence) {
    throw new ValidationError(
      'selected action request consequence does not match current trusted operation metadata'
    );
  }

  const args = validateArguments(selected.arguments, manifest.argumentSchema);
  const canonicalConfirmation = Object.freeze({
    required: manifest.confirmationPolicy.required,
    policy_ref: manifest.confirmationPolicy.policyRef,
    policy_version: manifest.confirmationPolicy.policyVersion,
    policy_digest: manifest.confirmationPolicyDigest,
    confirmation_ref: manifest.confirmationPolicy.confirmationRef
  });

  return Object.freeze({
    schema: GENERATIVE_INTERFACE_ACTION_HANDOFF_SCHEMA,
    version: 0,
    status: STATUS,
    proposal_id: value.proposal.proposal_id,
    proposal_digest: digestObject(value.proposal),
    request_id: selected.request_id,
    action_request_digest: digestObject(selected),
    operation_ref: selected.operation_ref,
    operation_version: manifest.operationVersion,
    trusted_operation_manifest_digest: digestObject(value.trustedOperationManifest),
    catalog_entry_digest: manifest.catalogEntryDigest,
    consequence: manifest.consequence,
    proposal_confirmation: selected.confirmation,
    argument_schema_ref: manifest.argumentSchema.schemaRef,
    argument_schema_version: manifest.argumentSchema.schemaVersion,
    argument_schema_digest: manifest.argumentSchemaDigest,
    arguments: args,
    canonical_confirmation: canonicalConfirmation,
    authority_effect: 'none',
    execution_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    effect_handoff: 'none'
  });
}
