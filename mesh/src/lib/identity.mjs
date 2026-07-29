import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  sign,
  timingSafeEqual,
  verify
} from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { canonicalJson, sha256, AxiomError } from './canonical.mjs';
import { assertTransportPeer } from './transport-credentials.mjs';

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

export async function loadTrustedKey(dataDir, service) {
  if (!KEY_PATTERN.test(service)) throw new AxiomError('invalid_service_identity', 'Invalid service identity', 401);
  const pem = await readFile(join(dataDir, 'trust', `${service}.pub.pem`), 'utf8');
  return createPublicKey(pem);
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
    this.keyId = `${service}:${sha256(publicPem).slice(0, 16)}`;
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

export class ReplayGuard {
  constructor({ maxEntries = 10_000 } = {}) {
    this.maxEntries = maxEntries;
    this.nonces = new Map();
  }

  use(service, nonce, expiresAtMs) {
    const now = Date.now();
    for (const [key, expiry] of this.nonces) {
      if (expiry <= now) this.nonces.delete(key);
    }
    const key = `${service}:${nonce}`;
    if (this.nonces.has(key)) return false;
    if (this.nonces.size >= this.maxEntries) return false;
    this.nonces.set(key, expiresAtMs);
    return true;
  }
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
  if (!replayGuard.use(service, nonce, (timestampSeconds + clockSkewSeconds + 1) * 1000)) {
    throw new AxiomError('replayed_request', 'Service request nonce has already been used', 409);
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
