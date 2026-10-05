// labs/praxis/policy.mjs
//
// Deterministic policy premises: normalization, pinning, and requirement evaluation.
//
// Split from the former index.mjs monolith without behavior change;
// this module owns the section(s) listed above.

import { canonicalJsonPraxis, immutablePraxisSnapshot } from './canonical.mjs';
import { signatureBodyDigest } from './crypto.mjs';
import { PraxisRuntimeError } from './errors.mjs';

const POLICY_COMPARATORS = new Set(['eq', 'neq', 'lt', 'lte', 'gt', 'gte']);

const FORBIDDEN_POLICY_PATH_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

function policyPremiseError(message) {
  return new PraxisRuntimeError('PRAXIS_POLICY_PREMISE', message);
}

function normalizePolicyPath(path, label) {
  if (path === undefined || path === null) return Object.freeze([]);
  if (!Array.isArray(path)) {
    throw policyPremiseError(label + ' path must be an array');
  }
  const normalized = path.map(segment => {
    if (
      !(typeof segment === 'string' || (Number.isSafeInteger(segment) && segment >= 0))
    ) {
      throw policyPremiseError(label + ' path contains an invalid segment');
    }
    if (typeof segment === 'string' && FORBIDDEN_POLICY_PATH_SEGMENTS.has(segment)) {
      throw policyPremiseError(label + ' path contains a forbidden host-runtime name');
    }
    return segment;
  });
  return Object.freeze(normalized);
}

function normalizePolicyOperand(operand, label) {
  if (!operand || typeof operand !== 'object' || Array.isArray(operand)) {
    throw policyPremiseError(label + ' must be a policy operand object');
  }
  if (operand.source === 'const') {
    if (!Object.hasOwn(operand, 'value')) {
      throw policyPremiseError(label + ' constant is missing value');
    }
    return Object.freeze({
      source: 'const',
      value: immutablePraxisSnapshot(operand.value)
    });
  }
  if (operand.source === 'evidence') {
    if (typeof operand.verifier !== 'string' || operand.verifier.length === 0) {
      throw policyPremiseError(label + ' evidence operand requires verifier');
    }
    return Object.freeze({
      source: 'evidence',
      verifier: operand.verifier,
      path: normalizePolicyPath(operand.path, label)
    });
  }
  if (operand.source === 'operation') {
    const path = normalizePolicyPath(operand.path, label);
    if (path.length === 0) {
      throw policyPremiseError(label + ' operation operand requires a path');
    }
    if (!['action', 'scope', 'args', 'operation_digest'].includes(path[0])) {
      throw policyPremiseError(label + ' operation path may read only action, scope, args, or operation_digest');
    }
    return Object.freeze({
      source: 'operation',
      path
    });
  }
  throw policyPremiseError(
    label + ' may use only verified evidence, exact operation fields, or constants'
  );
}

function normalizePolicyPredicate(predicate, index, requiredVerifiers) {
  if (!predicate || typeof predicate !== 'object' || Array.isArray(predicate)) {
    throw policyPremiseError('require[' + index + '] must be an object');
  }
  if (!POLICY_COMPARATORS.has(predicate.op)) {
    throw policyPremiseError('require[' + index + '] uses unsupported comparator ' + predicate.op);
  }
  const left = normalizePolicyOperand(predicate.left, 'require[' + index + '].left');
  const right = normalizePolicyOperand(predicate.right, 'require[' + index + '].right');
  for (const operand of [left, right]) {
    if (operand.source === 'evidence' && !requiredVerifiers.has(operand.verifier)) {
      throw policyPremiseError(
        'require[' + index + '] references evidence verifier ' + operand.verifier
        + ' without declaring it in requires_evidence'
      );
    }
  }
  return Object.freeze({
    op: predicate.op,
    left,
    right
  });
}

export function normalizePolicyDefinition(name, definition) {
  if (!definition || !['Permit', 'Quorum'].includes(definition.authority_kind)) {
    throw new TypeError('policy ' + name + ' must declare authority_kind Permit or Quorum');
  }
  if (!definition.action || !definition.scope) {
    throw new TypeError('policy ' + name + ' requires action and scope');
  }
  if (!Number.isSafeInteger(definition.expires_ms) || definition.expires_ms <= 0) {
    throw new TypeError('policy ' + name + ' requires positive expires_ms');
  }
  if (definition.require !== undefined && !Array.isArray(definition.require)) {
    throw policyPremiseError('policy ' + name + ' require must be an array');
  }
  const requiresEvidence = Object.freeze(
    [...new Set((definition.requires_evidence ?? []).map(String))].sort()
  );
  const requiredVerifierSet = new Set(requiresEvidence);
  const normalized = {
    authority_kind: definition.authority_kind,
    action: String(definition.action),
    scope: String(definition.scope),
    expires_ms: definition.expires_ms,
    requires_evidence: requiresEvidence,
    require: Object.freeze(
      (definition.require ?? []).map((predicate, index) =>
        normalizePolicyPredicate(predicate, index, requiredVerifierSet)
      )
    ),
    advisor: definition.advisor ? String(definition.advisor) : null
  };
  if (definition.authority_kind === 'Quorum') {
    const members = (definition.members ?? []).map(String);
    if (members.length === 0 || new Set(members).size !== members.length) {
      throw new TypeError('policy ' + name + ' requires unique quorum members');
    }
    if (
      !Number.isSafeInteger(definition.threshold)
      || definition.threshold < 1
      || definition.threshold > members.length
    ) {
      throw new TypeError('policy ' + name + ' has invalid quorum threshold');
    }
    const humans = definition.humans ?? 0;
    if (!Number.isSafeInteger(humans) || humans < 0 || humans > definition.threshold) {
      throw new TypeError('policy ' + name + ' has invalid human minimum');
    }
    normalized.members = Object.freeze([...members].sort());
    normalized.threshold = definition.threshold;
    normalized.humans = humans;
  }
  return Object.freeze(normalized);
}

export function normalizeVerifierDefinition(name, definition) {
  if (!definition?.source) throw new TypeError('verifier ' + name + ' requires source');
  if (!Number.isSafeInteger(definition.freshness_ms) || definition.freshness_ms <= 0) {
    throw new TypeError('verifier ' + name + ' requires positive freshness_ms');
  }
  const signers = (definition.signers ?? []).map(String);
  if (signers.length === 0 || new Set(signers).size !== signers.length) {
    throw new TypeError('verifier ' + name + ' requires unique signers');
  }
  return Object.freeze({
    source: String(definition.source),
    signers: Object.freeze([...signers].sort()),
    freshness_ms: definition.freshness_ms
  });
}

export function pinnedDefinitions(definitions, normalizer) {
  const output = {};
  for (const [name, definition] of Object.entries(definitions ?? {})) {
    const def = normalizer(name, definition);
    output[name] = Object.freeze({
      def,
      digest: signatureBodyDigest(def)
    });
  }
  return output;
}

function readPolicyPath(root, path, label) {
  let current = root;
  for (const segment of path) {
    if (
      current === null
      || current === undefined
      || (typeof current !== 'object' && typeof current !== 'string')
      || !Object.hasOwn(Object(current), segment)
    ) {
      throw new PraxisRuntimeError(
        'PRAXIS_POLICY_ERROR',
        label + ' path does not exist'
      );
    }
    current = current[segment];
  }
  return current;
}

function resolvePolicyOperand(operand, evidenceByVerifier, operation) {
  if (operand.source === 'const') return operand.value;
  if (operand.source === 'evidence') {
    const evidence = evidenceByVerifier[operand.verifier];
    if (!evidence) {
      throw new PraxisRuntimeError(
        'PRAXIS_EVIDENCE_REQUIRED',
        'policy premise evidence ' + operand.verifier + ' is unavailable'
      );
    }
    return readPolicyPath(
      evidence.value,
      operand.path,
      'evidence ' + operand.verifier
    );
  }
  if (operand.source === 'operation') {
    if (!operation) {
      throw new PraxisRuntimeError(
        'PRAXIS_POLICY_SUBJECT_REQUIRED',
        'policy premise references the operation but no exact descriptor was supplied'
      );
    }
    return readPolicyPath(operation, operand.path, 'operation');
  }
  throw new PraxisRuntimeError('PRAXIS_POLICY_ERROR', 'unknown policy operand source');
}

function policyValuesEqual(left, right) {
  try {
    return canonicalJsonPraxis(left) === canonicalJsonPraxis(right);
  } catch {
    throw new PraxisRuntimeError(
      'PRAXIS_POLICY_ERROR',
      'policy equality comparison received a non-canonical value'
    );
  }
}

function comparePolicyValues(op, left, right) {
  if (op === 'eq') return policyValuesEqual(left, right);
  if (op === 'neq') return !policyValuesEqual(left, right);
  const leftType = typeof left;
  const rightType = typeof right;
  if (
    leftType !== rightType
    || !['number', 'string'].includes(leftType)
    || (leftType === 'number' && (!Number.isFinite(left) || !Number.isFinite(right)))
  ) {
    throw new PraxisRuntimeError(
      'PRAXIS_POLICY_ERROR',
      'ordered policy comparison requires two finite numbers or two strings'
    );
  }
  if (op === 'lt') return left < right;
  if (op === 'lte') return left <= right;
  if (op === 'gt') return left > right;
  if (op === 'gte') return left >= right;
  throw new PraxisRuntimeError('PRAXIS_POLICY_ERROR', 'unknown policy comparator ' + op);
}

export function evaluatePolicyRequirements(policy, evidenceContext, operation) {
  const results = [];
  for (const [index, predicate] of (policy.require ?? []).entries()) {
    const left = resolvePolicyOperand(predicate.left, evidenceContext.by_verifier, operation);
    const right = resolvePolicyOperand(predicate.right, evidenceContext.by_verifier, operation);
    let satisfied;
    try {
      satisfied = comparePolicyValues(predicate.op, left, right);
    } catch (error) {
      if (error instanceof PraxisRuntimeError) throw error;
      throw new PraxisRuntimeError(
        'PRAXIS_POLICY_ERROR',
        'policy require[' + index + '] evaluation failed closed'
      );
    }
    if (satisfied !== true) {
      throw new PraxisRuntimeError(
        'PRAXIS_POLICY_REQUIRE',
        'policy require[' + index + '] was not satisfied'
      );
    }
    results.push(Object.freeze({
      predicate_digest: signatureBodyDigest(predicate),
      result: true
    }));
  }
  return Object.freeze(results);
}
