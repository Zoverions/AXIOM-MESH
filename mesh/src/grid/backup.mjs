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

const BACKUP_FORMAT = 'axiom-grid-backup.v1';
const BACKUP_FILE = 'snapshot.axb';
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
  traceId
}) {
  if (!store || !identity || !protector) throw new ValidationError('Grid backup dependencies are missing');
  if (!ID.test(backupId ?? '')) throw new ValidationError('Backup id is invalid');
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
    const database = await readFile(temporaryDatabase);
    const status = store.getStatus();
    const protectionContext = `axiom:grid-backup:${backupId}`;
    const protectedSnapshot = Buffer.from(protector.sealBytes(database, protectionContext));
    const snapshotPath = join(directory, BACKUP_FILE);
    await atomicWrite(snapshotPath, protectedSnapshot, 0o600);

    const unsigned = {
      format: BACKUP_FORMAT,
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
        bytes: database.length,
        sha256: sha256(database),
        schema_version: status.schema_version,
        evidence_events: status.last_seq,
        evidence_head: status.last_hash
      },
      snapshot: {
        name: BACKUP_FILE,
        media_type: 'application/vnd.axiom.encrypted-sqlite',
        bytes: protectedSnapshot.length,
        sha256: sha256(protectedSnapshot),
        protection: 'A256GCM',
        context: protectionContext
      },
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
  const unsigned = structuredClone(manifest);
  delete unsigned.attestation;
  if (!verifyObjectSignature(unsigned, manifest.attestation, gridPublicKey)) {
    throw new ValidationError('Grid backup attestation is invalid');
  }
  const database = protector.openBytes(
    protectedSnapshot.toString('utf8'),
    manifest.snapshot.context
  );
  const databaseDigest = sha256(database);
  if (
    manifest.database?.bytes !== database.length
    || manifest.database?.sha256 !== databaseDigest
  ) throw new ValidationError('Grid backup database digest or byte count does not match');
  if (expectedDatabaseDigest !== undefined) {
    if (!DIGEST.test(expectedDatabaseDigest)) throw new ValidationError('Expected database digest is invalid');
    if (databaseDigest !== expectedDatabaseDigest) {
      throw new ValidationError('Grid backup does not match the exact expected database digest');
    }
  }
  return {
    valid: true,
    backup_id: manifest.backup_id,
    database_digest: databaseDigest,
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
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const snapshotName = manifest.snapshot?.name;
  if (snapshotName !== basename(snapshotName ?? '') || snapshotName !== BACKUP_FILE) {
    throw new ValidationError('Grid backup snapshot path is invalid');
  }
  const snapshotPath = join(dirname(manifestPath), snapshotName);
  const protectedSnapshot = await readFile(snapshotPath);
  const verified = verifyGridBackup({
    manifest,
    protectedSnapshot,
    gridPublicKey: identity.publicKey,
    protector,
    expectedDatabaseDigest
  });

  const recoveryRoot = join(dataDir, 'recovery');
  await mkdir(recoveryRoot, { recursive: true, mode: 0o700 });
  const validationDirectory = await mkdtemp(join(recoveryRoot, 'verify-'));
  const validationPath = join(validationDirectory, 'grid.sqlite');
  try {
    await writeFile(validationPath, verified.database, { mode: 0o600, flag: 'wx' });
    const { GridStore } = await import('./store.mjs');
    const candidate = new GridStore({
      path: validationPath,
      dataDir,
      identity,
      protector
    });
    const chain = candidate.verifyChain();
    candidate.close();
    if (!chain.valid) throw new ValidationError(`Restored Grid evidence is invalid: ${chain.reason}`);
    if (
      chain.events !== manifest.database.evidence_events
      || chain.head !== manifest.database.evidence_head
    ) throw new ValidationError('Restored Grid evidence head does not match the signed manifest');
  } finally {
    await rm(validationDirectory, { recursive: true, force: true });
  }

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
  await writeFile(temporary, verified.database, { mode: 0o600, flag: 'wx' });
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
