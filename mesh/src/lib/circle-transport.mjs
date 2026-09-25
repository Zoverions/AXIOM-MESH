import { randomBytes, sign } from 'node:crypto';
import { request as httpRequest, createServer as createHttpServer } from 'node:http';
import { request as httpsRequest, createServer as createHttpsServer } from 'node:https';
import { canonicalJson, digestObject, sha256, ValidationError } from './canonical.mjs';
import { verifyObjectSignature } from './identity.mjs';
import { circleKeyId } from './circle-keys.mjs';
import { CIRCLE_BUNDLE_MAX_BYTES } from './circle-exchange.mjs';

/**
 * Circle exchange over the network. Laboratory transport, off by default.
 *
 * circle-exchange.mjs defines what replicas exchange (heads and bounded
 * bundles of self-verifying updates) but opens no connection. This module
 * carries that protocol between members' own nodes over HTTPS:
 *
 * - pull: a member sends its heads; the node answers with the bundle of what
 *   the member lacks, and its own heads.
 * - offer: a member sends a bundle of what the node lacks (computed from the
 *   node's heads), so a member whose node accepts no connections can still
 *   publish its updates.
 *
 * Who may read or write is decided by the Circle itself. Every request is
 * signed with a Circle key, and the node answers only a key that, in its own
 * view at the time of the request, the Circle established and still holds
 * active, for a member in standing or for someone endorsed to join who has
 * not joined yet (their acceptance lives in their own log, so they must be
 * able to publish it). Former members, revoked or rotated keys and
 * strangers are refused. A request binds the Circle's genesis, the operation, the exact
 * payload digest, a time within two minutes of the node's clock and a fresh
 * nonce, so it cannot be replayed, redirected to another Circle, or reused
 * as the other operation. The signature is checked against the announced
 * key before the (costlier) view is derived, and before the nonce is
 * recorded, so unauthenticated requests cost little and burn no nonces.
 *
 * Every answer carries a node statement signed with the serving member's
 * Circle key. It binds the Circle, the operation, the exact request and the
 * exact answer (bundle or summary, and the node's heads) and the time. The
 * updates themselves are verified on receipt (circle-exchange.mjs), so a
 * node cannot forge them; the statement makes what a node chose to serve
 * attributable, so withholding leaves signed evidence rather than silence.
 * A caller checks the bindings before applying an answer and the signature
 * after (the bundle may carry the node's own key endorsement); an answer
 * signed by a key the caller still cannot place is kept as unattributed.
 * TLS authenticates the node's origin.
 *
 * Each Circle key has a request budget (a token bucket), checked after
 * authentication, so one member cannot monopolize a node and strangers
 * cannot spend members' budgets.
 *
 * Nothing here grants authority or executes an effect. Nothing starts this
 * transport: the circle-peer command requires an explicit configuration
 * with `enabled: true`.
 */

export const CIRCLE_SYNC_REQUEST_SCHEMA = 'axiom-circle-sync-request.v0';
export const CIRCLE_SYNC_RESPONSE_SCHEMA = 'axiom-circle-sync-response.v0';
export const CIRCLE_SYNC_RECEIPT_SCHEMA = 'axiom-circle-sync-receipt.v0';
export const CIRCLE_NODE_STATEMENT_SCHEMA = 'axiom-circle-node-statement.v0';
export const CIRCLE_PULL_PATH = '/circle/v0/pull';
export const CIRCLE_OFFER_PATH = '/circle/v0/offer';
export const CIRCLE_SYNC_CLOCK_SKEW_MS = 120_000;
// An offer carries one bundle (at most about 900 KB) and its envelope.
export const CIRCLE_SYNC_MAX_REQUEST_BYTES = CIRCLE_BUNDLE_MAX_BYTES + 256 * 1024;
// A pull response carries one bundle and the node's heads.
export const CIRCLE_SYNC_MAX_RESPONSE_BYTES = CIRCLE_BUNDLE_MAX_BYTES + 1024 * 1024;
const MAX_ROUNDS = 64;
const REQUEST_TIMEOUT_MS = 15_000;
const OPERATIONS = Object.freeze({ pull: CIRCLE_PULL_PATH, offer: CIRCLE_OFFER_PATH });
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const NONCE = /^[A-Za-z0-9_-]{22,64}$/;

export class CircleTransportError extends ValidationError {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/** Signs a pull (payload: the member's heads) or an offer (payload: a bundle). */
export function createCircleSyncRequest({
  genesisDigest,
  operation,
  payload,
  principalId,
  privateKey,
  now = Date.now(),
  nonce = randomBytes(18).toString('base64url')
}) {
  if (!OPERATIONS[operation]) throw new ValidationError('Circle sync operation is invalid');
  const body = Object.freeze({
    schema: CIRCLE_SYNC_REQUEST_SCHEMA,
    genesis_digest: genesisDigest,
    operation,
    principal_id: principalId,
    key_id: circleKeyId(privateKey),
    issued_at: new Date(now).toISOString(),
    nonce,
    payload_digest: digestObject(payload)
  });
  validateRequestBody(body);
  return Object.freeze({ request: signed(body, privateKey), payload });
}

function signed(body, privateKey) {
  const canonical = canonicalJson(body);
  return Object.freeze({
    body,
    attestation: Object.freeze({
      algorithm: 'Ed25519',
      digest: sha256(canonical),
      signature: sign(null, Buffer.from(canonical), privateKey).toString('base64url')
    })
  });
}

/**
 * A per-key token bucket: `capacity` requests at once, refilled at
 * `refillPerSecond`. At most `maxKeys` buckets are held; a new key beyond
 * that first evicts a full (idle) bucket, and is refused if none is full.
 */
export class CircleRateLimiter {
  constructor({ capacity = 120, refillPerSecond = 2, maxKeys = 4096 } = {}) {
    this.capacity = capacity;
    this.refillPerMs = refillPerSecond / 1000;
    this.maxKeys = maxKeys;
    this.buckets = new Map();
  }

  take(key, now) {
    let bucket = this.buckets.get(key);
    if (bucket) {
      bucket.tokens = Math.min(this.capacity, bucket.tokens + (now - bucket.at) * this.refillPerMs);
      bucket.at = now;
    } else {
      if (this.buckets.size >= this.maxKeys && !this.evictIdle(now)) return false;
      bucket = { tokens: this.capacity, at: now };
      this.buckets.set(key, bucket);
    }
    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  }

  evictIdle(now) {
    for (const [key, bucket] of this.buckets) {
      if (bucket.tokens + (now - bucket.at) * this.refillPerMs >= this.capacity) {
        this.buckets.delete(key);
        return true;
      }
    }
    return false;
  }
}

/**
 * Answers one request against `replica`. Returns { status, body } and never
 * throws for a bad request. `replayGuard` is an identity.mjs ReplayGuard;
 * `onChange` is awaited after an offer adds anything, before the answer.
 */
export async function handleCircleSyncRequest(replica, operation, message, {
  now = Date.now(),
  replayGuard,
  rateLimiter = null,
  signer,
  onChange = async () => {}
} = {}) {
  if (!signer?.principalId || !signer?.privateKey) throw new Error('Circle sync answers require a signer');
  try {
    const { body, payload } = authenticate(replica, operation, message, { now, replayGuard, rateLimiter });
    const answerWith = answerBody => answer(200, withStatement(answerBody, { signer, requestBody: body, now }));
    if (body.operation === 'pull') {
      let bundle;
      try {
        bundle = replica.updatesFor(payload);
      } catch (error) {
        if (!(error instanceof ValidationError)) throw error;
        throw new CircleTransportError('malformed', error.message, 400);
      }
      return answerWith({
        schema: CIRCLE_SYNC_RESPONSE_SCHEMA,
        genesis_digest: replica.genesisDigest,
        bundle,
        heads: replica.heads()
      });
    }
    let summary;
    try {
      summary = replica.receiveBundle(payload);
    } catch (error) {
      if (!(error instanceof ValidationError)) throw error;
      throw new CircleTransportError('malformed', error.message, 400);
    }
    if (summary.accepted || summary.equivocation || summary.pending) await onChange();
    return answerWith({
      schema: CIRCLE_SYNC_RECEIPT_SCHEMA,
      genesis_digest: replica.genesisDigest,
      summary,
      heads: replica.heads()
    });
  } catch (error) {
    if (error instanceof CircleTransportError) {
      return answer(error.status, { error: { code: error.code, message: error.message } });
    }
    throw error;
  }
}

function authenticate(replica, operation, message, { now, replayGuard, rateLimiter }) {
  if (!replayGuard) throw new Error('Circle sync requires a replay guard');
  if (!OPERATIONS[operation]) throw new CircleTransportError('not_found', 'Unknown Circle sync operation', 404);
  if (!isPlainObject(message) || !sameKeys(message, ['request', 'payload'])) {
    throw new CircleTransportError('malformed', 'Circle sync request is malformed', 400);
  }
  const { request, payload } = message;
  if (!isPlainObject(request) || !sameKeys(request, ['body', 'attestation'])) {
    throw new CircleTransportError('malformed', 'Circle sync request is malformed', 400);
  }
  let body;
  try {
    body = validateRequestBody(request.body);
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    throw new CircleTransportError('malformed', error.message, 400);
  }
  if (body.genesis_digest !== replica.genesisDigest) {
    throw new CircleTransportError('unknown_circle', 'This node does not hold that Circle', 404);
  }
  if (body.operation !== operation) {
    throw new CircleTransportError('wrong_operation', 'Circle sync request was signed for another operation', 400);
  }
  const issuedAt = Date.parse(body.issued_at);
  if (Math.abs(now - issuedAt) > CIRCLE_SYNC_CLOCK_SKEW_MS) {
    throw new CircleTransportError('stale', 'Circle sync request time is outside the allowed skew', 401);
  }
  if (digestObject(payload ?? null) !== body.payload_digest) {
    throw new CircleTransportError('payload_mismatch', 'Circle sync payload does not match its signed digest', 401);
  }
  // Cheap check first: the signature against the key the replica has seen
  // announced for this principal.
  const announced = replica.announcedKey(body.principal_id, body.key_id);
  if (!announced || !verifies(body, request.attestation, announced)) {
    throw new CircleTransportError('unauthenticated', 'Circle sync request signature is not valid for a known key', 401);
  }
  // Then the Circle's own rule: an active key of a member in standing now.
  const member = replica.memberKey({ keyId: body.key_id, asOf: new Date(now).toISOString() });
  if (!member || member.principal_id !== body.principal_id) {
    throw new CircleTransportError('not_a_member', 'Only an active key of a member in standing, or of someone endorsed to join, may sync this Circle', 403);
  }
  // The budget is spent only by authenticated members, before the nonce is
  // recorded, so a refused request can be retried with the same nonce.
  if (rateLimiter && !rateLimiter.take(`${replica.genesisDigest}:${body.key_id}`, now)) {
    throw new CircleTransportError('rate_limited', 'Circle sync request budget for this key is spent; retry later', 429);
  }
  const admitted = replayGuard.admit(
    `circle:${replica.genesisDigest}`,
    body.nonce,
    issuedAt + CIRCLE_SYNC_CLOCK_SKEW_MS,
    now
  );
  if (admitted === 'replayed') throw new CircleTransportError('replayed', 'Circle sync request was already used', 409);
  if (admitted !== 'admitted') throw new CircleTransportError('busy', 'Circle sync replay protection is saturated', 503);
  return { body, payload };
}

/**
 * Brings `replica` and one peer node up to date: pulls until the node's
 * bundle is complete, then offers what the node lacks until it has it all.
 * `send(path, message)` delivers one request and resolves to the parsed
 * answer (see httpCircleSender). Stops, rather than looping, when a round
 * makes no progress.
 */
export async function syncCirclePeer({
  replica,
  principalId,
  privateKey,
  send,
  now = () => Date.now(),
  maxRounds = MAX_ROUNDS
}) {
  const pulled = { accepted: 0, duplicate: 0, pending: 0, equivocation: 0, rejected: 0 };
  const offered = { accepted: 0, duplicate: 0, pending: 0, equivocation: 0, rejected: 0 };
  const statements = { verified: 0, unattributed: 0 };
  let lastStatement = null;
  const record = checked => {
    statements[checked.status] += 1;
    if (checked.status === 'verified') lastStatement = checked.statement;
  };
  let rounds = 0;
  let nodeHeads = null;
  for (;;) {
    if (++rounds > maxRounds) throw new ValidationError('Circle sync exceeded its round limit');
    const heads = replica.heads();
    const request = createCircleSyncRequest({
      genesisDigest: replica.genesisDigest, operation: 'pull', payload: heads, principalId, privateKey, now: now()
    });
    const response = await send(CIRCLE_PULL_PATH, request);
    assertAnswer(response, CIRCLE_SYNC_RESPONSE_SCHEMA, replica.genesisDigest, ['bundle', 'heads']);
    // Bindings before the answer is used; the signature after, since the
    // bundle may introduce the node's own key.
    checkStatementBindings(response, request.request.body);
    const summary = replica.receiveBundle(response.bundle);
    record(checkStatementSignature(replica, response));
    add(pulled, summary);
    nodeHeads = response.heads;
    if (summary.complete) break;
    if (!learned(summary)) throw new ValidationError('Circle sync pull made no progress');
  }
  for (;;) {
    let bundle;
    try {
      bundle = replica.updatesFor(nodeHeads);
    } catch (error) {
      if (!(error instanceof ValidationError)) throw error;
      throw new ValidationError(`Circle node heads are invalid: ${error.message}`);
    }
    if (!bundle.updates.length) break;
    if (++rounds > maxRounds) throw new ValidationError('Circle sync exceeded its round limit');
    const request = createCircleSyncRequest({
      genesisDigest: replica.genesisDigest, operation: 'offer', payload: bundle, principalId, privateKey, now: now()
    });
    const receipt = await send(CIRCLE_OFFER_PATH, request);
    assertAnswer(receipt, CIRCLE_SYNC_RECEIPT_SCHEMA, replica.genesisDigest, ['summary', 'heads']);
    checkStatementBindings(receipt, request.request.body);
    record(checkStatementSignature(replica, receipt));
    add(offered, receipt.summary);
    nodeHeads = receipt.heads;
    if (bundle.complete) break;
    if (!learned(receipt.summary)) throw new ValidationError('Circle sync offer made no progress');
  }
  return Object.freeze({
    rounds,
    pulled: Object.freeze(pulled),
    offered: Object.freeze(offered),
    statements: Object.freeze(statements),
    last_statement: lastStatement
  });
}

/**
 * An HTTPS sender for syncCirclePeer. `ca` pins a private CA (a member's own
 * node rarely has a public certificate); `servername` names the identity
 * the certificate must carry when the origin is an address. Plain HTTP is
 * accepted only for a loopback origin with allowInsecureLoopback, which the
 * circle-peer command never sets.
 */
export function httpCircleSender({ origin, ca, servername, allowInsecureLoopback = false, timeoutMs = REQUEST_TIMEOUT_MS }) {
  const base = circlePeerOrigin(origin, { allowInsecureLoopback });
  const secure = base.protocol === 'https:';
  return (path, message) => new Promise((resolve, reject) => {
    const payload = Buffer.from(JSON.stringify(message));
    if (payload.length > CIRCLE_SYNC_MAX_REQUEST_BYTES) {
      reject(new ValidationError('Circle sync request exceeds the byte limit'));
      return;
    }
    const target = new URL(path, base);
    const request = (secure ? httpsRequest : httpRequest)(target, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': payload.length },
      timeout: timeoutMs,
      ...(secure ? { ca, servername, rejectUnauthorized: true } : {})
    }, response => {
      const chunks = [];
      let bytes = 0;
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > CIRCLE_SYNC_MAX_RESPONSE_BYTES) {
          response.destroy(new ValidationError('Circle sync response exceeds the byte limit'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => {
        let parsed;
        try {
          parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          reject(new ValidationError('Circle sync response is not JSON'));
          return;
        }
        if (response.statusCode !== 200) {
          const code = typeof parsed?.error?.code === 'string' ? parsed.error.code : 'error';
          reject(new CircleTransportError(code, `Circle node refused the request: ${code}`, response.statusCode));
          return;
        }
        resolve(parsed);
      });
    });
    request.on('timeout', () => request.destroy(new ValidationError('Circle sync request timed out')));
    request.on('error', reject);
    request.end(payload);
  });
}

/**
 * The listening side. With `tls` ({ key, cert }) it serves HTTPS; plain HTTP
 * only with allowInsecureLoopback, for tests. Requests for one Circle are
 * answered one at a time, so an offer's persistence completes before the
 * next request reads the replica.
 */
export function createCircleSyncServer({
  replica,
  replayGuard,
  signer,
  rateLimiter = new CircleRateLimiter(),
  onChange,
  tls = null,
  allowInsecureLoopback = false,
  now = () => Date.now()
}) {
  if (!tls && !allowInsecureLoopback) throw new ValidationError('Circle sync server requires TLS');
  let queue = Promise.resolve();
  const handler = (request, response) => {
    const reply = (status, body) => {
      const serialized = Buffer.from(JSON.stringify(body));
      response.writeHead(status, {
        'content-type': 'application/json',
        'content-length': serialized.length,
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff'
      });
      response.end(serialized);
    };
    const operation = Object.keys(OPERATIONS).find(key => OPERATIONS[key] === request.url);
    if (!operation) return reply(404, { error: { code: 'not_found', message: 'Not found' } });
    if (request.method !== 'POST') return reply(405, { error: { code: 'method_not_allowed', message: 'POST only' } });
    if (!/^application\/json(;|$)/.test(request.headers['content-type'] ?? '')) {
      return reply(415, { error: { code: 'unsupported_media_type', message: 'JSON only' } });
    }
    const declared = Number(request.headers['content-length']);
    if (Number.isFinite(declared) && declared > CIRCLE_SYNC_MAX_REQUEST_BYTES) {
      request.resume();
      return reply(413, { error: { code: 'too_large', message: 'Request exceeds the byte limit' } });
    }
    const chunks = [];
    let bytes = 0;
    let tooLarge = false;
    request.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > CIRCLE_SYNC_MAX_REQUEST_BYTES) tooLarge = true;
      else chunks.push(chunk);
    });
    request.on('end', () => {
      if (tooLarge) return reply(413, { error: { code: 'too_large', message: 'Request exceeds the byte limit' } });
      let message;
      try {
        message = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        return reply(400, { error: { code: 'malformed', message: 'Request is not JSON' } });
      }
      queue = queue
        .then(() => handleCircleSyncRequest(replica, operation, message, { now: now(), replayGuard, rateLimiter, signer, onChange }))
        .then(
          result => reply(result.status, result.body),
          () => reply(500, { error: { code: 'internal', message: 'Circle sync failed' } })
        );
    });
  };
  return tls ? createHttpsServer({ key: tls.key, cert: tls.cert, minVersion: 'TLSv1.3' }, handler) : createHttpServer(handler);
}

/** An exact https origin; loopback http only when allowed. */
export function circlePeerOrigin(value, { allowInsecureLoopback = false } = {}) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new ValidationError('Circle peer origin is invalid');
  }
  if (url.origin !== value || url.username || url.password) {
    throw new ValidationError('Circle peer origin must be an exact origin');
  }
  const loopback = ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && allowInsecureLoopback && loopback)) {
    throw new ValidationError('Circle peer origin must use HTTPS');
  }
  return url;
}

function validateRequestBody(body) {
  if (!isPlainObject(body) || !sameKeys(body, [
    'schema', 'genesis_digest', 'operation', 'principal_id', 'key_id', 'issued_at', 'nonce', 'payload_digest'
  ])) throw new ValidationError('Circle sync request body is malformed');
  if (
    body.schema !== CIRCLE_SYNC_REQUEST_SCHEMA
    || !DIGEST.test(body.genesis_digest ?? '')
    || !OPERATIONS[body.operation]
    || !IDENTIFIER.test(body.principal_id ?? '')
    || !DIGEST.test(body.key_id ?? '')
    || typeof body.issued_at !== 'string'
    || Number.isNaN(Date.parse(body.issued_at))
    || new Date(body.issued_at).toISOString() !== body.issued_at
    || !NONCE.test(body.nonce ?? '')
    || !DIGEST.test(body.payload_digest ?? '')
  ) throw new ValidationError('Circle sync request body is invalid');
  return body;
}

function withStatement(answerBody, { signer, requestBody, now }) {
  const body = Object.freeze({
    schema: CIRCLE_NODE_STATEMENT_SCHEMA,
    genesis_digest: answerBody.genesis_digest,
    operation: requestBody.operation,
    principal_id: signer.principalId,
    key_id: circleKeyId(signer.privateKey),
    request_digest: digestObject(requestBody),
    answer_digest: digestObject(answerBody),
    issued_at: new Date(now).toISOString()
  });
  return Object.freeze({ ...answerBody, statement: signed(body, signer.privateKey) });
}

// The statement must describe exactly this request and this answer.
function checkStatementBindings(answerBody, requestBody) {
  const { statement, ...rest } = answerBody;
  const body = statement?.body;
  if (
    !isPlainObject(statement)
    || !sameKeys(statement, ['body', 'attestation'])
    || !isPlainObject(body)
    || !sameKeys(body, ['schema', 'genesis_digest', 'operation', 'principal_id', 'key_id', 'request_digest', 'answer_digest', 'issued_at'])
    || body.schema !== CIRCLE_NODE_STATEMENT_SCHEMA
    || !IDENTIFIER.test(body.principal_id ?? '')
    || !DIGEST.test(body.key_id ?? '')
    || typeof body.issued_at !== 'string'
    || Number.isNaN(Date.parse(body.issued_at))
  ) throw new ValidationError('Circle node statement is malformed');
  if (
    body.genesis_digest !== requestBody.genesis_digest
    || body.operation !== requestBody.operation
    || body.request_digest !== digestObject(requestBody)
    || body.answer_digest !== digestObject(rest)
  ) throw new ValidationError('Circle node statement does not match this request and answer');
}

// Verified against the key the replica knows for the node's principal; a
// key the replica cannot place yet leaves the answer unattributed.
function checkStatementSignature(replica, answerBody) {
  const { body, attestation } = answerBody.statement;
  const key = replica.announcedKey(body.principal_id, body.key_id);
  if (!key) return { status: 'unattributed', statement: answerBody.statement };
  if (!verifies(body, attestation, key)) throw new ValidationError('Circle node statement signature is invalid');
  return { status: 'verified', statement: answerBody.statement };
}

function assertAnswer(answerBody, schema, genesisDigest, fields) {
  if (
    !isPlainObject(answerBody)
    || !sameKeys(answerBody, ['schema', 'genesis_digest', ...fields, 'statement'])
    || answerBody.schema !== schema
    || answerBody.genesis_digest !== genesisDigest
  ) throw new ValidationError('Circle node answer is invalid');
}

function verifies(body, attestation, publicKey) {
  try {
    return verifyObjectSignature(body, attestation, publicKey);
  } catch {
    return false;
  }
}

function add(total, summary) {
  for (const key of ['accepted', 'duplicate', 'pending', 'equivocation']) {
    total[key] += Number.isSafeInteger(summary?.[key]) ? summary[key] : 0;
  }
  total.rejected += Array.isArray(summary?.rejected) ? summary.rejected.length : 0;
}

function learned(summary) {
  return Boolean(summary?.accepted || summary?.equivocation || summary?.pending);
}

function answer(status, body) {
  return Object.freeze({ status, body });
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function sameKeys(value, keys) {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
