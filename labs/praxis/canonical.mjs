// labs/praxis/canonical.mjs
//
// Canonical JSON, sha256 digests, and operation-descriptor construction/validation.
//
// Split from the former index.mjs monolith without behavior change;
// this module owns the section(s) listed above.

import { createHash } from 'node:crypto';
import { PraxisRuntimeError } from './errors.mjs';

export function canonicalizePraxis(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('Praxis canonical JSON does not allow non-finite numbers');
    }
    return Object.is(value, -0) ? 0 : value;
  }

  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      throw new TypeError('Praxis canonical arrays must use the ordinary Array prototype');
    }
    if (Object.getOwnPropertySymbols(value).length !== 0) {
      throw new TypeError('Praxis canonical arrays cannot contain symbol-keyed state');
    }

    const allowedNames = new Set(['length']);
    const output = [];
    for (let index = 0; index < value.length; index += 1) {
      const key = String(index);
      allowedNames.add(key);
      if (!Object.hasOwn(value, key)) {
        throw new TypeError(`Praxis canonical arrays cannot contain a sparse index at ${index}`);
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
        throw new TypeError(`Praxis canonical array index ${index} must be an enumerable data property`);
      }
      output.push(canonicalizePraxis(descriptor.value));
    }

    for (const name of Object.getOwnPropertyNames(value)) {
      if (!allowedNames.has(name)) {
        throw new TypeError(`Praxis canonical arrays cannot contain custom property ${name}`);
      }
    }
    return output;
  }

  if (typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('Praxis canonical objects must be plain records');
    }
    if (Object.getOwnPropertySymbols(value).length !== 0) {
      throw new TypeError('Praxis canonical objects cannot contain symbol-keyed state');
    }

    const ownNames = Object.getOwnPropertyNames(value);
    const enumerableKeys = Object.keys(value);
    if (ownNames.length !== enumerableKeys.length) {
      throw new TypeError('Praxis canonical objects cannot contain non-enumerable state');
    }

    const output = {};
    for (const key of enumerableKeys.sort()) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
        throw new TypeError(`Praxis canonical property ${key} must be an enumerable data property`);
      }
      const item = descriptor.value;
      if (item === undefined || typeof item === 'function' || typeof item === 'symbol') {
        throw new TypeError(`Praxis canonical JSON cannot encode property ${key}`);
      }
      Object.defineProperty(output, key, {
        value: canonicalizePraxis(item),
        enumerable: true,
        configurable: true,
        writable: true
      });
    }
    return output;
  }

  throw new TypeError(`Praxis canonical JSON cannot encode ${typeof value}`);
}

export function canonicalJsonPraxis(value) {
  return JSON.stringify(canonicalizePraxis(value));
}

export function digestPraxis(value) {
  return createHash('sha256').update(canonicalJsonPraxis(value), 'utf8').digest('hex');
}

export function operationDigest(value) {
  return `sha256:${digestPraxis(value)}`;
}

export function operationDigestPraxis({
  action,
  scope,
  args = [],
  secretReferences = []
}) {
  return operationDigest({
    schema: 'praxis-operation.v0',
    action: String(action),
    scope: String(scope),
    args,
    secret_references: secretReferences
  });
}

export function irDigestPraxis(ir) {
  if (!ir || typeof ir !== 'object') {
    throw new TypeError('Praxis IR digest requires an object');
  }
  const { digest: ignoredDigest, ...body } = ir;
  return `sha256:${digestPraxis(body)}`;
}

function deepFreezePraxis(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) deepFreezePraxis(item);
  return Object.freeze(value);
}

export function immutablePraxisSnapshot(value) {
  return deepFreezePraxis(canonicalizePraxis(value));
}

export function createOperationDescriptorPraxis({
  action,
  scope,
  args = [],
  secretReferences = [],
  effect = undefined,
  irreversible = undefined,
  egress = undefined,
  hostOperation = undefined
}) {
  if (!action || !scope) throw new TypeError('Praxis operation descriptor requires action and scope');
  const bodyInput = {
    schema: 'praxis-operation.v0',
    action: String(action),
    scope: String(scope),
    args,
    secret_references: secretReferences
  };
  if (effect !== undefined) {
    if (typeof effect !== 'string' || effect.length === 0) {
      throw new TypeError('Praxis measured operation effect must be a non-empty string');
    }
    if (typeof irreversible !== 'boolean') {
      throw new TypeError('Praxis measured operation requires explicit boolean irreversible');
    }
    if (
      egress === undefined
      || (
        egress !== null
        && (typeof egress !== 'string' || egress.length === 0)
      )
    ) {
      throw new TypeError('Praxis measured operation requires explicit egress: null or non-empty string');
    }
    bodyInput.host_operation = String(hostOperation ?? action);
    bodyInput.effect = effect;
    bodyInput.irreversible = irreversible;
    bodyInput.egress = egress;
  }
  const body = immutablePraxisSnapshot(bodyInput);
  return Object.freeze({
    kind: 'Operation',
    ...body,
    operation_digest: operationDigest(body)
  });
}

export function validateOperationDescriptorPraxis(operation) {
  if (!operation || operation.kind !== 'Operation' || operation.schema !== 'praxis-operation.v0') {
    throw new PraxisRuntimeError(
      'PRAXIS_POLICY_SUBJECT_REQUIRED',
      'policy evaluation requires a Praxis Operation descriptor'
    );
  }
  const {
    kind: ignoredKind,
    operation_digest: claimedDigest,
    ...body
  } = operation;
  if (operation.effect !== undefined) {
    if (
      typeof operation.host_operation !== 'string'
      || operation.host_operation.length === 0
      || typeof operation.effect !== 'string'
      || operation.effect.length === 0
      || typeof operation.irreversible !== 'boolean'
      || !Object.hasOwn(operation, 'egress')
      || (
        operation.egress !== null
        && (typeof operation.egress !== 'string' || operation.egress.length === 0)
      )
    ) {
      throw new PraxisRuntimeError(
        'PRAXIS_POLICY_SUBJECT_INVALID',
        'measured operation descriptor metadata is malformed'
      );
    }
  }
  const expected = operationDigest(body);
  if (claimedDigest !== expected) {
    throw new PraxisRuntimeError(
      'PRAXIS_POLICY_SUBJECT_INVALID',
      'operation descriptor digest does not match its content'
    );
  }
  return operation;
}

export function normalizeOperationDigest(value, label = 'operationDigest') {
  if (typeof value !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value)) {
    throw new TypeError(`${label} must be a sha256:<hex> digest`);
  }
  return value;
}
