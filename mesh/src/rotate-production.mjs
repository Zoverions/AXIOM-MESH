import {
  createHmac,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  hkdfSync,
  randomBytes
} from 'node:crypto';
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile
} from 'node:fs/promises';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve
} from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ValidationError,
  canonicalJson,
  digestObject,
  sha256
} from './lib/canonical.mjs';
import {
  MeshIdentity,
  verifyObjectSignature
} from './lib/identity.mjs';
import { DataProtector } from './lib/protector.mjs';
import {
  acquireGridRuntimeLock,
  recoverStaleGridRuntimeLock,
  releaseGridRuntimeLock
} from './grid/backup.mjs';

const ROTATION_FORMAT = 'axiom-credential-rotation.v1';
const ROLLBACK_FORMAT = 'axiom-credential-rollback.v1';
const ROLLBACK_RESULT_FORMAT = 'axiom-credential-rollback-result.v1';
const SERVICES = Object.freeze(['gateway', 'hypervisor', 'sandbox', 'grid']);
const ROTATION_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const MAX_CREDENTIAL_BYTES = 64 * 1024;
const MANIFEST_FILE = 'manifest.json';
const ROLLBACK_FILE = 'rollback.axr';
const FORWARD_FILE = 'forward.axr';
const ROLLBACK_RESULT_FILE = 'rollback-result.json';
const PENDING_MARKER = 'pending-credential-rotation.json';

const TARGETS = Object.freeze([
  ...SERVICES.flatMap(service => [
    {
      id: `${service}-private`,
      root: 'data',
      relative_path: `identities/${service}/private.pem`,
      mode: 0o600
    },
    {
      id: `${service}-public`,
      root: 'data',
      relative_path: `identities/${service}/public.pem`,
      mode: 0o644
    },
    {
      id: `${service}-trust`,
      root: 'data',
      relative_path: `trust/${service}.pub.pem`,
      mode: 0o644
    }
  ]),
  {
    id: 'api-token-registry',
    root: 'secret',
    relative_path: 'api-tokens.json',
    mode: 0o600
  },
  {
    id: 'operator-token',
    root: 'secret',
    relative_path: 'operator.token',
    mode: 0o600
  }
]);

export async function rotateProductionCredentials({
  dataDir,
  secretDir,
  rotationId = createRotationId()
}) {
  const roots = resolveRoots(dataDir, secretDir);
  assertRotationId(rotationId);
  const lock = await acquireGridRuntimeLock(roots.data);
  try {
    await assertNoPendingRotation(roots.data);
    const before = await readCredentialSnapshot(roots);
    const beforeState = validateCredentialSnapshot(before);
    const next = createRotatedSnapshot(before, beforeState);
    const afterState = validateCredentialSnapshot(next);
    const {
      protector,
      stateAuthenticationKey
    } = await loadRotationProtector(roots.secret);
    const rotationRoot = join(roots.data, 'credential-rotations', rotationId);
    await createRotationDirectory(rotationRoot);
    const rollbackContext = `axiom:credential-rotation:${rotationId}:rollback`;
    const rollbackPayload = rollbackPayloadFor(rotationId, before);
    const rollbackEnvelope = Buffer.from(
      `${protector.seal(rollbackPayload, rollbackContext)}\n`,
      'utf8'
    );
    const rollbackPath = join(rotationRoot, ROLLBACK_FILE);
    await writeExclusive(rollbackPath, rollbackEnvelope, 0o600);

    const signer = identityFromSnapshot(before, 'grid');
    const unsigned = {
      format: ROTATION_FORMAT,
      schema_version: 1,
      rotation_id: rotationId,
      created_at: new Date().toISOString(),
      scope: {
        service_identities: [...SERVICES],
        operator_api_token: true,
        data_protection_key: false,
        requires_stopped_runtime: true
      },
      signer: {
        service: 'grid',
        key_id: signer.keyId,
        public_key_pem: publicPemFromSnapshot(before, 'grid')
      },
      before: publicState(before, beforeState, stateAuthenticationKey),
      after: publicState(next, afterState, stateAuthenticationKey),
      rollback: {
        name: ROLLBACK_FILE,
        format: 'axiom-protected.v1',
        algorithm: 'A256GCM',
        context: rollbackContext,
        bytes: rollbackEnvelope.length,
        sha256: sha256(rollbackEnvelope)
      }
    };
    const manifest = {
      ...unsigned,
      attestation: signer.signObject(unsigned),
      successor_attestation: identityFromSnapshot(next, 'grid').signObject(unsigned)
    };
    verifyCredentialRotationManifest({ manifest, rollbackEnvelope });
    const manifestPath = join(rotationRoot, MANIFEST_FILE);
    await writeExclusive(
      manifestPath,
      Buffer.from(`${canonicalJson(manifest)}\n`, 'utf8'),
      0o600
    );

    const markerPath = join(roots.data, PENDING_MARKER);
    const marker = {
      format: ROTATION_FORMAT,
      rotation_id: rotationId,
      manifest_sha256: sha256(Buffer.from(`${canonicalJson(manifest)}\n`, 'utf8')),
      transaction: 'applying'
    };
    await writeExclusive(
      markerPath,
      Buffer.from(`${canonicalJson(marker)}\n`, 'utf8'),
      0o600
    );
    try {
      await applyCredentialSnapshot({
        roots,
        snapshot: next,
        transactionDir: join(rotationRoot, 'transaction')
      });
      const installed = await readCredentialSnapshot(roots);
      assertSnapshotMatches(installed, next, 'Rotated credential installation');
      validateCredentialSnapshot(installed);
      await rm(markerPath);
    } catch (error) {
      if (error.credentialTransactionRestored === true) {
        await rm(markerPath, { force: true });
      }
      throw error;
    }

    return {
      rotated: true,
      rotation_id: rotationId,
      manifest_path: manifestPath,
      before_key_ids: beforeState.key_ids,
      after_key_ids: afterState.key_ids,
      rollback_available: true,
      data_protection_key_rotated: false,
      restart_required: true
    };
  } finally {
    await releaseGridRuntimeLock(lock);
  }
}

export async function rollbackProductionCredentials({
  manifestPath,
  dataDir,
  secretDir
}) {
  const roots = resolveRoots(dataDir, secretDir);
  const resolvedManifestPath = resolveRequiredPath(manifestPath, 'rotation manifest');
  const serializedManifest = await readBoundedFile(resolvedManifestPath, 'utf8');
  const manifest = JSON.parse(serializedManifest);
  const manifestDigest = sha256(Buffer.from(serializedManifest, 'utf8'));
  assertRotationManifestLocation(manifest, resolvedManifestPath, roots.data);
  const rollbackPath = join(dirname(resolvedManifestPath), ROLLBACK_FILE);
  const rollbackEnvelope = await readBoundedFile(rollbackPath);
  verifyCredentialRotationManifest({ manifest, rollbackEnvelope });
  const {
    protector,
    stateAuthenticationKey
  } = await loadRotationProtector(roots.secret);
  const rollbackPayload = protector.open(
    rollbackEnvelope.toString('utf8'),
    manifest.rollback.context
  );
  const original = snapshotFromRollbackPayload(rollbackPayload, manifest.rotation_id);
  validateCredentialSnapshot(original);
  assertSnapshotPublicState(
    original,
    manifest.before,
    'Rollback payload',
    stateAuthenticationKey
  );

  const pendingBeforeLock = await readPendingRotation(roots.data);
  let staleRuntimeLockRecovered = false;
  let lock;
  try {
    lock = await acquireGridRuntimeLock(roots.data);
  } catch (error) {
    if (!pendingBeforeLock || error.code !== 'grid_already_running') throw error;
    await recoverStaleGridRuntimeLock(roots.data);
    staleRuntimeLockRecovered = true;
    lock = await acquireGridRuntimeLock(roots.data);
  }
  try {
    const pending = await readPendingRotation(roots.data);
    if (pending && pending.rotation_id !== manifest.rotation_id) {
      throw new ValidationError(
        `Credential rotation ${pending.rotation_id} is pending; refusing a different rollback`
      );
    }
    if (pending && pending.manifest_sha256 !== manifestDigest) {
      throw new ValidationError(
        'Pending credential rotation marker does not match the requested manifest'
      );
    }

    let forward = null;
    if (!pending) {
      const current = await readCredentialSnapshot(roots);
      validateCredentialSnapshot(current);
      assertSnapshotPublicState(
        current,
        manifest.after,
        'Current credentials',
        stateAuthenticationKey
      );
      const forwardContext = `axiom:credential-rotation:${manifest.rotation_id}:forward`;
      const forwardEnvelope = Buffer.from(
        `${protector.seal(
          rollbackPayloadFor(manifest.rotation_id, current, 'forward'),
          forwardContext
        )}\n`,
        'utf8'
      );
      const forwardPath = join(dirname(resolvedManifestPath), FORWARD_FILE);
      await writeExclusive(forwardPath, forwardEnvelope, 0o600);
      forward = {
        name: FORWARD_FILE,
        algorithm: 'A256GCM',
        context: forwardContext,
        bytes: forwardEnvelope.length,
        sha256: sha256(forwardEnvelope)
      };
    }

    await applyCredentialSnapshot({
      roots,
      snapshot: original,
      transactionDir: join(
        dirname(resolvedManifestPath),
        `rollback-transaction-${process.pid}-${Date.now()}`
      ),
      allowMissing: Boolean(pending)
    });
    const restored = await readCredentialSnapshot(roots);
    const restoredState = validateCredentialSnapshot(restored);
    assertSnapshotPublicState(
      restored,
      manifest.before,
      'Restored credentials',
      stateAuthenticationKey
    );
    await Promise.all([
      rm(join(roots.data, PENDING_MARKER), { force: true }),
      rm(join(dirname(resolvedManifestPath), 'transaction'), {
        recursive: true,
        force: true
      })
    ]);

    const signer = identityFromSnapshot(restored, 'grid');
    const statement = {
      format: ROLLBACK_RESULT_FORMAT,
      schema_version: 1,
      rotation_id: manifest.rotation_id,
      rolled_back_at: new Date().toISOString(),
      restored_key_ids: restoredState.key_ids,
      restored_target_set_digest: publicState(
        restored,
        restoredState,
        stateAuthenticationKey
      ).target_set_digest,
      interrupted_rotation_recovered: Boolean(pending),
      stale_runtime_lock_recovered: staleRuntimeLockRecovered,
      forward,
      restart_required: true
    };
    const rollbackResult = {
      ...statement,
      attestation: signer.signObject(statement)
    };
    await atomicWrite(
      join(dirname(resolvedManifestPath), ROLLBACK_RESULT_FILE),
      Buffer.from(`${canonicalJson(rollbackResult)}\n`, 'utf8'),
      0o600
    );
    return {
      rolled_back: true,
      rotation_id: manifest.rotation_id,
      restored_key_ids: restoredState.key_ids,
      interrupted_rotation_recovered: Boolean(pending),
      stale_runtime_lock_recovered: staleRuntimeLockRecovered,
      forward_recovery_available: Boolean(forward),
      restart_required: true
    };
  } finally {
    await releaseGridRuntimeLock(lock);
  }
}

export function verifyCredentialRotationManifest({
  manifest,
  rollbackEnvelope
}) {
  if (
    !manifest
    || typeof manifest !== 'object'
    || Array.isArray(manifest)
    || manifest.format !== ROTATION_FORMAT
    || manifest.schema_version !== 1
  ) {
    throw new ValidationError('Credential rotation manifest format is invalid');
  }
  assertRotationId(manifest.rotation_id);
  if (
    manifest.scope?.data_protection_key !== false
    || manifest.scope?.operator_api_token !== true
    || manifest.scope?.requires_stopped_runtime !== true
    || canonicalJson(manifest.scope?.service_identities) !== canonicalJson(SERVICES)
  ) {
    throw new ValidationError('Credential rotation manifest scope is invalid');
  }
  validatePublicState(manifest.before, 'before');
  validatePublicState(manifest.after, 'after');
  for (const service of SERVICES) {
    if (manifest.before.key_ids[service] === manifest.after.key_ids[service]) {
      throw new ValidationError(`Credential rotation did not replace the ${service} identity`);
    }
  }
  if (
    targetAuthentication(manifest.before, 'api-token-registry') === (
      targetAuthentication(manifest.after, 'api-token-registry')
    )
    || targetAuthentication(manifest.before, 'operator-token') === (
      targetAuthentication(manifest.after, 'operator-token')
    )
    || manifest.before.target_set_digest === manifest.after.target_set_digest
  ) {
    throw new ValidationError('Credential rotation did not replace the API credential set');
  }
  if (
    manifest.rollback?.name !== ROLLBACK_FILE
    || manifest.rollback?.format !== 'axiom-protected.v1'
    || manifest.rollback?.algorithm !== 'A256GCM'
    || manifest.rollback?.context !== (
      `axiom:credential-rotation:${manifest.rotation_id}:rollback`
    )
    || !Number.isSafeInteger(manifest.rollback?.bytes)
    || manifest.rollback.bytes < 1
    || !DIGEST.test(manifest.rollback?.sha256 ?? '')
  ) {
    throw new ValidationError('Credential rotation rollback metadata is invalid');
  }
  if (
    manifest.signer?.service !== 'grid'
    || typeof manifest.signer?.public_key_pem !== 'string'
    || manifest.signer?.key_id !== manifest.before.key_ids.grid
    || manifest.attestation?.key_id !== manifest.signer.key_id
  ) {
    throw new ValidationError('Credential rotation signer metadata is invalid');
  }
  let publicKey;
  try {
    publicKey = createPublicKey(manifest.signer.public_key_pem);
  } catch {
    throw new ValidationError('Credential rotation signer public key is invalid');
  }
  if (
    keyId('grid', manifest.signer.public_key_pem) !== manifest.signer.key_id
    || !samePublicKey(
      publicKey,
      createPublicKey(manifest.before.public_keys.grid)
    )
  ) {
    throw new ValidationError('Credential rotation signer key identifier is invalid');
  }
  const unsigned = structuredClone(manifest);
  delete unsigned.attestation;
  delete unsigned.successor_attestation;
  if (!verifyObjectSignature(unsigned, manifest.attestation, publicKey)) {
    throw new ValidationError('Credential rotation manifest attestation is invalid');
  }
  if (manifest.successor_attestation?.key_id !== manifest.after.key_ids.grid) {
    throw new ValidationError('Credential rotation successor attestation metadata is invalid');
  }
  let successorPublicKey;
  try {
    successorPublicKey = createPublicKey(manifest.after.public_keys.grid);
  } catch {
    throw new ValidationError('Credential rotation successor public key is invalid');
  }
  if (
    !verifyObjectSignature(
      unsigned,
      manifest.successor_attestation,
      successorPublicKey
    )
  ) {
    throw new ValidationError('Credential rotation successor attestation is invalid');
  }
  if (rollbackEnvelope !== undefined) {
    const envelope = Buffer.from(rollbackEnvelope);
    if (
      envelope.length !== manifest.rollback.bytes
      || sha256(envelope) !== manifest.rollback.sha256
    ) {
      throw new ValidationError('Credential rotation rollback envelope digest is invalid');
    }
  }
  return {
    valid: true,
    rotation_id: manifest.rotation_id,
    before_key_ids: manifest.before.key_ids,
    after_key_ids: manifest.after.key_ids
  };
}

function createRotatedSnapshot(before, beforeState) {
  const contents = new Map();
  for (const service of SERVICES) {
    const pair = generateKeyPairSync('ed25519');
    const privatePem = String(pair.privateKey.export({
      type: 'pkcs8',
      format: 'pem'
    }));
    const publicPem = String(pair.publicKey.export({
      type: 'spki',
      format: 'pem'
    }));
    contents.set(`${service}-private`, Buffer.from(privatePem, 'utf8'));
    contents.set(`${service}-public`, Buffer.from(publicPem, 'utf8'));
    contents.set(`${service}-trust`, Buffer.from(publicPem, 'utf8'));
  }
  const registry = structuredClone(beforeState.registry);
  let nextToken;
  do {
    nextToken = randomBytes(32).toString('base64url');
  } while (Object.hasOwn(registry, nextToken));
  const principal = registry[beforeState.operator_token];
  delete registry[beforeState.operator_token];
  registry[nextToken] = principal;
  contents.set(
    'api-token-registry',
    Buffer.from(`${canonicalJson(registry)}\n`, 'utf8')
  );
  contents.set('operator-token', Buffer.from(`${nextToken}\n`, 'utf8'));
  return TARGETS.map(target => ({
    ...target,
    content: contents.get(target.id)
  }));
}

async function readCredentialSnapshot(roots) {
  return Promise.all(TARGETS.map(async target => {
    const path = targetPath(roots, target);
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink() || !metadata.isFile()) {
      throw new ValidationError(`Credential target ${target.id} must be a regular file`);
    }
    if (metadata.size < 1 || metadata.size > MAX_CREDENTIAL_BYTES) {
      throw new ValidationError(`Credential target ${target.id} has an invalid size`);
    }
    if (
      process.platform !== 'win32'
      && target.mode === 0o600
      && (metadata.mode & 0o077) !== 0
    ) {
      throw new ValidationError(`Credential target ${target.id} is not private`);
    }
    return {
      ...target,
      content: await readFile(path)
    };
  }));
}

function validateCredentialSnapshot(snapshot) {
  assertExactTargetSet(snapshot);
  const key_ids = {};
  for (const service of SERVICES) {
    const privatePem = snapshotContent(snapshot, `${service}-private`).toString('utf8');
    const publicPem = snapshotContent(snapshot, `${service}-public`).toString('utf8');
    const trustPem = snapshotContent(snapshot, `${service}-trust`).toString('utf8');
    let derived;
    let declared;
    let trusted;
    try {
      derived = createPublicKey(createPrivateKey(privatePem));
      declared = createPublicKey(publicPem);
      trusted = createPublicKey(trustPem);
    } catch {
      throw new ValidationError(`${service} identity contains an invalid Ed25519 key`);
    }
    const derivedDer = derived.export({ type: 'spki', format: 'der' });
    const declaredDer = declared.export({ type: 'spki', format: 'der' });
    const trustedDer = trusted.export({ type: 'spki', format: 'der' });
    if (
      derived.asymmetricKeyType !== 'ed25519'
      || declared.asymmetricKeyType !== 'ed25519'
      || trusted.asymmetricKeyType !== 'ed25519'
      || !Buffer.from(derivedDer).equals(Buffer.from(declaredDer))
      || !Buffer.from(declaredDer).equals(Buffer.from(trustedDer))
    ) {
      throw new ValidationError(`${service} private, public, and trust keys do not match`);
    }
    key_ids[service] = keyId(service, publicPem);
  }

  const operator_token = snapshotContent(snapshot, 'operator-token')
    .toString('utf8')
    .trim();
  if (
    operator_token.length < 32
    || operator_token.length > 512
    || !/^[A-Za-z0-9_-]+$/.test(operator_token)
  ) {
    throw new ValidationError('Operator token is invalid');
  }
  let registry;
  try {
    registry = JSON.parse(
      snapshotContent(snapshot, 'api-token-registry').toString('utf8')
    );
  } catch {
    throw new ValidationError('API token registry is invalid JSON');
  }
  if (
    !registry
    || typeof registry !== 'object'
    || Array.isArray(registry)
    || !Object.hasOwn(registry, operator_token)
  ) {
    throw new ValidationError('Operator token is absent from the API token registry');
  }
  return {
    key_ids,
    operator_token,
    registry
  };
}

function publicState(snapshot, state, stateAuthenticationKey) {
  const targets = snapshot.map(item => {
    const secret = item.root === 'secret';
    return {
      id: item.id,
      root: item.root,
      relative_path: item.relative_path,
      bytes: item.content.length,
      authentication: secret ? 'HMAC-SHA256' : 'SHA-256',
      digest: secret
        ? authenticateSecretTarget(item, stateAuthenticationKey)
        : sha256(item.content)
    };
  });
  return {
    key_ids: state.key_ids,
    public_keys: Object.fromEntries(SERVICES.map(service => [
      service,
      publicPemFromSnapshot(snapshot, service)
    ])),
    targets,
    target_set_digest: digestObject(targets)
  };
}

function validatePublicState(state, label) {
  if (
    !state
    || typeof state !== 'object'
    || Array.isArray(state)
    || !state.key_ids
    || SERVICES.some(service => (
      typeof state.key_ids[service] !== 'string'
      || !state.key_ids[service].startsWith(`${service}:`)
      || typeof state.public_keys?.[service] !== 'string'
      || keyId(service, state.public_keys[service]) !== state.key_ids[service]
    ))
    || !DIGEST.test(state.target_set_digest ?? '')
    || !Array.isArray(state.targets)
  ) {
    throw new ValidationError(`Credential rotation ${label} state is invalid`);
  }
  for (const service of SERVICES) {
    let key;
    try {
      key = createPublicKey(state.public_keys[service]);
    } catch {
      throw new ValidationError(
        `Credential rotation ${label} ${service} public key is invalid`
      );
    }
    if (key.asymmetricKeyType !== 'ed25519') {
      throw new ValidationError(
        `Credential rotation ${label} ${service} public key is not Ed25519`
      );
    }
  }
  const descriptor = state.targets.map(item => ({
    id: item.id,
    root: item.root,
    relative_path: item.relative_path,
    bytes: item.bytes,
    authentication: item.authentication,
    digest: item.digest
  }));
  if (
    descriptor.length !== TARGETS.length
    || descriptor.some((item, index) => (
      item.id !== TARGETS[index].id
      || item.root !== TARGETS[index].root
      || item.relative_path !== TARGETS[index].relative_path
      || !Number.isSafeInteger(item.bytes)
      || item.bytes < 1
      || item.bytes > MAX_CREDENTIAL_BYTES
      || item.authentication !== (
        TARGETS[index].root === 'secret' ? 'HMAC-SHA256' : 'SHA-256'
      )
      || !DIGEST.test(item.digest ?? '')
    ))
    || digestObject(descriptor) !== state.target_set_digest
  ) {
    throw new ValidationError(`Credential rotation ${label} target set is invalid`);
  }
}

function assertSnapshotPublicState(
  snapshot,
  expected,
  label,
  stateAuthenticationKey
) {
  const actual = publicState(
    snapshot,
    validateCredentialSnapshot(snapshot),
    stateAuthenticationKey
  );
  if (
    actual.target_set_digest !== expected.target_set_digest
    || canonicalJson(actual.key_ids) !== canonicalJson(expected.key_ids)
  ) {
    throw new ValidationError(`${label} do not match the signed rotation manifest`);
  }
}

function assertSnapshotMatches(actual, expected, label) {
  assertExactTargetSet(actual);
  assertExactTargetSet(expected);
  if (actual.some((item, index) => !item.content.equals(expected[index].content))) {
    throw new ValidationError(`${label} does not match the staged credential set`);
  }
}

function rollbackPayloadFor(rotationId, snapshot, direction = 'rollback') {
  return {
    format: ROLLBACK_FORMAT,
    schema_version: 1,
    rotation_id: rotationId,
    direction,
    targets: snapshot.map(item => ({
      id: item.id,
      root: item.root,
      relative_path: item.relative_path,
      mode: item.mode,
      bytes: item.content.length,
      content_base64: item.content.toString('base64')
    }))
  };
}

function snapshotFromRollbackPayload(payload, rotationId) {
  if (
    payload?.format !== ROLLBACK_FORMAT
    || payload?.schema_version !== 1
    || payload?.rotation_id !== rotationId
    || payload?.direction !== 'rollback'
    || !Array.isArray(payload.targets)
  ) {
    throw new ValidationError('Credential rollback payload is invalid');
  }
  const snapshot = payload.targets.map((item, index) => {
    const target = TARGETS[index];
    let content;
    try {
      content = Buffer.from(item.content_base64, 'base64');
    } catch {
      throw new ValidationError('Credential rollback payload encoding is invalid');
    }
    if (
      !target
      || item.id !== target.id
      || item.root !== target.root
      || item.relative_path !== target.relative_path
      || item.mode !== target.mode
      || item.bytes !== content.length
      || item.content_base64 !== content.toString('base64')
      || content.length < 1
      || content.length > MAX_CREDENTIAL_BYTES
    ) {
      throw new ValidationError('Credential rollback target metadata is invalid');
    }
    return { ...target, content };
  });
  assertExactTargetSet(snapshot);
  return snapshot;
}

async function applyCredentialSnapshot({
  roots,
  snapshot,
  transactionDir,
  allowMissing = false
}) {
  assertExactTargetSet(snapshot);
  await mkdir(transactionDir, { recursive: true, mode: 0o700 });
  const stagedDir = join(transactionDir, 'staged');
  const originalDir = join(transactionDir, 'original');
  await Promise.all([
    mkdir(stagedDir, { mode: 0o700 }),
    mkdir(originalDir, { mode: 0o700 })
  ]);
  const records = [];
  try {
    for (const [index, item] of snapshot.entries()) {
      await writeExclusive(
        join(stagedDir, String(index)),
        item.content,
        item.mode
      );
    }
    for (const [index, item] of snapshot.entries()) {
      const target = targetPath(roots, item);
      const original = join(originalDir, String(index));
      let originalMoved = false;
      try {
        await rename(target, original);
        originalMoved = true;
      } catch (error) {
        if (!allowMissing || error.code !== 'ENOENT') throw error;
      }
      const record = {
        target,
        original,
        originalMoved,
        installed: false
      };
      records.push(record);
      await mkdir(dirname(target), { recursive: true, mode: 0o700 });
      await rename(join(stagedDir, String(index)), target);
      record.installed = true;
      await chmod(target, item.mode);
    }
    for (const item of snapshot) {
      const installed = await readFile(targetPath(roots, item));
      if (!installed.equals(item.content)) {
        throw new ValidationError(
          `Credential transaction verification failed for ${item.id}`
        );
      }
    }
  } catch (error) {
    let restoreError;
    for (const record of [...records].reverse()) {
      try {
        if (record.installed) await rm(record.target, { force: true });
        if (record.originalMoved) await rename(record.original, record.target);
      } catch (candidate) {
        restoreError ??= candidate;
      }
    }
    if (restoreError) {
      throw new AggregateError(
        [error, restoreError],
        'Credential transaction failed and automatic restoration was incomplete'
      );
    }
    await rm(transactionDir, { recursive: true, force: true });
    error.credentialTransactionRestored = true;
    throw error;
  }
  await rm(transactionDir, { recursive: true, force: true });
}

async function loadRotationProtector(secretDir) {
  const encoded = (
    await readBoundedFile(join(secretDir, 'data-protection.key'), 'utf8')
  ).trim();
  const key = Buffer.from(encoded, 'base64url');
  if (key.length !== 32) {
    throw new ValidationError('Production data-protection key is invalid');
  }
  const stateAuthenticationKey = Buffer.from(hkdfSync(
    'sha256',
    key,
    Buffer.from('axiom-credential-rotation.v1', 'utf8'),
    Buffer.from('manifest-target-authentication', 'utf8'),
    32
  ));
  return {
    protector: new DataProtector(key),
    stateAuthenticationKey
  };
}

function identityFromSnapshot(snapshot, service) {
  return new MeshIdentity(
    service,
    snapshotContent(snapshot, `${service}-private`).toString('utf8'),
    snapshotContent(snapshot, `${service}-public`).toString('utf8')
  );
}

function publicPemFromSnapshot(snapshot, service) {
  return snapshotContent(snapshot, `${service}-public`).toString('utf8');
}

function snapshotContent(snapshot, id) {
  const item = snapshot.find(candidate => candidate.id === id);
  if (!item) throw new ValidationError(`Credential snapshot is missing ${id}`);
  return item.content;
}

function targetAuthentication(state, id) {
  const target = state.targets.find(item => item.id === id);
  if (!target) {
    throw new ValidationError(`Credential rotation state is missing ${id}`);
  }
  return target.digest;
}

function authenticateSecretTarget(item, stateAuthenticationKey) {
  const key = Buffer.from(stateAuthenticationKey ?? []);
  if (key.length !== 32) {
    throw new ValidationError(
      'Credential rotation state-authentication key is invalid'
    );
  }
  const context = canonicalJson({
    format: 'axiom-credential-target-authentication.v1',
    id: item.id,
    root: item.root,
    relative_path: item.relative_path,
    bytes: item.content.length
  });
  return createHmac('sha256', key)
    .update(context, 'utf8')
    .update('\n', 'utf8')
    .update(item.content)
    .digest('hex');
}

function assertExactTargetSet(snapshot) {
  if (
    !Array.isArray(snapshot)
    || snapshot.length !== TARGETS.length
    || snapshot.some((item, index) => (
      item?.id !== TARGETS[index].id
      || item.root !== TARGETS[index].root
      || item.relative_path !== TARGETS[index].relative_path
      || item.mode !== TARGETS[index].mode
      || !Buffer.isBuffer(item.content)
      || item.content.length < 1
      || item.content.length > MAX_CREDENTIAL_BYTES
    ))
  ) {
    throw new ValidationError('Credential snapshot target set is invalid');
  }
}

function targetPath(roots, target) {
  return join(roots[target.root], ...target.relative_path.split('/'));
}

function keyId(service, publicPem) {
  return `${service}:${sha256(publicPem).slice(0, 16)}`;
}

function samePublicKey(left, right) {
  return Buffer.from(left.export({ type: 'spki', format: 'der' })).equals(
    Buffer.from(right.export({ type: 'spki', format: 'der' }))
  );
}

function resolveRoots(dataDir, secretDir) {
  const data = resolveRequiredPath(dataDir, 'data directory');
  const secret = resolveRequiredPath(secretDir, 'secret directory');
  if (data === secret) {
    throw new ValidationError('Production data and secret directories must be distinct');
  }
  if (pathContains(data, secret) || pathContains(secret, data)) {
    throw new ValidationError(
      'Production data and secret directories must not contain one another'
    );
  }
  return { data, secret };
}

function pathContains(parent, candidate) {
  const child = relative(parent, candidate);
  return child !== '' && !child.startsWith('..') && !isAbsolute(child);
}

function resolveRequiredPath(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ValidationError(`A ${label} is required`);
  }
  return resolve(value);
}

async function createRotationDirectory(rotationRoot) {
  await mkdir(dirname(rotationRoot), { recursive: true, mode: 0o700 });
  try {
    await mkdir(rotationRoot, { mode: 0o700 });
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new ValidationError('Credential rotation identifier already exists');
    }
    throw error;
  }
}

async function assertNoPendingRotation(dataDir) {
  const pending = await readPendingRotation(dataDir);
  if (pending) {
    throw new ValidationError(
      `Credential rotation ${pending.rotation_id ?? 'unknown'} is pending rollback`
    );
  }
}

async function readPendingRotation(dataDir) {
  try {
    const pending = JSON.parse(
      await readBoundedFile(join(dataDir, PENDING_MARKER), 'utf8')
    );
    if (
      pending?.format !== ROTATION_FORMAT
      || !ROTATION_ID.test(pending.rotation_id ?? '')
      || !DIGEST.test(pending.manifest_sha256 ?? '')
      || pending.transaction !== 'applying'
    ) {
      throw new ValidationError('Pending credential rotation marker is invalid');
    }
    return pending;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function assertRotationManifestLocation(manifest, manifestPath, dataDir) {
  assertRotationId(manifest?.rotation_id);
  const expected = resolve(
    dataDir,
    'credential-rotations',
    manifest.rotation_id,
    MANIFEST_FILE
  );
  if (manifestPath !== expected || basename(manifestPath) !== MANIFEST_FILE) {
    throw new ValidationError('Credential rotation manifest path is outside its data directory');
  }
}

function assertRotationId(value) {
  if (!ROTATION_ID.test(value ?? '')) {
    throw new ValidationError('Credential rotation identifier is invalid');
  }
}

function createRotationId() {
  return `rotation_${new Date().toISOString().replaceAll(/[:.]/g, '-')}_${randomBytes(8).toString('hex')}`;
}

async function readBoundedFile(path, encoding) {
  const metadata = await lstat(path);
  if (metadata.isSymbolicLink() || !metadata.isFile()) {
    throw new ValidationError('Credential rotation input must be a regular file');
  }
  if (metadata.size < 1 || metadata.size > 1024 * 1024) {
    throw new ValidationError('Credential rotation input has an invalid size');
  }
  return readFile(path, encoding);
}

async function writeExclusive(path, content, mode) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, content, { mode, flag: 'wx' });
}

async function atomicWrite(path, content, mode) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, content, { mode, flag: 'wx' });
  await rename(temporary, path);
}

async function main() {
  const command = process.argv[2];
  if (command === 'rotate') {
    const result = await rotateProductionCredentials({
      dataDir: process.argv[3],
      secretDir: process.argv[4]
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (command === 'rollback') {
    const result = await rollbackProductionCredentials({
      manifestPath: process.argv[3],
      dataDir: process.argv[4],
      secretDir: process.argv[5]
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  throw new ValidationError(
    'Usage: rotate-production.mjs rotate <data-dir> <secret-dir> '
    + '| rollback <manifest-path> <data-dir> <secret-dir>'
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

export {
  ROLLBACK_RESULT_FORMAT,
  ROTATION_FORMAT,
  SERVICES
};
