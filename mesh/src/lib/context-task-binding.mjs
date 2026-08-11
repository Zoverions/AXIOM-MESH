import {
  AxiomError,
  ValidationError,
  assertPlainObject,
  assertString,
  assertStringArray,
  digestObject
} from './canonical.mjs';
import { verifyObjectSignature } from './identity.mjs';

export const CONTEXT_PROJECTION_RECEIPT_SCHEMA = 'axiom-context-projection-receipt.v1';
export const CONTEXT_PROJECTION_RECEIPT_STATEMENT_SCHEMA = 'axiom-context-projection-receipt-statement.v1';
export const CONTEXT_TASK_BINDING_SCHEMA = 'axiom-context-task-binding.v1';

const DIGEST = /^[a-f0-9]{64}$/;
const PRINCIPAL = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const PURPOSE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const SCOPE = /^context:[A-Za-z0-9][A-Za-z0-9_.:-]{0,151}$/;

export function buildContextProjectionReceipt(projection, identity) {
  if (!identity || typeof identity.signObject !== 'function') {
    throw new ValidationError('Context projection receipt requires a signing identity');
  }
  const anchor = projectionAnchor(projection);
  const statement = {
    schema: CONTEXT_PROJECTION_RECEIPT_STATEMENT_SCHEMA,
    ...anchor,
    authority_effect: 'none'
  };
  const envelope = {
    schema: CONTEXT_PROJECTION_RECEIPT_SCHEMA,
    statement,
    attestation: identity.signObject(statement)
  };
  return { ...envelope, receipt_digest: digestObject(envelope) };
}

export function validateContextProjectionReceipt(raw) {
  const receipt = assertPlainObject(raw, 'context projection receipt');
  exactKeys(receipt, ['schema', 'statement', 'attestation', 'receipt_digest'], 'context projection receipt');
  if (receipt.schema !== CONTEXT_PROJECTION_RECEIPT_SCHEMA) {
    throw new ValidationError('Context projection receipt schema is invalid');
  }
  const statement = normalizeStatement(receipt.statement);
  const attestation = assertPlainObject(receipt.attestation, 'context projection receipt attestation');
  exactKeys(attestation, ['algorithm', 'key_id', 'digest', 'signature'], 'context projection receipt attestation');
  if (attestation.algorithm !== 'Ed25519') {
    throw new ValidationError('Context projection receipt algorithm is invalid');
  }
  assertString(attestation.key_id, 'context projection receipt key_id', { max: 160 });
  digestField(attestation.digest, 'context projection receipt attestation digest');
  assertString(attestation.signature, 'context projection receipt signature', {
    max: 1024,
    pattern: /^[A-Za-z0-9_-]+$/
  });
  const receiptDigest = digestField(receipt.receipt_digest, 'context projection receipt digest');
  const envelope = {
    schema: CONTEXT_PROJECTION_RECEIPT_SCHEMA,
    statement,
    attestation: structuredClone(attestation)
  };
  if (digestObject(envelope) !== receiptDigest) {
    throw new ValidationError('Context projection receipt digest does not match its envelope');
  }
  return { ...envelope, receipt_digest: receiptDigest };
}

export function verifyContextProjectionReceipt(receipt, gridPublicKey, {
  principalId,
  purpose,
  machineAuthorityDigest
} = {}) {
  const normalized = validateContextProjectionReceipt(receipt);
  if (!gridPublicKey) throw new ValidationError('Grid public key is required');
  if (!verifyObjectSignature(normalized.statement, normalized.attestation, gridPublicKey)) {
    throw new AxiomError('invalid_context_receipt', 'Context projection receipt signature is invalid', 403);
  }
  if (principalId !== undefined && normalized.statement.principal !== principalId) {
    throw new AxiomError('context_receipt_principal_mismatch', 'Context projection receipt belongs to another principal', 403);
  }
  if (purpose !== undefined && normalized.statement.purpose !== purpose) {
    throw new AxiomError('context_receipt_purpose_mismatch', 'Context projection receipt is bound to another purpose', 403);
  }
  const actualMachineDigest = normalized.statement.machine_authority_digest;
  if (machineAuthorityDigest !== undefined) {
    if (actualMachineDigest !== machineAuthorityDigest) {
      throw new AxiomError('context_receipt_machine_authority_mismatch', 'Context projection receipt is bound to different machine authority', 403);
    }
  } else if (actualMachineDigest !== undefined) {
    throw new AxiomError('context_receipt_principal_mismatch', 'Machine context receipt cannot bind a non-machine request', 403);
  }
  return normalized;
}

export function buildContextTaskBinding(receipt) {
  const normalized = validateContextProjectionReceipt(receipt);
  return normalizeContextTaskBinding({
    schema: CONTEXT_TASK_BINDING_SCHEMA,
    view_digest: normalized.statement.view_digest,
    projection_digest: normalized.statement.projection_digest,
    authority_digest: normalized.statement.authority_digest,
    receipt_digest: normalized.receipt_digest,
    projection_receipt: normalized
  });
}

export function normalizeContextTaskBinding(raw) {
  const binding = assertPlainObject(raw, 'context task binding');
  exactKeys(binding, [
    'schema', 'view_digest', 'projection_digest', 'authority_digest',
    'receipt_digest', 'projection_receipt'
  ], 'context task binding');
  if (binding.schema !== CONTEXT_TASK_BINDING_SCHEMA) {
    throw new ValidationError('Context task binding schema is invalid');
  }
  const receipt = validateContextProjectionReceipt(binding.projection_receipt);
  const normalized = {
    schema: CONTEXT_TASK_BINDING_SCHEMA,
    view_digest: digestField(binding.view_digest, 'context binding view_digest'),
    projection_digest: digestField(binding.projection_digest, 'context binding projection_digest'),
    authority_digest: digestField(binding.authority_digest, 'context binding authority_digest'),
    receipt_digest: digestField(binding.receipt_digest, 'context binding receipt_digest'),
    projection_receipt: receipt
  };
  if (
    normalized.view_digest !== receipt.statement.view_digest
    || normalized.projection_digest !== receipt.statement.projection_digest
    || normalized.authority_digest !== receipt.statement.authority_digest
    || normalized.receipt_digest !== receipt.receipt_digest
  ) {
    throw new ValidationError('Context task binding does not match its projection receipt');
  }
  return normalized;
}

export function verifyContextTaskBinding(binding, gridPublicKey, expected = {}) {
  const normalized = normalizeContextTaskBinding(binding);
  verifyContextProjectionReceipt(normalized.projection_receipt, gridPublicKey, expected);
  return normalized;
}

export function contextTaskBindingIdentity(binding) {
  const normalized = normalizeContextTaskBinding(binding);
  return {
    schema: CONTEXT_TASK_BINDING_SCHEMA,
    view_digest: normalized.view_digest,
    projection_digest: normalized.projection_digest,
    authority_digest: normalized.authority_digest,
    receipt_digest: normalized.receipt_digest
  };
}

function projectionAnchor(raw) {
  const value = assertPlainObject(raw, 'context projection');
  if (value.schema !== 'axiom-context-projection.v1' || value.authority_effect !== 'none') {
    throw new ValidationError('Context projection is not a non-authorizing v1 projection');
  }
  const request = assertPlainObject(value.request, 'context projection request');
  const auth = assertPlainObject(value.authorization, 'context projection authorization');
  const evidence = assertPlainObject(value.evidence, 'context projection evidence');
  const grid = assertPlainObject(evidence.grid_chain, 'context projection Grid chain');
  if (grid.valid !== true || grid.verification_mode !== 'full') {
    throw new ValidationError('Context projection requires full Grid-chain verification');
  }
  if (!Number.isSafeInteger(grid.last_seq) || grid.last_seq < 0) {
    throw new ValidationError('Context projection Grid sequence is invalid');
  }
  const principal = assertString(value.principal, 'context projection principal', { max: 160, pattern: PRINCIPAL });
  const purpose = assertString(value.purpose, 'context projection purpose', { max: 160, pattern: PURPOSE });
  const authorityDigest = digestField(request.authority_digest, 'context projection authority digest');
  if (auth.principal_id !== principal || auth.purpose !== purpose || auth.authority_digest !== authorityDigest) {
    throw new ValidationError('Context projection authorization identity is inconsistent');
  }
  const scopes = assertStringArray(auth.projected_context_scopes, 'context projection scopes', {
    maxItems: 64,
    itemMax: 160
  });
  if (
    new Set(scopes).size !== scopes.length
    || scopes.some((scope, index) => index > 0 && scopes[index - 1] >= scope)
    || scopes.some(scope => !SCOPE.test(scope))
  ) throw new ValidationError('Context projection scopes must be unique sorted context scopes');
  return {
    principal,
    purpose,
    owner: assertString(request.owner, 'context projection owner', { max: 160, pattern: PRINCIPAL }),
    as_of: timestamp(request.as_of, 'context projection as_of'),
    view_digest: digestField(value.view_digest, 'context projection view digest'),
    projection_digest: digestField(value.projection_digest, 'context projection projection digest'),
    authority_digest: authorityDigest,
    projected_context_scopes: [...scopes],
    grid: {
      last_seq: grid.last_seq,
      last_hash: digestField(grid.last_hash, 'context projection Grid last hash'),
      verification_mode: 'full'
    },
    ...(auth.machine_authority_digest !== undefined
      ? { machine_authority_digest: digestField(auth.machine_authority_digest, 'context projection machine authority digest') }
      : {})
  };
}

function normalizeStatement(raw) {
  const value = assertPlainObject(raw, 'context projection receipt statement');
  const machine = value.machine_authority_digest !== undefined;
  exactKeys(value, [
    'schema', 'principal', 'purpose', 'owner', 'as_of', 'view_digest',
    'projection_digest', 'authority_digest', 'projected_context_scopes',
    'grid', 'authority_effect', ...(machine ? ['machine_authority_digest'] : [])
  ], 'context projection receipt statement');
  if (
    value.schema !== CONTEXT_PROJECTION_RECEIPT_STATEMENT_SCHEMA
    || value.authority_effect !== 'none'
  ) throw new ValidationError('Context projection receipt statement is invalid');
  const scopes = assertStringArray(value.projected_context_scopes, 'context receipt scopes', {
    maxItems: 64,
    itemMax: 160
  });
  if (
    new Set(scopes).size !== scopes.length
    || scopes.some((scope, index) => index > 0 && scopes[index - 1] >= scope)
    || scopes.some(scope => !SCOPE.test(scope))
  ) throw new ValidationError('Context receipt scopes must be unique sorted context scopes');
  const grid = assertPlainObject(value.grid, 'context receipt Grid anchor');
  exactKeys(grid, ['last_seq', 'last_hash', 'verification_mode'], 'context receipt Grid anchor');
  if (!Number.isSafeInteger(grid.last_seq) || grid.last_seq < 0 || grid.verification_mode !== 'full') {
    throw new ValidationError('Context receipt Grid anchor is invalid');
  }
  return {
    schema: CONTEXT_PROJECTION_RECEIPT_STATEMENT_SCHEMA,
    principal: assertString(value.principal, 'context receipt principal', { max: 160, pattern: PRINCIPAL }),
    purpose: assertString(value.purpose, 'context receipt purpose', { max: 160, pattern: PURPOSE }),
    owner: assertString(value.owner, 'context receipt owner', { max: 160, pattern: PRINCIPAL }),
    as_of: timestamp(value.as_of, 'context receipt as_of'),
    view_digest: digestField(value.view_digest, 'context receipt view_digest'),
    projection_digest: digestField(value.projection_digest, 'context receipt projection_digest'),
    authority_digest: digestField(value.authority_digest, 'context receipt authority_digest'),
    projected_context_scopes: [...scopes],
    grid: {
      last_seq: grid.last_seq,
      last_hash: digestField(grid.last_hash, 'context receipt Grid last_hash'),
      verification_mode: 'full'
    },
    authority_effect: 'none',
    ...(machine
      ? { machine_authority_digest: digestField(value.machine_authority_digest, 'context receipt machine authority digest') }
      : {})
  };
}

function digestField(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function timestamp(value, label) {
  assertString(value, label, { max: 64 });
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new ValidationError(`${label} must be an ISO timestamp`);
  return new Date(parsed).toISOString();
}

function exactKeys(value, expected, label) {
  const actual = Object.keys(value).sort();
  const allowed = [...expected].sort();
  if (actual.length !== allowed.length || actual.some((key, index) => key !== allowed[index])) {
    throw new ValidationError(`${label} contains unsupported or missing fields`);
  }
}
