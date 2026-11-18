// labs/praxis/registry.mjs
//
// Synthetic host operation registry: construction, contract resolution, normalization.
//
// Split from the former index.mjs monolith without behavior change;
// this module owns the section(s) listed above.

import { PraxisRuntimeError } from './errors.mjs';
import { HOST_OPERATION_REGISTRY } from './host-symbols.mjs';

export function createHostOperationRegistry(definitions = {}) {
  const operations = {};
  for (const [name, definition] of Object.entries(definitions)) {
    if (!name || ['__proto__', 'constructor', 'prototype'].includes(name)) {
      throw new TypeError('host operation name is invalid or forbidden: ' + name);
    }
    if (!definition || typeof definition !== 'object' || Array.isArray(definition)) {
      throw new TypeError('host operation ' + name + ' definition must be an object');
    }
    const allowedFields = new Set(['action', 'scope', 'effect', 'irreversible', 'egress']);
    for (const field of Object.keys(definition)) {
      if (!allowedFields.has(field)) {
        throw new TypeError('host operation ' + name + ' contains unknown field ' + field);
      }
    }
    for (const requiredField of ['action', 'scope', 'effect', 'irreversible', 'egress']) {
      if (!Object.hasOwn(definition, requiredField)) {
        throw new TypeError('host operation ' + name + ' requires explicit ' + requiredField);
      }
    }
    const action = String(definition.action);
    const scope = String(definition.scope);
    const effect = String(definition.effect);
    const irreversible = definition.irreversible;
    const egress = definition.egress;
    if (!action || !scope || !effect) {
      throw new TypeError('host operation ' + name + ' requires non-empty action, scope, and effect');
    }
    if (typeof irreversible !== 'boolean') {
      throw new TypeError('host operation ' + name + ' irreversible must be boolean');
    }
    if (egress !== null && (typeof egress !== 'string' || egress.length === 0)) {
      throw new TypeError('host operation ' + name + ' egress must be null or a non-empty string');
    }
    operations[name] = Object.freeze({
      name,
      action,
      scope,
      effect,
      irreversible,
      egress
    });
  }
  return Object.freeze({
    [HOST_OPERATION_REGISTRY]: true,
    schema: 'praxis-host-operation-registry.v0',
    operations: Object.freeze(operations)
  });
}

export function resolveHostOperationContract(registry, action, scope) {
  const matches = Object.values(registry.operations).filter(
    operation => operation.action === action && operation.scope === scope
  );
  if (matches.length === 0) {
    throw new PraxisRuntimeError(
      'PRAXIS_HOST_OPERATION_REQUIRED',
      'no host operation is registered for ' + action + '@' + scope
    );
  }
  if (matches.length > 1) {
    throw new PraxisRuntimeError(
      'PRAXIS_HOST_OPERATION_AMBIGUOUS',
      'multiple host operations match ' + action + '@' + scope
    );
  }
  return matches[0];
}

export function normalizeHostOperationRegistry(registry) {
  if (registry === null || registry === undefined) return null;
  if (
    !registry
    || registry[HOST_OPERATION_REGISTRY] !== true
    || registry.schema !== 'praxis-host-operation-registry.v0'
    || !registry.operations
  ) {
    throw new PraxisRuntimeError(
      'PRAXIS_HOST_OPERATION_REGISTRY',
      'run hostOperations must be a Praxis host operation registry'
    );
  }
  return registry;
}
