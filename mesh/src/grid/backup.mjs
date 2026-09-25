import { backup as sqliteBackup } from 'node:sqlite';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile
} from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';
import {
  AxiomError,
  ValidationError,
  canonicalJson,
  digestObject,
  sha256
} from '../lib/canonical.mjs';
import { verifyObjectSignature } from '../lib/identity.mjs';
import { openChunkedProtectedArtifact, openProtectedArtifact } from '../lib/protected-artifact.mjs';
import {
  CHUNKED_ARTIFACT_FORMAT,
  sealFileChunked,
  validateChunkedMetadata
} from '../lib/chunked-artifact.mjs';
import { loadGridVerificationKeys } from './store.mjs';

const BACKUP_FORMAT = 'axiom-grid-backup.v1';
const BACKUP_FILE = 'snapshot.axb';
// Streaming format (scalability audit S-13): the snapshot is a chunked
// protected artifact, so backup, verification and restore hold a bounded
// amount of memory whatever the database size. Data-key rotation rewraps it
// chunk by chunk under a signed rewrap record. Opt-in with
// AXIOM_GRID_BACKUP_FORMAT=axiom-grid-backup.v2.
export const STREAMING_BACKUP_FORMAT = 'axiom-grid-backup.v2';
const STREAMING_BACKUP_FILE = 'snapshot.axc';
const BACKUP_FORMATS = new Set([BACKUP_FORMAT, STREAMING_BACKUP_FORMAT]);
const MANIFEST_FILE = 'manifest.json';
const LOCK_FILE = 'grid-runtime.lock';
const RECOVERY_MARKER = 'pending-grid-recovery.json';
const DIGEST = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;

export async function createGridBackup({
  store,
  dataDir,
  identity,
  protector,
  backupId,
  traceId,
  format = process.env.AXIOM_GRID_BACKUP_FORMAT || BACKUP_FORMAT
}) {
  if (!store || !identity || !protector) throw new ValidationError('Grid backup dependencies are missing');
  if (!ID.test(backupId ?? '')) throw new ValidationError('Backup id is invalid');
  if (!BACKUP_FORMATS.has(format)) throw new ValidationError('Grid backup format is unsupported');
  const record = store.getBackupRecord(backupId);
  if (record.status === 'completed') return record.manifest_json;
  if (record.status !== 'pending') throw new AxiomError('backup_unavailable', 'Backup is not pending', 409);

  const directory = join(dataDir, 'backups', backupId);
  const temporaryDirectory = join(dataDir, 'backups', '.tmp');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await mkdir(temporaryDirectory, { recursive: true, mode: 0o700 });
  const temporaryDatabase = join(
    temporaryDirectory,
    `${backupId}.${process.pid}.${Date.now()}.sqlite`
  );
  try {
    await sqliteBackup(store.db, temporaryDatabase, { rate: 64 });
    const status = store.getStatus();
    const protectionContext = `axiom:grid-backup:${backupId}`;
    const { snapshotPath, databaseMetadata, snapshotMetadata } = format === STREAMING_BACKUP_FORMAT
      ? await sealStreamingSnapshot({ directory, temporaryDatabase, protector, protectionContext })
      : await sealSnapshot({ directory, temporaryDatabase, protector, protectionContext });

    const unsigned = {
      format,
      schema_versions: {
        manifest: 1,
        database: status.schema_version,
        evidence: 1
      },
      backup_id: backupId,
      principal: record.principal,
      created_at: new Date().toISOString(),
      database: {
        media_type: 'application/vnd.sqlite3',
        ...databaseMetadata,
        schema_version: status.schema_version,
        evidence_events: status.last_seq,
        evidence_head: status.last_hash
      },
      snapshot: snapshotMetadata,
      recovery: {
        requires_stopped_grid: true,
        exact_database_digest_required: true,
        preserves_replaced_database: true
      }
    };
    const manifest = { ...unsigned, attestation: identity.signObject(unsigned) };
    const manifestPath = join(directory, MANIFEST_FILE);
    await atomicWrite(manifestPath, Buffer.from(`${canonicalJson(manifest)}\n`), 0o600);
    store.appendEvents({
      traceId,
      actor: 'grid',
      events: [{
        kind: 'backup.completed',
        subject: backupId,
        payload: {
          backup_id: backupId,
          manifest,
          manifest_path: relative(dataDir, manifestPath),
          snapshot_path: relative(dataDir, snapshotPath)
        }
      }]
    });
    return manifest;
  } finally {
    await rm(temporaryDatabase, { force: true });
  }
}

async function sealSnapshot({ directory, temporaryDatabase, protector, protectionContext }) {
  const database = await readFile(temporaryDatabase);
  const protectedSnapshot = Buffer.from(protector.sealBytes(database, protectionContext));
  const snapshotPath = join(directory, BACKUP_FILE);
  await atomicWrite(snapshotPath, protectedSnapshot, 0o600);
  return {
    snapshotPath,
    databaseMetadata: { bytes: database.length, sha256: sha256(database) },
    snapshotMetadata: {
      name: BACKUP_FILE,
      media_type: 'application/vnd.axiom.encrypted-sqlite',
      bytes: protectedSnapshot.length,
      sha256: sha256(protectedSnapshot),
      protection: 'A256GCM',
      context: protectionContext
    }
  };
}

// Seals the SQLite copy chunk by chunk, from file to file.
async function sealStreamingSnapshot({ directory, temporaryDatabase, protector, protectionContext }) {
  const snapshotPath = join(directory, STREAMING_BACKUP_FILE);
  const temporary = `${snapshotPath}.${process.pid}.${Date.now()}.tmp`;
  const sealed = await sealFileChunked({
    protector,
    sourcePath: temporaryDatabase,
    targetPath: temporary,
    context: protectionContext
  });
  await rename(temporary, snapshotPath);
  return {
    snapshotPath,
    databaseMetadata: { bytes: sealed.plaintext.bytes, sha256: sealed.plaintext.sha256 },
    snapshotMetadata: {
      name: STREAMING_BACKUP_FILE,
      media_type: 'application/vnd.axiom.chunked-encrypted-sqlite',
      bytes: sealed.bytes,
      sha256: sealed.sha256,
      protection: 'A256GCM',
      chunked: {
        format: sealed.format,
        kdf: sealed.kdf,
        salt: sealed.salt,
        chunk_bytes: sealed.chunk_bytes,
        chunks: sealed.chunks
      },
      context: protectionContext
    }
  };
}

export function verifyGridBackup({
  manifest,
  protectedSnapshot,
  gridPublicKey,
  protector,
  expectedDatabaseDigest
}) {
  if (manifest?.format !== BACKUP_FORMAT) throw new ValidationError('Unsupported Grid backup format');
  if (manifest.schema_versions?.manifest !== 1 || manifest.schema_versions?.evidence !== 1) {
    throw new ValidationError('Unsupported Grid backup schema version');
  }
  if (!ID.test(manifest.backup_id ?? '')) throw new ValidationError('Grid backup id is invalid');
  if (!Buffer.isBuffer(protectedSnapshot)) protectedSnapshot = Buffer.from(protectedSnapshot);
  if (manifest.snapshot?.name !== BACKUP_FILE) throw new ValidationError('Grid backup snapshot name is invalid');
  if (
    manifest.snapshot.bytes !== protectedSnapshot.length
    || manifest.snapshot.sha256 !== sha256(protectedSnapshot)
  ) throw new ValidationError('Grid backup snapshot digest or byte count does not match');
  const database = protector.openBytes(
    protectedSnapshot.toString('utf8'),
    manifest.snapshot.context
  );
  return verifyGridBackupDatabase({
    manifest,
    database,
    databaseMetadata: manifest.database,
    gridPublicKey,
    expectedDatabaseDigest
  });
}

export async function verifyGridBackupArtifact({
  manifestPath,
  dataDir,
  identity,
  protector,
  expectedDatabaseDigest,
  artifactRelativePath,
  keepDatabase = false
}) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest?.format === STREAMING_BACKUP_FORMAT) {
    return verifyStreamingBackupArtifact({
      manifest,
      manifestPath,
      dataDir,
      identity,
      protector,
      expectedDatabaseDigest,
      artifactRelativePath,
      keepDatabase
    });
  }
  const snapshotName = manifest.snapshot?.name;
  if (snapshotName !== basename(snapshotName ?? '') || snapshotName !== BACKUP_FILE) {
    throw new ValidationError('Grid backup snapshot path is invalid');
  }
  const snapshotPath = join(dirname(manifestPath), snapshotName);
  const verificationKeys = loadGridVerificationKeys(dataDir, identity);
  const resolvedSnapshot = await openProtectedArtifact({
    artifactPath: snapshotPath,
    relativePath: artifactRelativePath
      ?? relative(dataDir, snapshotPath).replaceAll('\\', '/'),
    context: manifest.snapshot.context,
    encoding: 'bytes',
    expected: {
      bytes: manifest.snapshot.bytes,
      sha256: manifest.snapshot.sha256
    },
    expectedPlaintext: {
      bytes: manifest.database.bytes,
      sha256: manifest.database.sha256
    },
    protector,
    verificationKeys
  });
  const gridPublicKey = verificationKeys.get(manifest.attestation?.key_id);
  if (!gridPublicKey) {
    throw new ValidationError('Grid backup signer is not in the trusted key history');
  }
  const verified = verifyGridBackupDatabase({
    manifest,
    database: resolvedSnapshot.value,
    databaseMetadata: resolvedSnapshot.plaintext_metadata,
    gridPublicKey,
    expectedDatabaseDigest
  });

  const recoveryRoot = join(dataDir, 'recovery');
  await mkdir(recoveryRoot, { recursive: true, mode: 0o700 });
  const validationDirectory = await mkdtemp(join(recoveryRoot, 'verify-'));
  const validationPath = join(validationDirectory, 'grid.sqlite');
  let chain;
  try {
    await writeFile(validationPath, verified.database, { mode: 0o600, flag: 'wx' });
    const { GridStore } = await import('./store.mjs');
    const candidate = new GridStore({
      path: validationPath,
      dataDir,
      identity,
      protector
    });
    try {
      chain = candidate.verifyChain();
    } finally {
      candidate.close();
    }
    if (!chain.valid) throw new ValidationError(`Restored Grid evidence is invalid: ${chain.reason}`);
    if (
      chain.events !== manifest.database.evidence_events
      || chain.head !== manifest.database.evidence_head
    ) throw new ValidationError('Restored Grid evidence head does not match the signed manifest');
  } finally {
    await rm(validationDirectory, { recursive: true, force: true });
  }

  return {
    ...verified,
    manifest,
    manifest_path: manifestPath,
    snapshot_path: snapshotPath,
    evidence_chain: chain
  };
}

/**
 * Verifies a streaming backup without holding the database in memory: the
 * signature and digests first, then the snapshot is decrypted chunk by chunk
 * into a candidate file, and a copy of that candidate is opened to verify the
 * evidence chain against the signed head. The candidate itself is never
 * opened, so it stays byte-identical to the signed database digest. With
 * `keepDatabase`, the caller takes ownership of `database_path` and its
 * `database_directory`.
 */
async function verifyStreamingBackupArtifact({
  manifest,
  manifestPath,
  dataDir,
  identity,
  protector,
  expectedDatabaseDigest,
  artifactRelativePath,
  keepDatabase
}) {
  if (manifest.schema_versions?.manifest !== 1 || manifest.schema_versions?.evidence !== 1) {
    throw new ValidationError('Unsupported Grid backup schema version');
  }
  if (!ID.test(manifest.backup_id ?? '')) throw new ValidationError('Grid backup id is invalid');
  if (manifest.snapshot?.name !== STREAMING_BACKUP_FILE) {
    throw new ValidationError('Grid backup snapshot path is invalid');
  }
  const verificationKeys = loadGridVerificationKeys(dataDir, identity);
  const gridPublicKey = verificationKeys.get(manifest.attestation?.key_id);
  if (!gridPublicKey) throw new ValidationError('Grid backup signer is not in the trusted key history');
  const unsigned = structuredClone(manifest);
  delete unsigned.attestation;
  if (!verifyObjectSignature(unsigned, manifest.attestation, gridPublicKey)) {
    throw new ValidationError('Grid backup attestation is invalid');
  }
  if (expectedDatabaseDigest !== undefined) {
    if (!DIGEST.test(expectedDatabaseDigest)) throw new ValidationError('Expected database digest is invalid');
    if (manifest.database?.sha256 !== expectedDatabaseDigest) {
      throw new ValidationError('Grid backup does not match the exact expected database digest');
    }
  }
  const chunked = manifest.snapshot.chunked ?? {};
  // The snapshot as signed at backup time; a data-key rotation since then
  // is followed through its signed rewrap history.
  validateChunkedMetadata({
    format: chunked.format,
    algorithm: manifest.snapshot.protection,
    kdf: chunked.kdf,
    salt: chunked.salt,
    chunk_bytes: chunked.chunk_bytes,
    chunks: chunked.chunks,
    bytes: manifest.snapshot.bytes,
    sha256: manifest.snapshot.sha256,
    plaintext: { bytes: manifest.database?.bytes, sha256: manifest.database?.sha256 }
  });
  if (chunked.format !== CHUNKED_ARTIFACT_FORMAT) throw new ValidationError('Grid backup snapshot format is invalid');
  const snapshotPath = join(dirname(manifestPath), STREAMING_BACKUP_FILE);

  const recoveryRoot = join(dataDir, 'recovery');
  await mkdir(recoveryRoot, { recursive: true, mode: 0o700 });
  const directory = await mkdtemp(join(recoveryRoot, 'verify-'));
  const databasePath = join(directory, 'candidate.sqlite');
  const validationPath = join(directory, 'grid.sqlite');
  let chain;
  let kept = false;
  let opened;
  try {
    opened = await openChunkedProtectedArtifact({
      artifactPath: snapshotPath,
      relativePath: artifactRelativePath
        ?? relative(dataDir, snapshotPath).replaceAll('\\', '/'),
      context: manifest.snapshot.context,
      expected: { bytes: manifest.snapshot.bytes, sha256: manifest.snapshot.sha256 },
      expectedPlaintext: { bytes: manifest.database.bytes, sha256: manifest.database.sha256 },
      expectedChunked: { salt: chunked.salt, chunk_bytes: chunked.chunk_bytes, chunks: chunked.chunks },
      protector,
      verificationKeys,
      targetPath: databasePath
    });
    await copyFile(databasePath, validationPath);
    const { GridStore } = await import('./store.mjs');
    const candidate = new GridStore({ path: validationPath, dataDir, identity, protector });
    try {
      chain = candidate.verifyChain();
    } finally {
      candidate.close();
    }
    if (!chain.valid) throw new ValidationError(`Restored Grid evidence is invalid: ${chain.reason}`);
    if (
      chain.events !== manifest.database.evidence_events
      || chain.head !== manifest.database.evidence_head
    ) throw new ValidationError('Restored Grid evidence head does not match the signed manifest');
    for (const suffix of ['', '-wal', '-shm']) await rm(`${validationPath}${suffix}`, { force: true });
    kept = keepDatabase;
  } finally {
    if (!kept) await rm(directory, { recursive: true, force: true });
  }
  return {
    valid: true,
    backup_id: manifest.backup_id,
    // After a data-key rotation the database's protected columns carry the
    // new key, so its digest is the latest signed plaintext digest.
    database_digest: opened.plaintext_metadata.sha256,
    source_database_digest: manifest.database.sha256,
    rewrapped: opened.rewrapped,
    manifest,
    manifest_path: manifestPath,
    snapshot_path: snapshotPath,
    evidence_chain: chain,
    ...(kept ? { database_path: databasePath, database_directory: directory } : {})
  };
}

function verifyGridBackupDatabase({
  manifest,
  database,
  databaseMetadata,
  gridPublicKey,
  expectedDatabaseDigest
}) {
  if (manifest?.format !== BACKUP_FORMAT) throw new ValidationError('Unsupported Grid backup format');
  if (manifest.schema_versions?.manifest !== 1 || manifest.schema_versions?.evidence !== 1) {
    throw new ValidationError('Unsupported Grid backup schema version');
  }
  if (!ID.test(manifest.backup_id ?? '')) throw new ValidationError('Grid backup id is invalid');
  const unsigned = structuredClone(manifest);
  delete unsigned.attestation;
  if (!verifyObjectSignature(unsigned, manifest.attestation, gridPublicKey)) {
    throw new ValidationError('Grid backup attestation is invalid');
  }
  const databaseDigest = sha256(database);
  if (
    databaseMetadata?.bytes !== database.length
    || databaseMetadata?.sha256 !== databaseDigest
  ) throw new ValidationError('Grid backup database digest or byte count does not match');
  if (expectedDatabaseDigest !== undefined) {
    if (!DIGEST.test(expectedDatabaseDigest)) throw new ValidationError('Expected database digest is invalid');
    if (manifest.database?.sha256 !== expectedDatabaseDigest) {
      throw new ValidationError('Grid backup does not match the exact expected database digest');
    }
  }
  return {
    valid: true,
    backup_id: manifest.backup_id,
    database_digest: databaseDigest,
    source_database_digest: manifest.database.sha256,
    database
  };
}

export async function restoreGridBackup({
  manifestPath,
  dataDir,
  dbPath = join(dataDir, 'grid.sqlite'),
  identity,
  protector,
  expectedDatabaseDigest
}) {
  await assertGridStopped(dataDir);
  if (!DIGEST.test(expectedDatabaseDigest ?? '')) {
    throw new ValidationError('Restore requires an exact expected database digest');
  }
  const verified = await verifyGridBackupArtifact({
    manifestPath,
    dataDir,
    identity,
    protector,
    expectedDatabaseDigest,
    keepDatabase: true
  });

  const { manifest } = verified;
  const recoveryRoot = join(dataDir, 'recovery');
  const replacedDigest = await digestFile(dbPath);
  const rollbackDirectory = join(
    recoveryRoot,
    'rollback',
    `${new Date().toISOString().replaceAll(':', '-')}-${(replacedDigest ?? 'empty').slice(0, 12)}`
  );
  await mkdir(rollbackDirectory, { recursive: true, mode: 0o700 });
  for (const suffix of ['', '-wal', '-shm']) {
    await copyIfPresent(`${dbPath}${suffix}`, join(rollbackDirectory, `grid.sqlite${suffix}`));
  }
  const temporary = `${dbPath}.${process.pid}.${Date.now()}.restore`;
  if (verified.database_path) {
    // Streaming backup: the verified candidate is copied beside the database
    // and renamed into place, never read into memory.
    try {
      await copyFile(verified.database_path, temporary);
    } finally {
      await rm(verified.database_directory, { recursive: true, force: true });
    }
  } else {
    await writeFile(temporary, verified.database, { mode: 0o600, flag: 'wx' });
  }
  await rename(temporary, dbPath);
  await Promise.all([
    rm(`${dbPath}-wal`, { force: true }),
    rm(`${dbPath}-shm`, { force: true })
  ]);

  const recoveryId = `recovery_${digestObject({
    backup_id: manifest.backup_id,
    database_digest: verified.database_digest,
    replaced_database_digest: replacedDigest,
    restored_at: new Date().toISOString()
  })}`;
  const statement = {
    recovery_id: recoveryId,
    backup_id: manifest.backup_id,
    manifest,
    database_digest: verified.database_digest,
    replaced_database_digest: replacedDigest,
    rollback_path: relative(dataDir, rollbackDirectory),
    restored_at: new Date().toISOString()
  };
  const marker = { statement, attestation: identity.signObject(statement) };
  await atomicWrite(
    join(recoveryRoot, RECOVERY_MARKER),
    Buffer.from(`${canonicalJson(marker)}\n`),
    0o600
  );
  return {
    restored: true,
    recovery_id: recoveryId,
    backup_id: manifest.backup_id,
    database_digest: verified.database_digest,
    replaced_database_digest: replacedDigest,
    rollback_path: rollbackDirectory,
    restart_required: true
  };
}

export async function recordPendingRecovery({ store, dataDir, identity }) {
  const path = join(dataDir, 'recovery', RECOVERY_MARKER);
  let marker;
  try {
    marker = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  if (!verifyObjectSignature(marker.statement, marker.attestation, identity.publicKey)) {
    throw new ValidationError('Pending Grid recovery marker attestation is invalid');
  }
  const existing = store.db.prepare(`
    SELECT event_id FROM events WHERE kind = 'backup.restored' AND subject = ?
  `).get(marker.statement.backup_id);
  if (!existing) {
    store.appendEvents({
      traceId: marker.statement.recovery_id,
      actor: 'grid-recovery',
      events: [{
        event_id: `evt_${sha256(canonicalJson(marker)).slice(0, 48)}`,
        kind: 'backup.restored',
        subject: marker.statement.backup_id,
        payload: marker.statement
      }]
    });
  }
  await rm(path, { force: true });
  return marker.statement;
}

export async function acquireGridRuntimeLock(dataDir) {
  const path = join(dataDir, LOCK_FILE);
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const token = crypto.randomUUID();
  const content = `${canonicalJson({ pid: process.pid, token, started_at: new Date().toISOString() })}\n`;
  try {
    await writeFile(path, content, { mode: 0o600, flag: 'wx' });
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new AxiomError('grid_already_running', 'Grid runtime lock already exists', 409);
    }
    throw error;
  }
  return { path, token };
}

export async function releaseGridRuntimeLock(lock) {
  if (!lock) return;
  try {
    const current = JSON.parse(await readFile(lock.path, 'utf8'));
    if (current.token !== lock.token) {
      throw new ValidationError('Grid runtime lock ownership changed');
    }
    await rm(lock.path);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

export async function recoverStaleGridRuntimeLock(dataDir) {
  const path = join(dataDir, LOCK_FILE);
  let current;
  try {
    current = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new ValidationError('Grid runtime lock is invalid and requires operator review');
  }
  if (
    !Number.isSafeInteger(current.pid)
    || current.pid < 1
    || typeof current.token !== 'string'
    || current.token.length < 1
    || current.token.length > 160
  ) {
    throw new ValidationError('Grid runtime lock is invalid and requires operator review');
  }
  if (processIsAlive(current.pid)) {
    throw new AxiomError(
      'grid_is_running',
      'Grid runtime lock belongs to a live process',
      409
    );
  }
  const quarantineDirectory = join(dataDir, 'recovery', 'stale-runtime-locks');
  await mkdir(quarantineDirectory, { recursive: true, mode: 0o700 });
  const quarantinePath = join(
    quarantineDirectory,
    `${new Date().toISOString().replaceAll(':', '-')}-${current.pid}.json`
  );
  await rename(path, quarantinePath);
  return {
    recovered: true,
    stale_pid: current.pid,
    quarantine_path: quarantinePath
  };
}

export async function assertGridStopped(dataDir) {
  try {
    await readFile(join(dataDir, LOCK_FILE), 'utf8');
    throw new AxiomError(
      'grid_is_running',
      'Grid must be stopped before an exact-digest restore',
      409
    );
  } catch (error) {
    if (error.code === 'ENOENT') return true;
    throw error;
  }
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code !== 'ESRCH';
  }
}

async function atomicWrite(path, content, mode) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, content, { mode, flag: 'wx' });
  await rename(temporary, path);
}

async function digestFile(path) {
  try {
    return sha256(await readFile(path));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function copyIfPresent(source, destination) {
  try {
    await copyFile(source, destination);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

export { BACKUP_FORMAT };
