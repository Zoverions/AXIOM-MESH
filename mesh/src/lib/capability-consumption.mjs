import {
  AxiomError,
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject,
  sha256
} from './canonical.mjs';
import { verifyObjectSignature } from './identity.mjs';

export const CAPABILITY_CONSUMPTION_RECEIPT_SCHEMA =
  'axiom-capability-consumption-receipt.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const TOOL = /^[a-z][a-z0-9.-]{1,127}$/;

export function capabilityConsumptionEventId(jti) {
  const normalized = assertString(jti, 'capability jti', {
    max: 160,
    pattern: ID
  });
  return `evt_capability_consume_${sha256(normalized)}`;
}

export function buildCapabilityConsumptionStatement({
  capability,
  claims,
  executionEpoch,
  consumedAt = new Date().toISOString()
}) {
  const normalizedClaims = assertPlainObject(claims, 'capability claims');
  const epoch = assertString(executionEpoch, 'Sandbox execution epoch', {
    max: 160,
    pattern: ID
  });
  const consumedAtMs = Date.parse(consumedAt);
  if (!Number.isFinite(consumedAtMs)) {
    throw new ValidationError('Capability consumption time is invalid');
  }
  if (!Number.isSafeInteger(normalizedClaims.exp)) {
    throw new ValidationError('Capability expiry is invalid');
  }
  if (consumedAtMs >= normalizedClaims.exp * 1_000) {
    throw new AxiomError(
      'expired_capability',
      'Capability expired before durable consumption',
      401
    );
  }

  const statement = {
    schema: CAPABILITY_CONSUMPTION_RECEIPT_SCHEMA,
    jti: assertString(normalizedClaims.jti, 'capability jti', {
      max: 160,
      pattern: ID
    }),
    capability_digest: sha256(String(capability)),
    claims_digest: digestObject(normalizedClaims),
    subject: assertString(normalizedClaims.subject, 'capability subject', {
      max: 160,
      pattern: ID
    }),
    issuer: assertString(normalizedClaims.iss, 'capability issuer', {
      max: 64,
      pattern: /^[a-z][a-z0-9-]{0,63}$/
    }),
    audience: assertString(normalizedClaims.aud, 'capability audience', {
      max: 64,
      pattern: /^[a-z][a-z0-9-]{0,63}$/
    }),
    expires_at: normalizedClaims.exp,
    intent_digest: requiredDigest(normalizedClaims.intent_digest, 'capability intent digest'),
    plan_digest: requiredDigest(normalizedClaims.plan_digest, 'capability plan digest'),
    policy_digest: requiredDigest(normalizedClaims.policy_digest, 'capability policy digest'),
    ...(normalizedClaims.invocation_digest
      ? {
          invocation_digest: requiredDigest(
            normalizedClaims.invocation_digest,
            'capability invocation digest'
          )
        }
      : {}),
    tool: assertString(normalizedClaims.tool, 'capability tool', {
      max: 128,
      pattern: TOOL
    }),
    execution_epoch: epoch,
    consumed_at: new Date(consumedAtMs).toISOString()
  };
  return Object.freeze(statement);
}

export function signCapabilityConsumptionReceipt(identity, input) {
  if (!identity || typeof identity.signObject !== 'function') {
    throw new ValidationError('Grid signing identity is required');
  }
  const statement = buildCapabilityConsumptionStatement(input);
  const signature = identity.signObject(statement);
  const receipt = Object.freeze({ statement, signature });
  return Object.freeze({
    receipt,
    receipt_digest: digestObject(receipt)
  });
}

export function verifyCapabilityConsumptionReceipt(receiptInput, {
  gridPublicKey,
  capability,
  claims,
  executionEpoch
}) {
  const receipt = assertExactObject(
    receiptInput,
    ['statement', 'signature'],
    'Capability consumption receipt'
  );
  const statement = normalizeCapabilityConsumptionStatement(receipt.statement);
  if (!gridPublicKey || !verifyObjectSignature(statement, receipt.signature, gridPublicKey)) {
    throw new AxiomError(
      'invalid_capability_consumption_receipt',
      'Capability consumption receipt signature is invalid',
      401
    );
  }
  const expected = buildCapabilityConsumptionStatement({
    capability,
    claims,
    executionEpoch,
    consumedAt: statement.consumed_at
  });
  if (digestObject(statement) !== digestObject(expected)) {
    throw new AxiomError(
      'capability_consumption_mismatch',
      'Capability consumption receipt is not bound to this execution',
      403
    );
  }
  return Object.freeze({
    receipt: Object.freeze({
      statement,
      signature: structuredClone(receipt.signature)
    }),
    receipt_digest: digestObject({ statement, signature: receipt.signature })
  });
}

export function normalizeCapabilityConsumptionStatement(value) {
  const statement = assertExactObject(value, [
    'schema',
    'jti',
    'capability_digest',
    'claims_digest',
    'subject',
    'issuer',
    'audience',
    'expires_at',
    'intent_digest',
    'plan_digest',
    'policy_digest',
    'invocation_digest',
    'tool',
    'execution_epoch',
    'consumed_at'
  ], 'Capability consumption statement', { optional: ['invocation_digest'] });
  if (statement.schema !== CAPABILITY_CONSUMPTION_RECEIPT_SCHEMA) {
    throw new ValidationError('Capability consumption receipt schema is invalid');
  }
  assertString(statement.jti, 'consumption jti', { max: 160, pattern: ID });
  requiredDigest(statement.capability_digest, 'consumption capability digest');
  requiredDigest(statement.claims_digest, 'consumption claims digest');
  assertString(statement.subject, 'consumption subject', { max: 160, pattern: ID });
  assertString(statement.issuer, 'consumption issuer', {
    max: 64,
    pattern: /^[a-z][a-z0-9-]{0,63}$/
  });
  assertString(statement.audience, 'consumption audience', {
    max: 64,
    pattern: /^[a-z][a-z0-9-]{0,63}$/
  });
  if (!Number.isSafeInteger(statement.expires_at)) {
    throw new ValidationError('Capability consumption expiry is invalid');
  }
  requiredDigest(statement.intent_digest, 'consumption intent digest');
  requiredDigest(statement.plan_digest, 'consumption plan digest');
  requiredDigest(statement.policy_digest, 'consumption policy digest');
  if (statement.invocation_digest !== undefined) {
    requiredDigest(statement.invocation_digest, 'consumption invocation digest');
  }
  assertString(statement.tool, 'consumption tool', { max: 128, pattern: TOOL });
  assertString(statement.execution_epoch, 'consumption execution epoch', {
    max: 160,
    pattern: ID
  });
  const consumedAtMs = Date.parse(statement.consumed_at);
  if (!Number.isFinite(consumedAtMs) || consumedAtMs >= statement.expires_at * 1_000) {
    throw new ValidationError('Capability consumption time is outside capability lifetime');
  }
  return Object.freeze(structuredClone(statement));
}

function requiredDigest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function assertExactObject(value, allowed, label, { optional = [] } = {}) {
  const object = assertPlainObject(value, label);
  const allowedSet = new Set(allowed);
  const optionalSet = new Set(optional);
  for (const key of Object.keys(object)) {
    if (!allowedSet.has(key)) {
      throw new ValidationError(`${label} contains unsupported fields`);
    }
  }
  for (const key of allowed) {
    if (!optionalSet.has(key) && !Object.prototype.hasOwnProperty.call(object, key)) {
      throw new ValidationError(`${label} is missing ${key}`);
    }
  }
  return object;
}
