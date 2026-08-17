import { createPublicKey } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';

import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject,
  sha256
} from './canonical.mjs';
import { PublicWitnessAuthenticatedIngress } from './public-witness-live-ingress.mjs';
import { validatePublicWitnessSourceAdmission } from './public-witness-transfer.mjs';

export const PUBLIC_WITNESS_INGRESS_TRUST_BUNDLE_SCHEMA = 'axiom-public-witness-ingress-trust-bundle.v1';
export const PUBLIC_WITNESS_INGRESS_TRUST_VERIFICATION_SCHEMA = 'axiom-public-witness-ingress-trust-verification.v1';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const MAX_GENERATION = Number.MAX_SAFE_INTEGER;
const DEFAULT_MAX_FILE_BYTES = 2 * 1024 * 1024;
const HARD_MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_SOURCES = 4096;
const MAX_ROOTS = 4096;

const BUNDLE_KEYS = new Set([
  'schema',
  'domain_id',
  'generation',
  'previous_bundle_digest',
  'activated_at',
  'sources',
  'persona_roots',
  'source_trust_input',
  'persona_root_trust_input',
  'remote_self_admission_allowed',
  'social_authority_effect',
  'finality_claimed',
  'authority_effect',
  'network_effect',
  'bundle_digest'
]);
const SOURCE_KEYS = new Set(['certificate_sha256', 'admission']);
const ROOT_KEYS = new Set(['key_id', 'public_key']);

function exactKeys(raw, allowed, label) {
  const value = assertPlainObject(raw, label);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${label} contains unsupported field ${key}`);
  }
  return value;
}

function identifier(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: IDENTIFIER });
}

function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function nullableDigest(value, label) {
  return value === null ? null : digest(value, label);
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_GENERATION) {
    throw new ValidationError(`${label} must be a positive safe integer`);
  }
  return value;
}

function boundedInteger(value, label, fallback, max) {
  const normalized = value === undefined ? fallback : value;
  if (!Number.isSafeInteger(normalized) || normalized < 1 || normalized > max) {
    throw new ValidationError(`${label} must be a positive safe integer no greater than ${max}`);
  }
  return normalized;
}

function canonicalTimestamp(value, label) {
  const text = assertString(value, label, { min: 24, max: 24 });
  const parsed = new Date(text);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== text) {
    throw new ValidationError(`${label} must be a canonical UTC ISO timestamp`);
  }
  return text;
}

function publicKeyPem(value, label) {
  let key;
  try {
    key = createPublicKey(value);
  } catch {
    throw new ValidationError(`${label} is invalid`);
  }
  if (key.asymmetricKeyType !== 'ed25519') throw new ValidationError(`${label} must be Ed25519`);
  return key.export({ type: 'spki', format: 'pem' }).toString();
}

function normalizeSource(raw, index, expectedDomainId) {
  const value = exactKeys(raw, SOURCE_KEYS, `public witness ingress trust source[${index}]`);
  const admission = validatePublicWitnessSourceAdmission(value.admission);
  if (admission.domain_id !== expectedDomainId) {
    throw new ValidationError('public witness ingress trust source admission belongs to a different domain');
  }
  return Object.freeze({
    certificate_sha256: digest(
      value.certificate_sha256,
      `public witness ingress trust source[${index}] certificate_sha256`
    ),
    admission
  });
}

function normalizeRoot(raw, index) {
  const value = exactKeys(raw, ROOT_KEYS, `public witness ingress trust persona root[${index}]`);
  const publicKey = publicKeyPem(value.public_key, `public witness ingress trust persona root[${index}] public_key`);
  const keyId = digest(value.key_id, `public witness ingress trust persona root[${index}] key_id`);
  if (sha256(publicKey) !== keyId) {
    throw new ValidationError('public witness ingress trust persona root key_id does not match public key');
  }
  return Object.freeze({ key_id: keyId, public_key: publicKey });
}

function normalizeSources(raw, domainId) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_SOURCES) {
    throw new ValidationError(`public witness ingress trust sources must contain 1-${MAX_SOURCES} entries`);
  }
  const values = raw.map((value, index) => normalizeSource(value, index, domainId));
  const certificates = new Set();
  const sourceIds = new Set();
  for (const value of values) {
    if (certificates.has(value.certificate_sha256)) {
      throw new ValidationError('public witness ingress trust certificate digest cannot authenticate multiple source entries');
    }
    certificates.add(value.certificate_sha256);
    if (sourceIds.has(value.admission.source_id)) {
      throw new ValidationError('public witness ingress trust bundle may contain only one active entry per source_id');
    }
    sourceIds.add(value.admission.source_id);
  }
  return Object.freeze([...values].sort((a, b) => a.admission.source_id.localeCompare(b.admission.source_id)));
}

function normalizeRoots(raw) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_ROOTS) {
    throw new ValidationError(`public witness ingress trust persona_roots must contain 1-${MAX_ROOTS} entries`);
  }
  const values = raw.map(normalizeRoot);
  const ids = new Set();
  for (const value of values) {
    if (ids.has(value.key_id)) throw new ValidationError('public witness ingress trust persona root is duplicated');
    ids.add(value.key_id);
  }
  return Object.freeze([...values].sort((a, b) => a.key_id.localeCompare(b.key_id)));
}

function normalizeBundleBody(raw) {
  const value = exactKeys(raw, BUNDLE_KEYS, 'public witness ingress trust bundle');
  const domainId = identifier(value.domain_id, 'public witness ingress trust domain_id');
  const generation = positiveInteger(value.generation, 'public witness ingress trust generation');
  const previousBundleDigest = nullableDigest(
    value.previous_bundle_digest,
    'public witness ingress trust previous_bundle_digest'
  );
  if ((generation === 1) !== (previousBundleDigest === null)) {
    throw new ValidationError('public witness ingress trust generation 1 requires null predecessor and later generations require one');
  }
  if (
    value.source_trust_input !== 'pre-admitted-w2c2-source'
    || value.persona_root_trust_input !== 'local-operator-config'
    || value.remote_self_admission_allowed !== false
    || value.social_authority_effect !== 'none'
    || value.finality_claimed !== false
    || value.authority_effect !== 'none'
    || value.network_effect !== 'none'
  ) {
    throw new ValidationError('public witness ingress trust bundle cannot expand remote, social, finality, authority, or network claims');
  }
  return Object.freeze({
    schema: PUBLIC_WITNESS_INGRESS_TRUST_BUNDLE_SCHEMA,
    domain_id: domainId,
    generation,
    previous_bundle_digest: previousBundleDigest,
    activated_at: canonicalTimestamp(value.activated_at, 'public witness ingress trust activated_at'),
    sources: normalizeSources(value.sources, domainId),
    persona_roots: normalizeRoots(value.persona_roots),
    source_trust_input: 'pre-admitted-w2c2-source',
    persona_root_trust_input: 'local-operator-config',
    remote_self_admission_allowed: false,
    social_authority_effect: 'none',
    finality_claimed: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
}

function withBundleDigest(body) {
  return Object.freeze({ ...body, bundle_digest: digestObject(body) });
}

export function validatePublicWitnessIngressTrustBundle(raw) {
  const value = exactKeys(raw, BUNDLE_KEYS, 'public witness ingress trust bundle');
  const body = normalizeBundleBody(value);
  const expected = digestObject(body);
  if (digest(value.bundle_digest, 'public witness ingress trust bundle_digest') !== expected) {
    throw new ValidationError('public witness ingress trust bundle digest mismatch');
  }
  return withBundleDigest(body);
}

export function createPublicWitnessIngressTrustBundle({
  domainId,
  generation = 1,
  previousBundle = null,
  activatedAt,
  sources,
  personaRoots
} = {}) {
  let previousDigest = null;
  if (previousBundle !== null) {
    previousDigest = validatePublicWitnessIngressTrustBundle(previousBundle).bundle_digest;
  }
  const bundle = withBundleDigest(normalizeBundleBody({
    schema: PUBLIC_WITNESS_INGRESS_TRUST_BUNDLE_SCHEMA,
    domain_id: domainId,
    generation,
    previous_bundle_digest: previousDigest,
    activated_at: activatedAt,
    sources,
    persona_roots: personaRoots,
    source_trust_input: 'pre-admitted-w2c2-source',
    persona_root_trust_input: 'local-operator-config',
    remote_self_admission_allowed: false,
    social_authority_effect: 'none',
    finality_claimed: false,
    authority_effect: 'none',
    network_effect: 'none',
    bundle_digest: '0'.repeat(64)
  }));
  if (previousBundle !== null) validatePublicWitnessIngressTrustTransition(previousBundle, bundle);
  return bundle;
}

export function validatePublicWitnessIngressTrustTransition(previousRaw, nextRaw) {
  const previous = validatePublicWitnessIngressTrustBundle(previousRaw);
  const next = validatePublicWitnessIngressTrustBundle(nextRaw);
  if (next.domain_id !== previous.domain_id) {
    throw new ValidationError('public witness ingress trust transition cannot change domain');
  }
  if (next.generation !== previous.generation + 1) {
    throw new ValidationError('public witness ingress trust transition must advance exactly one generation');
  }
  if (next.previous_bundle_digest !== previous.bundle_digest) {
    throw new ValidationError('public witness ingress trust transition predecessor does not match prior bundle');
  }
  if (next.activated_at <= previous.activated_at) {
    throw new ValidationError('public witness ingress trust transition activation time must advance');
  }
  const previousBySource = new Map(previous.sources.map(value => [value.admission.source_id, value]));
  for (const source of next.sources) {
    const prior = previousBySource.get(source.admission.source_id);
    if (!prior) continue;
    if (source.admission.source_epoch < prior.admission.source_epoch) {
      throw new ValidationError('public witness ingress trust transition cannot roll a source epoch backward');
    }
    if (source.admission.source_epoch === prior.admission.source_epoch) {
      if (source.admission.admission_digest !== prior.admission.admission_digest) {
        throw new ValidationError('public witness ingress trust transition cannot replace a source admission within one epoch');
      }
      continue;
    }
    if (source.admission.source_epoch !== prior.admission.source_epoch + 1) {
      throw new ValidationError('public witness ingress trust source admission rotation must advance exactly one epoch');
    }
  }
  return next;
}

async function ensureRegularBoundedFile(path, maxBytes) {
  const normalizedPath = assertString(path, 'public witness ingress trust file path', { min: 1, max: 4096 });
  let info;
  try {
    info = await lstat(normalizedPath);
  } catch {
    throw new ValidationError('public witness ingress trust file is not readable');
  }
  if (info.isSymbolicLink() || !info.isFile()) {
    throw new ValidationError('public witness ingress trust file must be a regular non-symlink file');
  }
  if (info.size < 2 || info.size > maxBytes) {
    throw new ValidationError('public witness ingress trust file exceeds configured bounds');
  }
  return normalizedPath;
}

export async function loadPublicWitnessIngressTrustBundle(path, { maxFileBytes } = {}) {
  const maxBytes = boundedInteger(
    maxFileBytes,
    'public witness ingress trust maxFileBytes',
    DEFAULT_MAX_FILE_BYTES,
    HARD_MAX_FILE_BYTES
  );
  const normalizedPath = await ensureRegularBoundedFile(path, maxBytes);
  const raw = await readFile(normalizedPath, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ValidationError('public witness ingress trust file is not valid JSON');
  }
  return validatePublicWitnessIngressTrustBundle(parsed);
}

function sourceBinding(source) {
  return Object.freeze({
    certificate_sha256: source.certificate_sha256,
    source_id: source.admission.source_id,
    source_epoch: source.admission.source_epoch
  });
}

function sameCanonical(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

export function verifyPublicWitnessIngressTrustBundleAgainstReceiver({
  receiverStore,
  bundle: bundleRaw,
  previousBundle = null
} = {}) {
  if (
    !receiverStore
    || typeof receiverStore.getSourceAdmission !== 'function'
    || typeof receiverStore.snapshot !== 'function'
  ) {
    throw new ValidationError('public witness ingress trust verification requires a W2c2 receiver');
  }
  const bundle = previousBundle === null
    ? validatePublicWitnessIngressTrustBundle(bundleRaw)
    : validatePublicWitnessIngressTrustTransition(previousBundle, bundleRaw);
  const snapshot = receiverStore.snapshot();
  if (snapshot.domain_id !== bundle.domain_id) {
    throw new ValidationError('public witness ingress trust bundle belongs to a different receiver domain');
  }

  const sources = [];
  for (const source of bundle.sources) {
    const retained = receiverStore.getSourceAdmission(source.admission.admission_digest);
    if (!retained || !sameCanonical(retained, source.admission)) {
      throw new ValidationError('public witness ingress trust source admission is not exactly retained by W2c2');
    }
    sources.push(Object.freeze({
      source_id: source.admission.source_id,
      source_epoch: source.admission.source_epoch,
      admission_digest: source.admission.admission_digest,
      certificate_sha256: source.certificate_sha256,
      status: 'retained-source-required'
    }));
  }

  return Object.freeze({
    schema: PUBLIC_WITNESS_INGRESS_TRUST_VERIFICATION_SCHEMA,
    domain_id: bundle.domain_id,
    generation: bundle.generation,
    bundle_digest: bundle.bundle_digest,
    activated_at: bundle.activated_at,
    sources: Object.freeze(sources),
    persona_root_count: bundle.persona_roots.length,
    source_trust_input: 'pre-admitted-w2c2-source',
    persona_root_trust_input: 'local-operator-config',
    receiver_mutation: false,
    remote_self_admission_allowed: false,
    social_authority_effect: 'none',
    finality_claimed: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
}

export function createPublicWitnessAuthenticatedIngressFromTrustBundle({
  receiverStore,
  bundle: bundleRaw,
  previousBundle = null,
  clock,
  maxConcurrent,
  perClientBurst,
  rateWindowMs
} = {}) {
  const bundle = previousBundle === null
    ? validatePublicWitnessIngressTrustBundle(bundleRaw)
    : validatePublicWitnessIngressTrustTransition(previousBundle, bundleRaw);
  verifyPublicWitnessIngressTrustBundleAgainstReceiver({ receiverStore, bundle, previousBundle });
  return new PublicWitnessAuthenticatedIngress({
    receiverStore,
    sourceBindings: bundle.sources.map(sourceBinding),
    personaRoots: bundle.persona_roots,
    clock,
    maxConcurrent,
    perClientBurst,
    rateWindowMs
  });
}
