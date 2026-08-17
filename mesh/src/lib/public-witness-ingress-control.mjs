import { lstat, readFile } from 'node:fs/promises';

import {
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject
} from './canonical.mjs';
import {
  createPublicWitnessAuthenticatedIngressFromTrustBundle,
  validatePublicWitnessIngressTrustBundle
} from './public-witness-ingress-trust.mjs';
import { createPublicWitnessHttpsIngress } from './public-witness-live-ingress.mjs';

export const PUBLIC_WITNESS_INGRESS_CONTROL_SCHEMA = 'axiom-public-witness-ingress-control.v1';
export const PUBLIC_WITNESS_INGRESS_CONTROL_SNAPSHOT_SCHEMA = 'axiom-public-witness-ingress-control-snapshot.v1';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const STATES = new Set(['enabled', 'disabled']);
const DEFAULT_MAX_FILE_BYTES = 64 * 1024;
const HARD_MAX_FILE_BYTES = 1024 * 1024;

const CONTROL_KEYS = new Set([
  'schema',
  'domain_id',
  'generation',
  'previous_control_digest',
  'effective_at',
  'ingress_state',
  'trust_bundle_digest',
  'operator_local_input',
  'source_admission_effect',
  'persona_root_trust_effect',
  'social_authority_effect',
  'finality_claimed',
  'authority_effect',
  'network_effect',
  'control_digest'
]);

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
  if (!Number.isSafeInteger(value) || value < 1) {
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

function normalizeBody(raw) {
  const value = exactKeys(raw, CONTROL_KEYS, 'public witness ingress control');
  const state = assertString(value.ingress_state, 'public witness ingress control ingress_state', { min: 7, max: 8 });
  if (!STATES.has(state)) throw new ValidationError('public witness ingress control ingress_state is invalid');
  const generation = positiveInteger(value.generation, 'public witness ingress control generation');
  const previous = nullableDigest(value.previous_control_digest, 'public witness ingress control previous_control_digest');
  if ((generation === 1) !== (previous === null)) {
    throw new ValidationError('public witness ingress control generation 1 requires null predecessor and later generations require one');
  }
  const bundleDigest = nullableDigest(value.trust_bundle_digest, 'public witness ingress control trust_bundle_digest');
  if (state === 'enabled' && bundleDigest === null) {
    throw new ValidationError('public witness ingress control enabled state requires a trust bundle digest');
  }
  if (state === 'disabled' && bundleDigest !== null) {
    throw new ValidationError('public witness ingress control disabled state cannot retain a trust bundle digest');
  }
  if (
    value.operator_local_input !== true
    || value.source_admission_effect !== 'none'
    || value.persona_root_trust_effect !== 'none'
    || value.social_authority_effect !== 'none'
    || value.finality_claimed !== false
    || value.authority_effect !== 'none'
    || value.network_effect !== 'listener-lifecycle-laboratory'
  ) {
    throw new ValidationError('public witness ingress control cannot expand trust, social, finality, or authority claims');
  }
  return Object.freeze({
    schema: PUBLIC_WITNESS_INGRESS_CONTROL_SCHEMA,
    domain_id: identifier(value.domain_id, 'public witness ingress control domain_id'),
    generation,
    previous_control_digest: previous,
    effective_at: canonicalTimestamp(value.effective_at, 'public witness ingress control effective_at'),
    ingress_state: state,
    trust_bundle_digest: bundleDigest,
    operator_local_input: true,
    source_admission_effect: 'none',
    persona_root_trust_effect: 'none',
    social_authority_effect: 'none',
    finality_claimed: false,
    authority_effect: 'none',
    network_effect: 'listener-lifecycle-laboratory'
  });
}

function withDigest(body) {
  return Object.freeze({ ...body, control_digest: digestObject(body) });
}

function clockMillis(clock) {
  const now = (clock ?? (() => Date.now()))();
  if (!Number.isFinite(now)) throw new ValidationError('public witness ingress control clock must return finite milliseconds');
  return now;
}

export function validatePublicWitnessIngressControl(raw) {
  const value = exactKeys(raw, CONTROL_KEYS, 'public witness ingress control');
  const body = normalizeBody(value);
  const expected = digestObject(body);
  if (digest(value.control_digest, 'public witness ingress control control_digest') !== expected) {
    throw new ValidationError('public witness ingress control digest mismatch');
  }
  return withDigest(body);
}

export function createPublicWitnessIngressControl({
  domainId,
  generation = 1,
  previousControl = null,
  effectiveAt,
  ingressState,
  trustBundle = null
} = {}) {
  let previousDigest = null;
  if (previousControl !== null) previousDigest = validatePublicWitnessIngressControl(previousControl).control_digest;
  let trustBundleDigest = null;
  if (trustBundle !== null) trustBundleDigest = validatePublicWitnessIngressTrustBundle(trustBundle).bundle_digest;
  const control = withDigest(normalizeBody({
    schema: PUBLIC_WITNESS_INGRESS_CONTROL_SCHEMA,
    domain_id: domainId,
    generation,
    previous_control_digest: previousDigest,
    effective_at: effectiveAt,
    ingress_state: ingressState,
    trust_bundle_digest: trustBundleDigest,
    operator_local_input: true,
    source_admission_effect: 'none',
    persona_root_trust_effect: 'none',
    social_authority_effect: 'none',
    finality_claimed: false,
    authority_effect: 'none',
    network_effect: 'listener-lifecycle-laboratory',
    control_digest: '0'.repeat(64)
  }));
  if (previousControl !== null) validatePublicWitnessIngressControlTransition(previousControl, control);
  return control;
}

export function validatePublicWitnessIngressControlTransition(previousRaw, nextRaw) {
  const previous = validatePublicWitnessIngressControl(previousRaw);
  const next = validatePublicWitnessIngressControl(nextRaw);
  if (next.domain_id !== previous.domain_id) throw new ValidationError('public witness ingress control transition cannot change domain');
  if (next.generation !== previous.generation + 1) {
    throw new ValidationError('public witness ingress control transition must advance exactly one generation');
  }
  if (next.previous_control_digest !== previous.control_digest) {
    throw new ValidationError('public witness ingress control predecessor does not match prior control');
  }
  if (next.effective_at <= previous.effective_at) {
    throw new ValidationError('public witness ingress control effective time must advance');
  }
  return next;
}

function resolveOperationalControl(controlRaw, previousControl) {
  const control = validatePublicWitnessIngressControl(controlRaw);
  if (control.generation === 1) {
    if (previousControl !== null) {
      throw new ValidationError('public witness ingress control genesis cannot supply a predecessor');
    }
    return control;
  }
  if (previousControl === null) {
    throw new ValidationError('public witness ingress control non-genesis activation requires its predecessor');
  }
  return validatePublicWitnessIngressControlTransition(previousControl, control);
}

async function ensureRegularBoundedFile(path, maxBytes) {
  const normalized = assertString(path, 'public witness ingress control file path', { min: 1, max: 4096 });
  let info;
  try {
    info = await lstat(normalized);
  } catch {
    throw new ValidationError('public witness ingress control file is not readable');
  }
  if (info.isSymbolicLink() || !info.isFile()) {
    throw new ValidationError('public witness ingress control file must be a regular non-symlink file');
  }
  if (info.size < 2 || info.size > maxBytes) {
    throw new ValidationError('public witness ingress control file exceeds configured bounds');
  }
  return normalized;
}

export async function loadPublicWitnessIngressControl(path, { maxFileBytes } = {}) {
  const maxBytes = boundedInteger(
    maxFileBytes,
    'public witness ingress control maxFileBytes',
    DEFAULT_MAX_FILE_BYTES,
    HARD_MAX_FILE_BYTES
  );
  const normalized = await ensureRegularBoundedFile(path, maxBytes);
  const raw = await readFile(normalized, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ValidationError('public witness ingress control file is not valid JSON');
  }
  return validatePublicWitnessIngressControl(parsed);
}

export class PublicWitnessIngressLifecycleController {
  #receiverStore;
  #tlsKey;
  #tlsCertificate;
  #clientCa;
  #host;
  #port;
  #clock;
  #maxBodyBytes;
  #requestTimeoutMs;
  #maxConcurrent;
  #perClientBurst;
  #rateWindowMs;
  #currentControl;
  #currentBundle;
  #server;
  #address;
  #tail;

  constructor({
    receiverStore,
    tlsKey,
    tlsCertificate,
    clientCa,
    host = '127.0.0.1',
    port = 0,
    clock = () => Date.now(),
    maxBodyBytes,
    requestTimeoutMs,
    maxConcurrent,
    perClientBurst,
    rateWindowMs
  } = {}) {
    if (!receiverStore || typeof receiverStore.receiveTransfer !== 'function') {
      throw new ValidationError('public witness ingress lifecycle requires a W2c2 receiver');
    }
    if (typeof clock !== 'function') throw new ValidationError('public witness ingress lifecycle clock must be a function');
    this.#receiverStore = receiverStore;
    this.#tlsKey = tlsKey;
    this.#tlsCertificate = tlsCertificate;
    this.#clientCa = clientCa;
    this.#host = host;
    this.#port = port;
    this.#clock = clock;
    this.#maxBodyBytes = maxBodyBytes;
    this.#requestTimeoutMs = requestTimeoutMs;
    this.#maxConcurrent = maxConcurrent;
    this.#perClientBurst = perClientBurst;
    this.#rateWindowMs = rateWindowMs;
    this.#currentControl = null;
    this.#currentBundle = null;
    this.#server = null;
    this.#address = null;
    this.#tail = Promise.resolve();
  }

  async #serialized(fn) {
    const run = async () => fn();
    const result = this.#tail.then(run, run);
    this.#tail = result.then(() => undefined, () => undefined);
    return result;
  }

  #resolveCandidate(controlRaw, previousControl) {
    const candidate = resolveOperationalControl(controlRaw, previousControl);
    if (this.#currentControl === null) {
      if (candidate.generation !== 1) {
        throw new ValidationError('public witness ingress lifecycle must begin from control generation 1');
      }
    } else {
      if (previousControl === null) {
        throw new ValidationError('public witness ingress lifecycle transition requires the active predecessor control');
      }
      const previous = validatePublicWitnessIngressControl(previousControl);
      if (previous.control_digest !== this.#currentControl.control_digest) {
        throw new ValidationError('public witness ingress lifecycle predecessor is not the active control');
      }
      validatePublicWitnessIngressControlTransition(this.#currentControl, candidate);
    }
    if (Date.parse(candidate.effective_at) > clockMillis(this.#clock)) {
      throw new ValidationError('public witness ingress control is not effective yet');
    }
    return candidate;
  }

  async apply({
    control,
    previousControl = null,
    trustBundle = null,
    previousTrustBundle = null
  } = {}) {
    return this.#serialized(async () => {
      const candidate = this.#resolveCandidate(control, previousControl);
      if (candidate.ingress_state === 'disabled') {
        if (trustBundle !== null || previousTrustBundle !== null) {
          throw new ValidationError('public witness ingress disabled control cannot supply trust bundles');
        }
        if (this.#server) await this.#server.close();
        this.#server = null;
        this.#address = null;
        this.#currentBundle = null;
        this.#currentControl = candidate;
        return this.snapshot();
      }

      if (trustBundle === null) {
        throw new ValidationError('public witness ingress enabled control requires its exact trust bundle');
      }
      const bundle = validatePublicWitnessIngressTrustBundle(trustBundle);
      if (bundle.domain_id !== candidate.domain_id) {
        throw new ValidationError('public witness ingress control and trust bundle belong to different domains');
      }
      if (bundle.bundle_digest !== candidate.trust_bundle_digest) {
        throw new ValidationError('public witness ingress control does not bind the supplied trust bundle');
      }

      // Build and verify the complete candidate before closing the active listener.
      const ingress = createPublicWitnessAuthenticatedIngressFromTrustBundle({
        receiverStore: this.#receiverStore,
        bundle,
        previousBundle: previousTrustBundle,
        clock: this.#clock,
        maxConcurrent: this.#maxConcurrent,
        perClientBurst: this.#perClientBurst,
        rateWindowMs: this.#rateWindowMs
      });
      const nextServer = createPublicWitnessHttpsIngress({
        ingress,
        tlsKey: this.#tlsKey,
        tlsCertificate: this.#tlsCertificate,
        clientCa: this.#clientCa,
        host: this.#host,
        port: this.#port,
        maxBodyBytes: this.#maxBodyBytes,
        requestTimeoutMs: this.#requestTimeoutMs
      });

      if (this.#server) await this.#server.close();
      this.#server = null;
      this.#address = null;
      try {
        this.#address = await nextServer.listen();
      } catch (error) {
        this.#currentBundle = null;
        throw error;
      }
      this.#server = nextServer;
      this.#currentBundle = bundle;
      this.#currentControl = candidate;
      return this.snapshot();
    });
  }

  async close() {
    return this.#serialized(async () => {
      if (this.#server) await this.#server.close();
      this.#server = null;
      this.#address = null;
      return this.snapshot();
    });
  }

  snapshot() {
    const control = this.#currentControl;
    const body = Object.freeze({
      schema: PUBLIC_WITNESS_INGRESS_CONTROL_SNAPSHOT_SCHEMA,
      domain_id: control?.domain_id ?? null,
      control_generation: control?.generation ?? 0,
      control_digest: control?.control_digest ?? null,
      configured_ingress_state: control?.ingress_state ?? 'unconfigured',
      trust_bundle_digest: this.#currentBundle?.bundle_digest ?? null,
      listening: this.#server !== null,
      listen_address: this.#address && typeof this.#address === 'object'
        ? Object.freeze({ address: this.#address.address, family: this.#address.family, port: this.#address.port })
        : null,
      operator_local_input: true,
      source_admission_effect: 'none',
      persona_root_trust_effect: 'none',
      social_authority_effect: 'none',
      finality_claimed: false,
      authority_effect: 'none',
      network_effect: this.#server ? 'receive-only-laboratory' : 'none'
    });
    return Object.freeze({ ...body, snapshot_digest: digestObject(body) });
  }
}
