import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ValidationError,
  canonicalJson,
  digestObject,
  sha256
} from './lib/canonical.mjs';
import { ensureMeshIdentity, verifyObjectSignature } from './lib/identity.mjs';
import { DataProtector } from './lib/protector.mjs';
import {
  acquireGridRuntimeLock,
  recoverStaleGridRuntimeLock,
  releaseGridRuntimeLock,
  verifyGridBackupArtifact
} from './grid/backup.mjs';
import { loadGridVerificationKeys } from './grid/store.mjs';

const POLICY_FORMAT = 'axiom-backup-retention-policy.v1';
const PLAN_FORMAT = 'axiom-backup-retention-plan.v1';
const PENDING_FORMAT = 'axiom-backup-retention-pending.v1';
const RECEIPT_FORMAT = 'axiom-backup-retention-receipt.v1';
const DAY_MS = 24 * 60 * 60 * 1_000;
const DIGEST = /^[a-f0-9]{64}$/;
const BACKUP_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const PLAN_ID = /^backup_retention_[a-f0-9]{48}$/;
const MAX_BACKUPS = 10_000;
const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;
const MAX_MAINTENANCE_JSON_BYTES = 16 * 1024 * 1024;
const MAX_POLICY_BYTES = 64 * 1024;

export async function planBackupRetention({
  dataDir,
  identity,
  protector,
  policy,
  now = new Date()
}) {
  const root = resolveDataDir(dataDir);
  const normalizedPolicy = validateBackupRetentionPolicy(policy);
  const generatedAt = normalizeDate(now, 'Backup retention plan time');
  const inventory = await loadBackupInventory({
    dataDir: root,
    identity,
    protector
  });
  if (inventory.length < normalizedPolicy.minimum_verified_backups) {
    throw new ValidationError(
      'Backup inventory does not satisfy the minimum verified-backup count'
    );
  }
  const decision = selectRetentionDecision(
    inventory,
    normalizedPolicy,
    Date.parse(generatedAt)
  );
  if (decision.retained.length < normalizedPolicy.minimum_verified_backups) {
    throw new ValidationError(
      'Backup retention plan would violate the minimum verified-backup count'
    );
  }
  const base = {
    format: PLAN_FORMAT,
    schema_versions: {
      plan: 1,
      policy: 1,
      backup: 1
    },
    generated_at: generatedAt,
    signer_key_id: identity.keyId,
    policy: normalizedPolicy,
    inventory: {
      digest: digestObject(inventory),
      count: inventory.length,
      backups: inventory
    },
    decision: {
      retained_backup_ids: decision.retained.map(item => item.backup_id),
      retired_backup_ids: decision.retired.map(item => item.backup_id),
      retained_count: decision.retained.length,
      retired_count: decision.retired.length
    },
    safety: {
      grid_must_be_stopped_to_apply: true,
      inventory_must_be_unchanged_to_apply: true,
      every_backup_verified_before_selection: true,
      retirement_is_recoverable_quarantine: true,
      immediate_deletion: false
    }
  };
  const plan = {
    ...base,
    plan_id: planIdFor(base)
  };
  return {
    ...plan,
    attestation: identity.signObject(plan)
  };
}

export function verifyBackupRetentionPlan({ plan, dataDir, identity }) {
  if (
    !plan
    || typeof plan !== 'object'
    || Array.isArray(plan)
    || plan.format !== PLAN_FORMAT
    || plan.schema_versions?.plan !== 1
    || plan.schema_versions?.policy !== 1
    || plan.schema_versions?.backup !== 1
    || !PLAN_ID.test(plan.plan_id ?? '')
  ) {
    throw new ValidationError('Backup retention plan format is invalid');
  }
  const policy = validateBackupRetentionPolicy(plan.policy);
  const generatedAt = normalizeDate(
    plan.generated_at,
    'Backup retention plan generated_at'
  );
  if (
    typeof plan.signer_key_id !== 'string'
    || plan.signer_key_id !== plan.attestation?.key_id
  ) {
    throw new ValidationError('Backup retention plan signer metadata is invalid');
  }
  const backups = validateInventory(plan.inventory);
  if (backups.length < policy.minimum_verified_backups) {
    throw new ValidationError(
      'Backup retention plan does not satisfy the verified minimum'
    );
  }
  const decision = selectRetentionDecision(backups, policy, Date.parse(generatedAt));
  const expectedDecision = {
    retained_backup_ids: decision.retained.map(item => item.backup_id),
    retired_backup_ids: decision.retired.map(item => item.backup_id),
    retained_count: decision.retained.length,
    retired_count: decision.retired.length
  };
  if (canonicalJson(plan.decision) !== canonicalJson(expectedDecision)) {
    throw new ValidationError('Backup retention plan decision is not policy-derived');
  }
  if (
    plan.safety?.grid_must_be_stopped_to_apply !== true
    || plan.safety?.inventory_must_be_unchanged_to_apply !== true
    || plan.safety?.every_backup_verified_before_selection !== true
    || plan.safety?.retirement_is_recoverable_quarantine !== true
    || plan.safety?.immediate_deletion !== false
  ) {
    throw new ValidationError('Backup retention plan safety declaration is invalid');
  }
  const unsigned = structuredClone(plan);
  delete unsigned.attestation;
  const idInput = structuredClone(unsigned);
  delete idInput.plan_id;
  if (plan.plan_id !== planIdFor(idInput)) {
    throw new ValidationError('Backup retention plan id does not match its content');
  }
  const keys = loadGridVerificationKeys(resolveDataDir(dataDir), identity);
  const signer = keys.get(plan.attestation?.key_id);
  if (!signer || !verifyObjectSignature(unsigned, plan.attestation, signer)) {
    throw new ValidationError(
      'Backup retention plan is not signed by the trusted Grid key lineage'
    );
  }
  return {
    valid: true,
    plan_id: plan.plan_id,
    plan_digest: digestObject(plan),
    policy,
    inventory: backups,
    decision
  };
}

export async function applyBackupRetentionPlan({
  dataDir,
  identity,
  protector,
  plan
}) {
  const root = resolveDataDir(dataDir);
  const lock = await acquireBackupMaintenanceLock(root);
  try {
    return await applyBackupRetentionPlanLocked({
      dataDir: root,
      identity,
      protector,
      plan
    });
  } finally {
    await releaseGridRuntimeLock(lock);
  }
}

async function applyBackupRetentionPlanLocked({
  dataDir,
  identity,
  protector,
  plan
}) {
  const root = resolveDataDir(dataDir);
  const verifiedPlan = verifyBackupRetentionPlan({
    plan,
    dataDir: root,
    identity
  });
  const paths = maintenancePaths(root, plan.plan_id);
  const existingReceipt = await readOptionalJson(paths.receipt);
  if (existingReceipt) {
    verifyBackupRetentionReceipt({
      receipt: existingReceipt,
      dataDir: root,
      identity
    });
    if (existingReceipt.plan_digest !== verifiedPlan.plan_digest) {
      throw new ValidationError(
        'Existing backup retention receipt belongs to different plan content'
      );
    }
    const activeInventory = await loadBackupInventory({
      dataDir: root,
      identity,
      protector
    });
    if (
      canonicalJson(activeInventory)
      !== canonicalJson(existingReceipt.retained.backups)
    ) {
      throw new ValidationError(
        'Active backup inventory differs from the completed retention receipt'
      );
    }
    for (const descriptor of existingReceipt.retired.backups) {
      await verifyDescriptorAt({
        directory: join(paths.quarantine, descriptor.backup_id),
        descriptor,
        dataDir: root,
        identity,
        protector
      });
    }
    const quarantineReceiptPath = join(paths.quarantine, 'receipt.json');
    const quarantineReceipt = await readOptionalJson(quarantineReceiptPath);
    if (quarantineReceipt) {
      if (canonicalJson(quarantineReceipt) !== canonicalJson(existingReceipt)) {
        throw new ValidationError(
          'Backup quarantine receipt differs from the canonical receipt'
        );
      }
    } else {
      await writeNewJson(quarantineReceiptPath, existingReceipt);
    }
    await rm(paths.pending, { force: true });
    return existingReceipt;
  }

  const pending = await readOptionalJson(paths.pending);
  if (pending) {
    verifyPendingMaintenance({
      pending,
      dataDir: root,
      identity,
      plan,
      planDigest: verifiedPlan.plan_digest
    });
  } else {
    const current = await loadBackupInventory({
      dataDir: root,
      identity,
      protector
    });
    if (canonicalJson(current) !== canonicalJson(verifiedPlan.inventory)) {
      throw new ValidationError(
        'Backup inventory changed after the signed retention plan was created'
      );
    }
    const pendingUnsigned = {
      format: PENDING_FORMAT,
      plan,
      plan_digest: verifiedPlan.plan_digest,
      started_at: new Date().toISOString(),
      signer_key_id: identity.keyId
    };
    const pendingMarker = {
      ...pendingUnsigned,
      attestation: identity.signObject(pendingUnsigned)
    };
    await writeNewJson(paths.pending, pendingMarker);
  }

  await mkdir(paths.quarantine, { recursive: true, mode: 0o700 });
  let moved = 0;
  for (const descriptor of verifiedPlan.decision.retired) {
    const source = join(paths.backups, descriptor.backup_id);
    const destination = join(paths.quarantine, descriptor.backup_id);
    const [sourceExists, destinationExists] = await Promise.all([
      directoryExists(source),
      directoryExists(destination)
    ]);
    if (sourceExists === destinationExists) {
      throw new ValidationError(
        `Backup retirement state is ambiguous for ${descriptor.backup_id}`
      );
    }
    await verifyDescriptorAt({
      directory: sourceExists ? source : destination,
      descriptor,
      dataDir: root,
      identity,
      protector
    });
    if (sourceExists) {
      await rename(source, destination);
      moved += 1;
      maybeCrashAfterRetirement(moved);
    }
  }

  const activeInventory = await loadBackupInventory({
    dataDir: root,
    identity,
    protector
  });
  if (
    canonicalJson(activeInventory)
    !== canonicalJson(verifiedPlan.decision.retained)
  ) {
    throw new ValidationError(
      'Active backup inventory does not match the signed retention decision'
    );
  }
  for (const descriptor of verifiedPlan.decision.retired) {
    await verifyDescriptorAt({
      directory: join(paths.quarantine, descriptor.backup_id),
      descriptor,
      dataDir: root,
      identity,
      protector
    });
  }

  const appliedAt = new Date().toISOString();
  const receiptUnsigned = {
    format: RECEIPT_FORMAT,
    schema_versions: {
      receipt: 1,
      plan: 1,
      backup: 1
    },
    receipt_id: `backup_retention_receipt_${digestObject({
      plan_digest: verifiedPlan.plan_digest,
      applied_at: appliedAt,
      signer_key_id: identity.keyId
    }).slice(0, 48)}`,
    plan_id: plan.plan_id,
    plan_digest: verifiedPlan.plan_digest,
    applied_at: appliedAt,
    signer_key_id: identity.keyId,
    policy: verifiedPlan.policy,
    source_inventory_digest: plan.inventory.digest,
    retained: {
      count: activeInventory.length,
      inventory_digest: digestObject(activeInventory),
      backups: activeInventory
    },
    retired: {
      count: verifiedPlan.decision.retired.length,
      inventory_digest: digestObject(verifiedPlan.decision.retired),
      backups: verifiedPlan.decision.retired,
      quarantine: `backups/.retired/${plan.plan_id}`
    },
    checks: {
      plan_signature_verified: true,
      source_inventory_unchanged: true,
      all_source_backups_verified: true,
      retained_minimum_satisfied: (
        activeInventory.length >= verifiedPlan.policy.minimum_verified_backups
      ),
      retained_backups_verified: true,
      retired_backups_verified_in_quarantine: true,
      no_backup_deleted: true
    }
  };
  const receipt = {
    ...receiptUnsigned,
    attestation: identity.signObject(receiptUnsigned)
  };
  verifyBackupRetentionReceipt({
    receipt,
    dataDir: root,
    identity
  });
  await writeNewJson(paths.receipt, receipt);
  await writeNewJson(join(paths.quarantine, 'receipt.json'), receipt);
  await rm(paths.pending, { force: true });
  return receipt;
}

export async function recoverPendingBackupRetention({
  dataDir,
  identity,
  protector
}) {
  const root = resolveDataDir(dataDir);
  const pending = await readOptionalJson(
    join(root, 'recovery', 'backup-retention', 'pending.json')
  );
  if (!pending) return null;
  return applyBackupRetentionPlan({
    dataDir: root,
    identity,
    protector,
    plan: pending.plan
  });
}

export function verifyBackupRetentionReceipt({ receipt, dataDir, identity }) {
  if (
    !receipt
    || typeof receipt !== 'object'
    || Array.isArray(receipt)
    || receipt.format !== RECEIPT_FORMAT
    || receipt.schema_versions?.receipt !== 1
    || receipt.schema_versions?.plan !== 1
    || receipt.schema_versions?.backup !== 1
    || !PLAN_ID.test(receipt.plan_id ?? '')
    || !DIGEST.test(receipt.plan_digest ?? '')
    || !/^backup_retention_receipt_[a-f0-9]{48}$/.test(
      receipt.receipt_id ?? ''
    )
  ) {
    throw new ValidationError('Backup retention receipt format is invalid');
  }
  validateBackupRetentionPolicy(receipt.policy);
  normalizeDate(receipt.applied_at, 'Backup retention receipt applied_at');
  if (
    typeof receipt.signer_key_id !== 'string'
    || receipt.signer_key_id !== receipt.attestation?.key_id
  ) {
    throw new ValidationError('Backup retention receipt signer metadata is invalid');
  }
  const retained = validateReceiptInventory(receipt.retained, 'retained');
  const retired = validateReceiptInventory(receipt.retired, 'retired');
  const allIds = [
    ...retained.map(item => item.backup_id),
    ...retired.map(item => item.backup_id)
  ];
  const expectedReceiptId = `backup_retention_receipt_${digestObject({
    plan_digest: receipt.plan_digest,
    applied_at: receipt.applied_at,
    signer_key_id: receipt.signer_key_id
  }).slice(0, 48)}`;
  if (
    retained.length < receipt.policy.minimum_verified_backups
    || new Set(allIds).size !== allIds.length
    || receipt.receipt_id !== expectedReceiptId
    || !DIGEST.test(receipt.source_inventory_digest ?? '')
    || receipt.retired?.quarantine
      !== `backups/.retired/${receipt.plan_id}`
    || !receipt.checks
    || Object.values(receipt.checks).some(value => value !== true)
  ) {
    throw new ValidationError('Backup retention receipt safety checks are invalid');
  }
  const unsigned = structuredClone(receipt);
  delete unsigned.attestation;
  const keys = loadGridVerificationKeys(resolveDataDir(dataDir), identity);
  const signer = keys.get(receipt.attestation?.key_id);
  if (!signer || !verifyObjectSignature(unsigned, receipt.attestation, signer)) {
    throw new ValidationError(
      'Backup retention receipt is not signed by the trusted Grid key lineage'
    );
  }
  return {
    valid: true,
    receipt_id: receipt.receipt_id,
    plan_id: receipt.plan_id,
    retained_count: retained.length,
    retired_count: retired.length
  };
}

export function validateBackupRetentionPolicy(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError('Backup retention policy must be an object');
  }
  const expectedKeys = [
    'format',
    'minimum_verified_backups',
    'retain_latest',
    'retire_after_days'
  ];
  if (
    canonicalJson(Object.keys(value).sort())
    !== canonicalJson(expectedKeys.sort())
    || value.format !== POLICY_FORMAT
  ) {
    throw new ValidationError('Backup retention policy format or fields are invalid');
  }
  for (const [field, minimum, maximum] of [
    ['minimum_verified_backups', 2, 1_000],
    ['retain_latest', 2, 1_000],
    ['retire_after_days', 0, 36_500]
  ]) {
    if (
      !Number.isSafeInteger(value[field])
      || value[field] < minimum
      || value[field] > maximum
    ) {
      throw new ValidationError(`Backup retention policy ${field} is invalid`);
    }
  }
  if (value.retain_latest < value.minimum_verified_backups) {
    throw new ValidationError(
      'Backup retention policy retain_latest must satisfy the verified minimum'
    );
  }
  return structuredClone(value);
}

export async function loadBackupInventory({
  dataDir,
  identity,
  protector
}) {
  const root = resolveDataDir(dataDir);
  const backupsRoot = join(root, 'backups');
  let entries;
  try {
    entries = await readdir(backupsRoot, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const visible = entries.filter(entry => !entry.name.startsWith('.'));
  if (visible.length > MAX_BACKUPS) {
    throw new ValidationError('Backup inventory exceeds the supported limit');
  }
  const inventory = [];
  for (const entry of visible) {
    if (!entry.isDirectory() || !BACKUP_ID.test(entry.name)) {
      throw new ValidationError(`Backup inventory entry is unsafe: ${entry.name}`);
    }
    inventory.push(await descriptorForBackupDirectory({
      directory: join(backupsRoot, entry.name),
      backupId: entry.name,
      dataDir: root,
      identity,
      protector,
      artifactRelativePath: `backups/${entry.name}/snapshot.axb`
    }));
  }
  return inventory.sort(compareNewestFirst);
}

async function descriptorForBackupDirectory({
  directory,
  backupId,
  dataDir,
  identity,
  protector,
  artifactRelativePath
}) {
  await assertRealDirectory(directory, `Backup ${backupId}`);
  const manifestPath = join(directory, 'manifest.json');
  const rawManifest = await readBoundedFile(
    manifestPath,
    MAX_MANIFEST_BYTES,
    `Backup manifest ${backupId}`
  );
  let manifest;
  try {
    manifest = JSON.parse(rawManifest);
  } catch {
    throw new ValidationError(`Backup manifest is invalid JSON: ${backupId}`);
  }
  if (manifest.backup_id !== backupId) {
    throw new ValidationError(`Backup directory and manifest id differ: ${backupId}`);
  }
  const createdAt = normalizeDate(
    manifest.created_at,
    `Backup ${backupId} created_at`
  );
  const verified = await verifyGridBackupArtifact({
    manifestPath,
    dataDir,
    identity,
    protector,
    expectedDatabaseDigest: manifest.database?.sha256,
    artifactRelativePath
  });
  return validateDescriptor({
    backup_id: backupId,
    created_at: createdAt,
    manifest_sha256: sha256(rawManifest),
    signer_key_id: manifest.attestation?.key_id,
    snapshot_relative_path: `backups/${backupId}/snapshot.axb`,
    encrypted_snapshot_sha256: manifest.snapshot?.sha256,
    database_sha256: verified.database_digest,
    database_bytes: manifest.database?.bytes,
    schema_version: manifest.database?.schema_version,
    evidence_events: verified.evidence_chain?.events,
    evidence_head: verified.evidence_chain?.head
  });
}

async function verifyDescriptorAt({
  directory,
  descriptor,
  dataDir,
  identity,
  protector
}) {
  const actual = await descriptorForBackupDirectory({
    directory,
    backupId: descriptor.backup_id,
    dataDir,
    identity,
    protector,
    artifactRelativePath: descriptor.snapshot_relative_path
  });
  if (canonicalJson(actual) !== canonicalJson(descriptor)) {
    throw new ValidationError(
      `Backup descriptor changed for ${descriptor.backup_id}`
    );
  }
  return actual;
}

function selectRetentionDecision(inventory, policy, nowMs) {
  const retirementAgeMs = policy.retire_after_days * DAY_MS;
  const retained = [];
  const retired = [];
  for (const [index, descriptor] of inventory.entries()) {
    const ageMs = nowMs - Date.parse(descriptor.created_at);
    if (ageMs < 0) {
      throw new ValidationError(
        `Backup creation time is later than the retention plan: ${descriptor.backup_id}`
      );
    }
    if (
      index >= policy.retain_latest
      && ageMs >= retirementAgeMs
    ) {
      retired.push(descriptor);
    } else {
      retained.push(descriptor);
    }
  }
  return { retained, retired };
}

function validateInventory(value) {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || !Array.isArray(value.backups)
    || value.backups.length > MAX_BACKUPS
    || value.count !== value.backups.length
  ) {
    throw new ValidationError('Backup retention inventory is invalid');
  }
  const backups = value.backups.map(validateDescriptor);
  const sorted = [...backups].sort(compareNewestFirst);
  if (canonicalJson(backups) !== canonicalJson(sorted)) {
    throw new ValidationError('Backup retention inventory order is invalid');
  }
  if (new Set(backups.map(item => item.backup_id)).size !== backups.length) {
    throw new ValidationError('Backup retention inventory contains duplicate ids');
  }
  if (value.digest !== digestObject(backups)) {
    throw new ValidationError('Backup retention inventory digest is invalid');
  }
  return backups;
}

function validateReceiptInventory(value, label) {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || !Array.isArray(value.backups)
    || value.count !== value.backups.length
  ) {
    throw new ValidationError(`Backup retention ${label} inventory is invalid`);
  }
  const backups = value.backups.map(validateDescriptor);
  if (value.inventory_digest !== digestObject(backups)) {
    throw new ValidationError(
      `Backup retention ${label} inventory digest is invalid`
    );
  }
  if (
    new Set(backups.map(item => item.backup_id)).size !== backups.length
    || canonicalJson(backups)
      !== canonicalJson([...backups].sort(compareNewestFirst))
  ) {
    throw new ValidationError(
      `Backup retention ${label} inventory order or ids are invalid`
    );
  }
  return backups;
}

function validateDescriptor(value) {
  const expectedKeys = [
    'backup_id',
    'created_at',
    'database_bytes',
    'database_sha256',
    'encrypted_snapshot_sha256',
    'evidence_events',
    'evidence_head',
    'manifest_sha256',
    'schema_version',
    'signer_key_id',
    'snapshot_relative_path'
  ];
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || canonicalJson(Object.keys(value).sort())
      !== canonicalJson(expectedKeys.sort())
    || !BACKUP_ID.test(value.backup_id ?? '')
    || value.snapshot_relative_path
      !== `backups/${value.backup_id}/snapshot.axb`
    || ![
      value.manifest_sha256,
      value.encrypted_snapshot_sha256,
      value.database_sha256,
      value.evidence_head
    ].every(item => DIGEST.test(item ?? ''))
    || typeof value.signer_key_id !== 'string'
    || value.signer_key_id.length < 1
    || value.signer_key_id.length > 160
    || !Number.isSafeInteger(value.database_bytes)
    || value.database_bytes < 1
    || !Number.isSafeInteger(value.schema_version)
    || value.schema_version < 1
    || !Number.isSafeInteger(value.evidence_events)
    || value.evidence_events < 1
  ) {
    throw new ValidationError('Backup retention descriptor is invalid');
  }
  normalizeDate(value.created_at, `Backup ${value.backup_id} created_at`);
  return structuredClone(value);
}

function verifyPendingMaintenance({
  pending,
  dataDir,
  identity,
  plan,
  planDigest
}) {
  if (
    pending?.format !== PENDING_FORMAT
    || pending.plan_digest !== planDigest
    || digestObject(pending.plan) !== planDigest
    || canonicalJson(pending.plan) !== canonicalJson(plan)
    || typeof pending.signer_key_id !== 'string'
    || pending.signer_key_id !== pending.attestation?.key_id
  ) {
    throw new ValidationError('Pending backup retention marker is invalid');
  }
  normalizeDate(pending.started_at, 'Pending backup retention started_at');
  const unsigned = structuredClone(pending);
  delete unsigned.attestation;
  const keys = loadGridVerificationKeys(dataDir, identity);
  const signer = keys.get(pending.attestation?.key_id);
  if (!signer || !verifyObjectSignature(unsigned, pending.attestation, signer)) {
    throw new ValidationError(
      'Pending backup retention marker is not signed by the trusted Grid key lineage'
    );
  }
}

function maintenancePaths(dataDir, planId) {
  return {
    backups: join(dataDir, 'backups'),
    quarantine: join(dataDir, 'backups', '.retired', planId),
    pending: join(dataDir, 'recovery', 'backup-retention', 'pending.json'),
    receipt: join(
      dataDir,
      'recovery',
      'backup-retention',
      'receipts',
      `${planId}.json`
    )
  };
}

function compareNewestFirst(left, right) {
  return (
    Date.parse(right.created_at) - Date.parse(left.created_at)
    || right.backup_id.localeCompare(left.backup_id)
  );
}

function planIdFor(value) {
  return `backup_retention_${digestObject(value).slice(0, 48)}`;
}

function normalizeDate(value, label) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new ValidationError(`${label} is invalid`);
  }
  const normalized = date.toISOString();
  if (typeof value === 'string' && value !== normalized) {
    throw new ValidationError(`${label} must use canonical ISO-8601 UTC`);
  }
  return normalized;
}

function resolveDataDir(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ValidationError('Backup maintenance requires a data directory');
  }
  return resolve(value);
}

async function acquireBackupMaintenanceLock(dataDir) {
  try {
    return await acquireGridRuntimeLock(dataDir);
  } catch (error) {
    if (error.code !== 'grid_already_running') throw error;
    await recoverStaleGridRuntimeLock(dataDir);
    return acquireGridRuntimeLock(dataDir);
  }
}

async function directoryExists(path) {
  try {
    await assertRealDirectory(path, 'Backup retention path');
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function assertRealDirectory(path, label) {
  const metadata = await lstat(path);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new ValidationError(`${label} must be a real directory`);
  }
}

async function readBoundedFile(path, maximumBytes, label) {
  const metadata = await lstat(path);
  if (
    !metadata.isFile()
    || metadata.isSymbolicLink()
    || metadata.size < 1
    || metadata.size > maximumBytes
  ) {
    throw new ValidationError(`${label} is not a supported regular file`);
  }
  return readFile(path);
}

async function readOptionalJson(path) {
  try {
    return JSON.parse((
      await readBoundedFile(
        path,
        MAX_MAINTENANCE_JSON_BYTES,
        'Backup maintenance JSON'
      )
    ).toString('utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    if (error instanceof SyntaxError) {
      throw new ValidationError(`Backup maintenance JSON is invalid: ${path}`);
    }
    throw error;
  }
}

async function writeNewJson(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  try {
    await lstat(path);
    throw new ValidationError(`Backup maintenance file already exists: ${path}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temporary, `${canonicalJson(value)}\n`, {
      mode: 0o600,
      flag: 'wx'
    });
    await rename(temporary, path);
  } catch (error) {
    throw error;
  } finally {
    await rm(temporary, { force: true });
  }
}

function maybeCrashAfterRetirement(count) {
  const configured = process.env.AXIOM_TEST_BACKUP_RETENTION_CRASH_AFTER_MOVE;
  if (configured === undefined) return;
  if (!/^[1-9][0-9]{0,3}$/.test(configured)) {
    throw new ValidationError(
      'AXIOM_TEST_BACKUP_RETENTION_CRASH_AFTER_MOVE is invalid'
    );
  }
  if (count === Number(configured)) process.kill(process.pid, 'SIGKILL');
}

async function loadMaintenanceDependencies(dataDir, keyFile) {
  const resolvedKeyFile = resolve(keyFile);
  const keyContent = await readBoundedFile(
    resolvedKeyFile,
    4_096,
    'Data-protection key file'
  );
  const key = Buffer.from(keyContent.toString('utf8').trim(), 'base64url');
  return {
    identity: await ensureMeshIdentity(dataDir, 'grid', { create: false }),
    protector: new DataProtector(key)
  };
}

export {
  PLAN_FORMAT,
  POLICY_FORMAT,
  PENDING_FORMAT,
  RECEIPT_FORMAT
};

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const argumentsList = process.argv.slice(2);
  const [command, dataDirValue, keyFile, argument, outputPath] = argumentsList;
  if (!['plan', 'apply', 'recover'].includes(command)) {
    throw new ValidationError(
      'Usage: node src/backup-maintenance.mjs '
      + 'plan <data-dir> <data-key-file> <policy-file> <plan-file> | '
      + 'apply <data-dir> <data-key-file> <plan-file> | '
      + 'recover <data-dir> <data-key-file>'
    );
  }
  const dataDir = resolveDataDir(dataDirValue);
  if (!keyFile) throw new ValidationError('Backup maintenance requires a data-key file');
  const { identity, protector } = await loadMaintenanceDependencies(
    dataDir,
    keyFile
  );
  let result;
  if (command === 'plan') {
    if (argumentsList.length !== 5 || !argument || !outputPath) {
      throw new ValidationError(
        'Backup retention planning requires a policy file and output plan file'
      );
    }
    const policy = JSON.parse((
      await readBoundedFile(
        resolve(argument),
        MAX_POLICY_BYTES,
        'Backup retention policy'
      )
    ).toString('utf8'));
    result = await planBackupRetention({
      dataDir,
      identity,
      protector,
      policy
    });
    await writeNewJson(resolve(outputPath), result);
  } else if (command === 'apply') {
    if (argumentsList.length !== 4 || !argument || outputPath) {
      throw new ValidationError(
        'Backup retention apply requires exactly one signed plan file'
      );
    }
    const plan = JSON.parse((
      await readBoundedFile(
        resolve(argument),
        MAX_MAINTENANCE_JSON_BYTES,
        'Backup retention plan'
      )
    ).toString('utf8'));
    result = await applyBackupRetentionPlan({
      dataDir,
      identity,
      protector,
      plan
    });
  } else {
    if (argumentsList.length !== 3 || argument || outputPath) {
      throw new ValidationError(
        'Backup retention recover accepts only the data and key paths'
      );
    }
    result = await recoverPendingBackupRetention({
      dataDir,
      identity,
      protector
    });
    if (!result) {
      result = {
        format: RECEIPT_FORMAT,
        status: 'no_pending_maintenance'
      };
    }
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
