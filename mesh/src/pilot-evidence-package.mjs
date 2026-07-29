import { createPublicKey } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  canonicalJson,
  sha256,
  ValidationError
} from './lib/canonical.mjs';
import { verifyObjectSignature } from './lib/identity.mjs';
import {
  assertPilotSecretFree,
  PILOT_EVIDENCE_SCHEMAS,
  PILOT_EVIDENCE_TYPES,
  verifyPilotDossier
} from './pilot-dossier.mjs';
import {
  PILOT_EVIDENCE_DETAIL_CONTRACT_VERSION,
  validatePilotEvidenceDetails
} from './pilot-evidence-contracts.mjs';

export const PILOT_EVIDENCE_ENVELOPE_VERSION = 2;
export const PILOT_PACKAGE_RESULT_SCHEMA =
  'axiom-pilot-evidence-package-verification.v2';

export const PILOT_EVIDENCE_PRODUCER_ROLES = Object.freeze({
  deployment_manifest: 'platform_operator',
  image_provenance: 'release_manager',
  availability_observation: 'platform_operator',
  capacity_measurement: 'platform_operator',
  external_telemetry: 'platform_operator',
  provider_assessment: 'security_reviewer',
  custody_assessment: 'security_reviewer',
  scheduled_restore: 'data_recovery_reviewer',
  credential_rotation: 'data_recovery_reviewer',
  data_key_rotation: 'data_recovery_reviewer',
  credential_history_attestations: 'security_reviewer',
  incident_tabletop: 'independent_reviewer',
  independent_security_review: 'independent_reviewer'
});

const ROOT_ENTRIES = Object.freeze([
  'dossier.json',
  'evidence',
  'policy.json'
]);
const EVIDENCE_FILENAMES = Object.freeze(
  PILOT_EVIDENCE_TYPES.map(type => `${type}.json`)
);
const ENVELOPE_KEYS = Object.freeze([
  'schema',
  'version',
  'evidence_type',
  'status',
  'deployment_id',
  'source',
  'observed_at',
  'producer',
  'summary',
  'details',
  'signer',
  'attestation'
]);
const KEY_ID = /^[a-z][a-z0-9-]{0,63}:[a-f0-9]{16}$/;
const REVISION = /^[a-f0-9]{40}$/;
const IMAGE_DIGEST = /^sha256:[a-f0-9]{64}$/;
const MAX_CONTROL_FILE_BYTES = 4 * 1024 * 1024;
const MAX_EVIDENCE_FILE_BYTES = 8 * 1024 * 1024;
const MAX_PACKAGE_BYTES = 64 * 1024 * 1024;

export async function verifyPilotEvidencePackage({
  packageDir,
  authorityPublicKey,
  now = Date.now()
}) {
  const root = resolvePackageRoot(packageDir);
  await requireDirectory(root, 'Pilot evidence package');
  await exactDirectory(root, ROOT_ENTRIES, 'Pilot evidence package');

  const evidenceDir = join(root, 'evidence');
  await requireDirectory(evidenceDir, 'Pilot evidence directory');
  await exactDirectory(
    evidenceDir,
    EVIDENCE_FILENAMES,
    'Pilot evidence directory'
  );

  const policyRecord = await readCanonicalJson(
    join(root, 'policy.json'),
    'Pilot package policy',
    MAX_CONTROL_FILE_BYTES
  );
  const dossierRecord = await readCanonicalJson(
    join(root, 'dossier.json'),
    'Pilot package dossier',
    MAX_CONTROL_FILE_BYTES
  );
  const dossierResult = verifyPilotDossier(
    dossierRecord.value,
    policyRecord.value,
    authorityPublicKey,
    { now }
  );

  let totalBytes = policyRecord.bytes + dossierRecord.bytes;
  const producerCounts = {};
  for (let index = 0; index < PILOT_EVIDENCE_TYPES.length; index += 1) {
    const type = PILOT_EVIDENCE_TYPES[index];
    const filename = `${type}.json`;
    const expectedReference = `evidence/${filename}`;
    const metadata = dossierRecord.value.evidence[index];
    if (metadata.reference !== expectedReference) {
      throw new ValidationError(
        `Pilot package evidence reference must be local and exact: ${type}`
      );
    }
    const record = await readCanonicalJson(
      join(evidenceDir, filename),
      `Pilot package evidence ${type}`,
      MAX_EVIDENCE_FILE_BYTES
    );
    totalBytes += record.bytes;
    if (totalBytes > MAX_PACKAGE_BYTES) {
      throw new ValidationError('Pilot evidence package exceeds the size limit');
    }
    if (`sha256:${sha256(record.raw)}` !== metadata.sha256) {
      throw new ValidationError(`Pilot package evidence digest differs: ${type}`);
    }
    const result = verifyPilotEvidenceEnvelope({
      envelope: record.value,
      type,
      metadata,
      dossier: dossierRecord.value,
      policy: policyRecord.value
    });
    producerCounts[result.producer_role] =
      (producerCounts[result.producer_role] ?? 0) + 1;
  }

  return {
    valid: true,
    schema: PILOT_PACKAGE_RESULT_SCHEMA,
    dossier_id: dossierRecord.value.dossier_id,
    policy_id: policyRecord.value.policy_id,
    source_revision: dossierResult.source_revision,
    image_digest: dossierResult.image_digest,
    canonical_control_files: 2,
    canonical_evidence_files: PILOT_EVIDENCE_TYPES.length,
    evidence_detail_contract_version:
      PILOT_EVIDENCE_DETAIL_CONTRACT_VERSION,
    total_bytes: totalBytes,
    producer_roles: producerCounts,
    intake_status: 'accepted-for-promotion-review',
    production_promoted: false
  };
}

export function verifyPilotEvidenceEnvelope({
  envelope,
  type,
  metadata,
  dossier,
  policy
}) {
  exactObject(envelope, `Pilot evidence envelope ${type}`, ENVELOPE_KEYS);
  assertPilotSecretFree(envelope);
  const expectedRole = PILOT_EVIDENCE_PRODUCER_ROLES[type];
  const reviewer = policy.reviewers.find(item => item.role === expectedRole);
  if (!reviewer) {
    throw new ValidationError(`Pilot evidence producer role is not trusted: ${type}`);
  }
  exactObject(envelope.source, `Pilot evidence source ${type}`, [
    'kernel_version',
    'source_revision',
    'image_digest'
  ]);
  exactObject(envelope.producer, `Pilot evidence producer ${type}`, [
    'role',
    'reviewer_id'
  ]);
  exactObject(envelope.signer, `Pilot evidence signer ${type}`, ['key_id']);
  validateAttestation(envelope.attestation, `Pilot evidence attestation ${type}`);
  if (
    envelope.schema !== PILOT_EVIDENCE_SCHEMAS[type]
    || envelope.version !== PILOT_EVIDENCE_ENVELOPE_VERSION
    || envelope.evidence_type !== type
    || envelope.status !== 'passed'
    || envelope.deployment_id !== dossier.deployment.deployment_id
    || envelope.source.kernel_version !== dossier.build.kernel_version
    || envelope.source.source_revision !== dossier.build.source_revision
    || !REVISION.test(envelope.source.source_revision ?? '')
    || envelope.source.image_digest !== dossier.build.image_digest
    || !IMAGE_DIGEST.test(envelope.source.image_digest ?? '')
    || envelope.observed_at !== metadata.observed_at
    || envelope.producer.role !== expectedRole
    || envelope.producer.reviewer_id !== reviewer.reviewer_id
    || envelope.signer.key_id !== reviewer.key_id
    || typeof envelope.summary !== 'string'
    || envelope.summary.length < 20
    || envelope.summary.length > 1_000
    || /[\r\n]/.test(envelope.summary)
    || envelope.attestation.key_id !== reviewer.key_id
  ) throw new ValidationError(`Pilot evidence envelope is invalid: ${type}`);

  validatePilotEvidenceDetails({
    type,
    details: envelope.details,
    dossier,
    policy,
    metadata
  });
  const publicKey = parseReviewerKey(
    reviewer.public_key_pem,
    `Pilot evidence reviewer ${expectedRole}`
  );
  const unsigned = structuredClone(envelope);
  delete unsigned.attestation;
  if (!verifyObjectSignature(unsigned, envelope.attestation, publicKey)) {
    throw new ValidationError(`Pilot evidence envelope signature is invalid: ${type}`);
  }
  return {
    valid: true,
    type,
    schema: envelope.schema,
    producer_role: expectedRole
  };
}

export function pilotEvidenceEnvelopePayload(envelope) {
  const unsigned = structuredClone(envelope);
  delete unsigned.attestation;
  return unsigned;
}

async function readCanonicalJson(path, name, maxBytes) {
  const metadata = await requireFile(path, name, maxBytes);
  let raw;
  let value;
  try {
    raw = await readFile(path);
    value = JSON.parse(raw.toString('utf8'));
  } catch {
    throw new ValidationError(`${name} is not valid JSON`);
  }
  const canonical = canonicalJson(value);
  if (!raw.equals(Buffer.from(canonical, 'utf8'))) {
    throw new ValidationError(`${name} must use exact canonical JSON`);
  }
  return {
    raw,
    value,
    bytes: metadata.size
  };
}

async function exactDirectory(path, expected, name) {
  let entries;
  try {
    entries = await readdir(path, { withFileTypes: true });
  } catch {
    throw new ValidationError(`${name} cannot be read`);
  }
  const actual = entries.map(entry => entry.name).sort();
  if (canonicalJson(actual) !== canonicalJson([...expected].sort())) {
    throw new ValidationError(`${name} inventory is not exact`);
  }
  if (entries.some(entry => entry.isSymbolicLink())) {
    throw new ValidationError(`${name} may not contain symbolic links`);
  }
}

async function requireDirectory(path, name) {
  let metadata;
  try {
    metadata = await lstat(path);
  } catch {
    throw new ValidationError(`${name} is missing`);
  }
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new ValidationError(`${name} must be a real directory`);
  }
}

async function requireFile(path, name, maxBytes) {
  let metadata;
  try {
    metadata = await lstat(path);
  } catch {
    throw new ValidationError(`${name} is missing`);
  }
  if (
    !metadata.isFile()
    || metadata.isSymbolicLink()
    || metadata.size <= 0
    || metadata.size > maxBytes
  ) throw new ValidationError(`${name} must be a bounded regular file`);
  return metadata;
}

function resolvePackageRoot(value) {
  if (typeof value !== 'string' || !value.length) {
    throw new ValidationError('Pilot evidence package path is required');
  }
  return resolve(value);
}

function exactObject(value, name, keys) {
  if (
    !plainObject(value)
    || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...keys].sort())
  ) throw new ValidationError(`${name} fields are invalid`);
}

function validateAttestation(attestation, name) {
  exactObject(attestation, name, [
    'algorithm',
    'key_id',
    'digest',
    'signature'
  ]);
  if (
    attestation.algorithm !== 'Ed25519'
    || !KEY_ID.test(attestation.key_id ?? '')
    || !/^[a-f0-9]{64}$/.test(attestation.digest ?? '')
    || !/^[A-Za-z0-9_-]{80,128}$/.test(attestation.signature ?? '')
  ) throw new ValidationError(`${name} is invalid`);
}

function parseReviewerKey(pem, name) {
  if (
    typeof pem !== 'string'
    || !pem.includes('-----BEGIN PUBLIC KEY-----')
    || pem.includes('PRIVATE KEY')
  ) throw new ValidationError(`${name} is invalid`);
  try {
    const key = createPublicKey(pem);
    if (key.asymmetricKeyType !== 'ed25519') throw new Error('not Ed25519');
    return key;
  } catch {
    throw new ValidationError(`${name} is invalid`);
  }
}

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function main() {
  const [command, packageDir, authorityKeyPath] = process.argv.slice(2);
  if (
    command !== 'verify'
    || !packageDir
    || !authorityKeyPath
    || process.argv.length !== 5
  ) {
    throw new ValidationError(
      'Usage: node src/pilot-evidence-package.mjs verify <package-directory> <authority-public.pem>'
    );
  }
  const authorityPublicKey = await readFile(authorityKeyPath, 'utf8');
  process.stdout.write(`${JSON.stringify(
    await verifyPilotEvidencePackage({
      packageDir,
      authorityPublicKey
    }),
    null,
    2
  )}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
