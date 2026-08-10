import {
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject
} from './canonical.mjs';
import {
  intentRequestBinding,
  intentRequestDigest
} from './intent-binding.mjs';

export const INVOCATION_ENVELOPE_SCHEMA = 'axiom-invocation-envelope.v1';
export const NATIVE_INVOCATION_PROFILE = 'axiom-native-gateway.v1';
export const INVOCATION_EVIDENCE_PROFILE = 'axiom-grid-hash-linked.v1';

const DIGEST = /^[a-f0-9]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const RISK = /^[a-z][a-z0-9._-]{0,63}$/;

export function buildNativeInvocationEnvelope(intent, decision) {
  const value = assertPlainObject(intent, 'invocation intent');
  const principal = assertPlainObject(value.principal, 'invocation principal');
  const policy = assertPlainObject(decision, 'invocation decision');
  const request = intentRequestBinding(value);
  const requestDigest = intentRequestDigest(value);
  const inputDigest = digestObject(assertPlainObject(value.input ?? {}, 'invocation input'));
  const timeoutMs = normalizePositiveInteger(
    policy.timeout_ms ?? 10_000,
    'invocation decision timeout_ms',
    600_000
  );

  const caller = {
    principal_id: assertString(principal.id, 'invocation principal id', {
      max: 160,
      pattern: IDENTIFIER
    }),
    principal_type: assertString(principal.type ?? 'human', 'invocation principal type', {
      max: 16,
      pattern: /^(human|agent|service)$/
    })
  };

  let ingress;
  if (principal.schema === 'axiom-machine-principal.v1') {
    const constraints = assertPlainObject(principal.constraints, 'machine constraints');
    const budgets = assertPlainObject(constraints.budgets, 'machine budgets');
    const runtime = assertPlainObject(principal.runtime, 'machine runtime');
    caller.machine = {
      sponsor: assertString(principal.sponsor, 'machine sponsor', {
        max: 160,
        pattern: IDENTIFIER
      }),
      runtime_id: assertString(runtime.id, 'machine runtime id', {
        max: 160,
        pattern: IDENTIFIER
      }),
      authority_digest: assertString(
        principal.authority_digest,
        'machine authority digest',
        { min: 64, max: 64, pattern: DIGEST }
      )
    };
    ingress = {
      max_request_bytes: normalizePositiveInteger(
        budgets.max_request_bytes,
        'machine max_request_bytes',
        16_777_216
      ),
      max_requests_per_minute: normalizePositiveInteger(
        budgets.max_requests_per_minute,
        'machine max_requests_per_minute',
        10_000
      ),
      max_concurrent_requests: normalizePositiveInteger(
        budgets.max_concurrent_requests,
        'machine max_concurrent_requests',
        1_000
      ),
      max_response_bytes: normalizePositiveInteger(
        budgets.max_response_bytes,
        'machine max_response_bytes',
        20_971_520
      )
    };
  }

  const envelope = {
    schema: INVOCATION_ENVELOPE_SCHEMA,
    protocol_profile: NATIVE_INVOCATION_PROFILE,
    caller,
    request: {
      intent_id: assertString(value.intent_id, 'invocation intent id', {
        max: 160,
        pattern: IDENTIFIER
      }),
      request_digest: requestDigest,
      input_digest: inputDigest,
      action: request.action,
      purpose: request.purpose,
      data_scopes: request.data_scopes
    },
    authority: {
      policy_version: assertString(policy.policy_version, 'invocation policy version', {
        max: 128
      }),
      policy_digest: assertString(policy.policy_digest, 'invocation policy digest', {
        min: 64,
        max: 64,
        pattern: DIGEST
      }),
      risk: assertString(policy.risk, 'invocation risk', {
        max: 64,
        pattern: RISK
      }),
      independent_approval_required: policy.requires_independent_approval === true
    },
    limits: {
      execution_timeout_ms: timeoutMs,
      ...(ingress ? { ingress } : {})
    },
    evidence_profile: INVOCATION_EVIDENCE_PROFILE
  };
  return validateInvocationEnvelope(envelope);
}

export function validateInvocationEnvelope(raw) {
  const value = assertPlainObject(raw, 'invocation envelope');
  assertExactKeys(value, [
    'schema',
    'protocol_profile',
    'caller',
    'request',
    'authority',
    'limits',
    'evidence_profile'
  ], 'invocation envelope');
  if (value.schema !== INVOCATION_ENVELOPE_SCHEMA) {
    throw new ValidationError('Invocation envelope schema is unsupported');
  }
  if (value.protocol_profile !== NATIVE_INVOCATION_PROFILE) {
    throw new ValidationError('Invocation protocol profile is unsupported');
  }
  if (value.evidence_profile !== INVOCATION_EVIDENCE_PROFILE) {
    throw new ValidationError('Invocation evidence profile is unsupported');
  }

  const caller = assertPlainObject(value.caller, 'invocation caller');
  assertExactKeys(caller, [
    'principal_id',
    'principal_type',
    ...(caller.machine !== undefined ? ['machine'] : [])
  ], 'invocation caller');
  assertString(caller.principal_id, 'invocation principal id', {
    max: 160,
    pattern: IDENTIFIER
  });
  const principalType = assertString(caller.principal_type, 'invocation principal type', {
    max: 16,
    pattern: /^(human|agent|service)$/
  });

  if (caller.machine !== undefined) {
    if (!['agent', 'service'].includes(principalType)) {
      throw new ValidationError('Human invocation caller cannot carry machine authority');
    }
    const machine = assertPlainObject(caller.machine, 'invocation machine caller');
    assertExactKeys(machine, ['sponsor', 'runtime_id', 'authority_digest'], 'invocation machine caller');
    assertString(machine.sponsor, 'invocation machine sponsor', {
      max: 160,
      pattern: IDENTIFIER
    });
    assertString(machine.runtime_id, 'invocation machine runtime id', {
      max: 160,
      pattern: IDENTIFIER
    });
    assertString(machine.authority_digest, 'invocation machine authority digest', {
      min: 64,
      max: 64,
      pattern: DIGEST
    });
  }

  const request = assertPlainObject(value.request, 'invocation request');
  assertExactKeys(request, [
    'intent_id',
    'request_digest',
    'input_digest',
    'action',
    'purpose',
    'data_scopes'
  ], 'invocation request');
  assertString(request.intent_id, 'invocation intent id', { max: 160, pattern: IDENTIFIER });
  assertString(request.request_digest, 'invocation request digest', {
    min: 64,
    max: 64,
    pattern: DIGEST
  });
  assertString(request.input_digest, 'invocation input digest', {
    min: 64,
    max: 64,
    pattern: DIGEST
  });
  assertString(request.action, 'invocation action', {
    max: 128,
    pattern: /^[a-z][a-z0-9.-]+$/
  });
  assertString(request.purpose, 'invocation purpose', { max: 512 });
  if (
    !Array.isArray(request.data_scopes)
    || request.data_scopes.some(item => typeof item !== 'string' || item.length > 160)
    || request.data_scopes.some((item, index) => index > 0 && request.data_scopes[index - 1] >= item)
  ) {
    throw new ValidationError('Invocation data scopes must be unique sorted strings');
  }

  const authority = assertPlainObject(value.authority, 'invocation authority');
  assertExactKeys(authority, [
    'policy_version',
    'policy_digest',
    'risk',
    'independent_approval_required'
  ], 'invocation authority');
  assertString(authority.policy_version, 'invocation policy version', { max: 128 });
  assertString(authority.policy_digest, 'invocation policy digest', {
    min: 64,
    max: 64,
    pattern: DIGEST
  });
  assertString(authority.risk, 'invocation risk', { max: 64, pattern: RISK });
  if (typeof authority.independent_approval_required !== 'boolean') {
    throw new ValidationError('Invocation approval requirement must be boolean');
  }

  const limits = assertPlainObject(value.limits, 'invocation limits');
  assertExactKeys(limits, [
    'execution_timeout_ms',
    ...(limits.ingress !== undefined ? ['ingress'] : [])
  ], 'invocation limits');
  normalizePositiveInteger(limits.execution_timeout_ms, 'invocation execution timeout', 600_000);
  if (limits.ingress !== undefined) {
    if (caller.machine === undefined) {
      throw new ValidationError('Only a machine caller may carry machine ingress limits');
    }
    const ingress = assertPlainObject(limits.ingress, 'invocation ingress limits');
    assertExactKeys(
      ingress,
      [
        'max_request_bytes',
        'max_requests_per_minute',
        'max_concurrent_requests',
        'max_response_bytes'
      ],
      'invocation ingress limits'
    );
    normalizePositiveInteger(ingress.max_request_bytes, 'invocation max_request_bytes', 16_777_216);
    normalizePositiveInteger(ingress.max_requests_per_minute, 'invocation max_requests_per_minute', 10_000);
    normalizePositiveInteger(ingress.max_concurrent_requests, 'invocation max_concurrent_requests', 1_000);
    normalizePositiveInteger(ingress.max_response_bytes, 'invocation max_response_bytes', 20_971_520);
  }

  return structuredClone(value);
}

export function invocationEnvelopeDigest(envelope) {
  return digestObject(validateInvocationEnvelope(envelope));
}

function assertExactKeys(value, allowed, label) {
  const actual = Object.keys(value).sort();
  const expected = [...allowed].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new ValidationError(`${label} contains unsupported or missing fields`);
  }
}

function normalizePositiveInteger(value, label, maximum) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new ValidationError(`${label} must be a positive safe integer no greater than ${maximum}`);
  }
  return value;
}
