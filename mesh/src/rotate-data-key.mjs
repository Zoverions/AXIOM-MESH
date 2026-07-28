import {
  hkdfSync,
  randomBytes
} from 'node:crypto';
import { backup as sqliteBackup, DatabaseSync } from 'node:sqlite';
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
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
  ensureMeshIdentity,
  verifyObjectSignature
} from './lib/identity.mjs';
import { DataProtector } from './lib/protector.mjs';
import {
  ACTIVE_POINTER_FILE,
  ACTIVE_POINTER_FORMAT,
  CREDENTIAL_STATE_KEY_FILE,
  DATA_KEY_ROTATION_FORMAT,
  loadCredentialStateAuthenticationKeys,
  readActiveDataKeyPointer,
  verifyDataKeyRotationManifestAttestation
} from './lib/data-key-history.mjs';
import {
  SIDECAR_SUFFIX,
  prepareProtectedArtifactRewrap
} from './lib/protected-artifact.mjs';
import {
  acquireGridRuntimeLock,
  recoverStaleGridRuntimeLock,
  releaseGridRuntimeLock
} from './grid/backup.mjs';
import {
  GridStore,
  loadGridVerificationKeys,
  reencryptGridProtectedColumns
} from './grid/store.mjs';
import { verifyCredentialRotationManifest } from './rotate-production.mjs';

const MANIFEST_FILE = 'manifest.json';
const PRIOR_KEY_FILE = 'prior-key.axk';
const DATABASE_ROLLBACK_FILE = 'database.before.axd';
const FILES_ROLLBACK_FILE = 'files.before.axk';
const ROLLBACK_RESULT_FILE = 'rollback-result.json';
const PENDING_MARKER = 'pending-data-key-rotation.json';
const ROTATION_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const MAX_DATABASE_BYTES = 512 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;
const MAX_KEY_ENVELOPE_BYTES = 64 * 1024;
const MAX_ARTIFACTS = 512;
const MAX_DATABASE_COPIES = 128;
const MESH_SERVICES = Object.freeze([
  'gateway',
  'hypervisor',
  'sandbox',
  'grid'
]);

export async function rotateDataProtectionKey({
  dataDir,
  secretDir,
  rotationId = createRotationId()
}) {
  const roots = resolveRoots(dataDir, secretDir);
  assertRotationId(rotationId);
  let workRoot;
  let staleRuntimeLockRecovered = false;
  let lock;
  try {
    lock = await acquireGridRuntimeLock(roots.data);
  } catch (error) {
    if (error.code !== 'grid_already_running') throw error;
    await recoverStaleGridRuntimeLock(roots.data);
    staleRuntimeLockRecovered = true;
    lock = await acquireGridRuntimeLock(roots.data);
  }
  try {
    await assertNoPendingRotation(roots.data);
    await cleanupAbandonedRotationWorkDirectories(roots.data);
    const currentPointer = await readActiveDataKeyPointer(roots.data);
    const currentKey = await readDataKey(roots.secret);
    let nextKey;
    do {
      nextKey = randomBytes(32);
    } while (nextKey.equals(currentKey));
    const sourceProtector = new DataProtector(currentKey);
    const targetProtector = new DataProtector(nextKey);
    const identity = await ensureMeshIdentity(roots.data, 'grid', {
      create: false
    });
    const verificationKeys = loadGridVerificationKeys(
      roots.data,
      identity
    );
    const rotationRoot = join(
      roots.data,
      'data-key-rotations',
      rotationId
    );
    await createRotationDirectory(rotationRoot);
    workRoot = join(rotationRoot, '.work');
    await mkdir(workRoot, { mode: 0o700 });

    const sourceDatabasePath = join(roots.data, 'grid.sqlite');
    const cleanSourcePath = join(workRoot, 'database.before.sqlite');
    const candidatePath = join(workRoot, 'database.after.sqlite');
    const sourceStore = new GridStore({
      path: sourceDatabasePath,
      dataDir: roots.data,
      identity,
      protector: sourceProtector
    });
    const sourceStatus = sourceStore.getStatus();
    try {
      await sqliteBackup(sourceStore.db, cleanSourcePath, { rate: 64 });
    } finally {
      sourceStore.close();
    }
    await copyFile(cleanSourcePath, candidatePath);
    const candidateDb = new DatabaseSync(candidatePath);
    let reencrypted;
    try {
      reencrypted = reencryptGridProtectedColumns({
        db: candidateDb,
        sourceProtector,
        targetProtector
      });
    } finally {
      candidateDb.close();
    }
    const candidateStore = new GridStore({
      path: candidatePath,
      dataDir: roots.data,
      identity,
      protector: targetProtector
    });
    const candidateStatus = candidateStore.getStatus();
    const candidateChain = candidateStore.verifyChain();
    candidateStore.close();
    assertEquivalentGridState(sourceStatus, candidateStatus, candidateChain);

    const databaseCopies = await discoverRecoveryDatabases(roots.data);
    const preparedDatabaseCopies = [];
    for (const [index, databaseCopy] of databaseCopies.entries()) {
      preparedDatabaseCopies.push(await prepareDatabaseCopyReencryption({
        databaseCopy,
        workRoot,
        index,
        dataDir: roots.data,
        identity,
        sourceProtector,
        targetProtector
      }));
    }
    const artifacts = await discoverProtectedArtifacts(
      roots.data,
      verificationKeys
    );
    const preparedArtifacts = [];
    for (const [index, artifact] of artifacts.entries()) {
      preparedArtifacts.push({
        ...artifact,
        prepared: await prepareProtectedArtifactRewrap({
          artifactPath: artifact.path,
          relativePath: artifact.relative_path,
          context: artifact.context,
          encoding: artifact.encoding,
          expected: artifact.expected,
          expectedPlaintext: artifact.expected_plaintext,
          sourceProtector,
          targetProtector,
          identity,
          rotationId,
          verificationKeys,
          transform: artifact.kind === 'backup'
            ? database => reencryptBackupDatabase({
              database,
              workRoot,
              index,
              artifact,
              dataDir: roots.data,
              identity,
              sourceProtector,
              targetProtector
            })
            : undefined
        })
      });
    }

    const previousPointerContent = await readOptionalFile(
      join(roots.data, ACTIVE_POINTER_FILE)
    );
    const rollbackFiles = await snapshotArtifactFiles(
      preparedArtifacts,
      previousPointerContent
    );
    const priorKeyContext = `axiom:data-key-rotation:${rotationId}:prior-key`;
    const databaseContext = `axiom:data-key-rotation:${rotationId}:database-before`;
    const filesContext = `axiom:data-key-rotation:${rotationId}:files-before`;
    const priorKeyEnvelope = protectedBytes(
      targetProtector,
      currentKey,
      priorKeyContext
    );
    const databaseBefore = await readBoundedFile(
      cleanSourcePath,
      MAX_DATABASE_BYTES
    );
    const databaseEnvelope = protectedBytes(
      targetProtector,
      databaseBefore,
      databaseContext
    );
    const filesEnvelope = Buffer.from(
      `${targetProtector.seal(rollbackFiles, filesContext)}\n`,
      'utf8'
    );
    await Promise.all([
      writeExclusive(
        join(rotationRoot, PRIOR_KEY_FILE),
        priorKeyEnvelope,
        0o600
      ),
      writeExclusive(
        join(rotationRoot, DATABASE_ROLLBACK_FILE),
        databaseEnvelope,
        0o600
      ),
      writeExclusive(
        join(rotationRoot, FILES_ROLLBACK_FILE),
        filesEnvelope,
        0o600
      )
    ]);

    const databaseAfter = await readBoundedFile(
      candidatePath,
      MAX_DATABASE_BYTES
    );
    const signerPublicKey = String(identity.publicKey.export({
      type: 'spki',
      format: 'pem'
    }));
    const unsigned = {
      format: DATA_KEY_ROTATION_FORMAT,
      schema_version: 1,
      rotation_id: rotationId,
      created_at: new Date().toISOString(),
      previous: currentPointer,
      scope: {
        grid_database: true,
        recovery_databases: true,
        protected_artifacts: true,
        service_identities: false,
        operator_api_token: false
      },
      signer: {
        service: 'grid',
        key_id: identity.keyId,
        public_key_pem: signerPublicKey
      },
      database: {
        before: metadata(databaseBefore),
        after: metadata(databaseAfter),
        evidence_events: sourceStatus.last_seq,
        evidence_head: sourceStatus.last_hash,
        protected_values: reencrypted.protected_values,
        protected_values_by_table: reencrypted.tables
      },
      recovery_databases: preparedDatabaseCopies.map(item => ({
        path: item.relative_path,
        before: item.before,
        after: item.after,
        schema_version: item.status.schema_version,
        evidence_events: item.status.last_seq,
        evidence_head: item.status.last_hash,
        protected_values: item.reencrypted.protected_values
      })),
      artifacts: preparedArtifacts.map(artifact => ({
        kind: artifact.kind,
        path: artifact.relative_path,
        sidecar_path: `${artifact.relative_path}${SIDECAR_SUFFIX}`,
        context: artifact.context,
        encoding: artifact.encoding,
        before: artifact.prepared.before,
        after: artifact.prepared.after,
        ...(artifact.expected_plaintext ? {
          plaintext: artifact.prepared.rewrap.plaintext
        } : {})
      })),
      key_history: {
        prior_key: envelopeMetadata(
          PRIOR_KEY_FILE,
          priorKeyEnvelope,
          priorKeyContext
        )
      },
      rollback: {
        requires_stopped_runtime: true,
        preserves_post_rotation_grid_state: true,
        requires_rotation_artifacts_present: true,
        database: envelopeMetadata(
          DATABASE_ROLLBACK_FILE,
          databaseEnvelope,
          databaseContext
        ),
        files: envelopeMetadata(
          FILES_ROLLBACK_FILE,
          filesEnvelope,
          filesContext
        )
      }
    };
    const manifest = {
      ...unsigned,
      attestation: identity.signObject(unsigned)
    };
    verifyDataKeyRotationManifest({ manifest });
    const manifestContent = Buffer.from(
      `${canonicalJson(manifest)}\n`,
      'utf8'
    );
    const manifestPath = join(rotationRoot, MANIFEST_FILE);
    await writeExclusive(manifestPath, manifestContent, 0o600);
    const activePointer = {
      format: ACTIVE_POINTER_FORMAT,
      manifest_path: portableRelative(roots.data, manifestPath),
      manifest_sha256: sha256(manifestContent)
    };
    const activePointerContent = Buffer.from(
      `${canonicalJson(activePointer)}\n`,
      'utf8'
    );
    const markerPath = join(roots.data, PENDING_MARKER);
    await writeExclusive(
      markerPath,
      Buffer.from(`${canonicalJson({
        format: DATA_KEY_ROTATION_FORMAT,
        rotation_id: rotationId,
        manifest_sha256: sha256(manifestContent),
        transaction: 'applying'
      })}\n`, 'utf8'),
      0o600
    );

    const entries = [
      {
        path: sourceDatabasePath,
        content: databaseAfter,
        mode: 0o600
      },
      {
        path: `${sourceDatabasePath}-wal`,
        content: null,
        mode: 0o600
      },
      {
        path: `${sourceDatabasePath}-shm`,
        content: null,
        mode: 0o600
      }
    ];
    for (const databaseCopy of preparedDatabaseCopies) {
      entries.push(
        {
          path: databaseCopy.path,
          content: databaseCopy.database,
          mode: 0o600
        },
        {
          path: `${databaseCopy.path}-wal`,
          content: null,
          mode: 0o600
        },
        {
          path: `${databaseCopy.path}-shm`,
          content: null,
          mode: 0o600
        }
      );
    }
    for (const artifact of preparedArtifacts) {
      entries.push(
        {
          path: artifact.path,
          content: artifact.prepared.artifact,
          mode: 0o600
        },
        {
          path: artifact.prepared.sidecar_path,
          content: artifact.prepared.sidecar,
          mode: 0o600
        }
      );
    }
    entries.push(
      {
        path: join(roots.data, ACTIVE_POINTER_FILE),
        content: activePointerContent,
        mode: 0o600
      },
      {
        path: join(roots.secret, 'data-protection.key'),
        content: Buffer.from(`${nextKey.toString('base64url')}\n`, 'utf8'),
        mode: 0o600
      }
    );
    try {
      await applyFileTransaction({
        entries,
        transactionDir: join(rotationRoot, 'transaction')
      });
      const installed = new GridStore({
        path: sourceDatabasePath,
        dataDir: roots.data,
        identity,
        protector: targetProtector
      });
      const installedStatus = installed.getStatus();
      const installedChain = installed.verifyChain();
      installed.close();
      assertEquivalentGridState(
        sourceStatus,
        installedStatus,
        installedChain
      );
      await rm(markerPath);
    } catch (error) {
      if (error.fileTransactionRestored === true) {
        await rm(markerPath, { force: true });
      }
      throw error;
    } finally {
      await rm(workRoot, { recursive: true, force: true });
    }
    return {
      rotated: true,
      rotation_id: rotationId,
      manifest_path: manifestPath,
      protected_values: reencrypted.protected_values,
      recovery_databases: preparedDatabaseCopies.length,
      protected_artifacts: preparedArtifacts.length,
      evidence_events: sourceStatus.last_seq,
      evidence_head: sourceStatus.last_hash,
      rollback_available: true,
      stale_runtime_lock_recovered: staleRuntimeLockRecovered,
      restart_required: true
    };
  } finally {
    if (workRoot) {
      await rm(workRoot, { recursive: true, force: true });
    }
    await releaseGridRuntimeLock(lock);
  }
}

export async function rollbackDataProtectionKey({
  manifestPath,
  dataDir,
  secretDir
}) {
  const roots = resolveRoots(dataDir, secretDir);
  const resolvedManifestPath = resolveRequiredPath(
    manifestPath,
    'data-key rotation manifest'
  );
  const manifestContent = await readBoundedFile(
    resolvedManifestPath,
    MAX_MANIFEST_BYTES
  );
  const manifest = JSON.parse(manifestContent.toString('utf8'));
  verifyDataKeyRotationManifest({ manifest });
  assertManifestLocation(manifest, resolvedManifestPath, roots.data);

  let staleRuntimeLockRecovered = false;
  let rollbackJournalRecovered = false;
  let lock;
  let workRoot;
  try {
    lock = await acquireGridRuntimeLock(roots.data);
  } catch (error) {
    if (error.code !== 'grid_already_running') throw error;
    await recoverStaleGridRuntimeLock(roots.data);
    staleRuntimeLockRecovered = true;
    lock = await acquireGridRuntimeLock(roots.data);
  }
  try {
    let pending = await readPendingRotation(roots.data);
    if (
      pending
      && (
        pending.rotation_id !== manifest.rotation_id
        || pending.manifest_sha256 !== sha256(manifestContent)
      )
    ) {
      throw new ValidationError(
        'Pending data-key rotation marker does not match the requested manifest'
      );
    }
    if (pending?.transaction === 'rolling_back') {
      const rollbackTransactionDir = join(
        dirname(resolvedManifestPath),
        'rollback-transaction'
      );
      if (await directoryExists(rollbackTransactionDir)) {
        const targets = await readFileTransactionPlan({
          transactionDir: rollbackTransactionDir,
          roots,
          expectedDigest: pending.transaction_plan_sha256
        });
        await recoverInterruptedFileTransaction({
          targets,
          transactionDir: rollbackTransactionDir
        });
        await cleanupRollbackWorkDirectories(dirname(resolvedManifestPath));
        await rm(join(roots.data, PENDING_MARKER), { force: true });
        rollbackJournalRecovered = true;
        pending = null;
      } else {
        const completed = await recordCompletedInterruptedDataKeyRollback({
          manifest,
          manifestPath: resolvedManifestPath,
          roots,
          staleRuntimeLockRecovered
        });
        await rm(join(roots.data, PENDING_MARKER), { force: true });
        return completed;
      }
    }
    const transactionDir = join(
      dirname(resolvedManifestPath),
      'transaction'
    );
    const interruptedTransaction = await directoryExists(transactionDir);
    const activePointer = await readActiveDataKeyPointer(roots.data);
    const requestedPointerActive = pointerMatchesManifest({
      pointer: activePointer,
      manifestPath: resolvedManifestPath,
      manifestContent,
      dataDir: roots.data
    });
    if (pending?.transaction === 'applying' && interruptedTransaction) {
      await recoverInterruptedFileTransaction({
        targets: rotationTransactionTargets(manifest, roots),
        transactionDir
      });
      await rm(join(roots.data, PENDING_MARKER), { force: true });
      return recordInterruptedDataKeyRollback({
        manifest,
        manifestPath: resolvedManifestPath,
        roots,
        staleRuntimeLockRecovered,
        transactionRecovered: true
      });
    }
    if (pending?.transaction === 'applying' && !requestedPointerActive) {
      await rm(join(roots.data, PENDING_MARKER), { force: true });
      return recordInterruptedDataKeyRollback({
        manifest,
        manifestPath: resolvedManifestPath,
        roots,
        staleRuntimeLockRecovered,
        transactionRecovered: false
      });
    }
    if (
      pending?.transaction === 'applying'
      && requestedPointerActive
      && !interruptedTransaction
    ) {
      await rm(join(roots.data, PENDING_MARKER), { force: true });
      pending = null;
    }
    if (!pointerMatchesManifest({
      pointer: activePointer,
      manifestPath: resolvedManifestPath,
      manifestContent,
      dataDir: roots.data
    })) {
      throw new ValidationError(
        'Only the active data-key rotation may be rolled back'
      );
    }
    await cleanupRollbackWorkDirectories(dirname(resolvedManifestPath));
    const currentKey = await readDataKey(roots.secret);
    const currentProtector = new DataProtector(currentKey);
    const priorMetadata = manifest.key_history.prior_key;
    const priorEnvelope = await readEnvelope(
      dirname(resolvedManifestPath),
      priorMetadata
    );
    const priorKey = currentProtector.openBytes(
      priorEnvelope.toString('utf8'),
      priorMetadata.context
    );
    if (priorKey.length !== 32) {
      throw new ValidationError('Data-key rollback prior key is invalid');
    }
    const targetProtector = new DataProtector(priorKey);
    const identity = await ensureMeshIdentity(roots.data, 'grid', {
      create: false
    });
    const verificationKeys = loadGridVerificationKeys(
      roots.data,
      identity
    );
    const credentialStateContext = (
      `axiom:data-key-rotation:${manifest.rotation_id}:credential-state-key`
    );
    const credentialStateKeys = await loadCredentialStateAuthenticationKeys({
      dataDir: roots.data,
      currentKey,
      verificationKeys
    });
    const credentialStateEnvelope = protectedBytes(
      targetProtector,
      credentialStateHistoryPayload({
        keys: credentialStateKeys,
        restoredKey: priorKey
      }),
      credentialStateContext
    );
    await atomicWrite(
      join(dirname(resolvedManifestPath), CREDENTIAL_STATE_KEY_FILE),
      credentialStateEnvelope,
      0o600
    );
    const credentialStateDescriptor = envelopeMetadata(
      CREDENTIAL_STATE_KEY_FILE,
      credentialStateEnvelope,
      credentialStateContext
    );
    workRoot = join(
      dirname(resolvedManifestPath),
      `.rollback-work-${process.pid}-${Date.now()}`
    );
    await mkdir(workRoot, { mode: 0o700 });
    const currentDatabaseCopies = await discoverRecoveryDatabases(
      roots.data
    );
    assertDatabaseCopyInventory(
      manifest.recovery_databases,
      currentDatabaseCopies
    );
    const preparedDatabaseCopies = [];
    for (const [index, databaseCopy] of currentDatabaseCopies.entries()) {
      preparedDatabaseCopies.push(await prepareDatabaseCopyReencryption({
        databaseCopy,
        workRoot,
        index,
        dataDir: roots.data,
        identity,
        sourceProtector: currentProtector,
        targetProtector
      }));
    }
    const currentArtifacts = await discoverProtectedArtifacts(
      roots.data,
      verificationKeys
    );
    assertArtifactInventory(manifest.artifacts, currentArtifacts);
    const rollbackId = `${manifest.rotation_id}:rollback`;
    const preparedArtifacts = [];
    for (const [index, artifact] of currentArtifacts.entries()) {
      preparedArtifacts.push({
        ...artifact,
        prepared: await prepareProtectedArtifactRewrap({
          artifactPath: artifact.path,
          relativePath: artifact.relative_path,
          context: artifact.context,
          encoding: artifact.encoding,
          expected: artifact.expected,
          expectedPlaintext: artifact.expected_plaintext,
          sourceProtector: currentProtector,
          targetProtector,
          identity,
          rotationId: rollbackId,
          verificationKeys,
          transform: artifact.kind === 'backup'
            ? database => reencryptBackupDatabase({
              database,
              workRoot,
              index,
              artifact,
              dataDir: roots.data,
              identity,
              sourceProtector: currentProtector,
              targetProtector
            })
            : undefined
        })
      });
    }

    const databasePath = join(roots.data, 'grid.sqlite');
    const candidatePath = join(workRoot, 'database.rollback.sqlite');
    const currentStore = new GridStore({
      path: databasePath,
      dataDir: roots.data,
      identity,
      protector: currentProtector
    });
    const currentStatus = currentStore.getStatus();
    try {
      await sqliteBackup(currentStore.db, candidatePath, { rate: 64 });
    } finally {
      currentStore.close();
    }
    const candidateDb = new DatabaseSync(candidatePath);
    let reencrypted;
    try {
      reencrypted = reencryptGridProtectedColumns({
        db: candidateDb,
        sourceProtector: currentProtector,
        targetProtector
      });
    } finally {
      candidateDb.close();
    }
    const candidateStore = new GridStore({
      path: candidatePath,
      dataDir: roots.data,
      identity,
      protector: targetProtector
    });
    const candidateStatus = candidateStore.getStatus();
    const candidateChain = candidateStore.verifyChain();
    candidateStore.close();
    assertEquivalentGridState(
      currentStatus,
      candidateStatus,
      candidateChain
    );
    const candidate = await readBoundedFile(
      candidatePath,
      MAX_DATABASE_BYTES
    );
    const entries = [
      { path: databasePath, content: candidate, mode: 0o600 },
      { path: `${databasePath}-wal`, content: null, mode: 0o600 },
      { path: `${databasePath}-shm`, content: null, mode: 0o600 }
    ];
    for (const databaseCopy of preparedDatabaseCopies) {
      entries.push(
        {
          path: databaseCopy.path,
          content: databaseCopy.database,
          mode: 0o600
        },
        {
          path: `${databaseCopy.path}-wal`,
          content: null,
          mode: 0o600
        },
        {
          path: `${databaseCopy.path}-shm`,
          content: null,
          mode: 0o600
        }
      );
    }
    for (const artifact of preparedArtifacts) {
      entries.push(
        {
          path: artifact.path,
          content: artifact.prepared.artifact,
          mode: 0o600
        },
        {
          path: artifact.prepared.sidecar_path,
          content: artifact.prepared.sidecar,
          mode: 0o600
        }
      );
    }
    entries.push(
      {
        path: join(roots.data, ACTIVE_POINTER_FILE),
        content: manifest.previous
          ? Buffer.from(`${canonicalJson(manifest.previous)}\n`, 'utf8')
          : null,
        mode: 0o600
      },
      {
        path: join(roots.secret, 'data-protection.key'),
        content: Buffer.from(`${priorKey.toString('base64url')}\n`, 'utf8'),
        mode: 0o600
      }
    );
    const rollbackPlan = fileTransactionPlanContent(entries);
    await writeExclusive(
      join(roots.data, PENDING_MARKER),
      Buffer.from(`${canonicalJson({
        format: DATA_KEY_ROTATION_FORMAT,
        rotation_id: manifest.rotation_id,
        manifest_sha256: sha256(manifestContent),
        transaction: 'rolling_back',
        transaction_plan_sha256: sha256(rollbackPlan)
      })}\n`, 'utf8'),
      0o600
    );
    try {
      await applyFileTransaction({
        entries,
        transactionDir: join(
          dirname(resolvedManifestPath),
          'rollback-transaction'
        )
      });
    } catch (error) {
      if (error.fileTransactionRestored === true) {
        await rm(join(roots.data, PENDING_MARKER), { force: true });
      }
      throw error;
    }
    maybeInjectCompletedRollbackCrash();
    const installed = new GridStore({
      path: databasePath,
      dataDir: roots.data,
      identity,
      protector: targetProtector
    });
    const installedStatus = installed.getStatus();
    const installedChain = installed.verifyChain();
    installed.close();
    assertEquivalentGridState(
      currentStatus,
      installedStatus,
      installedChain
    );
    const statement = {
      format: 'axiom-data-key-rollback-result.v1',
      schema_version: 1,
      rotation_id: manifest.rotation_id,
      rolled_back_at: new Date().toISOString(),
      rotation_applied: true,
      interrupted_rotation_recovered: (
        Boolean(pending) || rollbackJournalRecovered
      ),
      transaction_journal_recovered: rollbackJournalRecovered,
      protected_values: reencrypted.protected_values,
      recovery_databases: preparedDatabaseCopies.length,
      protected_artifacts: preparedArtifacts.length,
      evidence_events: currentStatus.last_seq,
      evidence_head: currentStatus.last_hash,
      preserves_post_rotation_grid_state: true,
      stale_runtime_lock_recovered: staleRuntimeLockRecovered,
      credential_state_authentication_key: credentialStateDescriptor,
      signer: gridSigner(identity),
      restart_required: true
    };
    const result = {
      ...statement,
      attestation: identity.signObject(statement)
    };
    await atomicWrite(
      join(dirname(resolvedManifestPath), ROLLBACK_RESULT_FILE),
      Buffer.from(`${canonicalJson(result)}\n`, 'utf8'),
      0o600
    );
    await Promise.all([
      rm(join(roots.data, PENDING_MARKER), { force: true }),
      rm(workRoot, { recursive: true, force: true })
    ]);
    return {
      rolled_back: true,
      rotation_id: manifest.rotation_id,
      rotation_applied: true,
      interrupted_rotation_recovered: (
        Boolean(pending) || rollbackJournalRecovered
      ),
      transaction_journal_recovered: rollbackJournalRecovered,
      protected_values: reencrypted.protected_values,
      recovery_databases: preparedDatabaseCopies.length,
      protected_artifacts: preparedArtifacts.length,
      evidence_events: currentStatus.last_seq,
      evidence_head: currentStatus.last_hash,
      preserves_post_rotation_grid_state: true,
      stale_runtime_lock_recovered: staleRuntimeLockRecovered,
      restart_required: true
    };
  } finally {
    if (workRoot) {
      await rm(workRoot, { recursive: true, force: true });
    }
    await releaseGridRuntimeLock(lock);
  }
}

export function verifyDataKeyRotationManifest({ manifest }) {
  verifyDataKeyRotationManifestAttestation(manifest);
  assertMetadata(manifest.database?.before, 'Data-key source database');
  assertMetadata(manifest.database?.after, 'Data-key target database');
  if (
    manifest.database.before.sha256 === manifest.database.after.sha256
    || !Number.isSafeInteger(manifest.database?.evidence_events)
    || manifest.database.evidence_events < 0
    || !DIGEST.test(manifest.database?.evidence_head ?? '')
    || !Number.isSafeInteger(manifest.database?.protected_values)
    || manifest.database.protected_values < 0
    || !Array.isArray(manifest.recovery_databases)
    || manifest.recovery_databases.length > MAX_DATABASE_COPIES
    || !Array.isArray(manifest.artifacts)
    || manifest.artifacts.length > MAX_ARTIFACTS
  ) {
    throw new ValidationError('Data-key rotation database evidence is invalid');
  }
  const paths = new Set();
  for (const database of manifest.recovery_databases) {
    assertPortablePath(database.path);
    assertMetadata(database.before, 'Data-key source recovery database');
    assertMetadata(database.after, 'Data-key target recovery database');
    if (
      database.before.sha256 === database.after.sha256
      || !Number.isSafeInteger(database.schema_version)
      || database.schema_version < 1
      || !Number.isSafeInteger(database.evidence_events)
      || database.evidence_events < 0
      || !DIGEST.test(database.evidence_head ?? '')
      || !Number.isSafeInteger(database.protected_values)
      || database.protected_values < 0
      || paths.has(database.path)
    ) {
      throw new ValidationError(
        'Data-key rotation recovery database evidence is invalid'
      );
    }
    paths.add(database.path);
  }
  for (const artifact of manifest.artifacts) {
    assertPortablePath(artifact.path);
    assertPortablePath(artifact.sidecar_path);
    assertMetadata(artifact.before, 'Data-key source artifact');
    assertMetadata(artifact.after, 'Data-key target artifact');
    if (artifact.kind === 'backup') {
      assertMetadata(
        artifact.plaintext?.source,
        'Data-key source backup plaintext'
      );
      assertMetadata(
        artifact.plaintext?.target,
        'Data-key target backup plaintext'
      );
    } else if (artifact.plaintext !== undefined) {
      throw new ValidationError(
        'Data-key credential artifact has unexpected plaintext metadata'
      );
    }
    if (
      !['backup', 'credential-rollback', 'credential-forward'].includes(
        artifact.kind
      )
      || !['bytes', 'json'].includes(artifact.encoding)
      || typeof artifact.context !== 'string'
      || artifact.context.length < 1
      || artifact.context.length > 512
      || artifact.before.sha256 === artifact.after.sha256
      || (
        artifact.kind === 'backup'
        && artifact.plaintext.source.sha256 === artifact.plaintext.target.sha256
      )
      || paths.has(artifact.path)
    ) {
      throw new ValidationError('Data-key rotation artifact evidence is invalid');
    }
    paths.add(artifact.path);
  }
  for (const [name, envelope] of [
    [PRIOR_KEY_FILE, manifest.key_history?.prior_key],
    [DATABASE_ROLLBACK_FILE, manifest.rollback?.database],
    [FILES_ROLLBACK_FILE, manifest.rollback?.files]
  ]) {
    if (
      envelope?.name !== name
      || envelope?.algorithm !== 'A256GCM'
      || !Number.isSafeInteger(envelope?.bytes)
      || envelope.bytes < 1
      || !DIGEST.test(envelope?.sha256 ?? '')
      || typeof envelope?.context !== 'string'
    ) {
      throw new ValidationError('Data-key rotation rollback metadata is invalid');
    }
  }
  if (
    manifest.rollback?.requires_stopped_runtime !== true
    || manifest.rollback?.preserves_post_rotation_grid_state !== true
    || manifest.rollback?.requires_rotation_artifacts_present !== true
  ) {
    throw new ValidationError('Data-key rotation rollback policy is invalid');
  }
  return {
    valid: true,
    rotation_id: manifest.rotation_id,
    protected_values: manifest.database.protected_values,
    recovery_databases: manifest.recovery_databases.length,
    protected_artifacts: manifest.artifacts.length
  };
}

async function discoverRecoveryDatabases(dataDir) {
  const rollbackRoot = join(dataDir, 'recovery', 'rollback');
  const databases = [];
  for (const entry of await readDirectories(rollbackRoot)) {
    const path = join(rollbackRoot, entry, 'grid.sqlite');
    try {
      await assertRegularDatabaseFile(path);
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    databases.push({
      path,
      relative_path: portableRelative(dataDir, path)
    });
  }
  if (databases.length > MAX_DATABASE_COPIES) {
    throw new ValidationError(
      'Recovery database inventory exceeds the rotation limit'
    );
  }
  return databases.sort((left, right) => (
    left.relative_path.localeCompare(right.relative_path)
  ));
}

async function prepareDatabaseCopyReencryption({
  databaseCopy,
  workRoot,
  index,
  dataDir,
  identity,
  sourceProtector,
  targetProtector
}) {
  const cleanPath = join(workRoot, `recovery-${index}.before.sqlite`);
  const candidatePath = join(workRoot, `recovery-${index}.after.sqlite`);
  const sourceDb = new DatabaseSync(databaseCopy.path);
  try {
    await sqliteBackup(sourceDb, cleanPath, { rate: 64 });
  } finally {
    sourceDb.close();
  }
  const sourceStore = new GridStore({
    path: cleanPath,
    dataDir,
    identity,
    protector: sourceProtector
  });
  const sourceStatus = sourceStore.getStatus();
  const sourceChain = sourceStore.verifyChain();
  sourceStore.close();
  if (!sourceChain.valid) {
    throw new ValidationError(
      'Recovery database evidence is invalid before re-encryption'
    );
  }
  const before = await readBoundedFile(cleanPath, MAX_DATABASE_BYTES);
  await copyFile(cleanPath, candidatePath);
  const candidateDb = new DatabaseSync(candidatePath);
  let reencrypted;
  try {
    reencrypted = reencryptGridProtectedColumns({
      db: candidateDb,
      sourceProtector,
      targetProtector
    });
  } finally {
    candidateDb.close();
  }
  const candidateStore = new GridStore({
    path: candidatePath,
    dataDir,
    identity,
    protector: targetProtector
  });
  const candidateStatus = candidateStore.getStatus();
  const candidateChain = candidateStore.verifyChain();
  candidateStore.close();
  assertEquivalentGridState(
    sourceStatus,
    candidateStatus,
    candidateChain
  );
  const database = await readBoundedFile(
    candidatePath,
    MAX_DATABASE_BYTES
  );
  await Promise.all([
    rm(cleanPath, { force: true }),
    rm(`${cleanPath}-wal`, { force: true }),
    rm(`${cleanPath}-shm`, { force: true }),
    rm(candidatePath, { force: true }),
    rm(`${candidatePath}-wal`, { force: true }),
    rm(`${candidatePath}-shm`, { force: true })
  ]);
  return {
    ...databaseCopy,
    database,
    before: metadata(before),
    after: metadata(database),
    status: sourceStatus,
    reencrypted
  };
}

async function discoverProtectedArtifacts(dataDir, verificationKeys) {
  const artifacts = [];
  const backupsRoot = join(dataDir, 'backups');
  for (const entry of await readDirectories(backupsRoot)) {
    if (entry === '.tmp') continue;
    const directory = join(backupsRoot, entry);
    const manifest = JSON.parse((await readBoundedFile(
      join(directory, MANIFEST_FILE),
      MAX_MANIFEST_BYTES
    )).toString('utf8'));
    if (
      manifest?.format !== 'axiom-grid-backup.v1'
      || manifest.snapshot?.name !== 'snapshot.axb'
    ) {
      throw new ValidationError('Unsupported backup artifact during data-key rotation');
    }
    const backupSigner = verificationKeys.get(
      manifest.attestation?.key_id
    );
    const unsigned = structuredClone(manifest);
    delete unsigned.attestation;
    if (
      !backupSigner
      || !verifyObjectSignature(unsigned, manifest.attestation, backupSigner)
    ) {
      throw new ValidationError(
        'Backup artifact attestation is invalid during data-key rotation'
      );
    }
    const path = join(directory, manifest.snapshot.name);
    artifacts.push({
      kind: 'backup',
      path,
      relative_path: portableRelative(dataDir, path),
      context: manifest.snapshot.context,
      encoding: 'bytes',
      expected: {
        bytes: manifest.snapshot.bytes,
        sha256: manifest.snapshot.sha256
      },
      expected_plaintext: {
        bytes: manifest.database.bytes,
        sha256: manifest.database.sha256
      },
      database: {
        schema_version: manifest.database.schema_version,
        evidence_events: manifest.database.evidence_events,
        evidence_head: manifest.database.evidence_head
      }
    });
  }

  const credentialRoot = join(dataDir, 'credential-rotations');
  for (const entry of await readDirectories(credentialRoot)) {
    const directory = join(credentialRoot, entry);
    const manifestPath = join(directory, MANIFEST_FILE);
    let manifest;
    try {
      manifest = JSON.parse(
        (await readBoundedFile(
          manifestPath,
          MAX_MANIFEST_BYTES
        )).toString('utf8')
      );
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    verifyCredentialRotationManifest({ manifest });
    const rollbackPath = join(directory, manifest.rollback.name);
    artifacts.push({
      kind: 'credential-rollback',
      path: rollbackPath,
      relative_path: portableRelative(dataDir, rollbackPath),
      context: manifest.rollback.context,
      encoding: 'json',
      expected: {
        bytes: manifest.rollback.bytes,
        sha256: manifest.rollback.sha256
      }
    });
    const resultPath = join(directory, 'rollback-result.json');
    let result;
    try {
      result = JSON.parse(
        (await readBoundedFile(
          resultPath,
          MAX_MANIFEST_BYTES
        )).toString('utf8')
      );
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (result?.forward) {
      const statement = structuredClone(result);
      delete statement.attestation;
      const publicKey = manifest.before.public_keys.grid;
      if (
        result.format !== 'axiom-credential-rollback-result.v1'
        || !verifyObjectSignature(
          statement,
          result.attestation,
          publicKey
        )
      ) {
        throw new ValidationError(
          'Credential forward artifact attestation is invalid'
        );
      }
      const forwardPath = join(directory, result.forward.name);
      artifacts.push({
        kind: 'credential-forward',
        path: forwardPath,
        relative_path: portableRelative(dataDir, forwardPath),
        context: result.forward.context,
        encoding: 'json',
        expected: {
          bytes: result.forward.bytes,
          sha256: result.forward.sha256
        }
      });
    }
  }
  artifacts.sort((left, right) => (
    left.relative_path.localeCompare(right.relative_path)
  ));
  if (artifacts.length > MAX_ARTIFACTS) {
    throw new ValidationError('Protected artifact inventory exceeds the rotation limit');
  }
  return artifacts;
}

async function reencryptBackupDatabase({
  database,
  workRoot,
  index,
  artifact,
  dataDir,
  identity,
  sourceProtector,
  targetProtector
}) {
  const path = join(workRoot, `backup-${index}.sqlite`);
  await writeExclusive(path, Buffer.from(database), 0o600);
  const db = new DatabaseSync(path);
  try {
    reencryptGridProtectedColumns({
      db,
      sourceProtector,
      targetProtector
    });
  } finally {
    db.close();
  }
  const store = new GridStore({
    path,
    dataDir,
    identity,
    protector: targetProtector
  });
  const status = store.getStatus();
  const chain = store.verifyChain();
  store.close();
  if (
    !chain.valid
    || status.schema_version !== artifact.database.schema_version
    || status.last_seq !== artifact.database.evidence_events
    || status.last_hash !== artifact.database.evidence_head
  ) {
    throw new ValidationError(
      'Re-encrypted backup does not preserve its signed evidence state'
    );
  }
  const transformed = await readBoundedFile(path, MAX_DATABASE_BYTES);
  await Promise.all([
    rm(path, { force: true }),
    rm(`${path}-wal`, { force: true }),
    rm(`${path}-shm`, { force: true })
  ]);
  return transformed;
}

async function snapshotArtifactFiles(artifacts, previousPointerContent) {
  const files = [];
  for (const artifact of artifacts) {
    files.push({
      path: artifact.relative_path,
      content_base64: (
        await readBoundedFile(artifact.path, 512 * 1024 * 1024)
      ).toString('base64')
    });
    const sidecar = await readOptionalFile(
      `${artifact.path}${SIDECAR_SUFFIX}`
    );
    files.push({
      path: `${artifact.relative_path}${SIDECAR_SUFFIX}`,
      content_base64: sidecar?.toString('base64') ?? null
    });
  }
  files.push({
    path: ACTIVE_POINTER_FILE,
    content_base64: previousPointerContent?.toString('base64') ?? null
  });
  return {
    format: 'axiom-data-key-rollback-files.v1',
    files
  };
}

function assertArtifactInventory(expected, actual) {
  const actualByPath = new Map(actual.map(item => [
    item.relative_path,
    item
  ]));
  const missingOrChanged = expected.some(item => {
    const current = actualByPath.get(item.path);
    return (
      !current
      || current.kind !== item.kind
      || current.context !== item.context
      || current.encoding !== item.encoding
    );
  });
  if (missingOrChanged) {
    throw new ValidationError(
      'A protected artifact from the data-key rotation is missing or changed'
    );
  }
}

function assertDatabaseCopyInventory(expected, actual) {
  const actualPaths = new Set(actual.map(item => item.relative_path));
  if (expected.some(item => !actualPaths.has(item.path))) {
    throw new ValidationError(
      'A recovery database from the data-key rotation is missing'
    );
  }
}

async function assertRegularDatabaseFile(path) {
  const stat = await lstat(path);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new ValidationError(
      'Recovery database must be a regular file'
    );
  }
  if (stat.size < 1 || stat.size > MAX_DATABASE_BYTES) {
    throw new ValidationError('Recovery database has an invalid size');
  }
}

function fileTransactionPlanContent(entries) {
  return Buffer.from(`${canonicalJson({
    format: 'axiom-file-transaction-plan.v1',
    targets: entries.map(entry => entry.path)
  })}\n`, 'utf8');
}

async function applyFileTransaction({ entries, transactionDir }) {
  const unique = new Set();
  for (const entry of entries) {
    if (unique.has(entry.path)) {
      throw new ValidationError('File transaction contains a duplicate target');
    }
    unique.add(entry.path);
    if (entry.content !== null && !Buffer.isBuffer(entry.content)) {
      throw new ValidationError('File transaction content is invalid');
    }
  }
  await mkdir(transactionDir, { recursive: true, mode: 0o700 });
  await writeExclusive(
    join(transactionDir, 'plan.json'),
    fileTransactionPlanContent(entries),
    0o600
  );
  const stagedDir = join(transactionDir, 'staged');
  const originalDir = join(transactionDir, 'original');
  const recordDir = join(transactionDir, 'records');
  await Promise.all([
    mkdir(stagedDir, { mode: 0o700 }),
    mkdir(originalDir, { mode: 0o700 }),
    mkdir(recordDir, { mode: 0o700 })
  ]);
  const records = [];
  try {
    for (const [index, entry] of entries.entries()) {
      if (entry.content !== null) {
        await writeExclusive(
          join(stagedDir, String(index)),
          entry.content,
          entry.mode
        );
      }
    }
    for (const [index, entry] of entries.entries()) {
      const original = join(originalDir, String(index));
      const existing = await lstatOptional(entry.path);
      if (
        existing
        && (existing.isSymbolicLink() || !existing.isFile())
      ) {
        throw new ValidationError(
          'File transaction target must be a regular file'
        );
      }
      const record = {
        path: entry.path,
        original,
        originalMoved: false,
        installed: false
      };
      records.push(record);
      await writeExclusive(
        join(recordDir, `${index}.json`),
        Buffer.from(`${canonicalJson({
          format: 'axiom-file-transaction-record.v1',
          index,
          target: entry.path,
          original_exists: Boolean(existing)
        })}\n`, 'utf8'),
        0o600
      );
      try {
        await rename(entry.path, original);
        record.originalMoved = true;
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      if (entry.content !== null) {
        await mkdir(dirname(entry.path), {
          recursive: true,
          mode: 0o700
        });
        await rename(join(stagedDir, String(index)), entry.path);
        record.installed = true;
        await chmod(entry.path, entry.mode);
      }
      maybeInjectFileTransactionCrash(index + 1);
    }
    for (const entry of entries) {
      const installed = await readOptionalFile(entry.path);
      if (
        (entry.content === null && installed !== undefined)
        || (
          entry.content !== null
          && (!installed || !installed.equals(entry.content))
        )
      ) {
        throw new ValidationError('File transaction verification failed');
      }
    }
  } catch (error) {
    let restoreError;
    for (const record of [...records].reverse()) {
      try {
        if (record.installed) await rm(record.path, { force: true });
        if (record.originalMoved) await rename(record.original, record.path);
      } catch (candidate) {
        restoreError ??= candidate;
      }
    }
    if (restoreError) {
      throw new AggregateError(
        [error, restoreError],
        'File transaction failed and restoration was incomplete'
      );
    }
    await rm(transactionDir, { recursive: true, force: true });
    error.fileTransactionRestored = true;
    throw error;
  }
  await rm(transactionDir, { recursive: true, force: true });
}

function maybeInjectFileTransactionCrash(processedTargets) {
  if (process.env.NODE_ENV !== 'test') return;
  const configured = process.env.AXIOM_TEST_DATA_KEY_CRASH_AFTER_TARGET;
  if (configured === undefined) return;
  const target = Number(configured);
  if (
    !Number.isSafeInteger(target)
    || target < 1
    || target !== processedTargets
  ) {
    return;
  }
  process.kill(process.pid, 'SIGKILL');
}

function maybeInjectCompletedRollbackCrash() {
  if (
    process.env.NODE_ENV === 'test'
    && process.env.AXIOM_TEST_DATA_KEY_CRASH_AFTER_ROLLBACK_TRANSACTION === '1'
  ) {
    process.kill(process.pid, 'SIGKILL');
  }
}

async function recoverInterruptedFileTransaction({
  targets,
  transactionDir
}) {
  const recordDir = join(transactionDir, 'records');
  const originalDir = join(transactionDir, 'original');
  let recordNames;
  try {
    recordNames = await readdir(recordDir, { withFileTypes: true });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    let originals = [];
    try {
      originals = await readdir(originalDir);
    } catch (candidate) {
      if (candidate.code !== 'ENOENT') throw candidate;
    }
    if (originals.length > 0) {
      throw new ValidationError(
        'Interrupted file transaction lacks recovery records'
      );
    }
    await rm(transactionDir, { recursive: true, force: true });
    return { recovered: true, restored_targets: 0 };
  }
  for (const entry of recordNames) {
    if (
      entry.isSymbolicLink()
      || !entry.isFile()
      || !/^(0|[1-9][0-9]*)\.json$/.test(entry.name)
      || Number(entry.name.slice(0, -5)) >= targets.length
    ) {
      throw new ValidationError(
        'Interrupted file transaction record set is invalid'
      );
    }
  }
  let restoredTargets = 0;
  for (let index = targets.length - 1; index >= 0; index -= 1) {
    const serialized = await readOptionalFile(
      join(recordDir, `${index}.json`)
    );
    if (!serialized) continue;
    let record;
    try {
      record = JSON.parse(serialized.toString('utf8'));
    } catch {
      throw new ValidationError(
        'Interrupted file transaction record is invalid JSON'
      );
    }
    if (
      record?.format !== 'axiom-file-transaction-record.v1'
      || record.index !== index
      || record.target !== targets[index]
      || typeof record.original_exists !== 'boolean'
    ) {
      throw new ValidationError(
        'Interrupted file transaction record is invalid'
      );
    }
    const target = targets[index];
    const original = join(originalDir, String(index));
    const originalStat = await lstatOptional(original);
    const targetStat = await lstatOptional(target);
    for (const stat of [originalStat, targetStat]) {
      if (stat && (stat.isSymbolicLink() || !stat.isFile())) {
        throw new ValidationError(
          'Interrupted file transaction contains an unsafe target'
        );
      }
    }
    if (record.original_exists) {
      if (originalStat) {
        await rm(target, { force: true });
        await mkdir(dirname(target), { recursive: true, mode: 0o700 });
        await rename(original, target);
      } else if (!targetStat) {
        throw new ValidationError(
          'Interrupted file transaction lost an original target'
        );
      }
    } else {
      if (originalStat) {
        throw new ValidationError(
          'Interrupted file transaction has an unexpected original target'
        );
      }
      await rm(target, { force: true });
    }
    restoredTargets += 1;
  }
  await rm(transactionDir, { recursive: true, force: true });
  return {
    recovered: true,
    restored_targets: restoredTargets
  };
}

async function readFileTransactionPlan({
  transactionDir,
  roots,
  expectedDigest
}) {
  const serialized = await readBoundedFile(
    join(transactionDir, 'plan.json'),
    MAX_MANIFEST_BYTES
  );
  if (
    !DIGEST.test(expectedDigest ?? '')
    || sha256(serialized) !== expectedDigest
  ) {
    throw new ValidationError(
      'Interrupted file transaction plan digest is invalid'
    );
  }
  let plan;
  try {
    plan = JSON.parse(serialized.toString('utf8'));
  } catch {
    throw new ValidationError(
      'Interrupted file transaction plan is invalid JSON'
    );
  }
  if (
    plan?.format !== 'axiom-file-transaction-plan.v1'
    || !Array.isArray(plan.targets)
    || plan.targets.length < 1
    || plan.targets.length > 2_000
  ) {
    throw new ValidationError(
      'Interrupted file transaction plan is invalid'
    );
  }
  const secretKeyPath = join(roots.secret, 'data-protection.key');
  const unique = new Set();
  for (const target of plan.targets) {
    if (
      typeof target !== 'string'
      || resolve(target) !== target
      || unique.has(target)
      || (
        target !== secretKeyPath
        && !pathContains(roots.data, target)
      )
    ) {
      throw new ValidationError(
        'Interrupted file transaction plan target is invalid'
      );
    }
    unique.add(target);
  }
  return plan.targets;
}

function rotationTransactionTargets(manifest, roots) {
  const databasePath = join(roots.data, 'grid.sqlite');
  const targets = [
    databasePath,
    `${databasePath}-wal`,
    `${databasePath}-shm`
  ];
  for (const database of manifest.recovery_databases) {
    const path = resolvePortableDataPath(roots.data, database.path);
    targets.push(path, `${path}-wal`, `${path}-shm`);
  }
  for (const artifact of manifest.artifacts) {
    targets.push(
      resolvePortableDataPath(roots.data, artifact.path),
      resolvePortableDataPath(roots.data, artifact.sidecar_path)
    );
  }
  targets.push(
    join(roots.data, ACTIVE_POINTER_FILE),
    join(roots.secret, 'data-protection.key')
  );
  return targets;
}

async function cleanupRollbackWorkDirectories(rotationRoot) {
  const entries = await readdir(rotationRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.name.startsWith('.rollback-work-')) continue;
    if (entry.isSymbolicLink() || !entry.isDirectory()) {
      throw new ValidationError(
        'Data-key rollback workspace is not a safe directory'
      );
    }
    const path = resolve(rotationRoot, entry.name);
    if (!pathContains(rotationRoot, path)) {
      throw new ValidationError(
        'Data-key rollback workspace escapes its rotation directory'
      );
    }
    await rm(path, { recursive: true, force: true });
  }
}

async function cleanupAbandonedRotationWorkDirectories(dataDir) {
  const rotationRoot = join(dataDir, 'data-key-rotations');
  let entries;
  try {
    entries = await readdir(rotationRoot, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      throw new ValidationError(
        'Data-key rotation history may not contain symbolic links'
      );
    }
    if (!entry.isDirectory() || !ROTATION_ID.test(entry.name)) continue;
    const workPath = resolve(rotationRoot, entry.name, '.work');
    if (
      !pathContains(rotationRoot, workPath)
      || !await directoryExists(workPath)
    ) {
      continue;
    }
    await rm(workPath, { recursive: true, force: true });
  }
}

async function recordInterruptedDataKeyRollback({
  manifest,
  manifestPath,
  roots,
  staleRuntimeLockRecovered,
  transactionRecovered
}) {
  const key = await readDataKey(roots.secret);
  const protector = new DataProtector(key);
  const identity = await ensureMeshIdentity(roots.data, 'grid', {
    create: false
  });
  const store = new GridStore({
    path: join(roots.data, 'grid.sqlite'),
    dataDir: roots.data,
    identity,
    protector
  });
  const status = store.getStatus();
  const chain = store.verifyChain();
  store.close();
  if (!chain.valid) {
    throw new ValidationError(
      'Interrupted data-key rollback did not restore valid Grid evidence'
    );
  }
  const statement = {
    format: 'axiom-data-key-rollback-result.v1',
    schema_version: 1,
    rotation_id: manifest.rotation_id,
    rolled_back_at: new Date().toISOString(),
    rotation_applied: false,
    interrupted_rotation_recovered: true,
    transaction_journal_recovered: transactionRecovered,
    protected_values: 0,
    recovery_databases: 0,
    protected_artifacts: 0,
    evidence_events: status.last_seq,
    evidence_head: status.last_hash,
    preserves_post_rotation_grid_state: false,
    stale_runtime_lock_recovered: staleRuntimeLockRecovered,
    restart_required: true
  };
  const result = {
    ...statement,
    attestation: identity.signObject(statement)
  };
  await atomicWrite(
    join(dirname(manifestPath), ROLLBACK_RESULT_FILE),
    Buffer.from(`${canonicalJson(result)}\n`, 'utf8'),
    0o600
  );
  return {
    rolled_back: true,
    rotation_id: manifest.rotation_id,
    rotation_applied: false,
    interrupted_rotation_recovered: true,
    transaction_journal_recovered: transactionRecovered,
    protected_values: 0,
    recovery_databases: 0,
    protected_artifacts: 0,
    evidence_events: status.last_seq,
    evidence_head: status.last_hash,
    preserves_post_rotation_grid_state: false,
    stale_runtime_lock_recovered: staleRuntimeLockRecovered,
    restart_required: true
  };
}

async function recordCompletedInterruptedDataKeyRollback({
  manifest,
  manifestPath,
  roots,
  staleRuntimeLockRecovered
}) {
  const activePointer = await readActiveDataKeyPointer(roots.data);
  if (canonicalJson(activePointer) !== canonicalJson(manifest.previous)) {
    throw new ValidationError(
      'Interrupted data-key rollback active pointer is inconsistent'
    );
  }
  const key = await readDataKey(roots.secret);
  const protector = new DataProtector(key);
  const identity = await ensureMeshIdentity(roots.data, 'grid', {
    create: false
  });
  const store = new GridStore({
    path: join(roots.data, 'grid.sqlite'),
    dataDir: roots.data,
    identity,
    protector
  });
  const status = store.getStatus();
  const chain = store.verifyChain();
  store.close();
  if (!chain.valid) {
    throw new ValidationError(
      'Interrupted completed data-key rollback has invalid Grid evidence'
    );
  }
  const context = (
    `axiom:data-key-rotation:${manifest.rotation_id}:credential-state-key`
  );
  const envelope = await readBoundedFile(
    join(dirname(manifestPath), CREDENTIAL_STATE_KEY_FILE),
    MAX_KEY_ENVELOPE_BYTES
  );
  const retiredStateKeys = parseCredentialStateHistoryPayload(
    protector.openBytes(
    envelope.toString('utf8'),
    context
    )
  );
  if (retiredStateKeys.length < 1) {
    throw new ValidationError(
      'Interrupted rollback credential state-authentication key is invalid'
    );
  }
  const descriptor = envelopeMetadata(
    CREDENTIAL_STATE_KEY_FILE,
    envelope,
    context
  );
  const statement = {
    format: 'axiom-data-key-rollback-result.v1',
    schema_version: 1,
    rotation_id: manifest.rotation_id,
    rolled_back_at: new Date().toISOString(),
    rotation_applied: true,
    interrupted_rotation_recovered: true,
    transaction_journal_recovered: false,
    completed_rollback_finalized: true,
    protected_values: manifest.database.protected_values,
    recovery_databases: manifest.recovery_databases.length,
    protected_artifacts: manifest.artifacts.length,
    evidence_events: status.last_seq,
    evidence_head: status.last_hash,
    preserves_post_rotation_grid_state: true,
    stale_runtime_lock_recovered: staleRuntimeLockRecovered,
    credential_state_authentication_key: descriptor,
    signer: gridSigner(identity),
    restart_required: true
  };
  const result = {
    ...statement,
    attestation: identity.signObject(statement)
  };
  await atomicWrite(
    join(dirname(manifestPath), ROLLBACK_RESULT_FILE),
    Buffer.from(`${canonicalJson(result)}\n`, 'utf8'),
    0o600
  );
  await cleanupRollbackWorkDirectories(dirname(manifestPath));
  return {
    rolled_back: true,
    rotation_id: manifest.rotation_id,
    rotation_applied: true,
    interrupted_rotation_recovered: true,
    transaction_journal_recovered: false,
    completed_rollback_finalized: true,
    protected_values: statement.protected_values,
    recovery_databases: statement.recovery_databases,
    protected_artifacts: statement.protected_artifacts,
    evidence_events: status.last_seq,
    evidence_head: status.last_hash,
    preserves_post_rotation_grid_state: true,
    stale_runtime_lock_recovered: staleRuntimeLockRecovered,
    restart_required: true
  };
}

function pointerMatchesManifest({
  pointer,
  manifestPath,
  manifestContent,
  dataDir
}) {
  return (
    pointer?.manifest_path === portableRelative(dataDir, manifestPath)
    && pointer?.manifest_sha256 === sha256(manifestContent)
  );
}

function assertEquivalentGridState(source, candidate, chain) {
  if (
    !chain?.valid
    || source.last_seq !== candidate.last_seq
    || source.last_hash !== candidate.last_hash
    || source.schema_version !== candidate.schema_version
  ) {
    throw new ValidationError(
      'Re-encrypted Grid database does not preserve exact evidence state'
    );
  }
}

async function readDataKey(secretDir) {
  const serialized = (
    await readBoundedFile(
      join(secretDir, 'data-protection.key'),
      4096
    )
  ).toString('utf8').trim();
  const key = Buffer.from(serialized, 'base64url');
  if (key.length !== 32) {
    throw new ValidationError('Production data-protection key is invalid');
  }
  return key;
}

async function readEnvelope(directory, descriptor) {
  const path = join(directory, descriptor.name);
  if (basename(path) !== descriptor.name) {
    throw new ValidationError('Data-key rollback envelope path is invalid');
  }
  const content = await readBoundedFile(path, MAX_DATABASE_BYTES * 2);
  if (
    descriptor.bytes !== content.length
    || descriptor.sha256 !== sha256(content)
  ) {
    throw new ValidationError('Data-key rollback envelope digest is invalid');
  }
  return content;
}

function protectedBytes(protector, value, context) {
  return Buffer.from(`${protector.sealBytes(value, context)}\n`, 'utf8');
}

function envelopeMetadata(name, content, context) {
  return {
    name,
    algorithm: 'A256GCM',
    context,
    bytes: content.length,
    sha256: sha256(content)
  };
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

function credentialStateHistoryPayload({ keys, restoredKey }) {
  const restoredStateKey = deriveCredentialStateAuthenticationKey(restoredKey);
  const retained = [];
  const seen = new Set([restoredStateKey.toString('hex')]);
  for (const key of keys) {
    const normalized = Buffer.from(key);
    if (normalized.length !== 32) {
      throw new ValidationError(
        'Credential state-authentication key history is invalid'
      );
    }
    const id = normalized.toString('hex');
    if (!seen.has(id)) {
      retained.push(normalized.toString('base64url'));
      seen.add(id);
    }
  }
  if (retained.length < 1 || retained.length > 256) {
    throw new ValidationError(
      'Credential state-authentication key history has an invalid size'
    );
  }
  return Buffer.from(canonicalJson({
    format: 'axiom-credential-state-key-history.v1',
    keys_base64url: retained
  }), 'utf8');
}

function parseCredentialStateHistoryPayload(value) {
  let payload;
  try {
    payload = JSON.parse(Buffer.from(value).toString('utf8'));
  } catch {
    throw new ValidationError(
      'Credential state-authentication key history payload is invalid JSON'
    );
  }
  if (
    payload?.format !== 'axiom-credential-state-key-history.v1'
    || !Array.isArray(payload.keys_base64url)
    || payload.keys_base64url.length < 1
    || payload.keys_base64url.length > 256
  ) {
    throw new ValidationError(
      'Credential state-authentication key history payload is invalid'
    );
  }
  const unique = new Set();
  return payload.keys_base64url.map(encoded => {
    const key = Buffer.from(encoded, 'base64url');
    if (
      typeof encoded !== 'string'
      || key.length !== 32
      || key.toString('base64url') !== encoded
      || unique.has(encoded)
    ) {
      throw new ValidationError(
        'Credential state-authentication key history entry is invalid'
      );
    }
    unique.add(encoded);
    return key;
  });
}

function gridSigner(identity) {
  return {
    service: 'grid',
    key_id: identity.keyId,
    public_key_pem: String(identity.publicKey.export({
      type: 'spki',
      format: 'pem'
    }))
  };
}

function metadata(content) {
  return {
    bytes: content.length,
    sha256: sha256(content)
  };
}

function assertMetadata(value, label) {
  if (
    !value
    || !Number.isSafeInteger(value.bytes)
    || value.bytes < 1
    || value.bytes > MAX_DATABASE_BYTES * 2
    || !DIGEST.test(value.sha256 ?? '')
  ) {
    throw new ValidationError(`${label} metadata is invalid`);
  }
}

function resolveRoots(dataDir, secretDir) {
  const data = resolveRequiredPath(dataDir, 'data directory');
  const secret = resolveRequiredPath(secretDir, 'secret directory');
  if (data === secret || pathContains(data, secret) || pathContains(secret, data)) {
    throw new ValidationError(
      'Production data and secret directories must be distinct and non-nested'
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

function assertPortablePath(value) {
  if (
    typeof value !== 'string'
    || value.length < 1
    || value.length > 1000
    || value.includes('\\')
    || isAbsolute(value)
    || value.split('/').includes('..')
  ) {
    throw new ValidationError('Data-key rotation relative path is invalid');
  }
}

function resolvePortableDataPath(dataDir, value) {
  assertPortablePath(value);
  const path = resolve(dataDir, ...value.split('/'));
  const child = relative(dataDir, path);
  if (child === '' || child.startsWith('..') || isAbsolute(child)) {
    throw new ValidationError(
      'Data-key rotation path escapes its data directory'
    );
  }
  return path;
}

async function directoryExists(path) {
  try {
    const stat = await lstat(path);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new ValidationError(
        'Data-key transaction path must be a regular directory'
      );
    }
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function lstatOptional(path) {
  try {
    return await lstat(path);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function assertManifestLocation(manifest, manifestPath, dataDir) {
  const expected = resolve(
    dataDir,
    'data-key-rotations',
    manifest.rotation_id,
    MANIFEST_FILE
  );
  if (manifestPath !== expected) {
    throw new ValidationError(
      'Data-key rotation manifest path is outside its data directory'
    );
  }
}

async function createRotationDirectory(rotationRoot) {
  await mkdir(dirname(rotationRoot), { recursive: true, mode: 0o700 });
  try {
    await mkdir(rotationRoot, { mode: 0o700 });
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new ValidationError('Data-key rotation identifier already exists');
    }
    throw error;
  }
}

async function assertNoPendingRotation(dataDir) {
  const pending = await readPendingRotation(dataDir);
  if (pending) {
    throw new ValidationError(
      `Data-key rotation ${pending.rotation_id} is pending rollback`
    );
  }
}

async function readPendingRotation(dataDir) {
  try {
    const pending = JSON.parse(
      await readBoundedFile(
        join(dataDir, PENDING_MARKER),
        MAX_MANIFEST_BYTES
      )
    );
    if (
      pending?.format !== DATA_KEY_ROTATION_FORMAT
      || !ROTATION_ID.test(pending.rotation_id ?? '')
      || !DIGEST.test(pending.manifest_sha256 ?? '')
      || !['applying', 'rolling_back'].includes(pending.transaction)
      || (
        pending.transaction === 'rolling_back'
        && !DIGEST.test(pending.transaction_plan_sha256 ?? '')
      )
      || (
        pending.transaction === 'applying'
        && pending.transaction_plan_sha256 !== undefined
      )
    ) {
      throw new ValidationError('Pending data-key rotation marker is invalid');
    }
    return pending;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function readDirectories(root) {
  try {
    const entries = await readdir(root, { withFileTypes: true });
    const names = [];
    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        throw new ValidationError(
          'Protected artifact inventory may not contain symbolic links'
        );
      }
      if (entry.isDirectory()) names.push(entry.name);
    }
    return names.sort();
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function readBoundedFile(path, maxBytes) {
  const stat = await lstat(path);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new ValidationError('Data-key rotation input must be a regular file');
  }
  if (stat.size < 1 || stat.size > maxBytes) {
    throw new ValidationError('Data-key rotation input has an invalid size');
  }
  return readFile(path);
}

async function readOptionalFile(path) {
  try {
    const stat = await lstat(path);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new ValidationError(
        'Data-key rotation optional input must be a regular file'
      );
    }
    return await readFile(path);
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
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

function portableRelative(from, to) {
  return relative(from, to).replaceAll('\\', '/');
}

function createRotationId() {
  return `data_key_${new Date().toISOString().replaceAll(/[:.]/g, '-')}_${randomBytes(8).toString('hex')}`;
}

function assertRotationId(value) {
  if (!ROTATION_ID.test(value ?? '')) {
    throw new ValidationError('Data-key rotation identifier is invalid');
  }
}

async function main() {
  const command = process.argv[2];
  if (command === 'rotate') {
    const result = await rotateDataProtectionKey({
      dataDir: process.argv[3],
      secretDir: process.argv[4]
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (command === 'rollback') {
    const result = await rollbackDataProtectionKey({
      manifestPath: process.argv[3],
      dataDir: process.argv[4],
      secretDir: process.argv[5]
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  throw new ValidationError(
    'Usage: rotate-data-key.mjs rotate <data-dir> <secret-dir> '
    + '| rollback <manifest-path> <data-dir> <secret-dir>'
  );
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}

export { MESH_SERVICES };
