import { createHash, createPublicKey } from 'node:crypto';
import { createServer as createHttpsServer } from 'node:https';

import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  sha256
} from './canonical.mjs';

export const PUBLIC_WITNESS_LIVE_INGRESS_SCHEMA = 'axiom-public-witness-live-ingress.v1';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;
const HARD_MAX_BODY_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_CONCURRENT = 32;
const HARD_MAX_CONCURRENT = 1024;
const DEFAULT_PER_CLIENT_BURST = 16;
const HARD_PER_CLIENT_BURST = 1024;
const DEFAULT_RATE_WINDOW_MS = 1000;
const HARD_RATE_WINDOW_MS = 60_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 5000;
const HARD_REQUEST_TIMEOUT_MS = 60_000;

function identifier(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: IDENTIFIER });
}

function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function boundedInteger(value, label, fallback, max) {
  const normalized = value === undefined ? fallback : value;
  if (!Number.isSafeInteger(normalized) || normalized < 1 || normalized > max) {
    throw new ValidationError(`${label} must be a positive safe integer no greater than ${max}`);
  }
  return normalized;
}

function canonicalTimestampFromMillis(value, label) {
  if (!Number.isFinite(value)) throw new ValidationError(`${label} must return finite milliseconds`);
  return new Date(value).toISOString();
}

function exactKeys(raw, allowed, label) {
  const value = assertPlainObject(raw, label);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${label} contains unsupported field ${key}`);
  }
  return value;
}

function publicKeyId(publicKeyValue) {
  let key;
  try {
    key = createPublicKey(publicKeyValue);
  } catch {
    throw new ValidationError('public witness live ingress persona root public key is invalid');
  }
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new ValidationError('public witness live ingress persona root public key must be Ed25519');
  }
  return sha256(key.export({ type: 'spki', format: 'pem' }).toString());
}

function normalizeSourceBinding(raw, index) {
  const value = exactKeys(
    raw,
    new Set(['certificate_sha256', 'source_id', 'source_epoch']),
    `public witness live ingress source binding[${index}]`
  );
  const sourceEpoch = value.source_epoch;
  if (!Number.isSafeInteger(sourceEpoch) || sourceEpoch < 1) {
    throw new ValidationError('public witness live ingress source_epoch must be a positive safe integer');
  }
  return Object.freeze({
    certificate_sha256: digest(value.certificate_sha256, 'public witness live ingress certificate_sha256'),
    source_id: identifier(value.source_id, 'public witness live ingress source_id'),
    source_epoch: sourceEpoch
  });
}

function normalizeRoot(raw, index) {
  const value = exactKeys(
    raw,
    new Set(['key_id', 'public_key']),
    `public witness live ingress persona root[${index}]`
  );
  const keyId = digest(value.key_id, 'public witness live ingress persona root key_id');
  if (publicKeyId(value.public_key) !== keyId) {
    throw new ValidationError('public witness live ingress persona root key_id does not match public key');
  }
  return Object.freeze({ key_id: keyId, public_key: value.public_key });
}

function normalizeRequest(raw) {
  const value = exactKeys(
    raw,
    new Set(['transfer', 'persona_root_key_id']),
    'public witness live ingress request'
  );
  const transfer = assertPlainObject(value.transfer, 'public witness live ingress transfer');
  const statement = assertPlainObject(transfer.statement, 'public witness live ingress transfer statement');
  const sourceEpoch = statement.source_epoch;
  if (!Number.isSafeInteger(sourceEpoch) || sourceEpoch < 1) {
    throw new ValidationError('public witness live ingress transfer source_epoch is invalid');
  }
  return Object.freeze({
    transfer,
    persona_root_key_id: digest(value.persona_root_key_id, 'public witness live ingress persona_root_key_id'),
    source_id: identifier(statement.source_id, 'public witness live ingress transfer source_id'),
    source_epoch: sourceEpoch
  });
}

function transportKey(certificateDigest, sourceId, sourceEpoch) {
  return `${certificateDigest}\u0000${sourceId}\u0000${sourceEpoch}`;
}

export function certificateSha256(rawCertificate) {
  if (!Buffer.isBuffer(rawCertificate) || rawCertificate.length === 0) {
    throw new ValidationError('public witness live ingress peer certificate bytes are required');
  }
  return createHash('sha256').update(rawCertificate).digest('hex');
}

export class PublicWitnessAuthenticatedIngress {
  #receiverStore;
  #bindings;
  #bindingResolver;
  #roots;
  #clock;
  #maxConcurrent;
  #perClientBurst;
  #rateWindowMs;
  #active;
  #rate;
  #accepted;
  #replayed;
  #rejected;

  constructor({
    receiverStore,
    sourceBindings,
    sourceBindingResolver,
    personaRoots,
    clock = () => Date.now(),
    maxConcurrent,
    perClientBurst,
    rateWindowMs
  } = {}) {
    if (!receiverStore || typeof receiverStore.receiveTransfer !== 'function') {
      throw new ValidationError('public witness live ingress requires a W2c2 receiver store');
    }
    const usesResolver = sourceBindingResolver !== undefined;
    if (usesResolver && typeof sourceBindingResolver !== 'function') {
      throw new ValidationError('public witness live ingress sourceBindingResolver must be a function');
    }
    if (usesResolver && sourceBindings !== undefined) {
      throw new ValidationError('public witness live ingress cannot combine static source bindings with a dynamic resolver');
    }
    if (!usesResolver && (!Array.isArray(sourceBindings) || sourceBindings.length < 1 || sourceBindings.length > 4096)) {
      throw new ValidationError('public witness live ingress requires 1-4096 transport source bindings or one dynamic resolver');
    }
    if (!Array.isArray(personaRoots) || personaRoots.length < 1 || personaRoots.length > 4096) {
      throw new ValidationError('public witness live ingress requires 1-4096 local persona roots');
    }
    if (typeof clock !== 'function') throw new ValidationError('public witness live ingress clock must be a function');
    this.#receiverStore = receiverStore;
    this.#bindings = new Map();
    this.#bindingResolver = usesResolver ? sourceBindingResolver : null;
    if (!usesResolver) {
      for (const [index, raw] of sourceBindings.entries()) {
        const binding = normalizeSourceBinding(raw, index);
        const key = transportKey(binding.certificate_sha256, binding.source_id, binding.source_epoch);
        if (this.#bindings.has(key)) throw new ValidationError('public witness live ingress transport binding is duplicated');
        this.#bindings.set(key, binding);
      }
    }
    this.#roots = new Map();
    for (const [index, raw] of personaRoots.entries()) {
      const root = normalizeRoot(raw, index);
      if (this.#roots.has(root.key_id)) throw new ValidationError('public witness live ingress persona root is duplicated');
      this.#roots.set(root.key_id, root.public_key);
    }
    this.#clock = clock;
    this.#maxConcurrent = boundedInteger(maxConcurrent, 'public witness live ingress maxConcurrent', DEFAULT_MAX_CONCURRENT, HARD_MAX_CONCURRENT);
    this.#perClientBurst = boundedInteger(perClientBurst, 'public witness live ingress perClientBurst', DEFAULT_PER_CLIENT_BURST, HARD_PER_CLIENT_BURST);
    this.#rateWindowMs = boundedInteger(rateWindowMs, 'public witness live ingress rateWindowMs', DEFAULT_RATE_WINDOW_MS, HARD_RATE_WINDOW_MS);
    this.#active = 0;
    this.#rate = new Map();
    this.#accepted = 0;
    this.#replayed = 0;
    this.#rejected = 0;
  }

  #consume(certificateDigest, now) {
    if (this.#active >= this.#maxConcurrent) {
      this.#rejected += 1;
      throw new ValidationError('public witness live ingress concurrent request capacity is exhausted');
    }
    const prior = this.#rate.get(certificateDigest);
    const current = !prior || now - prior.windowStartedAt >= this.#rateWindowMs
      ? { windowStartedAt: now, count: 0 }
      : prior;
    if (current.count >= this.#perClientBurst) {
      this.#rate.set(certificateDigest, current);
      this.#rejected += 1;
      throw new ValidationError('public witness live ingress client rate limit is exhausted');
    }
    current.count += 1;
    this.#rate.set(certificateDigest, current);
    this.#active += 1;
  }

  async #resolveBinding(certificateDigest, sourceId, sourceEpoch) {
    if (!this.#bindingResolver) {
      return this.#bindings.get(transportKey(certificateDigest, sourceId, sourceEpoch)) ?? null;
    }
    let raw;
    try {
      raw = await this.#bindingResolver({
        certificate_sha256: certificateDigest,
        source_id: sourceId,
        source_epoch: sourceEpoch
      });
    } catch (error) {
      this.#rejected += 1;
      throw error;
    }
    if (raw === null || raw === undefined) return null;
    const binding = normalizeSourceBinding(raw, 0);
    if (
      binding.certificate_sha256 !== certificateDigest
      || binding.source_id !== sourceId
      || binding.source_epoch !== sourceEpoch
    ) {
      this.#rejected += 1;
      throw new ValidationError('public witness live ingress dynamic resolver returned a mismatched transport binding');
    }
    return binding;
  }

  async accept({ certificate_sha256: certificateDigestRaw, request } = {}) {
    const certificateDigest = digest(certificateDigestRaw, 'public witness live ingress certificate digest');
    const normalized = normalizeRequest(request);
    const nowMillis = this.#clock();
    this.#consume(certificateDigest, nowMillis);
    try {
      const binding = await this.#resolveBinding(
        certificateDigest,
        normalized.source_id,
        normalized.source_epoch
      );
      if (!binding) {
        this.#rejected += 1;
        throw new ValidationError('public witness live ingress transport identity is not bound to transfer source epoch');
      }
      const trustedPersonaRootPublicKey = this.#roots.get(normalized.persona_root_key_id);
      if (!trustedPersonaRootPublicKey) {
        this.#rejected += 1;
        throw new ValidationError('public witness live ingress persona root is not locally trusted');
      }
      const receivedAt = canonicalTimestampFromMillis(nowMillis, 'public witness live ingress clock');
      let result;
      try {
        result = await this.#receiverStore.receiveTransfer(normalized.transfer, {
          trustedPersonaRootPublicKey,
          receivedAt
        });
      } catch (error) {
        this.#rejected += 1;
        throw error;
      }
      if (result.status === 'replay') this.#replayed += 1;
      else this.#accepted += 1;
      return Object.freeze({
        schema: PUBLIC_WITNESS_LIVE_INGRESS_SCHEMA,
        status: result.status,
        transfer_digest: result.transfer_digest,
        transfer_receipt: result.transfer_receipt,
        source_equivocation_evidence: result.source_equivocation_evidence ?? null,
        observation_status: result.observation_status ?? result.intake_status ?? null,
        received_at: receivedAt,
        transport_certificate_sha256: certificateDigest,
        persona_root_trust_source: 'local-config',
        source_binding_source: this.#bindingResolver ? 'local-dynamic-resolver' : 'local-static-config',
        source_admission_effect: 'none',
        persona_root_trust_effect: 'none',
        social_authority_effect: 'none',
        finality_claimed: false,
        authority_effect: 'none',
        network_effect: 'receive-only-laboratory'
      });
    } finally {
      this.#active -= 1;
    }
  }

  snapshot() {
    return Object.freeze({
      schema: PUBLIC_WITNESS_LIVE_INGRESS_SCHEMA,
      transport_binding_mode: this.#bindingResolver ? 'dynamic-local-resolver' : 'static-local-config',
      transport_binding_count: this.#bindingResolver ? null : this.#bindings.size,
      persona_root_count: this.#roots.size,
      active_requests: this.#active,
      accepted_requests: this.#accepted,
      replayed_requests: this.#replayed,
      rejected_requests: this.#rejected,
      max_concurrent: this.#maxConcurrent,
      per_client_burst: this.#perClientBurst,
      rate_window_ms: this.#rateWindowMs,
      automatic_source_admission: false,
      outbound_fetch: false,
      discovery: false,
      grid_credentials: false,
      source_admission_effect: 'none',
      persona_root_trust_effect: 'none',
      social_authority_effect: 'none',
      finality_claimed: false,
      authority_effect: 'none',
      network_effect: 'receive-only-laboratory'
    });
  }
}

function writeJson(response, statusCode, payload) {
  const body = `${canonicalJson(payload)}\n`;
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  });
  response.end(body);
}

async function readCanonicalJson(request, maxBodyBytes, timeoutMs) {
  const chunks = [];
  let size = 0;
  const timeoutError = new ValidationError('public witness live ingress request body timed out');
  const timer = setTimeout(() => request.destroy(timeoutError), timeoutMs);
  timer.unref?.();
  try {
    for await (const chunk of request) {
      size += chunk.length;
      if (size > maxBodyBytes) {
        throw new ValidationError('public witness live ingress request body exceeds configured byte limit');
      }
      chunks.push(chunk);
    }
  } catch (error) {
    if (error === timeoutError || request.destroyed && error?.message === timeoutError.message) {
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
  if (size === 0) throw new ValidationError('public witness live ingress request body is required');
  const text = Buffer.concat(chunks).toString('utf8');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ValidationError('public witness live ingress request body is not valid JSON');
  }
  if (canonicalJson(parsed) !== text) {
    throw new ValidationError('public witness live ingress request body must use canonical JSON without trailing bytes');
  }
  return parsed;
}

export function createPublicWitnessHttpsIngress({
  ingress,
  tlsKey,
  tlsCertificate,
  clientCa,
  host = '127.0.0.1',
  port = 0,
  maxBodyBytes,
  requestTimeoutMs
} = {}) {
  if (!(ingress instanceof PublicWitnessAuthenticatedIngress)) {
    throw new ValidationError('public witness HTTPS ingress requires an authenticated ingress core');
  }
  const normalizedHost = assertString(host, 'public witness HTTPS ingress host', { min: 1, max: 255 });
  if (['0.0.0.0', '::'].includes(normalizedHost)) {
    throw new ValidationError('public witness HTTPS ingress wildcard bind requires a separately reviewed deployment wrapper');
  }
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) {
    throw new ValidationError('public witness HTTPS ingress port is invalid');
  }
  const normalizedBodyLimit = boundedInteger(maxBodyBytes, 'public witness HTTPS ingress maxBodyBytes', DEFAULT_MAX_BODY_BYTES, HARD_MAX_BODY_BYTES);
  const normalizedTimeout = boundedInteger(requestTimeoutMs, 'public witness HTTPS ingress requestTimeoutMs', DEFAULT_REQUEST_TIMEOUT_MS, HARD_REQUEST_TIMEOUT_MS);
  const server = createHttpsServer({
    key: tlsKey,
    cert: tlsCertificate,
    ca: clientCa,
    requestCert: true,
    rejectUnauthorized: true,
    minVersion: 'TLSv1.3'
  }, async (request, response) => {
    response.setHeader('connection', 'close');
    try {
      if (request.method !== 'POST' || request.url !== '/v1/transfers') {
        writeJson(response, 404, { error: 'not-found' });
        return;
      }
      if (request.headers['content-type'] !== 'application/json') {
        writeJson(response, 415, { error: 'unsupported-media-type' });
        return;
      }
      const certificate = request.socket.getPeerCertificate(true);
      if (!request.socket.authorized || !certificate?.raw) {
        writeJson(response, 403, { error: 'unauthorized-client-certificate' });
        return;
      }
      const parsed = await readCanonicalJson(request, normalizedBodyLimit, normalizedTimeout);
      const result = await ingress.accept({
        certificate_sha256: certificateSha256(certificate.raw),
        request: parsed
      });
      writeJson(response, result.status === 'replay' ? 200 : 202, result);
    } catch (error) {
      const message = error instanceof ValidationError ? error.message : 'public witness live ingress request failed';
      if (response.destroyed || response.writableEnded) return;
      const status = /rate limit|concurrent request capacity/.test(message)
        ? 429
        : /byte limit/.test(message)
          ? 413
          : /timed out/.test(message)
            ? 408
            : /transport identity|persona root/.test(message)
              ? 403
              : 400;
      writeJson(response, status, { error: 'request-rejected', detail: message });
    }
  });
  server.requestTimeout = normalizedTimeout;
  server.headersTimeout = normalizedTimeout;
  server.keepAliveTimeout = 1;
  server.maxRequestsPerSocket = 1;

  return Object.freeze({
    schema: PUBLIC_WITNESS_LIVE_INGRESS_SCHEMA,
    network_effect: 'receive-only-laboratory',
    automatic_source_admission: false,
    outbound_fetch: false,
    discovery: false,
    async listen() {
      if (server.listening) throw new ValidationError('public witness HTTPS ingress is already listening');
      await new Promise((resolve, reject) => {
        const onError = error => { server.off('listening', onListening); reject(error); };
        const onListening = () => { server.off('error', onError); resolve(); };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(port, normalizedHost);
      });
      return server.address();
    },
    async close() {
      if (!server.listening) return;
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    },
    address() {
      return server.address();
    }
  });
}
