import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes
} from 'node:crypto';
import { ValidationError, canonicalJson, sha256 } from './canonical.mjs';

const FORMAT = 'axiom-recipient-encrypted.v1';
const ALGORITHM = 'X25519-HKDF-SHA256+A256GCM';

export function recipientKeyMetadata(publicKeyValue) {
  const publicKey = normalizePublicKey(publicKeyValue);
  const der = publicKey.export({ type: 'spki', format: 'der' });
  return {
    public_key: publicKey,
    key_id: `x25519:${sha256(der).slice(0, 32)}`
  };
}

export function encryptForRecipient(value, publicKeyValue, context) {
  const plaintext = Buffer.from(value);
  const recipient = recipientKeyMetadata(publicKeyValue);
  const ephemeral = generateKeyPairSync('x25519');
  const ephemeralDer = ephemeral.publicKey.export({ type: 'spki', format: 'der' });
  const salt = randomBytes(32);
  const nonce = randomBytes(12);
  const header = {
    format: FORMAT,
    algorithm: ALGORITHM,
    context: assertContext(context),
    recipient_key_id: recipient.key_id,
    ephemeral_public_key: ephemeralDer.toString('base64url'),
    salt: salt.toString('base64url'),
    nonce: nonce.toString('base64url')
  };
  const key = deriveKey(
    diffieHellman({ privateKey: ephemeral.privateKey, publicKey: recipient.public_key }),
    salt,
    header.context
  );
  const cipher = createCipheriv('aes-256-gcm', key, nonce, { authTagLength: 16 });
  cipher.setAAD(Buffer.from(canonicalJson(header)));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    ...header,
    ciphertext: ciphertext.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url')
  };
}

export function decryptFromRecipient(envelopeValue, privateKeyValue, context) {
  const envelope = typeof envelopeValue === 'string'
    ? parseJson(envelopeValue)
    : structuredClone(envelopeValue);
  if (envelope?.format !== FORMAT || envelope.algorithm !== ALGORITHM) {
    throw new ValidationError('Recipient-encrypted envelope format is unsupported');
  }
  if (envelope.context !== assertContext(context)) {
    throw new ValidationError('Recipient-encrypted envelope context does not match');
  }
  const privateKey = normalizePrivateKey(privateKeyValue);
  const recipient = recipientKeyMetadata(createPublicKey(privateKey));
  if (recipient.key_id !== envelope.recipient_key_id) {
    throw new ValidationError('Recipient private key does not match the encrypted export');
  }
  let ephemeralPublicKey;
  try {
    ephemeralPublicKey = createPublicKey({
      key: Buffer.from(envelope.ephemeral_public_key, 'base64url'),
      type: 'spki',
      format: 'der'
    });
  } catch {
    throw new ValidationError('Encrypted export ephemeral public key is invalid');
  }
  if (ephemeralPublicKey.asymmetricKeyType !== 'x25519') {
    throw new ValidationError('Encrypted export ephemeral key must use X25519');
  }
  const salt = decodeExact(envelope.salt, 32, 'salt');
  const nonce = decodeExact(envelope.nonce, 12, 'nonce');
  const tag = decodeExact(envelope.tag, 16, 'authentication tag');
  const ciphertext = decodeBase64Url(envelope.ciphertext, 'ciphertext');
  const header = structuredClone(envelope);
  delete header.ciphertext;
  delete header.tag;
  const key = deriveKey(
    diffieHellman({ privateKey, publicKey: ephemeralPublicKey }),
    salt,
    envelope.context
  );
  let plaintext;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, nonce, { authTagLength: 16 });
    decipher.setAAD(Buffer.from(canonicalJson(header)));
    decipher.setAuthTag(tag);
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new ValidationError('Recipient-encrypted export authentication failed');
  }
  return plaintext;
}

function normalizePublicKey(value) {
  let key;
  try {
    key = value?.type === 'public' ? value : createPublicKey(value);
  } catch {
    throw new ValidationError('Recipient public key is invalid');
  }
  if (key.asymmetricKeyType !== 'x25519') {
    throw new ValidationError('Recipient public key must use X25519');
  }
  return key;
}

function normalizePrivateKey(value) {
  let key;
  try {
    key = value?.type === 'private' ? value : createPrivateKey(value);
  } catch {
    throw new ValidationError('Recipient private key is invalid');
  }
  if (key.asymmetricKeyType !== 'x25519') {
    throw new ValidationError('Recipient private key must use X25519');
  }
  return key;
}

function deriveKey(sharedSecret, salt, context) {
  return Buffer.from(hkdfSync(
    'sha256',
    sharedSecret,
    salt,
    Buffer.from(`AXIOM-MESH export recipient encryption\n${context}`),
    32
  ));
}

function decodeExact(value, length, name) {
  const decoded = decodeBase64Url(value, name);
  if (decoded.length !== length) throw new ValidationError(`Encrypted export ${name} is invalid`);
  return decoded;
}

function decodeBase64Url(value, name) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]*$/.test(value)) {
    throw new ValidationError(`Encrypted export ${name} is invalid`);
  }
  return Buffer.from(value, 'base64url');
}

function assertContext(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 512) {
    throw new ValidationError('Recipient-encryption context is invalid');
  }
  return value;
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    throw new ValidationError('Recipient-encrypted envelope is not valid JSON');
  }
}

export { FORMAT as RECIPIENT_ENCRYPTION_FORMAT };
