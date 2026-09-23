import {
  createPrivateKey,
  createPublicKey,
  randomBytes,
  sign,
  verify
} from 'node:crypto';
import { readFileSync } from 'node:fs';

import {
  AxiomError,
  ValidationError,
  canonicalJson,
  digestObject,
  sha256
} from '../lib/canonical.mjs';
import { verifyObjectSignature } from '../lib/identity.mjs';
import { normalizeCircleLifecycleHeadSnapshot } from './circle-admission-lifecycle-guards.mjs';
import {
  deriveCircleMembershipCredentialState,
  validateCircleMembershipCredentialLifecycle
} from '../../../packages/axiom-circle-membership-credential-lifecycle/index.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const B64URL = /^[A-Za-z0-9_-]+$/;
const CHALLENGE_KEYS = Object.freeze([
  'schema', 'challenge_id', 'circle_id', 'membership_id', 'principal_id', 'credential_id',
  'request_digest', 'lifecycle_head_digest', 'credential_lifecycle_digest', 'challenge_nonce',
  'issued_at', 'expires_at', 'credential_possession_granted_authority', 'authority_effect', 'network_effect'
]);
const CHALLENGE_ENVELOPE_KEYS = Object.freeze(['schema', 'statement', 'signature']);
const RESPONSE_KEYS = Object.freeze([
  'schema', 'challenge_digest', 'credential_id', 'public_key_spki_der_base64url', 'signature_base64url'
]);
const RESPONSE_STATEMENT_KEYS = Object.freeze(['schema', 'challenge_digest']);
const ATTESTATION_KEYS = Object.freeze([
  'schema', 'challenge_digest', 'circle_id', 'membership_id', 'principal_id', 'credential_id',
  'request_digest', 'lifecycle_head_digest', 'credential_lifecycle_digest',
  'public_key_fingerprint', 'public_key_fingerprint_scheme', 'observed_at',
  'credential_possession_verified', 'human_identity_verified', 'legal_identity_verified',
  'role_authority_granted', 'runtime_authority', 'portable_authority',
  'external_effect_authority', 'authority_effect', 'network_effect'
]);
const ATTESTATION_ENVELOPE_KEYS = Object.freeze(['schema', 'statement', 'signature']);

const EXPECTED_REQUIREMENTS = Object.freeze({
  hypervisor_signed_challenge_required: true,
  challenge_random_nonce_required: true,
  challenge_exact_request_digest_bound: true,
  challenge_exact_lifecycle_head_bound: true,
  challenge_exact_credential_lifecycle_digest_bound: true,
  response_exact_challenge_digest_bound: true,
  response_public_key_spki_der_required: true,
  response_ed25519_signature_required: true,
  public_key_fingerprint_must_match_lifecycle_credential: true,
  credential_must_be_authentication_eligible_at_observation: true,
  hypervisor_observation_must_be_inside_challenge_window: true,
  attestation_exact_request_digest_bound: true,
  attestation_exact_lifecycle_head_bound: true,
  attestation_exact_credential_bound: true,
  attestation_exact_public_key_fingerprint_bound: true,
  attestation_is_possession_evidence_only: true,
  human_identity_proved: false,
  legal_identity_proved: false,
  role_authority_granted: false,
  runtime_authority: false,
  portable_authority: false,
  external_effect_authority: false,
  challenge_single_use_persisted: false,
  public_grid_route: false,
  gateway_route: false,
  hypervisor_runtime_route: false
});

const EXPECTED_NON_CLAIMS = new Set([
  'human-identity',
  'legal-identity',
  'credential-issuance-authority',
  'membership-authority',
  'role-authority',
  'governance-legitimacy',
  'trusted-global-time',
  'historical-possession-before-hypervisor-observation',
  'challenge-single-use-persistence',
  'runtime-authorization',
  'portable-authority',
  'external-effect-authority',
  'distributed-consensus'
]);

const policyUrl = new URL('../../config/circle-credential-possession-attestation.v0.json', import.meta.url);
const POLICY = deepFreeze(JSON.parse(readFileSync(policyUrl, 'utf8')));
validateCircleCredentialPossessionAttestationPolicy(POLICY);

export function getCircleCredentialPossessionAttestationPolicy() {
  return POLICY;
}

export function validateCircleCredentialPossessionAttestationPolicy(policy) {
  exactObject(policy, 'Circle credential possession policy', [
    'schema', 'version', 'status', 'runtime_activation', 'authority_effect', 'network_effect',
    'issuer_service', 'credential_algorithm', 'public_key_fingerprint_scheme',
    'absolute_challenge_ttl_seconds', 'requirements', 'schemas', 'non_claims'
  ]);
  if (
    policy.schema !== 'axiom-circle-credential-possession-attestation-policy.v0'
    || policy.version !== 0
    || policy.status !== 'inert-hypervisor-observed-possession-contract'
    || policy.runtime_activation !== false
    || policy.authority_effect !== 'none'
    || policy.network_effect !== 'none'
    || policy.issuer_service !== 'hypervisor'
    || policy.credential_algorithm !== 'Ed25519'
    || policy.public_key_fingerprint_scheme !== 'sha256-spki-der'
    || policy.absolute_challenge_ttl_seconds !== 60
  ) throw new ValidationError('Circle credential possession activation boundary is invalid');
  exactObject(policy.requirements, 'Circle credential possession requirements', Object.keys(EXPECTED_REQUIREMENTS));
  for (const [key, expected] of Object.entries(EXPECTED_REQUIREMENTS)) {
    if (policy.requirements[key] !== expected) {
      throw new ValidationError(`Circle credential possession requirement ${key} was weakened`);
    }
  }
  exactObject(policy.schemas, 'Circle credential possession schemas', [
    'challenge_statement', 'challenge_envelope', 'response', 'response_statement',
    'attestation_statement', 'attestation_envelope'
  ]);
  const expectedSchemas = {
    challenge_statement: 'axiom-circle-credential-possession-challenge.v0',
    challenge_envelope: 'axiom-circle-credential-possession-challenge-envelope.v0',
    response: 'axiom-circle-credential-possession-response.v0',
    response_statement: 'axiom-circle-credential-possession-response-statement.v0',
    attestation_statement: 'axiom-circle-credential-possession-attestation.v0',
    attestation_envelope: 'axiom-circle-credential-possession-attestation-envelope.v0'
  };
  for (const [key, expected] of Object.entries(expectedSchemas)) {
    if (policy.schemas[key] !== expected) throw new ValidationError(`Circle credential possession schema ${key} drifted`);
  }
  exactSet(policy.non_claims, EXPECTED_NON_CLAIMS, 'Circle credential possession non-claims');
  return true;
}

export function circleCredentialPublicKeyFingerprint(publicKeyInput) {
  const publicKey = importEd25519PublicKey(publicKeyInput);
  const der = publicKey.export({ type: 'spki', format: 'der' });
  return sha256(der);
}

export function createCircleCredentialPossessionChallenge(identity, {
  circleId,
  membershipId,
  principalId,
  credentialId,
  requestDigest,
  lifecycleHead,
  nowSeconds = Math.floor(Date.now() / 1000),
  ttlSeconds = 20
}) {
  validateCircleCredentialPossessionAttestationPolicy(POLICY);
  if (!identity || identity.service !== POLICY.issuer_service || typeof identity.signObject !== 'function') {
    throw new ValidationError('Circle credential possession challenge requires Hypervisor identity');
  }
  validateChallengeLifetime(nowSeconds, ttlSeconds);
  const head = normalizeCircleLifecycleHeadSnapshot(lifecycleHead);
  const circle = requiredId(circleId, 'Circle credential possession circle_id');
  const membership = requiredId(membershipId, 'Circle credential possession membership_id');
  const principal = requiredId(principalId, 'Circle credential possession principal_id');
  const credential = requiredId(credentialId, 'Circle credential possession credential_id');
  if (
    head.circle_id !== circle
    || head.membership_id !== membership
    || head.principal_id !== principal
  ) throw new ValidationError('Circle credential possession challenge identity does not match lifecycle head');

  const nonce = randomBytes(24).toString('base64url');
  const issuedAt = new Date(nowSeconds * 1000).toISOString();
  const expiresAt = new Date((nowSeconds + ttlSeconds) * 1000).toISOString();
  const statement = deepFreeze({
    schema: POLICY.schemas.challenge_statement,
    challenge_id: `circle_possession_${sha256(nonce)}`,
    circle_id: circle,
    membership_id: membership,
    principal_id: principal,
    credential_id: credential,
    request_digest: requiredDigest(requestDigest, 'Circle credential possession request digest'),
    lifecycle_head_digest: head.lifecycle_head_digest,
    credential_lifecycle_digest: head.credential_lifecycle_digest,
    challenge_nonce: nonce,
    issued_at: issuedAt,
    expires_at: expiresAt,
    credential_possession_granted_authority: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
  return deepFreeze({
    schema: POLICY.schemas.challenge_envelope,
    statement,
    signature: identity.signObject(statement)
  });
}

export function verifyCircleCredentialPossessionChallenge(challengeInput, hypervisorPublicKey, {
  nowSeconds = Math.floor(Date.now() / 1000),
  maxTtlSeconds = 20
} = {}) {
  if (!hypervisorPublicKey) throw new ValidationError('Trusted Hypervisor public key is required for possession challenge verification');
  if (!Number.isSafeInteger(nowSeconds)) throw new ValidationError('Circle possession challenge verification time is invalid');
  if (!Number.isSafeInteger(maxTtlSeconds) || maxTtlSeconds < 1 || maxTtlSeconds > POLICY.absolute_challenge_ttl_seconds) {
    throw new ValidationError('Circle possession challenge local TTL ceiling is invalid');
  }
  exactObject(challengeInput, 'Circle possession challenge envelope', CHALLENGE_ENVELOPE_KEYS);
  if (challengeInput.schema !== POLICY.schemas.challenge_envelope) {
    throw new ValidationError('Circle possession challenge envelope schema is invalid');
  }
  const statement = normalizeChallengeStatement(challengeInput.statement);
  if (!verifyObjectSignature(statement, challengeInput.signature, hypervisorPublicKey)) {
    throw new AxiomError('invalid_circle_possession_challenge', 'Circle credential possession challenge signature is invalid', 401);
  }
  const issuedSeconds = Math.floor(Date.parse(statement.issued_at) / 1000);
  const expiresSeconds = Math.floor(Date.parse(statement.expires_at) / 1000);
  if (
    expiresSeconds <= issuedSeconds
    || expiresSeconds - issuedSeconds > maxTtlSeconds
    || issuedSeconds > nowSeconds
    || expiresSeconds <= nowSeconds
  ) {
    throw new AxiomError('expired_circle_possession_challenge', 'Circle credential possession challenge is outside its active window', 401);
  }
  return deepFreeze({
    challenge: {
      schema: challengeInput.schema,
      statement,
      signature: structuredClone(challengeInput.signature)
    },
    challenge_digest: digestObject(statement)
  });
}

export function signCircleCredentialPossessionChallenge(challengeInput, privateKeyInput, publicKeyInput, {
  hypervisorPublicKey,
  nowSeconds = Math.floor(Date.now() / 1000),
  maxTtlSeconds = 20
} = {}) {
  const verifiedChallenge = verifyCircleCredentialPossessionChallenge(challengeInput, hypervisorPublicKey, {
    nowSeconds,
    maxTtlSeconds
  });
  const privateKey = importEd25519PrivateKey(privateKeyInput);
  const publicKey = importEd25519PublicKey(publicKeyInput);
  if (!privateKeyMatchesPublicKey(privateKey, publicKey)) {
    throw new ValidationError('Circle credential possession private/public key pair does not match');
  }
  const proofStatement = {
    schema: POLICY.schemas.response_statement,
    challenge_digest: verifiedChallenge.challenge_digest
  };
  const signature = sign(null, Buffer.from(canonicalJson(proofStatement)), privateKey).toString('base64url');
  const publicDer = publicKey.export({ type: 'spki', format: 'der' });
  return deepFreeze({
    schema: POLICY.schemas.response,
    challenge_digest: verifiedChallenge.challenge_digest,
    credential_id: verifiedChallenge.challenge.statement.credential_id,
    public_key_spki_der_base64url: Buffer.from(publicDer).toString('base64url'),
    signature_base64url: signature
  });
}

export function verifyCircleCredentialPossessionResponse({
  challenge,
  response,
  hypervisorPublicKey,
  credentialPolicy,
  circlePackage,
  credentialLifecycle,
  lifecycleHead,
  nowSeconds = Math.floor(Date.now() / 1000),
  maxTtlSeconds = 20
}) {
  const verifiedChallenge = verifyCircleCredentialPossessionChallenge(challenge, hypervisorPublicKey, {
    nowSeconds,
    maxTtlSeconds
  });
  const statement = verifiedChallenge.challenge.statement;
  const head = normalizeCircleLifecycleHeadSnapshot(lifecycleHead);
  if (
    head.circle_id !== statement.circle_id
    || head.membership_id !== statement.membership_id
    || head.principal_id !== statement.principal_id
    || head.lifecycle_head_digest !== statement.lifecycle_head_digest
    || head.credential_lifecycle_digest !== statement.credential_lifecycle_digest
    || digestObject(credentialLifecycle) !== statement.credential_lifecycle_digest
  ) {
    throw new AxiomError(
      'circle_possession_lifecycle_mismatch',
      'Circle credential possession challenge no longer matches the supplied lifecycle state',
      409
    );
  }
  validateCircleMembershipCredentialLifecycle(
    credentialPolicy,
    circlePackage,
    credentialLifecycle,
    { now: new Date(nowSeconds * 1000) }
  );

  exactObject(response, 'Circle credential possession response', RESPONSE_KEYS);
  if (
    response.schema !== POLICY.schemas.response
    || response.challenge_digest !== verifiedChallenge.challenge_digest
    || response.credential_id !== statement.credential_id
    || typeof response.public_key_spki_der_base64url !== 'string'
    || response.public_key_spki_der_base64url.length < 40
    || response.public_key_spki_der_base64url.length > 1024
    || !B64URL.test(response.public_key_spki_der_base64url)
    || typeof response.signature_base64url !== 'string'
    || response.signature_base64url.length < 40
    || response.signature_base64url.length > 1024
    || !B64URL.test(response.signature_base64url)
  ) throw new ValidationError('Circle credential possession response boundary is invalid');

  const lifecycleCredential = credentialLifecycle.credentials.find(item => item.credential_id === statement.credential_id);
  if (!lifecycleCredential) throw new ValidationError('Circle credential possession target credential is absent from lifecycle');
  if (
    lifecycleCredential.circle_id !== statement.circle_id
    || lifecycleCredential.membership_id !== statement.membership_id
    || lifecycleCredential.principal_id !== statement.principal_id
    || lifecycleCredential.algorithm !== POLICY.credential_algorithm
  ) throw new ValidationError('Circle credential possession target credential identity is invalid');

  let publicDer;
  let publicKey;
  try {
    publicDer = Buffer.from(response.public_key_spki_der_base64url, 'base64url');
    publicKey = createPublicKey({ key: publicDer, type: 'spki', format: 'der' });
  } catch {
    throw new ValidationError('Circle credential possession public key is invalid SPKI DER');
  }
  assertEd25519Key(publicKey, 'Circle credential possession public key');
  const fingerprint = sha256(publicDer);
  if (fingerprint !== lifecycleCredential.public_key_fingerprint) {
    throw new AxiomError(
      'circle_possession_key_fingerprint_mismatch',
      'Circle credential possession public key fingerprint does not match lifecycle credential',
      403
    );
  }

  const proofStatement = {
    schema: POLICY.schemas.response_statement,
    challenge_digest: verifiedChallenge.challenge_digest
  };
  let signatureBytes;
  try {
    signatureBytes = Buffer.from(response.signature_base64url, 'base64url');
  } catch {
    throw new ValidationError('Circle credential possession signature encoding is invalid');
  }
  if (!verify(null, Buffer.from(canonicalJson(proofStatement)), publicKey, signatureBytes)) {
    throw new AxiomError('invalid_circle_possession_signature', 'Circle credential possession signature is invalid', 401);
  }

  const state = deriveCircleMembershipCredentialState(
    credentialPolicy,
    circlePackage,
    credentialLifecycle,
    {
      asOf: statement.issued_at,
      now: new Date(nowSeconds * 1000)
    }
  );
  const credentialState = state.credentials.find(item => item.credential_id === statement.credential_id);
  if (!credentialState || credentialState.authentication_eligible !== true) {
    throw new AxiomError(
      'circle_credential_not_authentication_eligible',
      'Circle credential was not authentication-eligible when the Hypervisor challenge was issued',
      403
    );
  }

  return deepFreeze({
    valid: true,
    challenge_digest: verifiedChallenge.challenge_digest,
    circle_id: statement.circle_id,
    membership_id: statement.membership_id,
    principal_id: statement.principal_id,
    credential_id: statement.credential_id,
    request_digest: statement.request_digest,
    lifecycle_head_digest: statement.lifecycle_head_digest,
    credential_lifecycle_digest: statement.credential_lifecycle_digest,
    public_key_fingerprint: fingerprint,
    public_key_fingerprint_scheme: POLICY.public_key_fingerprint_scheme,
    observed_at: new Date(nowSeconds * 1000).toISOString(),
    credential_possession_verified: true,
    human_identity_verified: false,
    legal_identity_verified: false,
    role_authority_granted: false,
    runtime_authority: false,
    portable_authority: false,
    external_effect_authority: false
  });
}

export function attestCircleCredentialPossession(identity, input) {
  if (!identity || identity.service !== POLICY.issuer_service || typeof identity.signObject !== 'function') {
    throw new ValidationError('Circle credential possession attestation requires Hypervisor identity');
  }
  const verified = verifyCircleCredentialPossessionResponse(input);
  const statement = deepFreeze({
    schema: POLICY.schemas.attestation_statement,
    challenge_digest: verified.challenge_digest,
    circle_id: verified.circle_id,
    membership_id: verified.membership_id,
    principal_id: verified.principal_id,
    credential_id: verified.credential_id,
    request_digest: verified.request_digest,
    lifecycle_head_digest: verified.lifecycle_head_digest,
    credential_lifecycle_digest: verified.credential_lifecycle_digest,
    public_key_fingerprint: verified.public_key_fingerprint,
    public_key_fingerprint_scheme: verified.public_key_fingerprint_scheme,
    observed_at: verified.observed_at,
    credential_possession_verified: true,
    human_identity_verified: false,
    legal_identity_verified: false,
    role_authority_granted: false,
    runtime_authority: false,
    portable_authority: false,
    external_effect_authority: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
  return deepFreeze({
    schema: POLICY.schemas.attestation_envelope,
    statement,
    signature: identity.signObject(statement)
  });
}

export function verifyCircleCredentialPossessionAttestation(attestationInput, hypervisorPublicKey, {
  requestDigest,
  lifecycleHeadDigest,
  circleId,
  membershipId,
  principalId,
  credentialId,
  nowSeconds = Math.floor(Date.now() / 1000),
  maxAgeSeconds = 60
} = {}) {
  if (!hypervisorPublicKey) throw new ValidationError('Trusted Hypervisor public key is required for possession attestation verification');
  if (!Number.isSafeInteger(nowSeconds)) throw new ValidationError('Circle possession attestation verification time is invalid');
  if (!Number.isSafeInteger(maxAgeSeconds) || maxAgeSeconds < 1 || maxAgeSeconds > 3600) {
    throw new ValidationError('Circle possession attestation max age is invalid');
  }
  exactObject(attestationInput, 'Circle credential possession attestation envelope', ATTESTATION_ENVELOPE_KEYS);
  if (attestationInput.schema !== POLICY.schemas.attestation_envelope) {
    throw new ValidationError('Circle credential possession attestation envelope schema is invalid');
  }
  const statement = normalizeAttestationStatement(attestationInput.statement);
  if (!verifyObjectSignature(statement, attestationInput.signature, hypervisorPublicKey)) {
    throw new AxiomError('invalid_circle_possession_attestation', 'Circle credential possession attestation signature is invalid', 401);
  }
  if (
    statement.request_digest !== requiredDigest(requestDigest, 'Circle possession expected request digest')
    || statement.lifecycle_head_digest !== requiredDigest(lifecycleHeadDigest, 'Circle possession expected lifecycle head digest')
    || statement.circle_id !== requiredId(circleId, 'Circle possession expected circle_id')
    || statement.membership_id !== requiredId(membershipId, 'Circle possession expected membership_id')
    || statement.principal_id !== requiredId(principalId, 'Circle possession expected principal_id')
    || statement.credential_id !== requiredId(credentialId, 'Circle possession expected credential_id')
  ) {
    throw new AxiomError(
      'circle_possession_attestation_context_mismatch',
      'Circle credential possession attestation does not match the expected request and lifecycle context',
      403
    );
  }
  const observedSeconds = Math.floor(Date.parse(statement.observed_at) / 1000);
  if (observedSeconds > nowSeconds || nowSeconds - observedSeconds > maxAgeSeconds) {
    throw new AxiomError('stale_circle_possession_attestation', 'Circle credential possession attestation is too old', 401);
  }
  return deepFreeze({
    valid: true,
    statement,
    attestation_digest: digestObject(attestationInput),
    credential_possession_verified: true,
    human_identity_verified: false,
    legal_identity_verified: false,
    role_authority_granted: false,
    runtime_authority: false,
    portable_authority: false,
    external_effect_authority: false
  });
}

function normalizeChallengeStatement(value) {
  exactObject(value, 'Circle credential possession challenge statement', CHALLENGE_KEYS);
  if (
    value.schema !== POLICY.schemas.challenge_statement
    || !ID.test(value.challenge_id ?? '')
    || !ID.test(value.circle_id ?? '')
    || !ID.test(value.membership_id ?? '')
    || !ID.test(value.principal_id ?? '')
    || !ID.test(value.credential_id ?? '')
    || !DIGEST.test(value.request_digest ?? '')
    || !DIGEST.test(value.lifecycle_head_digest ?? '')
    || !DIGEST.test(value.credential_lifecycle_digest ?? '')
    || typeof value.challenge_nonce !== 'string'
    || value.challenge_nonce.length < 20
    || value.challenge_nonce.length > 128
    || !B64URL.test(value.challenge_nonce)
    || !canonicalTimestamp(value.issued_at)
    || !canonicalTimestamp(value.expires_at)
    || value.credential_possession_granted_authority !== false
    || value.authority_effect !== 'none'
    || value.network_effect !== 'none'
  ) throw new ValidationError('Circle credential possession challenge statement boundary is invalid');
  if (`circle_possession_${sha256(value.challenge_nonce)}` !== value.challenge_id) {
    throw new ValidationError('Circle credential possession challenge id is not bound to its nonce');
  }
  return deepFreeze(structuredClone(value));
}

function normalizeAttestationStatement(value) {
  exactObject(value, 'Circle credential possession attestation statement', ATTESTATION_KEYS);
  if (
    value.schema !== POLICY.schemas.attestation_statement
    || !DIGEST.test(value.challenge_digest ?? '')
    || !ID.test(value.circle_id ?? '')
    || !ID.test(value.membership_id ?? '')
    || !ID.test(value.principal_id ?? '')
    || !ID.test(value.credential_id ?? '')
    || !DIGEST.test(value.request_digest ?? '')
    || !DIGEST.test(value.lifecycle_head_digest ?? '')
    || !DIGEST.test(value.credential_lifecycle_digest ?? '')
    || !DIGEST.test(value.public_key_fingerprint ?? '')
    || value.public_key_fingerprint_scheme !== POLICY.public_key_fingerprint_scheme
    || !canonicalTimestamp(value.observed_at)
    || value.credential_possession_verified !== true
    || value.human_identity_verified !== false
    || value.legal_identity_verified !== false
    || value.role_authority_granted !== false
    || value.runtime_authority !== false
    || value.portable_authority !== false
    || value.external_effect_authority !== false
    || value.authority_effect !== 'none'
    || value.network_effect !== 'none'
  ) throw new ValidationError('Circle credential possession attestation statement boundary is invalid');
  return deepFreeze(structuredClone(value));
}

function importEd25519PublicKey(input) {
  let key;
  try {
    key = input?.type === 'public' ? input : createPublicKey(input);
  } catch {
    throw new ValidationError('Circle credential possession public key is invalid');
  }
  assertEd25519Key(key, 'Circle credential possession public key');
  return key;
}

function importEd25519PrivateKey(input) {
  let key;
  try {
    key = input?.type === 'private' ? input : createPrivateKey(input);
  } catch {
    throw new ValidationError('Circle credential possession private key is invalid');
  }
  assertEd25519Key(key, 'Circle credential possession private key');
  return key;
}

function assertEd25519Key(key, label) {
  if (!key || key.asymmetricKeyType !== 'ed25519') throw new ValidationError(`${label} must be Ed25519`);
}

function privateKeyMatchesPublicKey(privateKey, publicKey) {
  const derived = createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
  const supplied = publicKey.export({ type: 'spki', format: 'der' });
  return Buffer.from(derived).equals(Buffer.from(supplied));
}

function validateChallengeLifetime(nowSeconds, ttlSeconds) {
  if (
    !Number.isSafeInteger(nowSeconds)
    || !Number.isSafeInteger(ttlSeconds)
    || ttlSeconds < 1
    || ttlSeconds > POLICY.absolute_challenge_ttl_seconds
  ) throw new ValidationError('Circle credential possession challenge lifetime is invalid');
}

function requiredId(value, label) {
  if (typeof value !== 'string' || !ID.test(value)) throw new ValidationError(`${label} is invalid`);
  return value;
}

function requiredDigest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) throw new ValidationError(`${label} is invalid`);
  return value;
}

function canonicalTimestamp(value) {
  if (typeof value !== 'string') return false;
  const date = new Date(value);
  return !Number.isNaN(date.valueOf()) && date.toISOString() === value;
}

function exactSet(values, expected, label) {
  if (!Array.isArray(values)) throw new ValidationError(`${label} must be an array`);
  const actual = new Set(values);
  if (values.length !== expected.size || actual.size !== expected.size || [...expected].some(value => !actual.has(value))) {
    throw new ValidationError(`${label} inventory drifted`);
  }
}

function exactObject(value, label, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ValidationError(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new ValidationError(`${label} fields are invalid`);
  }
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
