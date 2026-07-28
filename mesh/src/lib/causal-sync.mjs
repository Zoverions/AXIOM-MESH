import { createPublicKey, verify } from 'node:crypto';
import {
  ValidationError,
  assertPlainObject,
  assertString,
  assertStringArray,
  canonicalJson,
  digestObject,
  sha256
} from './canonical.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const NAME = /^[a-z][a-z0-9.-]{0,127}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const MAX_UPDATE_BYTES = 262_144;
const MAX_BUNDLE_BYTES = 900_000;

export function verifyCausalUpdate(input, {
  expectedOwner,
  expectedNodeId,
  expectedPublicKeyDigest,
  requireNotFuture = true,
  now = Date.now()
} = {}) {
  const value = assertPlainObject(input, 'causal update');
  const operation = assertString(value.operation, 'operation', {
    max: 16,
    pattern: /^(put|delete)$/
  });
  const payload = operation === 'put'
    ? structuredClone(assertPlainObject(value.value, 'value'))
    : null;
  if (Buffer.byteLength(canonicalJson(payload)) > MAX_UPDATE_BYTES) {
    throw new ValidationError(`Causal update value exceeds ${MAX_UPDATE_BYTES} bytes`);
  }
  const owner = assertString(value.owner, 'owner', { max: 160, pattern: ID });
  const nodeId = assertString(value.node_id, 'node_id', { max: 160, pattern: ID });
  if (expectedOwner !== undefined && owner !== expectedOwner) {
    throw new ValidationError('Causal update owner does not match the bundle owner');
  }
  if (expectedNodeId !== undefined && nodeId !== expectedNodeId) {
    throw new ValidationError('Causal update node does not match the bundle source');
  }
  const vector = normalizeVersionVector(value.vector, 'vector');
  if (!Number.isSafeInteger(vector[nodeId]) || vector[nodeId] < 1) {
    throw new ValidationError('Causal update vector must contain a positive source-node counter');
  }
  const resolves = [...new Set(assertStringArray(
    value.resolves ?? [],
    'resolves',
    { maxItems: 128, itemMax: 160 }
  ))].sort();
  if (resolves.some(item => !/^sync_[a-f0-9]{64}$/.test(item))) {
    throw new ValidationError('Causal update resolves contains an invalid update identifier');
  }
  const occurredAt = isoTimestamp(value.occurred_at, 'occurred_at', {
    requireNotFuture,
    now
  });
  const statement = {
    format: assertExact(value.format, 'axiom-causal-update.v1', 'causal update format'),
    owner,
    node_id: nodeId,
    namespace: assertString(value.namespace, 'namespace', { max: 128, pattern: NAME }),
    record_id: assertString(value.record_id, 'record_id', { max: 160, pattern: ID }),
    operation,
    value: payload,
    value_digest: assertString(value.value_digest, 'value_digest', {
      min: 64,
      max: 64,
      pattern: DIGEST
    }),
    vector,
    resolves,
    occurred_at: occurredAt,
    nonce: assertString(value.nonce, 'nonce', { max: 160, pattern: ID })
  };
  if (statement.value_digest !== digestObject(statement.value)) {
    throw new ValidationError('Causal update value digest is invalid');
  }
  const publicKey = assertString(value.public_key, 'public_key', { max: 8192 });
  const publicKeyDigest = sha256(publicKey);
  if (expectedPublicKeyDigest !== undefined && publicKeyDigest !== expectedPublicKeyDigest) {
    throw new ValidationError('Causal update public key does not match the admitted node');
  }
  const signature = assertString(value.signature, 'signature', { max: 1024 });
  verifyStatement(statement, signature, publicKey, 'Causal update');
  const updateDigest = digestObject(statement);
  return {
    statement,
    signature,
    public_key: publicKey,
    public_key_digest: publicKeyDigest,
    update_digest: updateDigest,
    update_id: `sync_${updateDigest}`,
    author_counter: vector[nodeId]
  };
}

export function verifyCausalBundle(input, {
  expectedOwner,
  expectedNodeId,
  expectedPublicKeyDigest,
  requireNotFuture = true,
  now = Date.now()
} = {}) {
  const value = assertPlainObject(input, 'causal sync bundle');
  if (Buffer.byteLength(canonicalJson(value)) > MAX_BUNDLE_BYTES) {
    throw new ValidationError(`Causal sync bundle exceeds ${MAX_BUNDLE_BYTES} bytes`);
  }
  const owner = assertString(value.owner, 'owner', { max: 160, pattern: ID });
  const sourceNodeId = assertString(value.source_node_id, 'source_node_id', {
    max: 160,
    pattern: ID
  });
  if (expectedOwner !== undefined && owner !== expectedOwner) {
    throw new ValidationError('Causal sync bundle owner does not match the authenticated principal');
  }
  if (expectedNodeId !== undefined && sourceNodeId !== expectedNodeId) {
    throw new ValidationError('Causal sync bundle source node is invalid');
  }
  const createdAt = isoTimestamp(value.created_at, 'created_at', {
    requireNotFuture,
    now
  });
  if (!Array.isArray(value.updates) || value.updates.length < 1 || value.updates.length > 128) {
    throw new ValidationError('Causal sync bundle must contain 1-128 updates');
  }
  const publicKey = assertString(value.public_key, 'public_key', { max: 8192 });
  const publicKeyDigest = sha256(publicKey);
  if (expectedPublicKeyDigest !== undefined && publicKeyDigest !== expectedPublicKeyDigest) {
    throw new ValidationError('Causal sync bundle key does not match the admitted node');
  }
  const updates = value.updates.map((update, index) => {
    const verified = verifyCausalUpdate(update, {
      expectedOwner: owner,
      expectedNodeId: sourceNodeId,
      expectedPublicKeyDigest: publicKeyDigest,
      requireNotFuture,
      now
    });
    if (verified.statement.occurred_at > createdAt) {
      throw new ValidationError(`Causal update ${index} occurred after bundle creation`);
    }
    return verified;
  });
  const updateIds = updates.map(update => update.update_id);
  if (new Set(updateIds).size !== updateIds.length) {
    throw new ValidationError('Causal sync bundle contains duplicate updates');
  }
  for (let index = 1; index < updates.length; index += 1) {
    if (updates[index].author_counter <= updates[index - 1].author_counter) {
      throw new ValidationError('Causal sync bundle source counters must increase strictly');
    }
  }
  const statement = {
    format: assertExact(value.format, 'axiom-causal-sync-bundle.v1', 'causal sync bundle format'),
    owner,
    source_node_id: sourceNodeId,
    updates: updates.map(update => ({
      ...update.statement,
      public_key: update.public_key,
      signature: update.signature
    })),
    created_at: createdAt,
    nonce: assertString(value.nonce, 'nonce', { max: 160, pattern: ID })
  };
  const signature = assertString(value.signature, 'signature', { max: 1024 });
  verifyStatement(statement, signature, publicKey, 'Causal sync bundle');
  return {
    statement,
    signature,
    public_key: publicKey,
    public_key_digest: publicKeyDigest,
    bundle_digest: digestObject(statement),
    updates
  };
}

export function normalizeVersionVector(input, name = 'version vector') {
  const value = assertPlainObject(input, name);
  const entries = Object.entries(value);
  if (entries.length < 1 || entries.length > 128) {
    throw new ValidationError(`${name} must contain 1-128 node counters`);
  }
  const output = {};
  for (const [nodeId, counter] of entries.sort(([left], [right]) => left.localeCompare(right))) {
    if (!ID.test(nodeId)) throw new ValidationError(`${name} contains an invalid node identifier`);
    if (!Number.isSafeInteger(counter) || counter < 0) {
      throw new ValidationError(`${name}.${nodeId} must be a non-negative safe integer`);
    }
    if (counter > 0) output[nodeId] = counter;
  }
  if (!Object.keys(output).length) throw new ValidationError(`${name} must contain a positive counter`);
  return output;
}

export function compareVersionVectors(leftInput, rightInput) {
  const left = normalizeVersionVector(leftInput, 'left vector');
  const right = normalizeVersionVector(rightInput, 'right vector');
  const nodes = new Set([...Object.keys(left), ...Object.keys(right)]);
  let leftGreater = false;
  let rightGreater = false;
  for (const node of nodes) {
    const leftCounter = left[node] ?? 0;
    const rightCounter = right[node] ?? 0;
    if (leftCounter > rightCounter) leftGreater = true;
    if (rightCounter > leftCounter) rightGreater = true;
  }
  if (!leftGreater && !rightGreater) return 'equal';
  if (leftGreater && !rightGreater) return 'dominates';
  if (!leftGreater && rightGreater) return 'dominated';
  return 'concurrent';
}

function verifyStatement(statement, signature, publicKeyPem, label) {
  let publicKey;
  try {
    publicKey = createPublicKey(publicKeyPem);
  } catch {
    throw new ValidationError(`${label} public key is invalid`);
  }
  if (publicKey.asymmetricKeyType !== 'ed25519') {
    throw new ValidationError(`${label} public key must use Ed25519`);
  }
  let valid = false;
  try {
    valid = verify(
      null,
      Buffer.from(canonicalJson(statement)),
      publicKey,
      Buffer.from(signature, 'base64url')
    );
  } catch {
    valid = false;
  }
  if (!valid) throw new ValidationError(`${label} signature is invalid`);
}

function isoTimestamp(value, name, { requireNotFuture, now }) {
  const raw = assertString(value, name, { max: 64 });
  const date = new Date(raw);
  if (Number.isNaN(date.valueOf()) || date.toISOString() !== raw) {
    throw new ValidationError(`${name} must be a canonical ISO timestamp`);
  }
  if (requireNotFuture && date.valueOf() > now + 300_000) {
    throw new ValidationError(`${name} is too far in the future`);
  }
  return raw;
}

function assertExact(value, expected, name) {
  if (value !== expected) throw new ValidationError(`${name} must be ${expected}`);
  return value;
}
