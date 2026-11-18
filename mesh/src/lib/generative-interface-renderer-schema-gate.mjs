import {
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject
} from './canonical.mjs';
import {
  validateGenerativeInterfaceProposal
} from './generative-interface-proposal.mjs';

export const GENERATIVE_INTERFACE_RENDER_PLAN_SCHEMA =
  'axiom-generative-interface-render-plan.v0';

const RENDER_PLAN_STATUS = 'inert-trusted-render-plan';
const MANIFEST_FIELDS = Object.freeze([
  'renderer_ref',
  'renderer_version',
  'components'
]);
const COMPONENT_SCHEMA_FIELDS = Object.freeze(['type', 'props_schema']);
const PROPS_SCHEMA_FIELDS = Object.freeze(['additional_props', 'fields']);
const PROP_FIELD_FIELDS = Object.freeze(['name', 'type', 'required']);
const VALUE_TYPES = new Set([
  'string',
  'boolean',
  'number',
  'integer',
  'null'
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

function validateFieldType(value, expectedType, path) {
  const valid = switchType(value, expectedType);
  if (!valid) {
    throw new ValidationError(`${path} must be ${expectedType}`);
  }
}

function switchType(value, expectedType) {
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

function validatePropsSchema(input, componentType) {
  const value = assertPlainObject(
    input,
    `trusted renderer manifest component ${componentType}.props_schema`
  );
  exactFields(
    value,
    PROPS_SCHEMA_FIELDS,
    `trusted renderer manifest component ${componentType}.props_schema`
  );
  if (value.additional_props !== false) {
    throw new ValidationError(
      `trusted renderer manifest component ${componentType} must fail closed on additional props`
    );
  }
  if (!Array.isArray(value.fields)) {
    throw new ValidationError(
      `trusted renderer manifest component ${componentType}.props_schema.fields must be an array`
    );
  }

  const fields = new Map();
  for (const [index, entry] of value.fields.entries()) {
    const field = assertPlainObject(
      entry,
      `trusted renderer manifest component ${componentType}.props_schema.fields[${index}]`
    );
    exactFields(
      field,
      PROP_FIELD_FIELDS,
      `trusted renderer manifest component ${componentType}.props_schema.fields[${index}]`
    );
    const name = nonEmptyString(
      field.name,
      `trusted renderer manifest component ${componentType}.props_schema.fields[${index}].name`
    );
    const type = nonEmptyString(
      field.type,
      `trusted renderer manifest component ${componentType}.props_schema.fields[${index}].type`,
      32
    );
    if (!VALUE_TYPES.has(type)) {
      throw new ValidationError(`trusted renderer prop ${name} has unsupported type ${type}`);
    }
    if (field.required !== true && field.required !== false) {
      throw new ValidationError(`trusted renderer prop ${name}.required must be boolean`);
    }
    if (fields.has(name)) {
      throw new ValidationError(
        `trusted renderer manifest component ${componentType} contains duplicate prop ${name}`
      );
    }
    fields.set(name, Object.freeze({ type, required: field.required }));
  }
  return fields;
}

function validateRendererManifest(input) {
  const value = assertPlainObject(input, 'trusted renderer manifest');
  exactFields(value, MANIFEST_FIELDS, 'trusted renderer manifest');
  const rendererRef = nonEmptyString(
    value.renderer_ref,
    'trusted renderer manifest.renderer_ref'
  );
  const rendererVersion = nonEmptyString(
    value.renderer_version,
    'trusted renderer manifest.renderer_version',
    80
  );
  if (!Array.isArray(value.components) || value.components.length === 0) {
    throw new ValidationError('trusted renderer manifest.components must be a non-empty array');
  }

  const components = new Map();
  for (const [index, entry] of value.components.entries()) {
    const component = assertPlainObject(
      entry,
      `trusted renderer manifest.components[${index}]`
    );
    exactFields(
      component,
      COMPONENT_SCHEMA_FIELDS,
      `trusted renderer manifest.components[${index}]`
    );
    const type = nonEmptyString(
      component.type,
      `trusted renderer manifest.components[${index}].type`
    );
    if (components.has(type)) {
      throw new ValidationError(`trusted renderer manifest contains duplicate component type ${type}`);
    }
    components.set(type, validatePropsSchema(component.props_schema, type));
  }

  return Object.freeze({ rendererRef, rendererVersion, components });
}

function validateComponentProps(component, fields) {
  const props = assertPlainObject(
    component.props,
    `generated component ${component.component_id}.props`
  );
  for (const key of Object.keys(props)) {
    if (!fields.has(key)) {
      throw new ValidationError(
        `generated component ${component.component_id} contains unknown prop ${key}`
      );
    }
  }
  for (const [name, rule] of fields.entries()) {
    if (!Object.hasOwn(props, name)) {
      if (rule.required) {
        throw new ValidationError(
          `generated component ${component.component_id} is missing required prop ${name}`
        );
      }
      continue;
    }
    validateFieldType(
      props[name],
      rule.type,
      `generated component ${component.component_id} prop ${name}`
    );
  }
}

export function buildGenerativeInterfaceRenderPlan(input) {
  const value = assertPlainObject(input, 'generative interface render-plan input');
  exactFields(
    value,
    ['proposal', 'validationContext', 'rendererManifest'],
    'generative interface render-plan input'
  );

  const proposalValidation = validateGenerativeInterfaceProposal(
    value.proposal,
    value.validationContext
  );
  const manifest = validateRendererManifest(value.rendererManifest);

  if (
    value.proposal.renderer.renderer_ref !== manifest.rendererRef ||
    value.proposal.renderer.renderer_version !== manifest.rendererVersion
  ) {
    throw new ValidationError('proposal renderer identity does not match trusted renderer manifest');
  }

  const components = value.proposal.components.map(component => {
    const fields = manifest.components.get(component.type);
    if (!fields) {
      throw new ValidationError(
        `component type ${component.type} is not present in the trusted renderer manifest`
      );
    }
    validateComponentProps(component, fields);
    return Object.freeze({
      component_id: component.component_id,
      type: component.type,
      props: structuredClone(component.props),
      action_request_id: component.action_request_id
    });
  });

  return Object.freeze({
    schema: GENERATIVE_INTERFACE_RENDER_PLAN_SCHEMA,
    version: 0,
    status: RENDER_PLAN_STATUS,
    proposal_id: proposalValidation.proposal_id,
    proposal_digest: digestObject(value.proposal),
    renderer_ref: manifest.rendererRef,
    renderer_version: manifest.rendererVersion,
    renderer_manifest_digest: digestObject(value.rendererManifest),
    components: Object.freeze(components),
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    effect_handoff: 'none'
  });
}
