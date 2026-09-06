import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify
} from 'node:crypto';
import { canonicalJson, sha256 } from './canonical.mjs';

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

function fromB64url(input) {
  return Buffer.from(String(input), 'base64url');
}

export function keyIdFor(service, publicKey) {
  const pem = publicKey.export({ type: 'spki', format: 'pem' });
  return `${service}:${sha256(pem).slice(0, 16)}`;
}

export function generateEd25519Identity(service = 'grid') {
  const pair = generateKeyPairSync('ed25519');
  const privatePem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' });
  const publicPem = pair.publicKey.export({ type: 'spki', format: 'pem' });
  const privateKey = createPrivateKey(privatePem);
  const publicKey = createPublicKey(publicPem);
  return {
    service,
    privatePem,
    publicPem,
    privateKey,
    publicKey,
    keyId: keyIdFor(service, publicKey)
  };
}

export function signObject(value, identity) {
  const body = canonicalJson(value);
  return {
    algorithm: 'Ed25519',
    key_id: identity.keyId,
    digest: sha256(body),
    signature: b64url(sign(null, Buffer.from(body), identity.privateKey))
  };
}

export function verifyObjectSignature(value, attestation, publicKeyInput) {
  if (!attestation || attestation.algorithm !== 'Ed25519') return false;
  if (typeof attestation.signature !== 'string' || typeof attestation.digest !== 'string') {
    return false;
  }
  const publicKey = typeof publicKeyInput === 'string' || Buffer.isBuffer(publicKeyInput)
    ? createPublicKey(publicKeyInput)
    : publicKeyInput;
  const body = canonicalJson(value);
  if (attestation.digest !== sha256(body)) return false;
  try {
    return verify(null, Buffer.from(body), publicKey, fromB64url(attestation.signature));
  } catch {
    return false;
  }
}

export function loadPublicKey(publicKeyPem) {
  return createPublicKey(publicKeyPem);
}
