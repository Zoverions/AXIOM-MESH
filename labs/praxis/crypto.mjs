// labs/praxis/crypto.mjs
//
// Key encoding helpers and digest sign/verify primitives (node:crypto only).
//
// Split from the former index.mjs monolith without behavior change;
// this module owns the section(s) listed above.

import { createPublicKey, sign as cryptoSign, verify as cryptoVerify } from 'node:crypto';
import { digestPraxis } from './canonical.mjs';

export function keyToPublicDerBase64(key) {
  if (typeof key === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(key)) return key;
  const publicKey = key?.type === 'public' ? key : createPublicKey(key);
  return publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
}

export function publicKeyFromDerBase64(value) {
  return createPublicKey({
    key: Buffer.from(value, 'base64'),
    format: 'der',
    type: 'spki'
  });
}

export function signatureBodyDigest(body) {
  return 'sha256:' + digestPraxis(body);
}

export function signDigest(digest, privateKey) {
  return cryptoSign(null, Buffer.from(digest, 'utf8'), privateKey).toString('base64');
}

export function verifyDigestSignature(digest, signature, publicKey) {
  try {
    return cryptoVerify(
      null,
      Buffer.from(digest, 'utf8'),
      publicKey,
      Buffer.from(signature, 'base64')
    );
  } catch {
    return false;
  }
}
