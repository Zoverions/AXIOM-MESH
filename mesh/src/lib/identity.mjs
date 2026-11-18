import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  sign,
  timingSafeEqual,
  verify
} from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { canonicalJson, sha256, AxiomError } from './canonical.mjs';
import { assertTransportPeer } from './transport-credentials.mjs';
import { registerTransportMetrics } from './observability.mjs';

const KEY_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

function fromB64url(input) {
  return Buffer.from(input, 'base64url');
}

async function atomicWrite(path, content, mode) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, content, { mode, flag: 'wx' });
  await rename(temporary, path);
}

export async function ensureMeshIdentity(dataDir, service, { create = true } = {}) {
  if (!KEY_PATTERN.test(service)) throw new Error(`Invalid service identity: ${service}`);
  const identityDir = join(dataDir, 'identities', service);
  const privatePath = join(identityDir, 'private.pem');
  const publicPath = join(identityDir, 'public.pem');
  const trustPath = join(dataDir, 'trust', `${service}.pub.pem`);

  let privatePem;
  let publicPem;
  try {
    [privatePem, publicPem] = await Promise.all([
      readFile(privatePath, 'utf8'),
      readFile(publicPath, 'utf8')
    ]);
  } catch (error) {
    if (!create || error.code !== 'ENOENT') throw error;
    const pair = generateKeyPairSync('ed25519');
    privatePem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' });
    publicPem = pair.publicKey.export({ type: 'spki', format: 'pem' });
    await atomicWrite(privatePath, privatePem, 0o600);
    await atomicWrite(publicPath, publicPem, 0o644);
  }
  try {
    await readFile(trustPath, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await atomicWrite(trustPath, publicPem, 0o644);
  }
  return new MeshIdentity(service, privatePem, publicPem);
}

// Parsed trusted keys by path, each bound to the file identity it was read
// from (scalability audit S-05). Reading and parsing the PEM on every signed
// request cost ~5x a stat. Any replacement of the file -- rotation writes a
// new file and renames it into place -- changes the inode or timestamps, so
// the next request reads the new key exactly as before.
//
// Timestamps only change when the filesystem clock ticks: about every 15.6 ms
// on NTFS, a few ms on Linux, 2 s on FAT. A same-size rewrite within one tick
// of the cached read keeps the identity, so a file modified that recently is
// never served from the cache ("racy git"). Once it is older than the margin,
// any further write gets a timestamp outside the tick and shows as a change.
const trustedKeyCache = new Map();
const trustedKeyCounters = { reads: 0, hits: 0 };
registerTransportMetrics('trusted-keys', () => ({
  trusted_key_reads_total: trustedKeyCounters.reads,
  trusted_key_hits_total: trustedKeyCounters.hits
}));
export const TRUSTED_KEY_RACY_MARGIN_MS = 2_000;

function trustFileIdentity(info) {
  return `${info.dev}:${info.ino}:${info.size}:${info.mtimeNs}:${info.ctimeNs}`;
}

/** True when a trust file is settled enough for its identity to be trusted. */
export function trustedKeyCacheable(info, nowMs = Date.now()) {
  const now = BigInt(Math.floor(nowMs)) * 1_000_000n;
  const margin = BigInt(TRUSTED_KEY_RACY_MARGIN_MS) * 1_000_000n;
  return now - info.mtimeNs >= margin && now - info.ctimeNs >= margin;
}

/** Trust-file reads and cache hits since start, for evidence and tests. */
export function trustedKeyCacheStats() {
  return Object.freeze({ entries: trustedKeyCache.size, ...trustedKeyCounters });
}

export async function loadTrustedKey(dataDir, service, { nowMs = Date.now() } = {}) {
  if (!KEY_PATTERN.test(service)) throw new AxiomError('invalid_service_identity', 'Invalid service identity', 401);
  const path = join(dataDir, 'trust', `${service}.pub.pem`);
  const info = await stat(path, { bigint: true });
  const before = trustFileIdentity(info);
  const cached = trustedKeyCache.get(path);
  if (cached?.identity === before) {
    trustedKeyCounters.hits += 1;
    return cached.key;
  }

  trustedKeyCounters.reads += 1;
  const key = createPublicKey(await readFile(path, 'utf8'));
  // Cache only a settled file that did not change while it was being read.
  const after = trustFileIdentity(await stat(path, { bigint: true }));
  if (after === before && trustedKeyCacheable(info, nowMs)) {
    trustedKeyCache.set(path, { identity: before, key });
  } else {
    trustedKeyCache.delete(path);
  }
  return key;
}

function keyIdFor(service, publicKey) {
  const pem = publicKey.export({ type: 'spki', format: 'pem' });
  return `${service}:${sha256(pem).slice(0, 16)}`;
}

export class MeshIdentity {
  constructor(service, privatePem, publicPem) {
    this.service = service;
    this.privateKey = createPrivateKey(privatePem);
    this.publicKey = createPublicKey(publicPem);
    this.keyId = keyIdFor(service, this.publicKey);
  }

  signBytes(bytes) {
    return b64url(sign(null, Buffer.from(bytes), this.privateKey));
  }

  signObject(value) {
    const body = canonicalJson(value);
    return {
      algorithm: 'Ed25519',
      key_id: this.keyId,
      digest: sha256(body),
      signature: this.signBytes(body)
    };
  }
}

export function verifyObjectSignature(value, attestation, publicKey) {
  if (!attestation || attestation.algorithm !== 'Ed25519') return false;
  const body = canonicalJson(value);
  if (attestation.digest !== sha256(body)) return false;
  return verify(null, Buffer.from(body), publicKey, fromB64url(attestation.signature));
}

// Replay guard capacity (scalability audit S-06). A signed request's nonce is
// retained until its timestamp plus the clock-skew window plus one second.
// With the default 30 s skew, a request stamped up to 30 s ahead is retained
// for up to 61 s. Capacity is the declared peak signed-request rate per
// receiving service, times that retention, times a safety margin. At the
// default (500/s, 61 s, x2 = 61,000 entries) a full guard holds about 8 MiB.
export const REPLAY_DECLARED_REQUESTS_PER_SECOND = 500;
export const REPLAY_RETENTION_SECONDS = 61;
export const REPLAY_CAPACITY_MARGIN = 2;

export function replayGuardCapacity({
  requestsPerSecond = REPLAY_DECLARED_REQUESTS_PER_SECOND,
  retentionSeconds = REPLAY_RETENTION_SECONDS,
  margin = REPLAY_CAPACITY_MARGIN
} = {}) {
  const capacity = Math.ceil(requestsPerSecond * retentionSeconds * margin);
  if (!Number.isSafeInteger(capacity) || capacity < 1) {
    throw new RangeError('Replay guard capacity is invalid');
  }
  return capacity;
}

export const REPLAY_DEFAULT_CAPACITY = replayGuardCapacity();

// Every live guard in this process (a service holds one or two), weakly, so
// the operations report can sum them without keeping discarded guards alive.
const liveReplayGuards = new Set();
const replayGuardCollector = new FinalizationRegistry(reference => liveReplayGuards.delete(reference));

registerTransportMetrics('replay', () => {
  const totals = {
    replay_entries: 0,
    replay_capacity: 0,
    replay_high_water: 0,
    replay_saturated_total: 0,
    replay_expired_total: 0
  };
  for (const reference of liveReplayGuards) {
    const stats = reference.deref()?.stats();
    if (!stats) continue;
    totals.replay_entries += stats.entries;
    totals.replay_capacity += stats.capacity;
    totals.replay_high_water += stats.high_water;
    totals.replay_saturated_total += stats.saturated_total;
    totals.replay_expired_total += stats.expired_total;
  }
  return totals;
});

/**
 * Remembers nonces until they expire. Every live nonce is indexed under its
 * expiry time, and expiries are kept in a min-heap, so each admission evicts
 * exactly the entries that have expired: amortized O(1) per nonce plus
 * O(log b) per distinct expiry (b is small; signed requests expire on whole
 * seconds). There is no periodic full scan, and a full guard stays full only
 * of live nonces, so saturation always means the declared rate was exceeded.
 */
export class ReplayGuard {
  constructor({ maxEntries = REPLAY_DEFAULT_CAPACITY } = {}) {
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 1) {
      throw new RangeError('Replay guard capacity is invalid');
    }
    this.maxEntries = maxEntries;
    this.nonces = new Map();
    this.byExpiry = new Map();
    this.expiryHeap = [];
    this.highWater = 0;
    this.maxExpiryLagMs = 0;
    this.counters = { admitted: 0, replayed: 0, saturated: 0, expired: 0 };
    const reference = new WeakRef(this);
    liveReplayGuards.add(reference);
    replayGuardCollector.register(this, reference);
  }

  // Compatibility surface retained for existing callers/tests that only need
  // admitted vs not-admitted semantics. Security-sensitive callers that must
  // distinguish replay from capacity exhaustion use admit().
  use(service, nonce, expiresAtMs, now = Date.now()) {
    return this.admit(service, nonce, expiresAtMs, now) === 'admitted';
  }

  admit(service, nonce, expiresAtMs, now = Date.now()) {
    if (!Number.isFinite(expiresAtMs) || !Number.isFinite(now)) {
      throw new RangeError('Replay guard times must be finite');
    }
    this.sweepExpired(now);
    const key = `${service}:${nonce}`;
    if (this.nonces.has(key)) {
      this.counters.replayed += 1;
      return 'replayed';
    }
    if (this.nonces.size >= this.maxEntries) {
      this.counters.saturated += 1;
      return 'saturated';
    }
    this.counters.admitted += 1;
    // Already expired: nothing left to protect, so nothing to retain.
    if (expiresAtMs <= now) return 'admitted';
    this.nonces.set(key, expiresAtMs);
    const bucket = this.byExpiry.get(expiresAtMs);
    if (bucket) bucket.push(key);
    else {
      this.byExpiry.set(expiresAtMs, [key]);
      heapPush(this.expiryHeap, expiresAtMs);
    }
    if (this.nonces.size > this.highWater) this.highWater = this.nonces.size;
    return 'admitted';
  }

  sweepExpired(now = Date.now()) {
    while (this.expiryHeap.length && this.expiryHeap[0] <= now) {
      const expiry = heapPop(this.expiryHeap);
      const keys = this.byExpiry.get(expiry);
      this.byExpiry.delete(expiry);
      for (const key of keys) this.nonces.delete(key);
      this.counters.expired += keys.length;
      this.maxExpiryLagMs = Math.max(this.maxExpiryLagMs, now - expiry);
    }
  }

  /**
   * Occupancy and outcome counters. Replay and saturation stay separate here,
   * as they do in the errors callers raise (409 replay, 503 saturation).
   * max_expiry_lag_ms is the longest an expired nonce stayed resident; it
   * only grows while no request arrives, and never costs capacity, because
   * every admission evicts first.
   */
  stats() {
    return Object.freeze({
      entries: this.nonces.size,
      capacity: this.maxEntries,
      high_water: this.highWater,
      admitted_total: this.counters.admitted,
      replayed_total: this.counters.replayed,
      saturated_total: this.counters.saturated,
      expired_total: this.counters.expired,
      max_expiry_lag_ms: this.maxExpiryLagMs
    });
  }
}

function heapPush(heap, value) {
  heap.push(value);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = (index - 1) >> 1;
    if (heap[parent] <= value) break;
    heap[index] = heap[parent];
    index = parent;
  }
  heap[index] = value;
}

function heapPop(heap) {
  const top = heap[0];
  const last = heap.pop();
  if (heap.length) {
    let index = 0;
    for (;;) {
      const left = index * 2 + 1;
      if (left >= heap.length) break;
      const right = left + 1;
      const child = right < heap.length && heap[right] < heap[left] ? right : left;
      if (heap[child] >= last) break;
      heap[index] = heap[child];
      index = child;
    }
    heap[index] = last;
  }
  return top;
}

function requestSigningInput({ method, path, audience, service, timestamp, nonce, digest, interfaceVersion }) {
  return [
    'AXIOM-SIGNED-REQUEST-V1',
    interfaceVersion,
    method.toUpperCase(),
    path,
    audience,
    service,
    timestamp,
    nonce,
    digest
  ].join('\n');
}

export function signedRequestHeaders(identity, { method, url, audience, body = Buffer.alloc(0), now = Date.now() }) {
  const target = new URL(url);
  const timestamp = String(Math.floor(now / 1000));
  const nonce = randomBytes(18).toString('base64url');
  const digest = sha256(body);
  const interfaceVersion = `axiom.${audience}.v1`;
  const input = requestSigningInput({
    method,
    path: `${target.pathname}${target.search}`,
    audience,
    service: identity.service,
    timestamp,
    nonce,
    digest,
    interfaceVersion
  });
  return {
    'x-axiom-interface': interfaceVersion,
    'x-axiom-service': identity.service,
    'x-axiom-audience': audience,
    'x-axiom-timestamp': timestamp,
    'x-axiom-nonce': nonce,
    'x-axiom-content-sha256': digest,
    'x-axiom-signature': identity.signBytes(input),
    'x-axiom-key-id': identity.keyId
  };
}

export async function verifySignedRequest({
  req,
  body,
  audience,
  dataDir,
  allowedCallers,
  replayGuard,
  transportPeers,
  clockSkewSeconds = 30,
  now = Date.now()
}) {
  const service = req.headers['x-axiom-service'];
  const interfaceVersion = req.headers['x-axiom-interface'];
  const claimedAudience = req.headers['x-axiom-audience'];
  const timestamp = req.headers['x-axiom-timestamp'];
  const nonce = req.headers['x-axiom-nonce'];
  const digest = req.headers['x-axiom-content-sha256'];
  const signature = req.headers['x-axiom-signature'];
  const keyId = req.headers['x-axiom-key-id'];
  if (
    ![service, interfaceVersion, claimedAudience, timestamp, nonce, digest, signature, keyId]
      .every(item => typeof item === 'string')
  ) {
    throw new AxiomError('service_auth_required', 'A signed service request is required', 401);
  }
  if (!KEY_PATTERN.test(service) || nonce.length > 128 || signature.length > 1024 || keyId.length > 160) {
    throw new AxiomError('invalid_service_identity', 'Signed service request metadata is invalid', 401);
  }
  if (interfaceVersion !== `axiom.${audience}.v1`) {
    throw new AxiomError('incompatible_interface', 'Service interface version is incompatible', 426);
  }
  if (claimedAudience !== audience) throw new AxiomError('wrong_audience', 'Service request audience is invalid', 401);
  if (!allowedCallers.includes(service)) throw new AxiomError('caller_not_allowed', 'Calling service is not allowed', 403);
  if (transportPeers) {
    try {
      assertTransportPeer(req.socket, service, transportPeers);
    } catch {
      throw new AxiomError(
        'invalid_transport_peer',
        'Transport peer identity does not match the signed caller',
        401
      );
    }
  }
  const timestampSeconds = Number(timestamp);
  const nowSeconds = Math.floor(now / 1000);
  if (!Number.isSafeInteger(timestampSeconds) || Math.abs(nowSeconds - timestampSeconds) > clockSkewSeconds) {
    throw new AxiomError('stale_request', 'Service request timestamp is outside the allowed window', 401);
  }
  const actualDigest = sha256(body);
  if (!safeTextEqual(actualDigest, digest)) throw new AxiomError('body_digest_mismatch', 'Request body digest does not match', 401);
  const key = await loadTrustedKey(dataDir, service);
  if (!safeTextEqual(keyIdFor(service, key), keyId)) {
    throw new AxiomError('invalid_service_key', 'Service request key identifier is invalid', 401);
  }
  const input = requestSigningInput({
    method: req.method,
    path: req.url,
    audience,
    service,
    timestamp,
    nonce,
    digest,
    interfaceVersion
  });
  if (!verify(null, Buffer.from(input), key, fromB64url(signature))) {
    throw new AxiomError('invalid_service_signature', 'Service request signature is invalid', 401);
  }
  const replayAdmission = replayGuard.admit(
    service,
    nonce,
    (timestampSeconds + clockSkewSeconds + 1) * 1000,
    now
  );
  if (replayAdmission === 'replayed') {
    throw new AxiomError('replayed_request', 'Service request nonce has already been used', 409);
  }
  if (replayAdmission === 'saturated') {
    throw new AxiomError(
      'replay_guard_saturated',
      'Service replay protection is temporarily saturated',
      503
    );
  }
  if (replayAdmission !== 'admitted') {
    throw new AxiomError('replay_guard_unavailable', 'Service replay protection is unavailable', 503);
  }
  return { service };
}

export function issueCapability(identity, payload) {
  const header = { alg: 'EdDSA', typ: 'AXIOM-CAP+JWT', kid: identity.keyId };
  const encodedHeader = b64url(canonicalJson(header));
  const encodedPayload = b64url(canonicalJson(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  return `${signingInput}.${identity.signBytes(signingInput)}`;
}

export function verifyCapability(token, publicKey, {
  audience,
  issuer,
  nowSeconds = Math.floor(Date.now() / 1000),
  maxTtlSeconds = 300
} = {}) {
  const serialized = String(token);
  if (serialized.length > 16_384) {
    throw new AxiomError('invalid_capability', 'Capability token is too large', 401);
  }
  const parts = serialized.split('.');
  if (parts.length !== 3) throw new AxiomError('invalid_capability', 'Capability token is malformed', 401);
  let header;
  let payload;
  try {
    header = JSON.parse(fromB64url(parts[0]).toString('utf8'));
    payload = JSON.parse(fromB64url(parts[1]).toString('utf8'));
  } catch {
    throw new AxiomError('invalid_capability', 'Capability token payload is invalid', 401);
  }
  if (header.alg !== 'EdDSA' || header.typ !== 'AXIOM-CAP+JWT') {
    throw new AxiomError('invalid_capability', 'Capability token header is invalid', 401);
  }
  if (!verify(null, Buffer.from(`${parts[0]}.${parts[1]}`), publicKey, fromB64url(parts[2]))) {
    throw new AxiomError('invalid_capability_signature', 'Capability token signature is invalid', 401);
  }
  if (payload.aud !== audience) throw new AxiomError('invalid_capability_audience', 'Capability token audience is invalid', 403);
  if (issuer !== undefined && payload.iss !== issuer) {
    throw new AxiomError('invalid_capability_issuer', 'Capability token issuer is invalid', 403);
  }
  if (!Number.isSafeInteger(payload.nbf) || !Number.isSafeInteger(payload.exp) || payload.nbf > nowSeconds || payload.exp <= nowSeconds) {
    throw new AxiomError('expired_capability', 'Capability token is not currently valid', 401);
  }
  if (payload.exp - payload.nbf > maxTtlSeconds + 1) {
    throw new AxiomError('invalid_capability_ttl', 'Capability token lifetime exceeds the local safety limit', 401);
  }
  if (
    typeof payload.iss !== 'string'
    || typeof payload.subject !== 'string'
    || typeof payload.jti !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(payload.jti)
    || !/^[a-f0-9]{64}$/.test(payload.intent_digest ?? '')
    || !/^[a-f0-9]{64}$/.test(payload.plan_digest ?? '')
    || !/^[a-f0-9]{64}$/.test(payload.policy_digest ?? '')
    || !/^[a-z][a-z0-9.-]{1,127}$/.test(payload.tool ?? '')
    || !payload.constraints
    || typeof payload.constraints !== 'object'
    || Array.isArray(payload.constraints)
  ) {
    throw new AxiomError('invalid_capability_claims', 'Capability token is missing required claims', 401);
  }
  return payload;
}

export function safeTextEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}