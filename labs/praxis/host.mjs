// labs/praxis/host.mjs
//
// Synthetic host: permits, leases, quorums, secret/prepared refs, and the run() interpreter. No execution authority beyond the synthetic host.
//
// Split from the former index.mjs monolith without behavior change;
// this module owns the section(s) listed above.

import { canonicalJsonPraxis, createOperationDescriptorPraxis, irDigestPraxis, normalizeOperationDigest, operationDigest } from './canonical.mjs';
import { verifyHostObservation, verifySyntheticCharter } from './charter.mjs';
import { compile } from './compiler.mjs';
import { signatureBodyDigest } from './crypto.mjs';
import { validateEffectEnvelope, validateMeasuredOperationAgainstRegistry } from './effects.mjs';
import { PraxisRuntimeError } from './errors.mjs';
import { HOST_AUTHORITY, HOST_PREPARED_REF, HOST_SECRET_REF, consumedAuthorityTokens, consumedPreparedRefs } from './host-symbols.mjs';
import { normalizeHostOperationRegistry, resolveHostOperationContract } from './registry.mjs';

export function createHostPermit({ action, scope, id, operationDigest: planDigest }) {
  if (!action || !scope || !id) throw new TypeError('host permit requires action, scope, and id');
  return Object.freeze({
    [HOST_AUTHORITY]: 'Permit',
    schema: 'praxis-host-permit.v0',
    id: String(id),
    action: String(action),
    scope: String(scope),
    operation_digest: normalizeOperationDigest(planDigest)
  });
}

export function createHostLease({ action, scope, id, expiresAt, operationDigest: planDigest }) {
  if (!action || !scope || !id || expiresAt === undefined || expiresAt === null) {
    throw new TypeError('host lease requires action, scope, id, and expiresAt');
  }
  const expiresAtMs = typeof expiresAt === 'number' ? expiresAt : Date.parse(String(expiresAt));
  if (!Number.isFinite(expiresAtMs)) {
    throw new TypeError('host lease expiresAt must be a finite timestamp or parseable date');
  }
  return Object.freeze({
    [HOST_AUTHORITY]: 'Lease',
    schema: 'praxis-host-lease.v0',
    id: String(id),
    action: String(action),
    scope: String(scope),
    operation_digest: normalizeOperationDigest(planDigest),
    expires_at_ms: expiresAtMs
  });
}

export function createHostQuorum({
  id,
  action,
  scope,
  members,
  approvedBy,
  threshold,
  operationDigest: planDigest
}) {
  if (!id || !action || !scope) {
    throw new TypeError('host quorum requires id, action, and scope');
  }
  if (!Array.isArray(members) || members.length === 0) {
    throw new TypeError('host quorum requires at least one member');
  }
  if (!Array.isArray(approvedBy)) {
    throw new TypeError('host quorum approvedBy must be an array');
  }
  if (!Number.isSafeInteger(threshold) || threshold < 1 || threshold > members.length) {
    throw new TypeError('host quorum threshold must be an integer within the member set');
  }
  const normalizedMembers = members.map(String);
  const normalizedApprovals = approvedBy.map(String);
  if (new Set(normalizedMembers).size !== normalizedMembers.length) {
    throw new TypeError('host quorum members must be unique');
  }
  if (new Set(normalizedApprovals).size !== normalizedApprovals.length) {
    throw new TypeError('host quorum approvals must be unique');
  }
  const memberSet = new Set(normalizedMembers);
  if (normalizedApprovals.some(member => !memberSet.has(member))) {
    throw new TypeError('host quorum approval is not a declared member');
  }
  return Object.freeze({
    [HOST_AUTHORITY]: 'Quorum',
    schema: 'praxis-host-quorum.v0',
    id: String(id),
    action: String(action),
    scope: String(scope),
    operation_digest: normalizeOperationDigest(planDigest),
    threshold,
    members: Object.freeze([...normalizedMembers].sort()),
    approved_by: Object.freeze([...normalizedApprovals].sort())
  });
}

export function createHostSecretRef({ id, kind }) {
  if (!id || !kind) throw new TypeError('host secret reference requires id and kind');
  return Object.freeze({
    [HOST_SECRET_REF]: true,
    schema: 'praxis-host-secret-ref.v0',
    id: String(id),
    kind: String(kind)
  });
}

export function createHostPreparedRef({
  id,
  action,
  scope,
  operation,
  authority,
  preparation
}) {
  if (!id || !action || !scope) {
    throw new TypeError('host prepared reference requires id, action, and scope');
  }
  if (!operation || operation.kind !== 'Operation' || operation.schema !== 'praxis-operation.v0') {
    throw new TypeError('host prepared reference requires a Praxis Operation');
  }
  const {
    kind: ignoredKind,
    operation_digest: suppliedDigest,
    ...operationBody
  } = operation;
  const expectedDigest = operationDigest(operationBody);
  if (suppliedDigest !== expectedDigest) {
    throw new TypeError('host prepared reference operation digest is invalid');
  }
  if (operation.action !== action || operation.scope !== scope) {
    throw new TypeError('host prepared reference action/scope does not match operation');
  }
  if (
    !authority
    || authority.action !== action
    || authority.scope !== scope
    || authority.operation_digest !== suppliedDigest
    || typeof authority.authority_id !== 'string'
  ) {
    throw new TypeError('host prepared reference authority binding is invalid');
  }
  if (
    !preparation
    || preparation.durable !== true
    || preparation.operation_digest !== suppliedDigest
    || typeof preparation.preparation_digest !== 'string'
    || !/^sha256:[a-f0-9]{64}$/.test(preparation.preparation_digest)
  ) {
    throw new TypeError('host prepared reference preparation evidence is invalid');
  }
  return Object.freeze({
    [HOST_PREPARED_REF]: true,
    schema: 'praxis-host-prepared-ref.v0',
    id: String(id),
    action: String(action),
    scope: String(scope),
    operation: Object.freeze({ ...operation }),
    authority: Object.freeze({ ...authority }),
    preparation: Object.freeze({ ...preparation })
  });
}

function resolveValue(arg, values) {
  if (arg.kind === 'literal') return arg.value;
  if (!values.has(arg.name)) {
    throw new PraxisRuntimeError('PRAXIS_RUNTIME_UNKNOWN_BINDING', `runtime binding ${arg.name} missing`);
  }
  return values.get(arg.name);
}

function validateCharteredAuthorityToken(token, requirement, charterContext, nowMs) {
  if (!token?.charter_digest) return;
  if (!charterContext) {
    throw new PraxisRuntimeError(
      'PRAXIS_CHARTER_REQUIRED',
      'chartered authority requires the signed charter at runtime'
    );
  }
  if (token.charter_digest !== charterContext.digest) {
    throw new PraxisRuntimeError('PRAXIS_CHARTER_SIGNATURE', 'authority charter digest mismatch');
  }
  const policyEntry = charterContext.body.policies?.[token.policy_name];
  if (!policyEntry || policyEntry.digest !== token.policy_digest) {
    throw new PraxisRuntimeError(
      'PRAXIS_POLICY_UNPINNED',
      'authority policy is not pinned by the runtime charter'
    );
  }
  const policy = policyEntry.def;
  const expectedKind = requirement.authority_kind ?? 'Permit';
  if (
    policy.authority_kind !== expectedKind
    || policy.action !== token.action
    || policy.scope !== token.scope
  ) {
    throw new PraxisRuntimeError(
      'PRAXIS_POLICY_UNPINNED',
      'chartered authority does not match the pinned policy'
    );
  }
  if (expectedKind === 'Quorum') {
    const policyMembers = [...(policy.members ?? [])].sort();
    const tokenMembers = [...(token.members ?? [])].sort();
    if (
      policy.threshold !== token.threshold
      || policyMembers.length !== tokenMembers.length
      || policyMembers.some((member, index) => member !== tokenMembers[index])
      || (policy.humans ?? 0) !== (token.human_minimum ?? 0)
    ) {
      throw new PraxisRuntimeError(
        'PRAXIS_POLICY_UNPINNED',
        'chartered quorum was weakened relative to the pinned policy'
      );
    }
  }
  for (const evidence of token.evidence ?? []) {
    const verifier = charterContext.body.verifiers?.[evidence.verifier_name];
    if (!verifier || verifier.digest !== evidence.verifier_digest) {
      throw new PraxisRuntimeError(
        'PRAXIS_VERIFIER_UNPINNED',
        'authority evidence uses an unpinned verifier'
      );
    }
    if (nowMs >= evidence.valid_until_ms) {
      throw new PraxisRuntimeError('PRAXIS_EVIDENCE_STALE', 'authority evidence is stale');
    }
  }
  const expectedPremises = policy.require ?? [];
  const actualPremises = token.premises ?? [];
  if (
    expectedPremises.length !== actualPremises.length
    || expectedPremises.some((predicate, index) =>
      actualPremises[index]?.result !== true
      || actualPremises[index]?.predicate_digest !== signatureBodyDigest(predicate)
    )
  ) {
    throw new PraxisRuntimeError(
      'PRAXIS_POLICY_REQUIRE',
      'chartered authority does not preserve its pinned premise results'
    );
  }
  if (policy.advisor) {
    if (!token.advice || token.advice.advisor !== policy.advisor || token.advice.deny !== false) {
      throw new PraxisRuntimeError(
        'PRAXIS_ADVISOR_REQUIRED',
        'pinned advisor result is missing from authority'
      );
    }
  }
}

function validateAuthorityToken(token, requirement, {
  nowMs,
  revokedAuthorityIds,
  operationDigest: expectedOperationDigest = null,
  charterContext = null
}) {
  const expectedKind = requirement.authority_kind ?? 'Permit';
  if (!token || token[HOST_AUTHORITY] !== expectedKind) {
    throw new PraxisRuntimeError(
      'PRAXIS_HOST_AUTHORITY_REQUIRED',
      `host did not provide a matching Praxis ${expectedKind} for ${requirement.name}`
    );
  }
  if (revokedAuthorityIds.has(token.id)) {
    throw new PraxisRuntimeError(
      'PRAXIS_HOST_AUTHORITY_REVOKED',
      `host authority token ${token.id} is revoked`
    );
  }
  if (
    token.expires_at_ms !== null
    && token.expires_at_ms !== undefined
    && nowMs >= token.expires_at_ms
  ) {
    throw new PraxisRuntimeError(
      'PRAXIS_HOST_AUTHORITY_EXPIRED',
      `host authority token ${token.id} expired`
    );
  }
  validateCharteredAuthorityToken(token, requirement, charterContext, nowMs);
  if (expectedKind === 'Quorum') {
    const expectedMembers = [...requirement.members].sort();
    const actualMembers = Array.isArray(token.members) ? [...token.members].sort() : [];
    if (
      expectedMembers.length !== actualMembers.length
      || expectedMembers.some((member, index) => member !== actualMembers[index])
    ) {
      throw new PraxisRuntimeError(
        'PRAXIS_HOST_QUORUM_MISMATCH',
        `host quorum ${token.id} does not match the declared member set`
      );
    }
    if (token.threshold !== requirement.threshold) {
      throw new PraxisRuntimeError(
        'PRAXIS_HOST_QUORUM_MISMATCH',
        `host quorum ${token.id} threshold ${token.threshold} does not match declared threshold ${requirement.threshold}`
      );
    }
    if (!Array.isArray(token.approved_by) || token.approved_by.length < requirement.threshold) {
      throw new PraxisRuntimeError(
        'PRAXIS_HOST_QUORUM_INSUFFICIENT',
        `host quorum ${token.id} has insufficient approvals for threshold ${requirement.threshold}`
      );
    }
  }
  if (consumedAuthorityTokens.has(token)) {
    throw new PraxisRuntimeError(
      'PRAXIS_HOST_AUTHORITY_CONSUMED',
      `host authority token ${token.id} was already consumed`
    );
  }
  if (token.action !== requirement.action || token.scope !== requirement.scope) {
    throw new PraxisRuntimeError(
      'PRAXIS_HOST_AUTHORITY_MISMATCH',
      `host authority ${token.id} grants ${token.action}@${token.scope}, expected ${requirement.action}@${requirement.scope}`
    );
  }
  if (expectedOperationDigest !== null && token.operation_digest !== expectedOperationDigest) {
    throw new PraxisRuntimeError(
      'PRAXIS_HOST_AUTHORITY_PLAN_MISMATCH',
      `host authority ${token.id} is not bound to operation ${expectedOperationDigest}`
    );
  }
}

function runtimeKnowledgeKind(kind) {
  return kind === 'Observed' || kind === 'Verified' || kind === 'Assessment' || kind === 'Receipt';
}

function assertRuntimeOrdinaryValue(value, path = 'value', seen = new Set()) {
  if (value === null || typeof value !== 'object') return;

  if (seen.has(value)) {
    throw new PraxisRuntimeError(
      'PRAXIS_IR_MALFORMED',
      `runtime value at ${path} contains a cycle`
    );
  }
  seen.add(value);

  if (value.kind === 'SecretRef') {
    throw new PraxisRuntimeError(
      'PRAXIS_SECRET_EXFILTRATION',
      `SecretRef cannot cross the ordinary value channel at ${path}`
    );
  }
  if (
    value.kind === 'Permit'
    || value.kind === 'Lease'
    || value.kind === 'Quorum'
    || value.kind === 'AuthorizedOperation'
    || value.kind === 'PreparedOperation'
  ) {
    throw new PraxisRuntimeError(
      'PRAXIS_AUTHORITY_EXFILTRATION',
      `${value.kind} cannot cross the ordinary value channel at ${path}`
    );
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertRuntimeOrdinaryValue(item, `${path}[${index}]`, seen));
  } else {
    for (const [key, item] of Object.entries(value)) {
      assertRuntimeOrdinaryValue(item, `${path}.${key}`, seen);
    }
  }
  seen.delete(value);
}

function validateRuntimeIr(ir) {
  if (!ir || ir.schema !== 'praxis-ir.v0') {
    throw new PraxisRuntimeError('PRAXIS_IR_MALFORMED', 'run expects praxis-ir.v0');
  }
  if (ir.digest !== irDigestPraxis(ir)) {
    throw new PraxisRuntimeError('PRAXIS_IR_TAMPERED', 'Praxis IR digest mismatch');
  }
  if (
    !Array.isArray(ir.required_permits)
    || !Array.isArray(ir.required_secrets)
    || !Array.isArray(ir.required_prepared)
    || !Array.isArray(ir.instructions)
  ) {
    throw new PraxisRuntimeError('PRAXIS_IR_MALFORMED', 'Praxis IR tables must be arrays');
  }
  const allowed = new Set([
    'REQUIRE_PERMIT',
    'REQUIRE_LEASE',
    'REQUIRE_QUORUM',
    'REQUIRE_SECRET',
    'REQUIRE_PREPARED',
    'OBSERVE',
    'VERIFY',
    'ASSESS',
    'PLAN',
    'AUTHORIZE',
    'PREPARE',
    'CANCEL',
    'COMMIT',
    'FINALIZE'
  ]);
  for (const instruction of ir.instructions) {
    if (!instruction || typeof instruction !== 'object' || !allowed.has(instruction.op)) {
      throw new PraxisRuntimeError('PRAXIS_IR_MALFORMED', 'Praxis IR contains an unknown instruction');
    }
  }
}

function normalizeRuntimeTime(now) {
  const nowMs = typeof now === 'number' ? now : Date.parse(String(now));
  if (!Number.isFinite(nowMs)) {
    throw new TypeError('run now must be a finite timestamp or parseable date');
  }
  return nowMs;
}

function normalizeRevocations(value) {
  if (value instanceof Set) {
    return Object.freeze({
      has(id) {
        return value.has(id) || value.has(String(id));
      }
    });
  }
  if (Array.isArray(value)) {
    const snapshot = new Set(value.map(String));
    return Object.freeze({
      has(id) {
        return snapshot.has(String(id));
      }
    });
  }
  throw new TypeError('revokedAuthorityIds must be an array or Set');
}

function runtimeTime(now) {
  return normalizeRuntimeTime(typeof now === 'function' ? now() : now);
}

function validatePreparedAuthorityState(prepared, {
  nowMs,
  revokedAuthorityIds,
  charterContext = null
}) {
  const authority = prepared?.authority;
  const operation = prepared?.operation;
  if (
    !authority
    || !operation
    || authority.operation_digest !== operation.operation_digest
    || typeof authority.authority_id !== 'string'
  ) {
    throw new PraxisRuntimeError(
      'PRAXIS_IR_MALFORMED',
      'prepared operation authority binding is invalid'
    );
  }
  if (revokedAuthorityIds.has(authority.authority_id)) {
    throw new PraxisRuntimeError(
      'PRAXIS_HOST_AUTHORITY_REVOKED',
      `host authority token ${authority.authority_id} is revoked at commit`
    );
  }
  if (
    authority.expires_at_ms !== null
    && authority.expires_at_ms !== undefined
    && nowMs >= authority.expires_at_ms
  ) {
    throw new PraxisRuntimeError(
      'PRAXIS_HOST_AUTHORITY_EXPIRED',
      `host authority token ${authority.authority_id} expired before commit`
    );
  }
  if (authority.charter_digest) {
    if (!charterContext) {
      throw new PraxisRuntimeError(
        'PRAXIS_CHARTER_REQUIRED',
        'chartered prepared authority requires the signed charter at replay/commit'
      );
    }
    if (authority.charter_digest !== charterContext.digest) {
      throw new PraxisRuntimeError(
        'PRAXIS_CHARTER_SIGNATURE',
        'prepared authority charter digest does not match the runtime charter'
      );
    }
    const policyEntry = charterContext.body.policies?.[authority.policy_name];
    if (!policyEntry || policyEntry.digest !== authority.policy_digest) {
      throw new PraxisRuntimeError(
        'PRAXIS_POLICY_UNPINNED',
        'prepared authority policy is not pinned by the runtime charter'
      );
    }
    const policy = policyEntry.def;
    if (
      policy.authority_kind !== authority.authority_kind
      || policy.action !== authority.action
      || policy.scope !== authority.scope
    ) {
      throw new PraxisRuntimeError(
        'PRAXIS_POLICY_UNPINNED',
        'prepared authority does not match the pinned policy'
      );
    }
    if (authority.authority_kind === 'Quorum') {
      const expectedMembers = [...(policy.members ?? [])].sort();
      const actualMembers = [...(authority.members ?? [])].sort();
      if (
        policy.threshold !== authority.threshold
        || expectedMembers.length !== actualMembers.length
        || expectedMembers.some((member, index) => member !== actualMembers[index])
        || (policy.humans ?? 0) !== (authority.human_minimum ?? 0)
      ) {
        throw new PraxisRuntimeError(
          'PRAXIS_POLICY_UNPINNED',
          'prepared quorum was weakened relative to the pinned policy'
        );
      }
    }
    const expectedPremises = policy.require ?? [];
    const actualPremises = authority.premises ?? [];
    if (
      expectedPremises.length !== actualPremises.length
      || expectedPremises.some((predicate, index) =>
        actualPremises[index]?.result !== true
        || actualPremises[index]?.predicate_digest !== signatureBodyDigest(predicate)
      )
    ) {
      throw new PraxisRuntimeError(
        'PRAXIS_POLICY_REQUIRE',
        'prepared authority does not preserve its pinned premise results'
      );
    }
    if (policy.advisor) {
      if (
        !authority.advice
        || authority.advice.advisor !== policy.advisor
        || authority.advice.deny !== false
      ) {
        throw new PraxisRuntimeError(
          'PRAXIS_ADVISOR_REQUIRED',
          'prepared authority is missing the pinned advisor result'
        );
      }
    }
  }
  validateEffectEnvelope(authority, operation, charterContext);
  for (const evidence of authority.evidence ?? []) {
    if (authority.charter_digest) {
      const verifier = charterContext?.body.verifiers?.[evidence.verifier_name];
      if (!verifier || verifier.digest !== evidence.verifier_digest) {
        throw new PraxisRuntimeError(
          'PRAXIS_VERIFIER_UNPINNED',
          'prepared authority evidence uses an unpinned verifier'
        );
      }
    }
    if (nowMs >= evidence.valid_until_ms) {
      throw new PraxisRuntimeError(
        'PRAXIS_EVIDENCE_STALE',
        'authority evidence expired before commit'
      );
    }
  }
}

export async function run(source, {
  authorities = {},
  secrets = {},
  prepared = {},
  observations = {},
  charter = null,
  trustedCharterKeys = [],
  hostOperations = null,
  preparer = null,
  executor = null,
  completer = null,
  canceler = null,
  verifiers = {},
  assessors = {},
  now = Date.now(),
  revokedAuthorityIds = []
} = {}) {
  const ir = typeof source === 'string' ? compile(source) : source;
  validateRuntimeIr(ir);

  const values = new Map();
  const requirements = new Map(ir.required_permits.map(item => [item.name, item]));
  const secretRequirements = new Map((ir.required_secrets ?? []).map(item => [item.name, item]));
  const preparedRequirements = new Map((ir.required_prepared ?? []).map(item => [item.name, item]));
  const authorityTokens = new Map();
  const secretRefs = new Map();
  const preparedRefs = new Map();
  const terminalPreparedValues = new WeakSet();
  const revoked = normalizeRevocations(revokedAuthorityIds);
  const charterContext = charter
    ? verifySyntheticCharter(charter, trustedCharterKeys)
    : null;
  const hostOperationRegistry = normalizeHostOperationRegistry(hostOperations);
  if (
    charterContext
    && (charterContext.body.program_digests?.length ?? 0) > 0
    && !charterContext.body.program_digests.includes(ir.digest)
  ) {
    throw new PraxisRuntimeError(
      'PRAXIS_PROGRAM_UNPINNED',
      'executed Praxis IR is not pinned by the signed charter'
    );
  }

  const bindValue = (name, value) => {
    if (typeof name !== 'string' || name.length === 0) {
      throw new PraxisRuntimeError('PRAXIS_IR_MALFORMED', 'Praxis IR binding name is invalid');
    }
    if (values.has(name)) {
      throw new PraxisRuntimeError(
        'PRAXIS_IR_DUPLICATE_BINDING',
        `Praxis IR attempts to redefine binding ${name}`
      );
    }
    values.set(name, value);
  };

  for (const requirement of ir.required_permits) {
    const token = authorities[requirement.name];
    validateAuthorityToken(token, requirement, {
      nowMs: runtimeTime(now),
      revokedAuthorityIds: revoked,
      charterContext
    });
    authorityTokens.set(requirement.name, token);
    bindValue(requirement.name, {
      kind: requirement.authority_kind ?? 'Permit',
      authority_id: token.id,
      action: token.action,
      scope: token.scope,
      expires_at_ms: token.expires_at_ms ?? null,
      threshold: token.threshold ?? null,
      members: token.members ?? null,
      approved_by: token.approved_by ?? null,
      human_minimum: token.human_minimum ?? 0,
      operation_digest: token.operation_digest,
      charter_digest: token.charter_digest ?? null,
      policy_name: token.policy_name ?? null,
      policy_digest: token.policy_digest ?? null,
      requester: token.requester ?? null,
      request_digest: token.request_digest ?? null,
      evidence: token.evidence ?? null,
      premises: token.premises ?? null,
      advice: token.advice ?? null
    });
  }

  for (const requirement of ir.required_secrets ?? []) {
    const ref = secrets[requirement.name];
    if (!ref || ref[HOST_SECRET_REF] !== true) {
      throw new PraxisRuntimeError(
        'PRAXIS_HOST_SECRET_REQUIRED',
        `host did not provide an opaque secret reference for ${requirement.name}`
      );
    }
    if (ref.kind !== requirement.secret_kind) {
      throw new PraxisRuntimeError(
        'PRAXIS_HOST_SECRET_KIND_MISMATCH',
        `host secret reference ${ref.id} has kind ${ref.kind}, expected ${requirement.secret_kind}`
      );
    }
    secretRefs.set(requirement.name, ref);
    bindValue(requirement.name, Object.freeze({
      kind: 'SecretRef',
      secret_ref_id: ref.id,
      secret_kind: ref.kind
    }));
  }

  for (const requirement of ir.required_prepared ?? []) {
    const ref = prepared[requirement.name];
    if (!ref || ref[HOST_PREPARED_REF] !== true) {
      throw new PraxisRuntimeError(
        'PRAXIS_HOST_PREPARED_REQUIRED',
        `host did not provide a prepared-effect reference for ${requirement.name}`
      );
    }
    if (consumedPreparedRefs.has(ref)) {
      throw new PraxisRuntimeError(
        'PRAXIS_HOST_PREPARED_CONSUMED',
        `prepared-effect reference ${ref.id} already has a terminal transition`
      );
    }
    if (ref.action !== requirement.action || ref.scope !== requirement.scope) {
      throw new PraxisRuntimeError(
        'PRAXIS_HOST_PREPARED_MISMATCH',
        `prepared-effect reference ${ref.id} does not match ${requirement.action}@${requirement.scope}`
      );
    }
    preparedRefs.set(requirement.name, ref);
    bindValue(requirement.name, Object.freeze({
      kind: 'PreparedOperation',
      operation: ref.operation,
      authority: ref.authority,
      preparation: ref.preparation,
      prepared_ref_id: ref.id,
      imported: true
    }));
  }

  for (const instruction of ir.instructions) {
    switch (instruction.op) {
      case 'REQUIRE_PERMIT':
      case 'REQUIRE_LEASE':
      case 'REQUIRE_QUORUM':
      case 'REQUIRE_SECRET':
      case 'REQUIRE_PREPARED':
        break;

      case 'OBSERVE': {
        const observedValue = resolveValue(instruction.value, values);
        assertRuntimeOrdinaryValue(observedValue, `observe ${instruction.name}`);
        const signedObservation = observations[instruction.provenance] ?? null;
        if (signedObservation) {
          if (
            signedObservation.schema !== 'praxis-signed-observation.v0'
            || signedObservation.body?.source !== instruction.provenance
            || canonicalJsonPraxis(signedObservation.body?.value) !== canonicalJsonPraxis(observedValue)
          ) {
            throw new PraxisRuntimeError(
              'PRAXIS_OBSERVATION_MISMATCH',
              'signed observation does not match the requested source/value'
            );
          }
        }
        bindValue(instruction.name, {
          kind: 'Observed',
          value: signedObservation ? signedObservation.body.value : observedValue,
          provenance: instruction.provenance,
          host_observation: signedObservation
        });
        break;
      }

      case 'VERIFY': {
        const input = values.get(instruction.input);
        if (!input || (input.kind !== 'Observed' && input.kind !== 'Verified')) {
          throw new PraxisRuntimeError(
            'PRAXIS_VERIFY_REQUIRES_EVIDENCE',
            `verify requires Observed or Verified input, received ${input?.kind ?? 'missing'}`
          );
        }

        if (input.host_observation) {
          if (!charterContext) {
            throw new PraxisRuntimeError(
              'PRAXIS_CHARTER_REQUIRED',
              'signed observations require a trusted charter'
            );
          }
          const verified = verifyHostObservation({
            observation: input.host_observation,
            verifierName: instruction.policy,
            charter,
            trustedRootKeys: trustedCharterKeys,
            now: runtimeTime(now)
          });
          const supplementalVerifier = verifiers[instruction.policy];
          if (supplementalVerifier !== undefined) {
            if (typeof supplementalVerifier !== 'function') {
              throw new PraxisRuntimeError(
                'PRAXIS_VERIFIER_REQUIRED',
                `verifier ${instruction.policy} is not callable`
              );
            }
            const supplementalResult = await supplementalVerifier(verified);
            if (!supplementalResult || supplementalResult.ok !== true) {
              throw new PraxisRuntimeError(
                'PRAXIS_VERIFICATION_DENIED',
                `verifier ${instruction.policy} supplemental check denied`
              );
            }
          }
          bindValue(instruction.name, verified);
          break;
        }

        const verifier = verifiers[instruction.policy];
        if (typeof verifier !== 'function') {
          throw new PraxisRuntimeError(
            'PRAXIS_VERIFIER_REQUIRED',
            `verifier ${instruction.policy} is not available`
          );
        }
        const result = await verifier(input);
        if (!result || result.ok !== true) {
          throw new PraxisRuntimeError(
            'PRAXIS_VERIFICATION_DENIED',
            `verifier ${instruction.policy} did not return explicit ok:true`
          );
        }
        bindValue(instruction.name, {
          kind: 'Verified',
          value: input.value,
          provenance: input.provenance,
          policy: instruction.policy,
          evidence: result.evidence ?? null
        });
        break;
      }

      case 'ASSESS': {
        const input = values.get(instruction.input);
        if (!input || !runtimeKnowledgeKind(input.kind) || input.kind === 'Receipt') {
          throw new PraxisRuntimeError(
            'PRAXIS_ASSESS_REQUIRES_KNOWLEDGE',
            `assess requires knowledge input, received ${input?.kind ?? 'missing'}`
          );
        }
        const assessor = assessors[instruction.policy];
        if (typeof assessor !== 'function') {
          throw new PraxisRuntimeError(
            'PRAXIS_ASSESSOR_REQUIRED',
            `assessor ${instruction.policy} is not available`
          );
        }
        const result = await assessor(input);
        if (!result || result.ok !== true || !Object.prototype.hasOwnProperty.call(result, 'value')) {
          throw new PraxisRuntimeError(
            'PRAXIS_ASSESSMENT_DENIED',
            `assessor ${instruction.policy} did not return explicit ok:true with value`
          );
        }
        bindValue(instruction.name, {
          kind: 'Assessment',
          value: result.value,
          policy: instruction.policy,
          based_on: instruction.input
        });
        break;
      }

      case 'PLAN': {
        if (!Array.isArray(instruction.args) || !Array.isArray(instruction.secrets ?? [])) {
          throw new PraxisRuntimeError('PRAXIS_IR_MALFORMED', 'PLAN args/secrets must be arrays');
        }
        const args = instruction.args.map((arg, index) => {
          const value = resolveValue(arg, values);
          assertRuntimeOrdinaryValue(value, `PLAN ${instruction.name} arg ${index}`);
          return value;
        });
        const secretReferences = (instruction.secrets ?? []).map(name => {
          const requirement = secretRequirements.get(name);
          const ref = secretRefs.get(name);
          if (!requirement || !ref) {
            throw new PraxisRuntimeError(
              'PRAXIS_HOST_SECRET_REQUIRED',
              `secret reference ${name} is unavailable`
            );
          }
          return Object.freeze({
            binding: name,
            secret_ref_id: ref.id,
            secret_kind: ref.kind
          });
        });

        let operation;
        if (hostOperationRegistry) {
          const measured = resolveHostOperationContract(
            hostOperationRegistry,
            instruction.action,
            instruction.scope
          );
          if (instruction.declared_effect === null || instruction.declared_effect === undefined) {
            throw new PraxisRuntimeError(
              'PRAXIS_EFFECT_UNDECLARED',
              `operation ${instruction.name} must declare its measured effect`
            );
          }
          if (
            measured.action !== instruction.action
            || measured.scope !== instruction.scope
            || measured.effect !== instruction.declared_effect
            || measured.irreversible !== (instruction.declared_irreversible === true)
            || measured.egress !== (instruction.declared_egress ?? null)
          ) {
            throw new PraxisRuntimeError(
              'PRAXIS_LINK_MISMATCH',
              `operation ${instruction.name} declaration does not match the host-measured contract`
            );
          }
          operation = createOperationDescriptorPraxis({
            action: measured.action,
            scope: measured.scope,
            args,
            secretReferences,
            hostOperation: measured.name,
            effect: measured.effect,
            irreversible: measured.irreversible,
            egress: measured.egress
          });
        } else {
          if (
            instruction.declared_effect !== null
            && instruction.declared_effect !== undefined
          ) {
            throw new PraxisRuntimeError(
              'PRAXIS_HOST_OPERATION_REQUIRED',
              `operation ${instruction.name} declares an effect but no host registry is present`
            );
          }
          operation = createOperationDescriptorPraxis({
            action: instruction.action,
            scope: instruction.scope,
            args,
            secretReferences
          });
        }

        bindValue(instruction.name, operation);
        break;
      }

      case 'AUTHORIZE': {
        const operation = values.get(instruction.operation);
        if (!operation || operation.kind !== 'Operation') {
          throw new PraxisRuntimeError(
            'PRAXIS_AUTHORIZE_REQUIRES_OPERATION',
            `authorize requires Operation, received ${operation?.kind ?? 'missing'}`
          );
        }
        const authorityValue = values.get(instruction.permit);
        if (!authorityValue) {
          throw new PraxisRuntimeError(
            'PRAXIS_HOST_AUTHORITY_REQUIRED',
            `authority binding ${instruction.permit} is unavailable`
          );
        }
        if (!['Permit', 'Lease', 'Quorum'].includes(authorityValue.kind)) {
          throw new PraxisRuntimeError(
            'PRAXIS_AUTHORIZE_REQUIRES_PERMIT',
            `authorize requires Permit, Lease, or Quorum, received ${authorityValue.kind}`
          );
        }
        const requirement = requirements.get(instruction.permit);
        const token = authorityTokens.get(instruction.permit);
        if (!requirement || !token) {
          throw new PraxisRuntimeError(
            'PRAXIS_HOST_AUTHORITY_REQUIRED',
            `host authority token for ${instruction.permit} is unavailable`
          );
        }
        validateAuthorityToken(token, requirement, {
          nowMs: runtimeTime(now),
          revokedAuthorityIds: revoked,
          operationDigest: operation.operation_digest,
          charterContext
        });
        validateEffectEnvelope(token, operation, charterContext);
        bindValue(instruction.name, Object.freeze({
          kind: 'AuthorizedOperation',
          operation,
          permit_name: instruction.permit,
          authority: Object.freeze({
            authority_id: token.id,
            authority_kind: requirement.authority_kind ?? 'Permit',
            action: token.action,
            scope: token.scope,
            operation_digest: token.operation_digest,
            expires_at_ms: token.expires_at_ms ?? null,
            threshold: token.threshold ?? null,
            members: token.members ?? null,
            approved_by: token.approved_by ?? null,
            human_minimum: token.human_minimum ?? 0,
            charter_digest: token.charter_digest ?? null,
            policy_name: token.policy_name ?? null,
            policy_digest: token.policy_digest ?? null,
            requester: token.requester ?? null,
            request_digest: token.request_digest ?? null,
            evidence: token.evidence ?? null,
            premises: token.premises ?? null,
            advice: token.advice ?? null
          })
        }));
        break;
      }

      case 'PREPARE': {
        if (typeof preparer !== 'function') {
          throw new PraxisRuntimeError(
            'PRAXIS_PREPARER_REQUIRED',
            'prepare is fail-closed: a host durable preparer must be explicitly injected'
          );
        }

        const authorized = values.get(instruction.operation);
        if (!authorized || authorized.kind !== 'AuthorizedOperation' || authorized.operation?.kind !== 'Operation') {
          throw new PraxisRuntimeError(
            'PRAXIS_PREPARE_REQUIRES_AUTHORITY',
            `prepare requires AuthorizedOperation, received ${authorized?.kind ?? 'missing'}`
          );
        }
        const requirement = requirements.get(authorized.permit_name);
        const token = authorityTokens.get(authorized.permit_name);
        validateAuthorityToken(token, requirement, {
          nowMs: runtimeTime(now),
          revokedAuthorityIds: revoked,
          operationDigest: authorized.operation.operation_digest,
          charterContext
        });
        validateEffectEnvelope(token, authorized.operation, charterContext);

        const request = Object.freeze({
          schema: 'praxis-prepare-request.v0',
          operation: authorized.operation,
          authority: authorized.authority
        });

        let preparedResult;
        try {
          preparedResult = await preparer(request);
        } catch {
          throw new PraxisRuntimeError(
            'PRAXIS_PREPARATION_UNCOMMITTED',
            'effect was not made executable because durable preparation failed',
            {
              operation_digest: authorized.operation.operation_digest,
              executor_invoked: false
            }
          );
        }

        const evidence = preparedResult?.evidence;
        if (
          preparedResult?.ok !== true
          || !evidence
          || evidence.durable !== true
          || evidence.operation_digest !== authorized.operation.operation_digest
          || typeof evidence.preparation_digest !== 'string'
          || !/^sha256:[a-f0-9]{64}$/.test(evidence.preparation_digest)
        ) {
          throw new PraxisRuntimeError(
            'PRAXIS_PREPARATION_EVIDENCE_INVALID',
            'preparer did not return durable evidence bound to the exact operation digest',
            {
              operation_digest: authorized.operation.operation_digest,
              executor_invoked: false
            }
          );
        }

        consumedAuthorityTokens.add(token);
        bindValue(instruction.name, Object.freeze({
          kind: 'PreparedOperation',
          operation: authorized.operation,
          authority: authorized.authority,
          preparation: Object.freeze({ ...evidence })
        }));
        break;
      }

      case 'CANCEL': {
        if (typeof canceler !== 'function') {
          throw new PraxisRuntimeError(
            'PRAXIS_CANCELER_REQUIRED',
            'cancel is fail-closed: a host durable cancellation recorder must be explicitly injected'
          );
        }

        const preparedValue = values.get(instruction.operation);
        if (!preparedValue || preparedValue.kind !== 'PreparedOperation') {
          throw new PraxisRuntimeError(
            'PRAXIS_CANCEL_REQUIRES_PREPARATION',
            `cancel requires PreparedOperation, received ${preparedValue?.kind ?? 'missing'}`
          );
        }
        if (terminalPreparedValues.has(preparedValue)) {
          throw new PraxisRuntimeError(
            'PRAXIS_LINEAR_OPERATION_REUSE',
            'prepared operation already has a terminal transition'
          );
        }
        const cancellationRequest = Object.freeze({
          schema: 'praxis-cancellation-request.v0',
          operation_digest: preparedValue.operation.operation_digest,
          preparation_digest: preparedValue.preparation.preparation_digest,
          idempotency_key: preparedValue.preparation.preparation_digest
        });

        let cancellation;
        try {
          cancellation = await canceler(cancellationRequest);
        } catch {
          throw new PraxisRuntimeError(
            'PRAXIS_CANCELLATION_UNCOMMITTED',
            'cancellation was not durable; effect remains prepared',
            {
              state: 'prepared',
              operation_digest: cancellationRequest.operation_digest,
              preparation_digest: cancellationRequest.preparation_digest
            }
          );
        }

        if (
          cancellation?.ok !== true
          || !cancellation.evidence
          || cancellation.evidence.durable !== true
          || cancellation.evidence.operation_digest !== cancellationRequest.operation_digest
          || cancellation.evidence.preparation_digest !== cancellationRequest.preparation_digest
        ) {
          throw new PraxisRuntimeError(
            'PRAXIS_CANCELLATION_EVIDENCE_INVALID',
            'cancellation evidence is not bound to the prepared effect',
            {
              state: 'prepared',
              operation_digest: cancellationRequest.operation_digest,
              preparation_digest: cancellationRequest.preparation_digest
            }
          );
        }

        terminalPreparedValues.add(preparedValue);
        const importedRef = preparedRefs.get(instruction.operation);
        if (importedRef) consumedPreparedRefs.add(importedRef);

        bindValue(instruction.name, Object.freeze({
          kind: 'CancellationReceipt',
          schema: 'praxis-cancellation-receipt.v0',
          operation_digest: cancellationRequest.operation_digest,
          preparation_digest: cancellationRequest.preparation_digest,
          cancellation_evidence: Object.freeze({ ...cancellation.evidence })
        }));
        break;
      }

      case 'COMMIT':
      case 'FINALIZE': {
        const finality = instruction.op === 'FINALIZE' ? 'finalize' : 'commit';
        if (typeof executor !== 'function') {
          throw new PraxisRuntimeError(
            'PRAXIS_EXECUTOR_REQUIRED',
            'commit is fail-closed: a host executor must be explicitly injected'
          );
        }
        if (typeof completer !== 'function') {
          throw new PraxisRuntimeError(
            'PRAXIS_COMPLETER_REQUIRED',
            'commit is fail-closed: a host durable completion recorder must be explicitly injected'
          );
        }

        const prepared = values.get(instruction.operation);
        if (!prepared || prepared.kind !== 'PreparedOperation') {
          throw new PraxisRuntimeError(
            'PRAXIS_COMMIT_REQUIRES_PREPARATION',
            `commit requires PreparedOperation, received ${prepared?.kind ?? 'missing'}`
          );
        }
        if (terminalPreparedValues.has(prepared)) {
          throw new PraxisRuntimeError(
            'PRAXIS_LINEAR_OPERATION_REUSE',
            'prepared operation already has a terminal transition'
          );
        }
        validatePreparedAuthorityState(prepared, {
          nowMs: runtimeTime(now),
          revokedAuthorityIds: revoked,
          charterContext
        });
        validateMeasuredOperationAgainstRegistry(prepared.operation, hostOperationRegistry);

        if (
          prepared.operation.effect !== undefined
          && typeof prepared.operation.irreversible !== 'boolean'
        ) {
          throw new PraxisRuntimeError(
            'PRAXIS_IR_MALFORMED',
            'measured prepared operation has invalid irreversibility metadata'
          );
        }
        if (prepared.operation.irreversible === true && finality !== 'finalize') {
          throw new PraxisRuntimeError(
            'PRAXIS_IRREVERSIBLE_REQUIRES_FINALIZE',
            'host-measured irreversible operation requires finalize'
          );
        }
        if (finality === 'finalize' && prepared.operation.irreversible !== true) {
          throw new PraxisRuntimeError(
            'PRAXIS_FINALIZE_REQUIRES_IRREVERSIBLE',
            'finalize requires a host-measured irreversible operation'
          );
        }

        const expectedDigest = prepared.operation.operation_digest;
        const preparationDigest = prepared.preparation.preparation_digest;
        const request = Object.freeze({
          schema: finality === 'finalize'
            ? 'praxis-finalize-request.v0'
            : 'praxis-commit-request.v0',
          finality,
          operation: prepared.operation,
          authority: prepared.authority,
          preparation: prepared.preparation,
          idempotency_key: preparationDigest
        });

        let result;
        try {
          result = await executor(request);
        } catch {
          throw new PraxisRuntimeError(
            'PRAXIS_EXTERNAL_OUTCOME_UNCERTAIN',
            'external outcome is unresolved; effect remains prepared',
            {
              state: 'prepared',
              operation_digest: expectedDigest,
              preparation_digest: preparationDigest,
              completion_committed: false
            }
          );
        }

        if (result?.status === 'uncertain') {
          throw new PraxisRuntimeError(
            'PRAXIS_EXTERNAL_OUTCOME_UNCERTAIN',
            'external outcome is unresolved; effect remains prepared',
            {
              state: 'prepared',
              operation_digest: expectedDigest,
              preparation_digest: preparationDigest,
              completion_committed: false
            }
          );
        }

        if (
          result?.status !== 'completed'
          || !result.receipt
          || result.receipt.operation_digest !== expectedDigest
          || result.receipt.preparation_digest !== preparationDigest
          || (
            prepared.operation.effect !== undefined
            && result.receipt.finality !== finality
          )
        ) {
          throw new PraxisRuntimeError(
            'PRAXIS_EXTERNAL_RECEIPT_UNVERIFIED',
            'external receipt is not verified; effect remains prepared',
            {
              state: 'prepared',
              operation_digest: expectedDigest,
              preparation_digest: preparationDigest,
              completion_committed: false
            }
          );
        }

        const completionRequest = Object.freeze({
          schema: 'praxis-completion-request.v0',
          finality,
          operation_digest: expectedDigest,
          preparation_digest: preparationDigest,
          receipt: Object.freeze({ ...result.receipt })
        });

        let completion;
        try {
          completion = await completer(completionRequest);
        } catch {
          throw new PraxisRuntimeError(
            'PRAXIS_COMPLETION_UNCOMMITTED',
            'receipt verified but durable completion failed; replay must use the same prepared effect',
            {
              state: 'prepared',
              operation_digest: expectedDigest,
              preparation_digest: preparationDigest,
              completion_committed: false
            }
          );
        }

        if (
          completion?.ok !== true
          || !completion.evidence
          || completion.evidence.durable !== true
          || completion.evidence.operation_digest !== expectedDigest
          || completion.evidence.preparation_digest !== preparationDigest
          || (
            prepared.operation.effect !== undefined
            && completion.evidence.finality !== finality
          )
        ) {
          throw new PraxisRuntimeError(
            'PRAXIS_COMPLETION_EVIDENCE_INVALID',
            'completion recorder did not return durable evidence bound to the prepared effect',
            {
              state: 'prepared',
              operation_digest: expectedDigest,
              preparation_digest: preparationDigest,
              completion_committed: false
            }
          );
        }

        terminalPreparedValues.add(prepared);
        const importedRef = preparedRefs.get(instruction.operation);
        if (importedRef) consumedPreparedRefs.add(importedRef);

        bindValue(instruction.name, Object.freeze({
          kind: 'Receipt',
          schema: 'praxis-receipt.v0',
          operation_digest: expectedDigest,
          preparation_digest: preparationDigest,
          authority_id: prepared.authority.authority_id,
          finality,
          executor_receipt: Object.freeze({ ...result.receipt }),
          completion_evidence: Object.freeze({ ...completion.evidence })
        }));
        break;
      }

      default:
        throw new PraxisRuntimeError(
          'PRAXIS_UNKNOWN_INSTRUCTION',
          `unknown instruction ${instruction.op}`
        );
    }
  }

  return Object.freeze({
    schema: 'praxis-run-result.v0',
    values: Object.freeze(Object.fromEntries(values))
  });
}
