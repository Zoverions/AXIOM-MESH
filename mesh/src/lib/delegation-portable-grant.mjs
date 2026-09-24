import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject
} from './canonical.mjs';
import {
  normalizeDelegationAuthority,
  normalizeDelegationGrant,
  resolveDelegationChain
} from './delegation-graph.mjs';
import {
  delegationRootAttestationKeyId,
  verifyDelegationRootAttestation
} from './delegation-root-attestation.mjs';

// Historical, one-hop provenance only. No endpoint, grant activation, or
// assertion that the verifier has received every later revocation.
export const PORTABLE_DELEGATION_GRANT_SCHEMA = 'axiom-portable-delegation-grant.v1';
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const SIGNATURE = /^[A-Za-z0-9_-]+$/;
const STATEMENT_KEYS = [
  'audience_id',
  'authority_effect',
  'execution_authority_granted',
  'global_currentness_claimed',
  'grant_digest',
  'grant_id',
  'revocation_currentness_claimed',
  'root_attestation_digest',
  'root_authority_digest',
  'root_binding_digest',
  'signed_at',
  'signer_id',
  'signer_key_id'
];

function exact(value, keys, label) {
  const input = assertPlainObject(value, label);
  if (Object.keys(input).sort().join(',') !== [...keys].sort().join(',')) {
    throw new ValidationError(`${label} fields are invalid`);
  }
  return input;
}

function identifier(value, label) {
  return assertString(value, label, { min: 1, max: 160, pattern: ID });
}

function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function timestamp(value, label) {
  const input = assertString(value, label, { min: 24, max: 24 });
  const parsed = new Date(input);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== input) {
    throw new ValidationError(`${label} must be a canonical UTC timestamp`);
  }
  return input;
}

function publicKey(value) {
  let key;
  try { key = value?.type === 'public' ? value : createPublicKey(value); } catch { throw new ValidationError('portable grant trusted root key is invalid'); }
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new ValidationError('portable grant trusted root key must be Ed25519');
  }
  return key;
}

function privateKey(value) {
  let key;
  try { key = value?.type === 'private' ? value : createPrivateKey(value); } catch { throw new ValidationError('portable grant signer key is invalid'); }
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new ValidationError('portable grant signer key must be Ed25519');
  }
  return key;
}

function validatedRoot(rootAuthorityRaw, rootAttestationRaw, pinnedPublicKey, expectedBindingDigest) {
  const root = normalizeDelegationAuthority(rootAuthorityRaw);
  const attestation = verifyDelegationRootAttestation(rootAttestationRaw, {
    trusted_signer_public_key: pinnedPublicKey,
    expected_root_binding_digest: expectedBindingDigest,
    expected_root_authority_digest: root.authority_digest,
    expected_signer_id: root.holder
  });
  return { root, attestation };
}

function validateOneHop(root, grant, signedAt, now) {
  if (grant.parent_grant_id !== null) {
    throw new ValidationError('Portable delegation grant must be one-hop with no parent');
  }
  if (grant.delegator !== root.holder) {
    throw new ValidationError('Portable delegation grant delegator must be the pinned root holder');
  }
  if (signedAt < grant.issued_at || signedAt >= grant.authority.expires_at) {
    throw new ValidationError('Portable delegation grant signature must fall inside the grant lifetime');
  }
  return resolveDelegationChain({
    root_authority: root,
    grants: [grant],
    target_grant_id: grant.id,
    now
  });
}

export function createPortableDelegationGrant({
  root_authority,
  root_attestation,
  grant,
  signer_private_key,
  audience_id,
  signed_at
} = {}) {
  const signer = privateKey(signer_private_key);
  const signerPublicKey = createPublicKey(signer);
  const { root, attestation } = validatedRoot(
    root_authority,
    root_attestation,
    signerPublicKey,
    root_attestation?.statement?.root_binding_digest
  );
  const normalizedGrant = normalizeDelegationGrant(grant);
  const signedAt = timestamp(signed_at, 'portable delegation grant signed_at');
  if (attestation.statement.issued_at > signedAt) {
    throw new ValidationError('Portable delegation grant cannot predate its root attestation');
  }
  validateOneHop(root, normalizedGrant, signedAt, new Date(signedAt));
  const statement = {
    audience_id: identifier(audience_id, 'portable delegation audience_id'),
    authority_effect: 'none',
    execution_authority_granted: false,
    global_currentness_claimed: false,
    grant_digest: normalizedGrant.grant_digest,
    grant_id: normalizedGrant.id,
    revocation_currentness_claimed: false,
    root_attestation_digest: attestation.attestation_digest,
    root_authority_digest: root.authority_digest,
    root_binding_digest: attestation.statement.root_binding_digest,
    signed_at: signedAt,
    signer_id: root.holder,
    signer_key_id: delegationRootAttestationKeyId(signerPublicKey)
  };
  const core = {
    schema: PORTABLE_DELEGATION_GRANT_SCHEMA,
    statement,
    grant: normalizedGrant,
    statement_digest: digestObject(statement)
  };
  const signed = {
    ...core,
    signer_signature: sign(null, Buffer.from(canonicalJson(core)), signer).toString('base64url')
  };
  return { ...signed, proof_digest: digestObject(signed) };
}

export function verifyPortableDelegationGrant(raw, {
  root_authority,
  root_attestation,
  trusted_root_public_key,
  expected_root_binding_digest,
  expected_audience_id,
  now = new Date(),
  revocations = []
} = {}) {
  const pin = publicKey(trusted_root_public_key);
  const pinnedBinding = digest(expected_root_binding_digest, 'portable delegation expected_root_binding_digest');
  const expectedAudience = identifier(expected_audience_id, 'portable delegation expected_audience_id');
  const { root, attestation } = validatedRoot(root_authority, root_attestation, pin, pinnedBinding);
  const value = exact(raw, [
    'schema', 'statement', 'grant', 'statement_digest', 'signer_signature', 'proof_digest'
  ], 'portable delegation grant proof');
  if (value.schema !== PORTABLE_DELEGATION_GRANT_SCHEMA) {
    throw new ValidationError('Portable delegation grant schema is unsupported');
  }
  const statement = exact(value.statement, STATEMENT_KEYS, 'portable delegation grant statement');
  if (
    statement.authority_effect !== 'none'
    || statement.execution_authority_granted !== false
    || statement.global_currentness_claimed !== false
    || statement.revocation_currentness_claimed !== false
  ) {
    throw new ValidationError('Portable delegation grant cannot claim execution or global currentness');
  }
  const grant = normalizeDelegationGrant(value.grant);
  const signedAt = timestamp(statement.signed_at, 'portable delegation grant signed_at');
  const evaluationTime = now instanceof Date ? new Date(now.valueOf()) : new Date(now);
  if (Number.isNaN(evaluationTime.valueOf())) {
    throw new ValidationError('Portable delegation evaluation time is invalid');
  }
  if (signedAt > evaluationTime.toISOString() || attestation.statement.issued_at > signedAt) {
    throw new ValidationError('Portable delegation grant or root attestation is future-dated');
  }
  if (statement.audience_id !== expectedAudience) {
    throw new ValidationError('Portable delegation grant audience does not match pinned verifier');
  }
  if (
    statement.signer_id !== root.holder
    || statement.signer_key_id !== delegationRootAttestationKeyId(pin)
    || statement.root_attestation_digest !== attestation.attestation_digest
    || statement.root_binding_digest !== pinnedBinding
    || statement.root_authority_digest !== root.authority_digest
    || statement.grant_digest !== grant.grant_digest
    || statement.grant_id !== grant.id
  ) {
    throw new ValidationError('Portable delegation grant binding does not match pinned root or grant');
  }
  const statementDigest = digest(value.statement_digest, 'portable delegation statement_digest');
  if (statementDigest !== digestObject(statement)) {
    throw new ValidationError('Portable delegation grant statement digest is invalid');
  }
  const signature = assertString(value.signer_signature, 'portable delegation signer_signature', {
    min: 86, max: 86, pattern: SIGNATURE
  });
  const decoded = Buffer.from(signature, 'base64url');
  if (decoded.length !== 64 || decoded.toString('base64url') !== signature) {
    throw new ValidationError('Portable delegation grant signature encoding is invalid');
  }
  const core = {
    schema: PORTABLE_DELEGATION_GRANT_SCHEMA,
    statement,
    grant,
    statement_digest: statementDigest
  };
  if (!verify(null, Buffer.from(canonicalJson(core)), pin, decoded)) {
    throw new ValidationError('Portable delegation grant signature is invalid');
  }
  const signed = { ...core, signer_signature: signature };
  if (digest(value.proof_digest, 'portable delegation proof_digest') !== digestObject(signed)) {
    throw new ValidationError('Portable delegation grant proof digest is invalid');
  }
  const chain = resolveDelegationChain({
    root_authority: root,
    grants: [grant],
    revocations,
    target_grant_id: grant.id,
    now: evaluationTime
  });
  validateOneHop(root, grant, signedAt, new Date(signedAt));
  return {
    valid: true,
    grant,
    chain_resolution: chain,
    root_binding_digest: pinnedBinding,
    audience_id: expectedAudience,
    authority_effect: 'none',
    execution_authority_granted: false,
    global_currentness_claimed: false,
    revocation_currentness_claimed: false,
    revocation_evidence_basis: 'caller-supplied-only'
  };
}
