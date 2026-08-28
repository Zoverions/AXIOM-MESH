import {
  createPrivateKey,
  createPublicKey,
  sign as signBytes,
  verify as verifyBytes
} from 'node:crypto';

import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject,
  sha256
} from './canonical.mjs';
import { DELEGATION_ROOT_BINDING_SCHEMA } from './delegation-ledger.mjs';
import {
  delegationRootAttestationKeyId,
  verifyDelegationRootAttestation
} from './delegation-root-attestation.mjs';

export const DELEGATION_ROOT_ATTESTATION_KEY_CREDENTIAL_SCHEMA =
  'axiom-delegation-root-attestation-key-credential.v1';
export const DELEGATION_ROOT_ATTESTATION_KEY_REVOCATION_SCHEMA =
  'axiom-delegation-root-attestation-key-revocation.v1';

const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const ATTESTATION_SCOPE = 'delegation-root-binding';
const CREDENTIAL_EFFECT = 'authorize-evidence-signing-only';
const REVOCATION_EFFECT = 'revoke-evidence-signing-key';
const MAX_PATH_LENGTH = 128;
const ROOT_BINDING_KEYS = Object.freeze([
  'schema',
  'root_holder',
  'root_authority_digest',
  'execution_authority_granted',
  'authority_effect',
  'binding_digest'
]);
const CREDENTIAL_STATEMENT_KEYS = Object.freeze([
  'root_binding_digest',
  'root_authority_digest',
  'root_holder',
  'controller_key_id',
  'operational_key_id',
  'operational_public_key',
  'key_epoch',
  'activated_at',
  'transition_kind',
  'predecessor_credential_digest',
  'predecessor_disposition',
  'attestation_scope',
  'attestation_effect',
  'authority_effect',
  'delegation_effect',
  'execution_authority_granted',
  'capability_promotion_effect',
  'global_currentness_claimed',
  'network_effect'
]);
const CREDENTIAL_KEYS = Object.freeze([
  'schema',
  'statement',
  'statement_digest',
  'controller_signature',
  'credential_digest'
]);
const REVOCATION_STATEMENT_KEYS = Object.freeze([
  'root_binding_digest',
  'root_authority_digest',
  'root_holder',
  'controller_key_id',
  'credential_digest',
  'operational_key_id',
  'key_epoch',
  'effective_at',
  'reason_code',
  'attestation_scope',
  'attestation_effect',
  'authority_effect',
  'delegation_effect',
  'execution_authority_granted',
  'capability_promotion_effect',
  'global_currentness_claimed',
  'network_effect'
]);
const REVOCATION_KEYS = Object.freeze([
  'schema',
  'statement',
  'statement_digest',
  'controller_signature',
  'revocation_digest'
]);
const REASON_CODES = new Set(['compromised', 'revoked', 'administrative']);

export function delegationRootAttestationOperationalKeyId(publicKey) {
  return delegationRootAttestationKeyId(publicKey);
}

export function createDelegationRootAttestationKeyCredential({
  rootBinding,
  controllerPrivateKey,
  operationalPublicKey,
  keyEpoch,
  activatedAt,
  transitionKind,
  predecessorCredential,
  predecessorDisposition
} = {}) {
  const binding = normalizeRootBinding(rootBinding);
  const controllerPrivate = parsePrivateKey(
    controllerPrivateKey,
    'delegation root attestation controller private key'
  );
  const controllerPublic = createPublicKey(controllerPrivate);
  const controllerKeyId = keyId(controllerPublic);
  const operationalPublic = parsePublicKey(
    operationalPublicKey,
    'delegation root attestation operational public key'
  );
  const operationalPublicPem = canonicalPublicKeyPem(operationalPublic);
  const operationalKeyId = delegationRootAttestationOperationalKeyId(operationalPublic);
  const epoch = assertPositiveInteger(keyEpoch, 'delegation root attestation key epoch');
  const activated = canonicalTimestamp(
    activatedAt,
    'delegation root attestation key activated_at'
  );

  let kind;
  let predecessorDigest = null;
  let disposition = null;

  if (epoch === 1) {
    if (
      predecessorCredential !== undefined
      || transitionKind !== undefined
      || predecessorDisposition !== undefined
    ) {
      throw new ValidationError(
        'Delegation root attestation key epoch 1 must be initial without a predecessor'
      );
    }
    kind = 'initial';
  } else {
    if (predecessorCredential === undefined) {
      throw new ValidationError(
        'Delegation root attestation successor credential requires predecessor credential'
      );
    }
    kind = normalizeTransitionKind(transitionKind);
    disposition = normalizePredecessorDisposition(predecessorDisposition);
    const predecessor = verifyDelegationRootAttestationKeyCredential(predecessorCredential, {
      trustedControllerPublicKey: controllerPublic,
      expectedRootBindingDigest: binding.binding_digest,
      expectedRootAuthorityDigest: binding.root_authority_digest,
      expectedRootHolder: binding.root_holder
    });
    if (epoch !== predecessor.statement.key_epoch + 1) {
      throw new ValidationError(
        'Delegation root attestation key epoch must advance by one'
      );
    }
    if (Date.parse(activated) <= Date.parse(predecessor.statement.activated_at)) {
      throw new ValidationError(
        'Delegation root attestation key activation must advance chronologically'
      );
    }
    if (operationalKeyId === predecessor.statement.operational_key_id) {
      throw new ValidationError(
        'Delegation root attestation rotation reuses operational key; successor must change operational key'
      );
    }
    if (kind === 'rotation' && disposition !== 'retired') {
      throw new ValidationError(
        'Delegation root attestation rotation must retire the predecessor'
      );
    }
    if (
      kind === 'recovery'
      && disposition !== 'revoked'
      && disposition !== 'compromised'
    ) {
      throw new ValidationError(
        'Delegation root attestation recovery requires revoked or compromised predecessor'
      );
    }
    predecessorDigest = predecessor.credential_digest;
  }

  const statement = {
    root_binding_digest: binding.binding_digest,
    root_authority_digest: binding.root_authority_digest,
    root_holder: binding.root_holder,
    controller_key_id: controllerKeyId,
    operational_key_id: operationalKeyId,
    operational_public_key: operationalPublicPem,
    key_epoch: epoch,
    activated_at: activated,
    transition_kind: kind,
    predecessor_credential_digest: predecessorDigest,
    predecessor_disposition: disposition,
    attestation_scope: ATTESTATION_SCOPE,
    attestation_effect: CREDENTIAL_EFFECT,
    authority_effect: 'none',
    delegation_effect: 'none',
    execution_authority_granted: false,
    capability_promotion_effect: 'none',
    global_currentness_claimed: false,
    network_effect: 'none'
  };
  return signCredential(statement, controllerPrivate);
}

export function verifyDelegationRootAttestationKeyCredential(credential, {
  trustedControllerPublicKey,
  expectedRootBindingDigest,
  expectedRootAuthorityDigest,
  expectedRootHolder
} = {}) {
  const normalized = normalizeCredential(credential);
  const trustedController = parsePublicKey(
    trustedControllerPublicKey,
    'delegation root attestation trusted controller public key'
  );
  const trustedControllerKeyId = keyId(trustedController);
  if (trustedControllerKeyId !== normalized.statement.controller_key_id) {
    throw new ValidationError(
      'Delegation root attestation controller key substitution detected'
    );
  }
  const signedPayload = {
    schema: normalized.schema,
    statement: normalized.statement,
    statement_digest: normalized.statement_digest
  };
  if (!verifyBytes(
    null,
    Buffer.from(canonicalJson(signedPayload), 'utf8'),
    trustedController,
    decodeCanonicalSignature(normalized.controller_signature)
  )) {
    throw new ValidationError('Delegation root attestation key credential signature is invalid');
  }
  assertExpectedRoot(normalized.statement, {
    expectedRootBindingDigest,
    expectedRootAuthorityDigest,
    expectedRootHolder
  });
  const core = {
    ...signedPayload,
    controller_signature: normalized.controller_signature
  };
  if (normalized.credential_digest !== digestObject(core)) {
    throw new ValidationError('Delegation root attestation key credential digest mismatch');
  }
  return normalized;
}

export function validateDelegationRootAttestationKeyCredentialTransition(
  previousCredential,
  currentCredential,
  { trustedControllerPublicKey } = {}
) {
  const previous = verifyDelegationRootAttestationKeyCredential(previousCredential, {
    trustedControllerPublicKey
  });
  const current = verifyDelegationRootAttestationKeyCredential(currentCredential, {
    trustedControllerPublicKey,
    expectedRootBindingDigest: previous.statement.root_binding_digest,
    expectedRootAuthorityDigest: previous.statement.root_authority_digest,
    expectedRootHolder: previous.statement.root_holder
  });
  if (current.statement.controller_key_id !== previous.statement.controller_key_id) {
    throw new ValidationError('Delegation root attestation controller key changed within lifecycle');
  }
  if (current.statement.key_epoch !== previous.statement.key_epoch + 1) {
    throw new ValidationError('Delegation root attestation key epoch must advance by one');
  }
  if (current.statement.predecessor_credential_digest !== previous.credential_digest) {
    throw new ValidationError('Delegation root attestation predecessor credential digest mismatch');
  }
  if (Date.parse(current.statement.activated_at) <= Date.parse(previous.statement.activated_at)) {
    throw new ValidationError('Delegation root attestation key activation must advance chronologically');
  }
  if (current.statement.operational_key_id === previous.statement.operational_key_id) {
    throw new ValidationError('Delegation root attestation successor reuses operational key');
  }
  if (
    current.statement.transition_kind === 'rotation'
    && current.statement.predecessor_disposition !== 'retired'
  ) {
    throw new ValidationError('Delegation root attestation rotation must retire predecessor');
  }
  if (
    current.statement.transition_kind === 'recovery'
    && current.statement.predecessor_disposition !== 'revoked'
    && current.statement.predecessor_disposition !== 'compromised'
  ) {
    throw new ValidationError(
      'Delegation root attestation recovery requires revoked or compromised predecessor'
    );
  }
  return {
    valid: true,
    previous_epoch: previous.statement.key_epoch,
    current_epoch: current.statement.key_epoch,
    transition_kind: current.statement.transition_kind,
    predecessor_disposition: current.statement.predecessor_disposition,
    authority_effect: 'none',
    execution_authority_granted: false
  };
}

export function validateDelegationRootAttestationKeyCredentialPath(credentials, {
  trustedControllerPublicKey,
  expectedRootBindingDigest,
  expectedRootAuthorityDigest,
  expectedRootHolder
} = {}) {
  if (!Array.isArray(credentials) || credentials.length < 1) {
    throw new ValidationError('Delegation root attestation credential path must be non-empty');
  }
  if (credentials.length > MAX_PATH_LENGTH) {
    throw new ValidationError('Delegation root attestation credential path exceeds supported bound');
  }
  const normalized = credentials.map(credential =>
    verifyDelegationRootAttestationKeyCredential(credential, {
      trustedControllerPublicKey,
      expectedRootBindingDigest,
      expectedRootAuthorityDigest,
      expectedRootHolder
    })
  );
  const first = normalized[0];
  if (
    first.statement.key_epoch !== 1
    || first.statement.transition_kind !== 'initial'
    || first.statement.predecessor_credential_digest !== null
  ) {
    throw new ValidationError(
      'Delegation root attestation credential path must begin at epoch 1; truncated history is not accepted'
    );
  }
  const seenOperationalKeys = new Set([first.statement.operational_key_id]);
  for (let index = 1; index < normalized.length; index += 1) {
    const previous = normalized[index - 1];
    const current = normalized[index];
    validateDelegationRootAttestationKeyCredentialTransition(previous, current, {
      trustedControllerPublicKey
    });
    if (seenOperationalKeys.has(current.statement.operational_key_id)) {
      throw new ValidationError(
        'Delegation root attestation credential path reuses an operational key'
      );
    }
    seenOperationalKeys.add(current.statement.operational_key_id);
  }
  return {
    valid: true,
    root_binding_digest: first.statement.root_binding_digest,
    root_authority_digest: first.statement.root_authority_digest,
    root_holder: first.statement.root_holder,
    controller_key_id: first.statement.controller_key_id,
    first_epoch: 1,
    last_epoch: normalized.at(-1).statement.key_epoch,
    credential_count: normalized.length,
    authority_effect: 'none',
    execution_authority_granted: false
  };
}

export function createDelegationRootAttestationKeyRevocation(credential, {
  trustedControllerPublicKey,
  controllerPrivateKey,
  effectiveAt,
  reasonCode
} = {}) {
  const target = verifyDelegationRootAttestationKeyCredential(credential, {
    trustedControllerPublicKey
  });
  const controllerPrivate = parsePrivateKey(
    controllerPrivateKey,
    'delegation root attestation controller private key'
  );
  const controllerPublic = createPublicKey(controllerPrivate);
  if (keyId(controllerPublic) !== target.statement.controller_key_id) {
    throw new ValidationError('Delegation root attestation revocation controller key mismatch');
  }
  const effective = canonicalTimestamp(
    effectiveAt,
    'delegation root attestation key revocation effective_at'
  );
  if (Date.parse(effective) < Date.parse(target.statement.activated_at)) {
    throw new ValidationError(
      'Delegation root attestation key revocation cannot predate credential activation'
    );
  }
  const reason = normalizeReasonCode(reasonCode);
  const statement = {
    root_binding_digest: target.statement.root_binding_digest,
    root_authority_digest: target.statement.root_authority_digest,
    root_holder: target.statement.root_holder,
    controller_key_id: target.statement.controller_key_id,
    credential_digest: target.credential_digest,
    operational_key_id: target.statement.operational_key_id,
    key_epoch: target.statement.key_epoch,
    effective_at: effective,
    reason_code: reason,
    attestation_scope: ATTESTATION_SCOPE,
    attestation_effect: REVOCATION_EFFECT,
    authority_effect: 'none',
    delegation_effect: 'none',
    execution_authority_granted: false,
    capability_promotion_effect: 'none',
    global_currentness_claimed: false,
    network_effect: 'none'
  };
  return signRevocation(statement, controllerPrivate);
}

export function verifyDelegationRootAttestationKeyRevocation(revocation, {
  trustedControllerPublicKey,
  credential
} = {}) {
  const normalized = normalizeRevocation(revocation);
  const trustedController = parsePublicKey(
    trustedControllerPublicKey,
    'delegation root attestation trusted controller public key'
  );
  if (keyId(trustedController) !== normalized.statement.controller_key_id) {
    throw new ValidationError('Delegation root attestation revocation controller key substitution detected');
  }
  const signedPayload = {
    schema: normalized.schema,
    statement: normalized.statement,
    statement_digest: normalized.statement_digest
  };
  if (!verifyBytes(
    null,
    Buffer.from(canonicalJson(signedPayload), 'utf8'),
    trustedController,
    decodeCanonicalSignature(normalized.controller_signature)
  )) {
    throw new ValidationError('Delegation root attestation key revocation signature is invalid');
  }
  const core = { ...signedPayload, controller_signature: normalized.controller_signature };
  if (normalized.revocation_digest !== digestObject(core)) {
    throw new ValidationError('Delegation root attestation key revocation digest mismatch');
  }
  if (credential !== undefined) {
    const target = verifyDelegationRootAttestationKeyCredential(credential, {
      trustedControllerPublicKey,
      expectedRootBindingDigest: normalized.statement.root_binding_digest,
      expectedRootAuthorityDigest: normalized.statement.root_authority_digest,
      expectedRootHolder: normalized.statement.root_holder
    });
    if (
      normalized.statement.credential_digest !== target.credential_digest
      || normalized.statement.operational_key_id !== target.statement.operational_key_id
      || normalized.statement.key_epoch !== target.statement.key_epoch
    ) {
      throw new ValidationError('Delegation root attestation key revocation target mismatch');
    }
    if (Date.parse(normalized.statement.effective_at) < Date.parse(target.statement.activated_at)) {
      throw new ValidationError('Delegation root attestation key revocation cannot predate credential activation');
    }
  }
  return normalized;
}

export function assertDelegationRootAttestationKeyUsableAt(credential, {
  trustedControllerPublicKey,
  at,
  successorCredential,
  revocation
} = {}) {
  const target = verifyDelegationRootAttestationKeyCredential(credential, {
    trustedControllerPublicKey
  });
  const instant = canonicalTimestamp(at, 'delegation root attestation key use time');
  if (Date.parse(instant) < Date.parse(target.statement.activated_at)) {
    throw new ValidationError('Delegation root attestation key was not active at requested time');
  }
  if (successorCredential !== undefined) {
    const successor = verifyDelegationRootAttestationKeyCredential(successorCredential, {
      trustedControllerPublicKey,
      expectedRootBindingDigest: target.statement.root_binding_digest,
      expectedRootAuthorityDigest: target.statement.root_authority_digest,
      expectedRootHolder: target.statement.root_holder
    });
    validateDelegationRootAttestationKeyCredentialTransition(target, successor, {
      trustedControllerPublicKey
    });
    if (Date.parse(instant) >= Date.parse(successor.statement.activated_at)) {
      throw new ValidationError(
        'Delegation root attestation key is stale after successor activation'
      );
    }
  }
  if (revocation !== undefined) {
    const verifiedRevocation = verifyDelegationRootAttestationKeyRevocation(revocation, {
      trustedControllerPublicKey,
      credential: target
    });
    if (Date.parse(instant) >= Date.parse(verifiedRevocation.statement.effective_at)) {
      throw new ValidationError('Delegation root attestation key is revoked at requested time');
    }
  }
  return {
    valid: true,
    operational_key_id: target.statement.operational_key_id,
    key_epoch: target.statement.key_epoch,
    at: instant,
    authority_effect: 'none',
    execution_authority_granted: false,
    wall_clock_time_proved: false,
    globally_current_key_state_claimed: false
  };
}

export function verifyDelegationRootAttestationWithKeyLifecycle(attestation, {
  trustedControllerPublicKey,
  credentials,
  revocations = [],
  expectedRootBindingDigest,
  expectedRootAuthorityDigest,
  expectedRootHolder
} = {}) {
  const path = validateDelegationRootAttestationKeyCredentialPath(credentials, {
    trustedControllerPublicKey,
    expectedRootBindingDigest,
    expectedRootAuthorityDigest,
    expectedRootHolder
  });
  const normalizedCredentials = credentials.map(credential =>
    verifyDelegationRootAttestationKeyCredential(credential, {
      trustedControllerPublicKey,
      expectedRootBindingDigest: path.root_binding_digest,
      expectedRootAuthorityDigest: path.root_authority_digest,
      expectedRootHolder: path.root_holder
    })
  );
  assertPlainObject(attestation, 'delegation root attestation');
  const signerKeyId = assertDigest(
    attestation?.statement?.signer_key_id,
    'delegation root attestation signer_key_id'
  );
  const signerCredentialIndex = normalizedCredentials.findIndex(
    credential => credential.statement.operational_key_id === signerKeyId
  );
  if (signerCredentialIndex < 0) {
    throw new ValidationError(
      'Delegation root attestation signer key is absent from supplied credential lifecycle'
    );
  }
  const signerCredential = normalizedCredentials[signerCredentialIndex];
  const successor = normalizedCredentials[signerCredentialIndex + 1];
  const matchingRevocations = normalizeMatchingRevocations(
    revocations,
    signerCredential,
    trustedControllerPublicKey
  );
  const issuedAt = canonicalTimestamp(
    attestation?.statement?.issued_at,
    'delegation root attestation issued_at'
  );
  assertDelegationRootAttestationKeyUsableAt(signerCredential, {
    trustedControllerPublicKey,
    at: issuedAt,
    successorCredential: successor,
    revocation: matchingRevocations[0]
  });
  const verifiedAttestation = verifyDelegationRootAttestation(attestation, {
    trusted_signer_public_key: signerCredential.statement.operational_public_key,
    expected_root_binding_digest: path.root_binding_digest,
    expected_root_authority_digest: path.root_authority_digest,
    expected_signer_id: path.root_holder
  });
  return {
    verified: true,
    attestation_digest: verifiedAttestation.attestation_digest,
    root_binding_digest: path.root_binding_digest,
    root_authority_digest: path.root_authority_digest,
    root_holder: path.root_holder,
    signer_key_id: signerCredential.statement.operational_key_id,
    signer_key_epoch: signerCredential.statement.key_epoch,
    signer_credential_digest: signerCredential.credential_digest,
    issued_at: issuedAt,
    execution_authority_granted: false,
    authority_effect: 'none',
    delegation_effect: 'none',
    capability_promotion_effect: 'none',
    network_effect: 'none',
    wall_clock_signing_time_proved: false,
    globally_current_key_state_claimed: false
  };
}

function signCredential(statement, controllerPrivate) {
  const statementDigest = digestObject(statement);
  const signedPayload = {
    schema: DELEGATION_ROOT_ATTESTATION_KEY_CREDENTIAL_SCHEMA,
    statement,
    statement_digest: statementDigest
  };
  const controllerSignature = signBytes(
    null,
    Buffer.from(canonicalJson(signedPayload), 'utf8'),
    controllerPrivate
  ).toString('base64url');
  const core = { ...signedPayload, controller_signature: controllerSignature };
  return { ...core, credential_digest: digestObject(core) };
}

function signRevocation(statement, controllerPrivate) {
  const statementDigest = digestObject(statement);
  const signedPayload = {
    schema: DELEGATION_ROOT_ATTESTATION_KEY_REVOCATION_SCHEMA,
    statement,
    statement_digest: statementDigest
  };
  const controllerSignature = signBytes(
    null,
    Buffer.from(canonicalJson(signedPayload), 'utf8'),
    controllerPrivate
  ).toString('base64url');
  const core = { ...signedPayload, controller_signature: controllerSignature };
  return { ...core, revocation_digest: digestObject(core) };
}

function normalizeCredential(raw) {
  assertPlainObject(raw, 'delegation root attestation key credential');
  assertExactKeys(raw, 'delegation root attestation key credential', CREDENTIAL_KEYS);
  if (raw.schema !== DELEGATION_ROOT_ATTESTATION_KEY_CREDENTIAL_SCHEMA) {
    throw new ValidationError('Delegation root attestation key credential schema is invalid');
  }
  const statement = normalizeCredentialStatement(raw.statement);
  const statementDigest = assertDigest(
    raw.statement_digest,
    'delegation root attestation key credential statement_digest'
  );
  if (statementDigest !== digestObject(statement)) {
    throw new ValidationError('Delegation root attestation key credential statement digest mismatch');
  }
  const controllerSignature = assertString(
    raw.controller_signature,
    'delegation root attestation key credential controller_signature',
    { max: 512, pattern: BASE64URL_PATTERN }
  );
  decodeCanonicalSignature(controllerSignature);
  const credentialDigest = assertDigest(
    raw.credential_digest,
    'delegation root attestation key credential credential_digest'
  );
  return {
    schema: DELEGATION_ROOT_ATTESTATION_KEY_CREDENTIAL_SCHEMA,
    statement,
    statement_digest: statementDigest,
    controller_signature: controllerSignature,
    credential_digest: credentialDigest
  };
}

function normalizeCredentialStatement(raw) {
  assertPlainObject(raw, 'delegation root attestation key credential statement');
  assertExactKeys(
    raw,
    'delegation root attestation key credential statement',
    CREDENTIAL_STATEMENT_KEYS
  );
  const rootBindingDigest = assertDigest(raw.root_binding_digest, 'root binding digest');
  const rootAuthorityDigest = assertDigest(raw.root_authority_digest, 'root authority digest');
  const rootHolder = assertIdentifier(raw.root_holder, 'root holder');
  const controllerKeyId = assertDigest(raw.controller_key_id, 'controller key id');
  const operationalPublic = parsePublicKey(
    raw.operational_public_key,
    'delegation root attestation operational public key'
  );
  const operationalPublicPem = canonicalPublicKeyPem(operationalPublic);
  if (raw.operational_public_key !== operationalPublicPem) {
    throw new ValidationError('Delegation root attestation operational public key must be canonical');
  }
  const operationalKeyId = assertDigest(raw.operational_key_id, 'operational key id');
  if (operationalKeyId !== delegationRootAttestationOperationalKeyId(operationalPublic)) {
    throw new ValidationError('Delegation root attestation operational key id mismatch');
  }
  const keyEpoch = assertPositiveInteger(raw.key_epoch, 'delegation root attestation key epoch');
  const activatedAt = canonicalTimestamp(raw.activated_at, 'delegation root attestation key activated_at');
  const transitionKind = raw.transition_kind;
  let predecessorDigest = raw.predecessor_credential_digest;
  let predecessorDisposition = raw.predecessor_disposition;
  if (keyEpoch === 1) {
    if (
      transitionKind !== 'initial'
      || predecessorDigest !== null
      || predecessorDisposition !== null
    ) {
      throw new ValidationError('Delegation root attestation genesis credential is invalid');
    }
  } else {
    if (transitionKind !== 'rotation' && transitionKind !== 'recovery') {
      throw new ValidationError('Delegation root attestation successor transition kind is invalid');
    }
    predecessorDigest = assertDigest(predecessorDigest, 'predecessor credential digest');
    predecessorDisposition = normalizePredecessorDisposition(predecessorDisposition);
    if (transitionKind === 'rotation' && predecessorDisposition !== 'retired') {
      throw new ValidationError('Delegation root attestation rotation must retire predecessor');
    }
    if (
      transitionKind === 'recovery'
      && predecessorDisposition !== 'revoked'
      && predecessorDisposition !== 'compromised'
    ) {
      throw new ValidationError('Delegation root attestation recovery requires revoked or compromised predecessor');
    }
  }
  assertNonAuthorityBoundary(raw, CREDENTIAL_EFFECT);
  return {
    root_binding_digest: rootBindingDigest,
    root_authority_digest: rootAuthorityDigest,
    root_holder: rootHolder,
    controller_key_id: controllerKeyId,
    operational_key_id: operationalKeyId,
    operational_public_key: operationalPublicPem,
    key_epoch: keyEpoch,
    activated_at: activatedAt,
    transition_kind: transitionKind,
    predecessor_credential_digest: predecessorDigest,
    predecessor_disposition: predecessorDisposition,
    attestation_scope: ATTESTATION_SCOPE,
    attestation_effect: CREDENTIAL_EFFECT,
    authority_effect: 'none',
    delegation_effect: 'none',
    execution_authority_granted: false,
    capability_promotion_effect: 'none',
    global_currentness_claimed: false,
    network_effect: 'none'
  };
}

function normalizeRevocation(raw) {
  assertPlainObject(raw, 'delegation root attestation key revocation');
  assertExactKeys(raw, 'delegation root attestation key revocation', REVOCATION_KEYS);
  if (raw.schema !== DELEGATION_ROOT_ATTESTATION_KEY_REVOCATION_SCHEMA) {
    throw new ValidationError('Delegation root attestation key revocation schema is invalid');
  }
  const statement = normalizeRevocationStatement(raw.statement);
  const statementDigest = assertDigest(raw.statement_digest, 'revocation statement digest');
  if (statementDigest !== digestObject(statement)) {
    throw new ValidationError('Delegation root attestation key revocation statement digest mismatch');
  }
  const controllerSignature = assertString(
    raw.controller_signature,
    'delegation root attestation key revocation controller_signature',
    { max: 512, pattern: BASE64URL_PATTERN }
  );
  decodeCanonicalSignature(controllerSignature);
  const revocationDigest = assertDigest(raw.revocation_digest, 'revocation digest');
  return {
    schema: DELEGATION_ROOT_ATTESTATION_KEY_REVOCATION_SCHEMA,
    statement,
    statement_digest: statementDigest,
    controller_signature: controllerSignature,
    revocation_digest: revocationDigest
  };
}

function normalizeRevocationStatement(raw) {
  assertPlainObject(raw, 'delegation root attestation key revocation statement');
  assertExactKeys(raw, 'delegation root attestation key revocation statement', REVOCATION_STATEMENT_KEYS);
  const statement = {
    root_binding_digest: assertDigest(raw.root_binding_digest, 'root binding digest'),
    root_authority_digest: assertDigest(raw.root_authority_digest, 'root authority digest'),
    root_holder: assertIdentifier(raw.root_holder, 'root holder'),
    controller_key_id: assertDigest(raw.controller_key_id, 'controller key id'),
    credential_digest: assertDigest(raw.credential_digest, 'credential digest'),
    operational_key_id: assertDigest(raw.operational_key_id, 'operational key id'),
    key_epoch: assertPositiveInteger(raw.key_epoch, 'delegation root attestation key epoch'),
    effective_at: canonicalTimestamp(raw.effective_at, 'delegation root attestation key revocation effective_at'),
    reason_code: normalizeReasonCode(raw.reason_code),
    attestation_scope: ATTESTATION_SCOPE,
    attestation_effect: REVOCATION_EFFECT,
    authority_effect: 'none',
    delegation_effect: 'none',
    execution_authority_granted: false,
    capability_promotion_effect: 'none',
    global_currentness_claimed: false,
    network_effect: 'none'
  };
  assertNonAuthorityBoundary(raw, REVOCATION_EFFECT);
  return statement;
}

function normalizeRootBinding(raw) {
  assertPlainObject(raw, 'delegation root binding');
  assertExactKeys(raw, 'delegation root binding', ROOT_BINDING_KEYS);
  if (raw.schema !== DELEGATION_ROOT_BINDING_SCHEMA) {
    throw new ValidationError('Delegation root binding schema is invalid');
  }
  const rootHolder = assertIdentifier(raw.root_holder, 'delegation root binding root_holder');
  const rootAuthorityDigest = assertDigest(raw.root_authority_digest, 'delegation root binding root_authority_digest');
  if (raw.execution_authority_granted !== false || raw.authority_effect !== 'none') {
    throw new ValidationError('Delegation root binding widens its non-authority boundary');
  }
  const bindingDigest = assertDigest(raw.binding_digest, 'delegation root binding binding_digest');
  const core = {
    schema: DELEGATION_ROOT_BINDING_SCHEMA,
    root_holder: rootHolder,
    root_authority_digest: rootAuthorityDigest,
    execution_authority_granted: false,
    authority_effect: 'none'
  };
  if (bindingDigest !== digestObject(core)) {
    throw new ValidationError('Delegation root binding digest mismatch');
  }
  return { ...core, binding_digest: bindingDigest };
}

function normalizeMatchingRevocations(revocations, credential, trustedControllerPublicKey) {
  if (!Array.isArray(revocations)) {
    throw new ValidationError('Delegation root attestation key revocations must be an array');
  }
  const matches = [];
  for (const revocation of revocations) {
    const verified = verifyDelegationRootAttestationKeyRevocation(revocation, {
      trustedControllerPublicKey
    });
    if (verified.statement.credential_digest === credential.credential_digest) {
      matches.push(verifyDelegationRootAttestationKeyRevocation(verified, {
        trustedControllerPublicKey,
        credential
      }));
    }
  }
  if (matches.length > 1) {
    const digests = new Set(matches.map(item => item.revocation_digest));
    if (digests.size > 1) {
      throw new ValidationError('Conflicting delegation root attestation key revocations');
    }
    throw new ValidationError('Duplicate delegation root attestation key revocation');
  }
  return matches;
}

function assertExpectedRoot(statement, {
  expectedRootBindingDigest,
  expectedRootAuthorityDigest,
  expectedRootHolder
}) {
  if (expectedRootBindingDigest !== undefined) {
    const expected = assertDigest(expectedRootBindingDigest, 'expected root binding digest');
    if (statement.root_binding_digest !== expected) {
      throw new ValidationError('Delegation root attestation credential belongs to a different root binding; root binding mismatch');
    }
  }
  if (expectedRootAuthorityDigest !== undefined) {
    const expected = assertDigest(expectedRootAuthorityDigest, 'expected root authority digest');
    if (statement.root_authority_digest !== expected) {
      throw new ValidationError('Delegation root attestation root authority digest mismatch');
    }
  }
  if (expectedRootHolder !== undefined) {
    const expected = assertIdentifier(expectedRootHolder, 'expected root holder');
    if (statement.root_holder !== expected) {
      throw new ValidationError('Delegation root attestation root holder mismatch');
    }
  }
}

function assertNonAuthorityBoundary(raw, effect) {
  if (
    raw.attestation_scope !== ATTESTATION_SCOPE
    || raw.attestation_effect !== effect
    || raw.authority_effect !== 'none'
    || raw.delegation_effect !== 'none'
    || raw.execution_authority_granted !== false
    || raw.capability_promotion_effect !== 'none'
    || raw.global_currentness_claimed !== false
    || raw.network_effect !== 'none'
  ) {
    throw new ValidationError('Delegation root attestation key lifecycle widens its evidence-only non-authority boundary');
  }
}

function normalizeTransitionKind(value) {
  if (value !== 'rotation' && value !== 'recovery') {
    throw new ValidationError('Delegation root attestation transition_kind must be rotation or recovery');
  }
  return value;
}

function normalizePredecessorDisposition(value) {
  if (value !== 'retired' && value !== 'revoked' && value !== 'compromised') {
    throw new ValidationError('Delegation root attestation predecessor disposition is invalid');
  }
  return value;
}

function normalizeReasonCode(value) {
  const reason = assertString(value, 'delegation root attestation key revocation reason_code', { max: 64 });
  if (!REASON_CODES.has(reason)) {
    throw new ValidationError('Delegation root attestation key revocation reason_code is invalid');
  }
  return reason;
}

function parsePrivateKey(value, name) {
  try {
    const key = value?.type === 'private' ? value : createPrivateKey(value);
    if (key.type !== 'private' || key.asymmetricKeyType !== 'ed25519') {
      throw new ValidationError(`${name} must be an Ed25519 private key`);
    }
    return key;
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError(`${name} is invalid`);
  }
}

function parsePublicKey(value, name) {
  try {
    const key = value?.type === 'public' ? value : createPublicKey(value);
    if (key.type !== 'public' || key.asymmetricKeyType !== 'ed25519') {
      throw new ValidationError(`${name} must be an Ed25519 public key`);
    }
    return key;
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError(`${name} is invalid`);
  }
}

function canonicalPublicKeyPem(value) {
  const key = parsePublicKey(value, 'delegation root attestation public key');
  return key.export({ type: 'spki', format: 'pem' }).toString().trim();
}

function keyId(value) {
  return sha256(canonicalPublicKeyPem(value));
}

function decodeCanonicalSignature(value) {
  if (typeof value !== 'string' || !BASE64URL_PATTERN.test(value)) {
    throw new ValidationError('Delegation root attestation lifecycle signature is invalid');
  }
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.length !== 64 || decoded.toString('base64url') !== value) {
    throw new ValidationError('Delegation root attestation lifecycle signature is invalid');
  }
  return decoded;
}

function assertIdentifier(value, name) {
  return assertString(value, name, { min: 1, max: 160 });
}

function assertDigest(value, name) {
  return assertString(value, name, { min: 64, max: 64, pattern: DIGEST_PATTERN });
}

function assertPositiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new ValidationError(`${name} must be a positive safe integer`);
  }
  return value;
}

function canonicalTimestamp(value, name) {
  const text = assertString(value, name, { max: 64 });
  const time = Date.parse(text);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== text) {
    throw new ValidationError(`${name} must be a canonical ISO-8601 timestamp`);
  }
  return text;
}

function assertExactKeys(value, name, keys) {
  const expected = [...keys].sort();
  const actual = Object.keys(value).sort();
  if (
    expected.length !== actual.length
    || expected.some((key, index) => key !== actual[index])
  ) {
    throw new ValidationError(`${name} contains unsupported or missing fields`);
  }
}
