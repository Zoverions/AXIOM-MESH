import {
  createPublicKey,
  hkdfSync
} from 'node:crypto';
import {
  lstat,
  readFile,
  readdir
} from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import {
  ValidationError,
  sha256
} from './canonical.mjs';
import { verifyObjectSignature } from './identity.mjs';
import { DataProtector } from './protector.mjs';

const DATA_KEY_ROTATION_FORMAT = 'axiom-data-key-rotation.v1';
const ACTIVE_POINTER_FORMAT = 'axiom-data-key-active.v1';
const ACTIVE_POINTER_FILE = 'active-data-key-rotation.json';
const DIGEST = /^[a-f0-9]{64}$/;
const ROTATION_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const MAX_HISTORY = 64;
const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;
const MAX_KEY_ENVELOPE_BYTES = 64 * 1024;
const CREDENTIAL_STATE_KEY_FILE = 'credential-state-key.axk';

export async function loadDataProtectionKeyHistory({
  dataDir,
  currentKey
}) {
  const root = resolve(dataDir);
  let activeKey = normalizeKey(currentKey);
  const keys = [activeKey];
  let pointer = await readActiveDataKeyPointer(root);
  const seen = new Set();
  while (pointer) {
    if (keys.length > MAX_HISTORY) {
      throw new ValidationError('Data-key rotation history is too deep');
    }
    const manifestPath = resolveDataPath(root, pointer.manifest_path);
    const serialized = await readRegularFile(
      manifestPath,
      MAX_MANIFEST_BYTES
    );
    if (sha256(serialized) !== pointer.manifest_sha256) {
      throw new ValidationError('Data-key rotation history manifest digest is invalid');
    }
    const manifest = JSON.parse(serialized.toString('utf8'));
    verifyDataKeyRotationManifestAttestation(manifest);
    if (seen.has(manifest.rotation_id)) {
      throw new ValidationError('Data-key rotation history contains a cycle');
    }
    seen.add(manifest.rotation_id);
    const prior = manifest.key_history?.prior_key;
    const priorPath = join(dirname(manifestPath), prior?.name ?? '');
    const envelope = await readRegularFile(priorPath, MAX_KEY_ENVELOPE_BYTES);
    if (
      prior?.name !== 'prior-key.axk'
      || prior?.algorithm !== 'A256GCM'
      || prior?.context !== `axiom:data-key-rotation:${manifest.rotation_id}:prior-key`
      || prior?.bytes !== envelope.length
      || prior?.sha256 !== sha256(envelope)
    ) {
      throw new ValidationError('Data-key rotation prior-key envelope is invalid');
    }
    activeKey = normalizeKey(
      new DataProtector(activeKey).openBytes(
        envelope.toString('utf8'),
        prior.context
      )
    );
    keys.push(activeKey);
    pointer = manifest.previous ?? null;
  }
  return keys;
}

export async function loadCredentialStateAuthenticationKeys({
  dataDir,
  currentKey,
  verificationKeys
}) {
  const root = resolve(dataDir);
  const dataKeys = await loadDataProtectionKeyHistory({
    dataDir: root,
    currentKey
  });
  const stateKeys = dataKeys.map(deriveCredentialStateAuthenticationKey);
  const seen = new Set(stateKeys.map(key => key.toString('hex')));
  const rotationRoot = join(root, 'data-key-rotations');
  let entries;
  try {
    entries = await readdir(rotationRoot, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return stateKeys;
    throw error;
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      throw new ValidationError(
        'Data-key rotation history may not contain symbolic links'
      );
    }
    if (!entry.isDirectory() || !ROTATION_ID.test(entry.name)) continue;
    const directory = join(rotationRoot, entry.name);
    const resultPath = join(directory, 'rollback-result.json');
    let serialized;
    try {
      serialized = await readRegularFile(
        resultPath,
        MAX_MANIFEST_BYTES
      );
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    const result = parseJson(
      serialized,
      'Data-key rollback result is invalid JSON'
    );
    const descriptor = result.credential_state_authentication_key;
    if (!descriptor) continue;
    verifyCredentialStateKeyResult({
      result,
      rotationId: entry.name,
      verificationKeys
    });
    const envelope = await readRegularFile(
      join(directory, descriptor.name),
      MAX_KEY_ENVELOPE_BYTES
    );
    if (
      descriptor.name !== CREDENTIAL_STATE_KEY_FILE
      || descriptor.algorithm !== 'A256GCM'
      || descriptor.context !== (
        `axiom:data-key-rotation:${entry.name}:credential-state-key`
      )
      || descriptor.bytes !== envelope.length
      || descriptor.sha256 !== sha256(envelope)
    ) {
      throw new ValidationError(
        'Retired credential state-authentication key envelope is invalid'
      );
    }
    let retiredStatePayload;
    for (const dataKey of dataKeys) {
      try {
        retiredStatePayload = new DataProtector(dataKey).openBytes(
          envelope.toString('utf8'),
          descriptor.context
        );
        break;
      } catch {
        // A retained state key may be wrapped by any reachable data key.
      }
    }
    if (!retiredStatePayload) {
      continue;
    }
    for (const retiredStateKey of parseCredentialStateKeyHistory(
      retiredStatePayload
    )) {
      const keyId = retiredStateKey.toString('hex');
      if (!seen.has(keyId)) {
        stateKeys.push(retiredStateKey);
        seen.add(keyId);
      }
    }
  }
  return stateKeys;
}

export async function readActiveDataKeyPointer(dataDir) {
  const path = join(resolve(dataDir), ACTIVE_POINTER_FILE);
  try {
    const pointer = JSON.parse(
      (await readRegularFile(path, MAX_MANIFEST_BYTES)).toString('utf8')
    );
    validatePointer(pointer);
    return pointer;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    if (error instanceof SyntaxError) {
      throw new ValidationError('Active data-key rotation pointer is invalid JSON');
    }
    throw error;
  }
}

export function verifyDataKeyRotationManifestAttestation(manifest) {
  if (
    manifest?.format !== DATA_KEY_ROTATION_FORMAT
    || manifest?.schema_version !== 1
    || !ROTATION_ID.test(manifest.rotation_id ?? '')
    || manifest.scope?.grid_database !== true
    || manifest.scope?.recovery_databases !== true
    || manifest.scope?.protected_artifacts !== true
    || manifest.scope?.service_identities !== false
    || manifest.scope?.operator_api_token !== false
  ) {
    throw new ValidationError('Data-key rotation manifest scope is invalid');
  }
  if (manifest.previous !== null) validatePointer(manifest.previous);
  if (
    manifest.signer?.service !== 'grid'
    || typeof manifest.signer?.public_key_pem !== 'string'
    || manifest.attestation?.key_id !== manifest.signer?.key_id
    || manifest.signer.key_id !== (
      `grid:${sha256(manifest.signer.public_key_pem).slice(0, 16)}`
    )
  ) {
    throw new ValidationError('Data-key rotation signer metadata is invalid');
  }
  let publicKey;
  try {
    publicKey = createPublicKey(manifest.signer.public_key_pem);
  } catch {
    throw new ValidationError('Data-key rotation signer key is invalid');
  }
  if (publicKey.asymmetricKeyType !== 'ed25519') {
    throw new ValidationError('Data-key rotation signer is not Ed25519');
  }
  const unsigned = structuredClone(manifest);
  delete unsigned.attestation;
  if (!verifyObjectSignature(unsigned, manifest.attestation, publicKey)) {
    throw new ValidationError('Data-key rotation manifest attestation is invalid');
  }
  return {
    valid: true,
    rotation_id: manifest.rotation_id
  };
}

function verifyCredentialStateKeyResult({
  result,
  rotationId,
  verificationKeys
}) {
  if (
    result?.format !== 'axiom-data-key-rollback-result.v1'
    || result?.schema_version !== 1
    || result.rotation_id !== rotationId
    || result.rotation_applied !== true
    || result.signer?.service !== 'grid'
    || typeof result.signer?.public_key_pem !== 'string'
    || result.attestation?.key_id !== result.signer?.key_id
  ) {
    throw new ValidationError(
      'Data-key rollback credential-state result is invalid'
    );
  }
  let publicKey;
  try {
    publicKey = createPublicKey(result.signer.public_key_pem);
  } catch {
    throw new ValidationError(
      'Data-key rollback credential-state signer is invalid'
    );
  }
  const trusted = verificationKeys?.get?.(result.signer.key_id);
  if (
    publicKey.asymmetricKeyType !== 'ed25519'
    || !trusted
    || !Buffer.from(trusted.export({
      type: 'spki',
      format: 'der'
    })).equals(Buffer.from(publicKey.export({
      type: 'spki',
      format: 'der'
    })))
  ) {
    throw new ValidationError(
      'Data-key rollback credential-state signer is untrusted'
    );
  }
  const unsigned = structuredClone(result);
  delete unsigned.attestation;
  if (!verifyObjectSignature(unsigned, result.attestation, publicKey)) {
    throw new ValidationError(
      'Data-key rollback credential-state attestation is invalid'
    );
  }
}

function deriveCredentialStateAuthenticationKey(key) {
  return Buffer.from(hkdfSync(
    'sha256',
    key,
    Buffer.from('axiom-credential-rotation.v1', 'utf8'),
    Buffer.from('manifest-target-authentication', 'utf8'),
    32
  ));
}

function parseJson(serialized, message) {
  try {
    return JSON.parse(serialized.toString('utf8'));
  } catch {
    throw new ValidationError(message);
  }
}

function parseCredentialStateKeyHistory(serialized) {
  const payload = parseJson(
    serialized,
    'Retired credential state-authentication key history is invalid JSON'
  );
  if (
    payload?.format !== 'axiom-credential-state-key-history.v1'
    || !Array.isArray(payload.keys_base64url)
    || payload.keys_base64url.length < 1
    || payload.keys_base64url.length > 256
  ) {
    throw new ValidationError(
      'Retired credential state-authentication key history is invalid'
    );
  }
  const unique = new Set();
  return payload.keys_base64url.map(encoded => {
    if (typeof encoded !== 'string') {
      throw new ValidationError(
        'Retired credential state-authentication key entry is invalid'
      );
    }
    const key = Buffer.from(encoded, 'base64url');
    if (
      key.length !== 32
      || key.toString('base64url') !== encoded
      || unique.has(encoded)
    ) {
      throw new ValidationError(
        'Retired credential state-authentication key entry is invalid'
      );
    }
    unique.add(encoded);
    return key;
  });
}

function validatePointer(pointer) {
  if (
    !pointer
    || pointer.format !== ACTIVE_POINTER_FORMAT
    || typeof pointer.manifest_path !== 'string'
    || pointer.manifest_path.length < 1
    || pointer.manifest_path.length > 1000
    || pointer.manifest_path.includes('\\')
    || isAbsolute(pointer.manifest_path)
    || pointer.manifest_path.split('/').includes('..')
    || !DIGEST.test(pointer.manifest_sha256 ?? '')
  ) {
    throw new ValidationError('Active data-key rotation pointer is invalid');
  }
}

function resolveDataPath(dataDir, portablePath) {
  const path = resolve(dataDir, ...portablePath.split('/'));
  const child = relative(dataDir, path);
  if (child === '' || child.startsWith('..') || isAbsolute(child)) {
    throw new ValidationError('Data-key rotation history path escapes its data directory');
  }
  return path;
}

function normalizeKey(value) {
  const key = Buffer.from(value);
  if (key.length !== 32) {
    throw new ValidationError('Data-protection key must contain exactly 32 bytes');
  }
  return key;
}

async function readRegularFile(path, maxBytes) {
  const stat = await lstat(path);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new ValidationError('Data-key rotation history input must be a regular file');
  }
  if (stat.size < 1 || stat.size > maxBytes) {
    throw new ValidationError('Data-key rotation history input has an invalid size');
  }
  return readFile(path);
}

export {
  ACTIVE_POINTER_FILE,
  ACTIVE_POINTER_FORMAT,
  CREDENTIAL_STATE_KEY_FILE,
  DATA_KEY_ROTATION_FORMAT
};
