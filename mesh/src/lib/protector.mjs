import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { canonicalJson, ValidationError } from './canonical.mjs';

const FORMAT = 'axiom-protected.v1';
const BYTES_FORMAT = 'axiom-protected-bytes.v1';

export class DataProtector {
  constructor(key) {
    this.key = normalizeKey(key);
  }

  seal(value, context) {
    return this.#sealBuffer(Buffer.from(canonicalJson(value)), context, FORMAT);
  }

  sealBytes(value, context) {
    if (!Buffer.isBuffer(value) && !(value instanceof Uint8Array)) {
      throw new ValidationError('Protected bytes must be a Buffer or Uint8Array');
    }
    return this.#sealBuffer(Buffer.from(value), context, BYTES_FORMAT);
  }

  open(serialized, context, { allowPlaintext = false } = {}) {
    let envelope;
    try {
      envelope = JSON.parse(serialized);
    } catch {
      throw new ValidationError('Protected value is not valid JSON');
    }
    if (envelope?.format !== FORMAT) {
      if (allowPlaintext) return envelope;
      throw new ValidationError('Protected value is stored in an unsupported format');
    }
    return JSON.parse(this.#openBuffer(envelope, context, FORMAT).toString('utf8'));
  }

  openBytes(serialized, context) {
    let envelope;
    try {
      envelope = typeof serialized === 'string' ? JSON.parse(serialized) : serialized;
    } catch {
      throw new ValidationError('Protected bytes are not valid JSON');
    }
    return this.#openBuffer(envelope, context, BYTES_FORMAT);
  }

  #sealBuffer(plaintext, context, format) {
    const aad = Buffer.from(assertContext(context));
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, nonce, { authTagLength: 16 });
    cipher.setAAD(aad);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return canonicalJson({
      format,
      algorithm: 'A256GCM',
      nonce: nonce.toString('base64url'),
      ciphertext: ciphertext.toString('base64url'),
      tag: cipher.getAuthTag().toString('base64url')
    });
  }

  #openBuffer(envelope, context, format) {
    if (envelope?.format !== format) {
      throw new ValidationError('Protected value is stored in an unsupported format');
    }
    if (
      envelope.algorithm !== 'A256GCM'
      || typeof envelope.nonce !== 'string'
      || typeof envelope.ciphertext !== 'string'
      || typeof envelope.tag !== 'string'
    ) {
      throw new ValidationError('Protected value envelope is malformed');
    }
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.key,
        Buffer.from(envelope.nonce, 'base64url'),
        { authTagLength: 16 }
      );
      decipher.setAAD(Buffer.from(assertContext(context)));
      decipher.setAuthTag(Buffer.from(envelope.tag, 'base64url'));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, 'base64url')),
        decipher.final()
      ]);
      return plaintext;
    } catch {
      throw new ValidationError('Protected value authentication failed');
    }
  }

  isProtected(serialized) {
    try {
      return JSON.parse(serialized)?.format === FORMAT;
    } catch {
      return false;
    }
  }
}

export async function loadDataProtector(config) {
  const configured = process.env.AXIOM_DATA_KEY;
  const configuredPath = process.env.AXIOM_DATA_KEY_FILE;
  if (configured && configuredPath) {
    throw new ValidationError('Configure only one of AXIOM_DATA_KEY or AXIOM_DATA_KEY_FILE');
  }
  if (configured) return new DataProtector(Buffer.from(configured, 'base64url'));
  const path = configuredPath
    ? resolve(configuredPath)
    : join(config.dataDir, 'secrets', 'data-protection.key');
  try {
    if ((await stat(path)).size > 4_096) {
      throw new ValidationError('Data-protection key file exceeds the 4 KiB limit');
    }
    return new DataProtector(Buffer.from((await readFile(path, 'utf8')).trim(), 'base64url'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (!config.autoBootstrap || configuredPath) {
      throw new ValidationError(
        'AXIOM_DATA_KEY or a readable provisioned AXIOM_DATA_KEY_FILE is required when auto-bootstrap is disabled'
      );
    }
    const key = randomBytes(32);
    await atomicWrite(path, `${key.toString('base64url')}\n`, 0o600);
    return new DataProtector(key);
  }
}

function normalizeKey(value) {
  const key = Buffer.from(value);
  if (key.length !== 32) throw new ValidationError('Data-protection key must contain exactly 32 bytes');
  return key;
}

function assertContext(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 512) {
    throw new ValidationError('Data-protection context is invalid');
  }
  return value;
}

async function atomicWrite(path, content, mode) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, content, { mode, flag: 'wx' });
  await rename(temporary, path);
}
