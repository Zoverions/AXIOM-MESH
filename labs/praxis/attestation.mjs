// labs/praxis/attestation.mjs
//
// Mesh attestation verification for the Praxis attestation gate (P0).
//
// A loop round emits attestations (`mesh-attestation.v0`): signed event
// attestations carrying checkable claim payloads, explicit non-claims, and a
// nullifier. Praxis verifies the attestation chain; irreversible gates open
// only on verification.
//
// This module is P0 / synthetic-host-only / production-unreachable. It adds
// NO language syntax and NO authority: it is a verifier factory and a
// host-side adapter consumed by the synthetic host's injected `verifiers`
// map and by `decideCharteredAuthority` evidence construction. All keys are
// explicitly injected; there is no ambient key material and no network.

import { createPublicKey } from 'node:crypto';

import { canonicalJsonPraxis, digestPraxis, immutablePraxisSnapshot } from './canonical.mjs';
import { signatureBodyDigest, signDigest, verifyDigestSignature } from './crypto.mjs';
import { PraxisRuntimeError } from './errors.mjs';
import { createHostObservation, verifyHostObservation } from './charter.mjs';

export const MESH_ATTESTATION_SCHEMA = 'mesh-attestation.v0';

// Attestation kinds the gate understands, mapped to the pinned chartered
// verifier name that carries each kind into a MergeGate-style policy.
// Unknown kinds are rejected: the gate cannot reason about evidence it has
// no policy premises for.
export const ATTESTATION_KIND_VERIFIERS = Object.freeze({
  'tests-reproduced': 'attestation:tests',
  'adversarial-review': 'attestation:review',
  'protected-ci': 'attestation:ci',
  'scope-honesty': 'attestation:scope'
});

const NULLIFIER_RE = /^sha256:[a-f0-9]{64}$/;

function attestationError(code, message) {
  return new PraxisRuntimeError(code, message);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// The signed body: every field except `signature`. Canonical JSON digest
// follows the repo's `sha256:<hex>` conventions.
export function attestationBody(attestation) {
  if (!isPlainObject(attestation)) {
    throw attestationError('PRAXIS_ATTESTATION_MALFORMED', 'attestation must be an object');
  }
  const {
    schema,
    attestor,
    subject,
    kind,
    claims,
    non_claims: nonClaims,
    nullifier,
    issued_at_ms: issuedAtMs,
    expires_at_ms: expiresAtMs,
    evidence_refs: evidenceRefs
  } = attestation;
  if (schema !== MESH_ATTESTATION_SCHEMA) {
    throw attestationError(
      'PRAXIS_ATTESTATION_MALFORMED',
      'attestation schema must be ' + MESH_ATTESTATION_SCHEMA
    );
  }
  if (typeof attestor !== 'string' || attestor.length === 0) {
    throw attestationError('PRAXIS_ATTESTATION_MALFORMED', 'attestation attestor is invalid');
  }
  if (typeof subject !== 'string' || subject.length === 0) {
    throw attestationError('PRAXIS_ATTESTATION_MALFORMED', 'attestation subject is invalid');
  }
  if (!Object.hasOwn(ATTESTATION_KIND_VERIFIERS, kind)) {
    throw attestationError(
      'PRAXIS_ATTESTATION_MALFORMED',
      'attestation kind ' + String(kind) + ' is not a known gate evidence kind'
    );
  }
  if (!isPlainObject(claims)) {
    throw attestationError('PRAXIS_ATTESTATION_MALFORMED', 'attestation claims must be an object');
  }
  // The B5 zero-claim pattern, enforced structurally: an attestation that
  // does not state what it does NOT claim is malformed.
  if (!Array.isArray(nonClaims) || nonClaims.length === 0 || !nonClaims.every(s => typeof s === 'string' && s.length > 0)) {
    throw attestationError(
      'PRAXIS_ATTESTATION_NON_CLAIMS',
      'attestation must carry a non-empty non_claims list stating what it does not claim'
    );
  }
  if (typeof nullifier !== 'string' || !NULLIFIER_RE.test(nullifier)) {
    throw attestationError('PRAXIS_ATTESTATION_MALFORMED', 'attestation nullifier is invalid');
  }
  if (!Number.isSafeInteger(issuedAtMs) || !Number.isSafeInteger(expiresAtMs) || !(expiresAtMs > issuedAtMs)) {
    throw attestationError('PRAXIS_ATTESTATION_MALFORMED', 'attestation validity window is invalid');
  }
  if (!Array.isArray(evidenceRefs) || !evidenceRefs.every(s => typeof s === 'string')) {
    throw attestationError('PRAXIS_ATTESTATION_MALFORMED', 'attestation evidence_refs must be string array');
  }
  return Object.freeze({
    schema,
    attestor,
    subject,
    kind,
    claims: immutablePraxisSnapshot(claims),
    non_claims: Object.freeze([...nonClaims]),
    nullifier,
    issued_at_ms: issuedAtMs,
    expires_at_ms: expiresAtMs,
    evidence_refs: Object.freeze([...evidenceRefs])
  });
}

export function attestationDigest(attestation) {
  return signatureBodyDigest(attestationBody(attestation));
}

// Synthetic helper: sign an attestation body with an attestor key.
// Production attestors would sign in their own custody; P0 tests use this.
export function signAttestation(
  { attestor, subject, kind, claims, nonClaims, nullifier, issuedAtMs, expiresAtMs, evidenceRefs = [] },
  privateKey
) {
  if (!privateKey) throw new TypeError('signAttestation requires a private key');
  const body = attestationBody({
    schema: MESH_ATTESTATION_SCHEMA,
    attestor,
    subject,
    kind,
    claims,
    non_claims: nonClaims,
    nullifier,
    issued_at_ms: issuedAtMs,
    expires_at_ms: expiresAtMs,
    evidence_refs: evidenceRefs,
    signature: 'placeholder'
  });
  const digest = signatureBodyDigest(body);
  return Object.freeze({ ...body, signature: signDigest(digest, privateKey) });
}

// Nullifier registry: spend-once semantics. The store is injectable so
// callers can persist spent digests (same discipline as caller-persisted
// nonces); the default is an in-memory Map for synthetic use.
export function createNullifierRegistry({ store } = {}) {
  const spent = store ?? new Map();
  if (typeof spent.has !== 'function' || typeof spent.set !== 'function') {
    throw new TypeError('nullifier registry store must expose has/set');
  }
  return Object.freeze({
    schema: 'praxis-nullifier-registry.v0',
    has(nullifier) {
      return spent.has(nullifier);
    },
    spend(nullifier, { spentAtMs = Date.now() } = {}) {
      if (spent.has(nullifier)) {
        throw attestationError(
          'PRAXIS_ATTESTATION_REPLAY',
          'attestation nullifier has already been spent: ' + nullifier
        );
      }
      spent.set(nullifier, spentAtMs);
      return true;
    }
  });
}

function normalizeTrustedKeys(trustedKeys) {
  if (!isPlainObject(trustedKeys)) {
    throw new TypeError('attestation verifier requires a trustedKeys map');
  }
  const out = {};
  for (const [id, key] of Object.entries(trustedKeys)) {
    if (['__proto__', 'constructor', 'prototype'].includes(id)) {
      throw new TypeError('attestation verifier key id is forbidden: ' + id);
    }
    try {
      out[id] = key?.type === 'public' ? key : createPublicKey(key);
    } catch {
      throw new TypeError('attestation verifier key for ' + id + ' is not a public key');
    }
  }
  return Object.freeze(out);
}

function coerceAttestation(value) {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      throw attestationError('PRAXIS_ATTESTATION_MALFORMED', 'attestation value is not valid JSON');
    }
  }
  if (isPlainObject(value)) return value;
  throw attestationError('PRAXIS_ATTESTATION_MALFORMED', 'attestation value must be a JSON string or object');
}

// Verify one attestation. Returns { attestation, evidence } on success and
// throws a specific PRAXIS_ATTESTATION_* error otherwise. The nullifier is
// spent exactly once, on success, before returning.
export function verifyAttestation(
  value,
  {
    trustedKeys,
    nullifiers,
    now = Date.now(),
    maxAgeMs = 15 * 60 * 1000,
    requiredNonClaims = []
  } = {}
) {
  const keys = normalizeTrustedKeys(trustedKeys);
  // Replay protection is host state: the nullifier is spent only when the
  // caller supplies a registry. The authority boundary (the coordinator that
  // converts verified attestations into chartered evidence) MUST supply one.
  // The in-language `verify` re-check is intentionally stateless: it
  // re-verifies authenticity, freshness, and non-claims without spending, so
  // a program can express what was checked while replay state stays with the
  // host that owns it.
  const checkReplay = nullifiers !== undefined && nullifiers !== null;
  if (checkReplay && typeof nullifiers.spend !== 'function') {
    throw new TypeError('verifyAttestation nullifier registry must expose spend');
  }
  const nowMs = typeof now === 'number' ? now : Date.parse(String(now));
  if (!Number.isFinite(nowMs)) throw new TypeError('attestation verification time is invalid');

  const raw = coerceAttestation(value);
  const body = attestationBody(raw);

  const publicKey = keys[body.attestor];
  if (!publicKey) {
    throw attestationError(
      'PRAXIS_ATTESTATION_UNKNOWN_ATTESTOR',
      'attestor ' + body.attestor + ' is not trusted by this verifier'
    );
  }
  const digest = signatureBodyDigest(body);
  if (typeof raw.signature !== 'string' || !verifyDigestSignature(digest, raw.signature, publicKey)) {
    throw attestationError('PRAXIS_ATTESTATION_SIGNATURE', 'attestation signature is invalid');
  }
  if (body.issued_at_ms > nowMs) {
    throw attestationError('PRAXIS_ATTESTATION_STALE', 'attestation is issued in the future');
  }
  if (nowMs - body.issued_at_ms > maxAgeMs) {
    throw attestationError('PRAXIS_ATTESTATION_STALE', 'attestation is older than the verifier max age');
  }
  if (nowMs >= body.expires_at_ms) {
    throw attestationError('PRAXIS_ATTESTATION_EXPIRED', 'attestation has expired');
  }
  const missing = requiredNonClaims.filter(claim => !body.non_claims.includes(claim));
  if (missing.length > 0) {
    throw attestationError(
      'PRAXIS_ATTESTATION_NON_CLAIMS',
      'attestation widens its claims: missing required non_claims: ' + missing.join(', ')
    );
  }

  if (checkReplay) {
    nullifiers.spend(body.nullifier, { spentAtMs: nowMs });
  }

  const evidence = Object.freeze({
    attestor: body.attestor,
    subject: body.subject,
    kind: body.kind,
    claims: body.claims,
    non_claims: body.non_claims,
    nullifier: body.nullifier,
    issued_at_ms: body.issued_at_ms,
    expires_at_ms: body.expires_at_ms,
    evidence_refs: body.evidence_refs
  });
  return Object.freeze({
    attestation: Object.freeze({ ...body, signature: raw.signature }),
    evidence,
    digest
  });
}

// Host-injectable verifier for `verify x = y with AttestationV0`.
// The interpreter requires an explicit { ok: true }; denials throw with
// specific codes so a gate program fails closed with reasons.
export function createAttestationVerifier(options) {
  return async input => {
    if (!input || (input.kind !== 'Observed' && input.kind !== 'Verified')) {
      throw attestationError(
        'PRAXIS_ATTESTATION_MALFORMED',
        'attestation verifier requires Observed or Verified input'
      );
    }
    const { evidence } = verifyAttestation(input.value, options);
    return { ok: true, evidence };
  };
}

// Digest over the sorted attestation digests: the exact evidence set the
// gate opens for. Used as the operation argument so the chartered permit is
// bound to exactly one evidence set (exact-plan binding).
export function attestationSetDigest(digests) {
  if (!Array.isArray(digests) || digests.length === 0) {
    throw new TypeError('attestationSetDigest requires a non-empty digest array');
  }
  const sorted = [...digests].map(String).sort();
  return 'sha256:' + digestPraxis({ schema: 'mesh-attestation-set.v0', digests: sorted });
}

// Host-side adapter: wrap an already-verified attestation as a chartered
// host observation under the pinned verifier name for its kind, so
// `decideCharteredAuthority` can evaluate gate policy premises over it.
// The attestation itself is NOT re-verified here: its nullifier was spent by
// the (in-program or host-side) verifyAttestation call that produced
// `verified`. Callers must pass the verifyAttestation result, not raw input.
export function attestationToHostObservation({
  verified,
  charter,
  trustedRootKeys,
  principal,
  privateKey,
  source = 'loop:attestation',
  issuedAt = Date.now(),
  now = Date.now()
} = {}) {
  if (!verified || !verified.evidence || !verified.digest) {
    throw new TypeError('attestationToHostObservation requires a verifyAttestation result');
  }
  const verifierName = ATTESTATION_KIND_VERIFIERS[verified.evidence.kind];
  if (!verifierName) {
    throw attestationError(
      'PRAXIS_ATTESTATION_MALFORMED',
      'no chartered verifier for attestation kind ' + verified.evidence.kind
    );
  }
  if (!principal || !privateKey) {
    throw new TypeError('attestationToHostObservation requires the host observation principal and key');
  }
  const observation = createHostObservation({
    source,
    value: {
      ...verified.evidence,
      attestation_digest: verified.digest
    },
    issuedAt,
    principal,
    privateKey
  });
  return verifyHostObservation({
    observation,
    verifierName,
    charter,
    trustedRootKeys,
    now
  });
}

// Debug helper: pretty-print an attestation without its signature.
export function describeAttestation(attestation) {
  const body = attestationBody(coerceAttestation(attestation));
  return (
    'mesh-attestation.v0 ' + body.kind + ' by ' + body.attestor +
    ' subject=' + body.subject + ' nullifier=' + body.nullifier.slice(0, 19) + '...'
  );
}

// Canonical JSON of a full attestation (body + signature), for embedding in
// `observe` string literals.
export function attestationJson(attestation) {
  const raw = coerceAttestation(attestation);
  const body = attestationBody(raw);
  return canonicalJsonPraxis({ ...body, signature: raw.signature });
}
