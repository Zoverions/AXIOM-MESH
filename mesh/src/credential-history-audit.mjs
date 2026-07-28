import {
  createHmac,
  createPublicKey,
  generateKeyPairSync
} from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  canonicalJson,
  digestObject,
  sha256,
  ValidationError
} from './lib/canonical.mjs';
import { MeshIdentity, verifyObjectSignature } from './lib/identity.mjs';
import { MESH_ROOT } from './lib/config.mjs';

const REPOSITORY_ROOT = dirname(MESH_ROOT);
const LEDGER_SCHEMA = 'axiom-credential-revocation-ledger.v1';
const EVIDENCE_SCHEMA = 'axiom-credential-history-audit-evidence.v1';
const DEFAULT_DEPRECATED_REF = 'origin/deprecated/legacy-main-pre-clean-room';
const MAX_BLOB_BYTES = 64 * 1024 * 1024;
const MAX_BATCH_BYTES = 8 * 1024 * 1024;
const MAX_BATCH_OBJECTS = 128;
const OBJECT_ID = /^[a-f0-9]{40,64}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const CREDENTIAL_ID = /^hmac-sha256:[a-f0-9]{64}$/;
const HIGH_RISK_PATH = /(?:^|\/)(?:\.env(?:\..*)?|[^/]*(?:secret|credential|keystore|wallet)[^/]*\.(?:conf|env|ini|json|pem|toml|txt|ya?ml)|[^/]*\.(?:key|p12|pfx|jks|keystore)|private(?:[-_.][^/]*)?\.pem)$/i;
const TEXT_SECRET_NAME = /(?:^|[_\-.])(?:api[_-]?key|access[_-]?key|auth[_-]?key|client[_-]?secret|credential|data[_-]?key|jwt|mnemonic|pass(?:word|wd|phrase)?|private[_-]?key|secret|seed|token|wallet)(?:$|[_\-.])/i;
const NON_SECRET_NAME = /(?:(?:^|[_\-.])(?:token|wallet)[_\-.](?:address|amount|balance|cost|count|decimals|id|limit|max|name|price|store|supply|symbol|types?|uri)|(?:^|[_\-.])(?:id|types?)[_\-.](?:token|wallet))(?:$|[_\-.])/i;
const BARE_ASSIGNMENT_PATH = /(?:^|\/)(?:\.env(?:\..*)?|[^/]*\.(?:bash|bat|cmd|conf|env|ini|json|properties|ps1|sh|tfvars|toml|ya?ml|zsh))$/i;
const PLACEHOLDER = /^(?:<[^>]+>|\$\{[^}]+}|change[-_ ]?me|example|sample|placeholder|replace[-_ ]?me|redacted|unset|undefined|null|none|todo|your[-_ ].*|insert[-_ ].*|xxx+|test(?:ing)?|dummy|password|secret)$/i;

const PROVIDER_PATTERNS = Object.freeze([
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{40,255})\b/g],
  ['aws-access-key-id', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ['google-api-key', /\bAIza[A-Za-z0-9_-]{35}\b/g],
  ['slack-token', /\bxox[baprs]-[A-Za-z0-9-]{10,255}\b/g],
  ['stripe-secret-key', /\bsk_(?:live|test)_[A-Za-z0-9]{16,255}\b/g],
  ['bearer-token', /\bBearer\s+([A-Za-z0-9._~+\/=-]{20,4096})/g],
  ['basic-auth-url', /\b[a-z][a-z0-9+.-]*:\/\/[^:\s/@]{1,256}:([^@\s/]{1,1024})@/gi]
]);

export function decodeAuditKey(serialized = process.env.AXIOM_CREDENTIAL_AUDIT_KEY) {
  if (typeof serialized !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(serialized)) {
    throw new ValidationError(
      'AXIOM_CREDENTIAL_AUDIT_KEY must be an unpadded base64url-encoded 32-byte key'
    );
  }
  const key = Buffer.from(serialized, 'base64url');
  if (key.length !== 32 || key.toString('base64url') !== serialized) {
    throw new ValidationError('Credential audit key encoding is invalid');
  }
  return key;
}

export function auditKeyId(auditKey) {
  assertAuditKey(auditKey);
  return `sha256:${sha256(auditKey)}`;
}

export function findCredentialCandidates(content, path, auditKey) {
  assertAuditKey(auditKey);
  if (!Buffer.isBuffer(content)) {
    throw new ValidationError('Credential scanner content must be a Buffer');
  }
  const candidates = new Map();
  const add = (secret, kind, label) => {
    const normalized = normalizeSecret(secret);
    if (!normalized.length || normalized.length > MAX_BLOB_BYTES) return;
    const id = credentialId(normalized, auditKey);
    const current = candidates.get(id) ?? {
      credential_id: id,
      kinds: new Set(),
      labels: new Set()
    };
    current.kinds.add(kind);
    current.labels.add(label);
    candidates.set(id, current);
  };

  const binary = content.includes(0);
  const text = content.toString('utf8').replace(/\r\n?/g, '\n');
  if (!binary) {
    for (const match of text.matchAll(
      /-----BEGIN ([A-Z0-9 ]*PRIVATE KEY)-----[\s\S]*?-----END \1-----/g
    )) {
      add(match[0], 'private-key', 'asymmetric-private-key');
    }
    for (const line of text.split('\n')) {
      const assignment = parseSensitiveAssignment(line, path);
      if (!assignment || isPlaceholder(assignment.value)) continue;
      add(
        assignment.value,
        'sensitive-assignment',
        `configuration:${assignment.name.toLowerCase()}`
      );
    }
  }
  for (const [label, pattern] of PROVIDER_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      add(match[1] ?? match[0].replace(/^Bearer\s+/i, ''), 'provider-token', label);
    }
  }

  if (candidates.size === 0 && HIGH_RISK_PATH.test(normalizePath(path))) {
    const trimmed = trimBuffer(content);
    if (trimmed.length && !isPlaceholder(trimmed.toString('utf8'))) {
      add(trimmed, 'secret-file', 'high-risk-file');
    }
  }

  return [...candidates.values()]
    .map(candidate => ({
      credential_id: candidate.credential_id,
      kinds: [...candidate.kinds].sort(),
      labels: [...candidate.labels].sort()
    }))
    .sort(compareCredentialRecords);
}

export function scanGitHistory({
  repositoryRoot = REPOSITORY_ROOT,
  ref,
  auditKey,
  scope = 'history',
  gitExecutable = process.env.AXIOM_GIT_EXECUTABLE || 'git'
}) {
  if (typeof ref !== 'string' || !ref.length) throw new ValidationError('Git ref is required');
  if (!['history', 'tree'].includes(scope)) {
    throw new ValidationError('Credential Git scan scope must be history or tree');
  }
  assertAuditKey(auditKey);
  const root = resolve(repositoryRoot);
  const tip = gitText(gitExecutable, ['rev-parse', '--verify', `${ref}^{commit}`], root);
  if (!OBJECT_ID.test(tip)) throw new ValidationError(`Git ref did not resolve to a commit: ${ref}`);
  const listed = scope === 'history'
    ? gitText(gitExecutable, ['rev-list', '--objects', ref], root)
    : gitText(
      gitExecutable,
      ['ls-tree', '-r', '--full-tree', '--format=%(objectname) %(path)', ref],
      root
    );
  const objects = parseObjectList(listed);
  const metadata = inspectObjects(gitExecutable, root, objects);
  const oversizedHighRiskPaths = metadata
    .filter(item => item.type === 'blob' && item.size > MAX_BLOB_BYTES && HIGH_RISK_PATH.test(item.path))
    .map(item => item.path)
    .sort();
  if (oversizedHighRiskPaths.length) {
    throw new ValidationError(
      `Credential audit cannot safely scan oversized high-risk paths: ${oversizedHighRiskPaths.join(', ')}`
    );
  }
  const blobs = metadata.filter(item => item.type === 'blob' && item.size <= MAX_BLOB_BYTES);
  const inventory = new Map();
  for (const batch of batchObjects(blobs)) {
    const contents = readObjectBatch(gitExecutable, root, batch);
    for (const item of batch) {
      const content = contents.get(item.id);
      if (!content) throw new ValidationError('Git credential audit blob batch was incomplete');
      for (const candidate of findCredentialCandidates(content, item.path, auditKey)) {
        const current = inventory.get(candidate.credential_id) ?? {
          credential_id: candidate.credential_id,
          kinds: new Set(),
          labels: new Set(),
          paths: new Set(),
          blob_occurrences: 0
        };
        candidate.kinds.forEach(value => current.kinds.add(value));
        candidate.labels.forEach(value => current.labels.add(value));
        current.paths.add(normalizePath(item.path));
        current.blob_occurrences += 1;
        inventory.set(candidate.credential_id, current);
      }
    }
  }
  const records = [...inventory.values()]
    .map(record => ({
      credential_id: record.credential_id,
      kinds: [...record.kinds].sort(),
      labels: [...record.labels].sort(),
      paths: [...record.paths].sort(),
      blob_occurrences: record.blob_occurrences
    }))
    .sort(compareCredentialRecords);
  return {
    ref,
    scope,
    tip,
    scanned_objects: metadata.length,
    scanned_blobs: blobs.length,
    skipped_large_blobs: metadata.filter(
      item => item.type === 'blob' && item.size > MAX_BLOB_BYTES
    ).length,
    records
  };
}

export function createCredentialRevocationLedger({
  legacyInventory,
  deprecatedRef = DEFAULT_DEPRECATED_REF,
  auditKey,
  generatedAt = new Date().toISOString()
}) {
  validateInventory(legacyInventory);
  assertAuditKey(auditKey);
  if (legacyInventory.ref !== deprecatedRef) {
    throw new ValidationError('Deprecated ref and scanned inventory ref differ');
  }
  const entries = legacyInventory.records.map(record => ({
    ...record,
    repository_revocation: {
      status: 'revoked',
      authority: 'supported-clean-room-trust-boundary',
      rationale: 'Deprecated-history credentials are permanently excluded from supported trust.'
    },
    external_revocation: {
      status: 'attestation-required',
      evidence: [],
      rationale: 'Prior deployment and provider custody are not inferable from Git history.'
    }
  }));
  return {
    schema: LEDGER_SCHEMA,
    generated_at: normalizeTimestamp(generatedAt),
    deprecated_history: {
      ref: deprecatedRef,
      tip: legacyInventory.tip,
      immutable: true
    },
    audit: {
      key_id: auditKeyId(auditKey),
      hmac: 'HMAC-SHA256',
      scanner: 'mesh/src/credential-history-audit.mjs',
      max_blob_bytes: MAX_BLOB_BYTES,
      scanned_objects: legacyInventory.scanned_objects,
      scanned_blobs: legacyInventory.scanned_blobs,
      skipped_large_blobs: legacyInventory.skipped_large_blobs
    },
    entries,
    summary: ledgerSummary(entries)
  };
}

export function validateCredentialRevocationLedger(ledger, {
  expectedInventory,
  auditKey,
  expectedDeprecatedRef = DEFAULT_DEPRECATED_REF
} = {}) {
  if (!ledger || ledger.schema !== LEDGER_SCHEMA) {
    throw new ValidationError('Credential revocation ledger schema is invalid');
  }
  normalizeTimestamp(ledger.generated_at);
  if (
    ledger.deprecated_history?.ref !== expectedDeprecatedRef
    || !OBJECT_ID.test(ledger.deprecated_history?.tip ?? '')
    || ledger.deprecated_history?.immutable !== true
  ) throw new ValidationError('Credential revocation ledger history boundary is invalid');
  if (
    ledger.audit?.hmac !== 'HMAC-SHA256'
    || ledger.audit?.scanner !== 'mesh/src/credential-history-audit.mjs'
    || ledger.audit?.max_blob_bytes !== MAX_BLOB_BYTES
    || !/^sha256:[a-f0-9]{64}$/.test(ledger.audit?.key_id ?? '')
  ) throw new ValidationError('Credential revocation ledger audit metadata is invalid');
  if (auditKey && ledger.audit.key_id !== auditKeyId(auditKey)) {
    throw new ValidationError('Credential revocation ledger was produced with a different audit key');
  }
  if (!Array.isArray(ledger.entries) || ledger.entries.length === 0) {
    throw new ValidationError('Credential revocation ledger has no entries');
  }
  const ids = new Set();
  for (const entry of ledger.entries) {
    if (!CREDENTIAL_ID.test(entry?.credential_id ?? '') || ids.has(entry.credential_id)) {
      throw new ValidationError('Credential revocation ledger has an invalid or duplicate identifier');
    }
    ids.add(entry.credential_id);
    validateStringArray(entry.kinds, 'credential kinds');
    validateStringArray(entry.labels, 'credential labels');
    validateStringArray(entry.paths, 'credential paths');
    if (!Number.isSafeInteger(entry.blob_occurrences) || entry.blob_occurrences < 1) {
      throw new ValidationError('Credential revocation ledger occurrence count is invalid');
    }
    if (
      entry.repository_revocation?.status !== 'revoked'
      || entry.repository_revocation?.authority !== 'supported-clean-room-trust-boundary'
      || !nonEmpty(entry.repository_revocation?.rationale)
    ) throw new ValidationError('Every historical credential must be revoked from repository trust');
    validateExternalRevocation(entry.external_revocation);
  }
  if (canonicalJson([...ledger.entries].sort(compareCredentialRecords)) !== canonicalJson(ledger.entries)) {
    throw new ValidationError('Credential revocation ledger entries must be sorted');
  }
  const summary = ledgerSummary(ledger.entries);
  if (canonicalJson(summary) !== canonicalJson(ledger.summary)) {
    throw new ValidationError('Credential revocation ledger summary is stale');
  }
  if (expectedInventory) {
    validateInventory(expectedInventory);
    if (
      expectedInventory.ref !== ledger.deprecated_history.ref
      || expectedInventory.tip !== ledger.deprecated_history.tip
    ) throw new ValidationError('Credential revocation ledger does not match deprecated history tip');
    const projected = ledger.entries.map(projectInventoryRecord);
    if (canonicalJson(projected) !== canonicalJson(expectedInventory.records)) {
      throw new ValidationError('Credential revocation ledger does not cover the exact historical inventory');
    }
    for (const field of ['scanned_objects', 'scanned_blobs', 'skipped_large_blobs']) {
      if (ledger.audit[field] !== expectedInventory[field]) {
        throw new ValidationError(`Credential revocation ledger audit count is stale: ${field}`);
      }
    }
  }
  return {
    valid: true,
    entries: ledger.entries.length,
    repository_revoked: summary.repository_revoked,
    external_attestation_required: summary.external_attestation_required,
    external_verified: summary.external_verified,
    external_complete: summary.external_complete,
    digest: digestObject(ledger)
  };
}

export function verifySupportedHistoryExcludesDeprecatedCredentials({
  legacyInventory,
  currentInventory
}) {
  validateInventory(legacyInventory);
  validateInventory(currentInventory);
  if (legacyInventory.scope !== 'history' || currentInventory.scope !== 'tree') {
    throw new ValidationError('Credential trust comparison requires deprecated history and supported tip');
  }
  const legacyIds = new Set(legacyInventory.records.map(record => record.credential_id));
  const reused = currentInventory.records
    .filter(record => legacyIds.has(record.credential_id))
    .map(record => record.credential_id);
  if (reused.length) {
    throw new ValidationError(
      `Supported tip reintroduces ${reused.length} deprecated credential fingerprint(s)`
    );
  }
  return {
    valid: true,
    deprecated_credentials: legacyIds.size,
    supported_credentials_scanned: currentInventory.records.length,
    reused_credentials: 0
  };
}

export function createCredentialHistoryEvidence({
  ledger,
  ledgerValidation,
  legacyInventory,
  currentInventory,
  trustComparison,
  currentRevision = currentInventory.tip,
  generatedAt = new Date().toISOString()
}) {
  const pair = generateKeyPairSync('ed25519');
  const signer = new MeshIdentity(
    'credential-auditor',
    pair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    pair.publicKey.export({ type: 'spki', format: 'pem' })
  );
  const unsigned = {
    schema: EVIDENCE_SCHEMA,
    status: 'passed',
    scope: 'repository-trust-boundary',
    generated_at: normalizeTimestamp(generatedAt),
    source: {
      revision: currentRevision,
      deprecated_ref: legacyInventory.ref,
      deprecated_tip: legacyInventory.tip
    },
    signer: {
      key_id: signer.keyId,
      public_key_pem: String(pair.publicKey.export({ type: 'spki', format: 'pem' }))
    },
    inventory: {
      audit_key_id: ledger.audit.key_id,
      credential_count: legacyInventory.records.length,
      scanned_objects: legacyInventory.scanned_objects,
      scanned_blobs: legacyInventory.scanned_blobs,
      skipped_large_blobs: legacyInventory.skipped_large_blobs,
      ledger_sha256: digestObject(ledger)
    },
    repository_revocation: {
      recorded: ledgerValidation.repository_revoked,
      supported_tip_credentials_scanned: trustComparison.supported_credentials_scanned,
      reintroduced: trustComparison.reused_credentials,
      complete: true
    },
    external_revocation: {
      verified: ledgerValidation.external_verified,
      attestation_required: ledgerValidation.external_attestation_required,
      complete: ledgerValidation.external_complete
    },
    checks: {
      deprecated_tip_bound: ledger.deprecated_history.tip === legacyInventory.tip,
      historical_inventory_exactly_covered: ledgerValidation.entries === legacyInventory.records.length,
      every_historical_credential_repository_revoked: (
        ledgerValidation.repository_revoked === legacyInventory.records.length
      ),
      supported_history_reuse_absent: trustComparison.reused_credentials === 0,
      secret_values_omitted: true
    },
    limitations: [
      'Repository revocation is not proof of revocation at an external provider or prior deployment.',
      'External attestations remain a production-promotion gate where the ledger says attestation-required.',
      'Credential identifiers are keyed HMACs; the audit key and credential values are omitted.'
    ]
  };
  const evidence = {
    ...unsigned,
    attestation: signer.signObject(unsigned)
  };
  verifyCredentialHistoryEvidence(evidence);
  return evidence;
}

export function verifyCredentialHistoryEvidence(evidence) {
  if (!evidence || evidence.schema !== EVIDENCE_SCHEMA || evidence.status !== 'passed') {
    throw new ValidationError('Credential history evidence schema or status is invalid');
  }
  if (
    evidence.scope !== 'repository-trust-boundary'
    || !OBJECT_ID.test(evidence.source?.revision ?? '')
    || !OBJECT_ID.test(evidence.source?.deprecated_tip ?? '')
    || !nonEmpty(evidence.source?.deprecated_ref)
    || !/^sha256:[a-f0-9]{64}$/.test(evidence.inventory?.audit_key_id ?? '')
    || !DIGEST.test(evidence.inventory?.ledger_sha256 ?? '')
  ) throw new ValidationError('Credential history evidence metadata is invalid');
  normalizeTimestamp(evidence.generated_at);
  if (
    !evidence.checks
    || Object.values(evidence.checks).some(value => value !== true)
    || evidence.repository_revocation?.complete !== true
    || evidence.repository_revocation?.reintroduced !== 0
  ) throw new ValidationError('Credential history evidence checks failed');
  const unsigned = { ...evidence };
  delete unsigned.attestation;
  let publicKey;
  try {
    publicKey = createPublicKey(evidence.signer?.public_key_pem);
  } catch {
    throw new ValidationError('Credential history evidence signer is invalid');
  }
  if (!verifyObjectSignature(unsigned, evidence.attestation, publicKey)) {
    throw new ValidationError('Credential history evidence attestation is invalid');
  }
  return {
    valid: true,
    credentials: evidence.inventory.credential_count,
    external_complete: evidence.external_revocation.complete
  };
}

export async function runCredentialHistoryAudit({
  repositoryRoot = REPOSITORY_ROOT,
  deprecatedRef = DEFAULT_DEPRECATED_REF,
  currentRef = 'HEAD',
  ledgerPath = resolve(MESH_ROOT, 'config', 'credential-revocations.json'),
  auditKey = decodeAuditKey(),
  gitExecutable = process.env.AXIOM_GIT_EXECUTABLE || 'git',
  generatedAt
} = {}) {
  const legacyInventory = scanGitHistory({
    repositoryRoot,
    ref: deprecatedRef,
    auditKey,
    gitExecutable
  });
  const currentInventory = scanGitHistory({
    repositoryRoot,
    ref: currentRef,
    auditKey,
    scope: 'tree',
    gitExecutable
  });
  const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
  const ledgerValidation = validateCredentialRevocationLedger(ledger, {
    expectedInventory: legacyInventory,
    auditKey,
    expectedDeprecatedRef: deprecatedRef
  });
  const trustComparison = verifySupportedHistoryExcludesDeprecatedCredentials({
    legacyInventory,
    currentInventory
  });
  return createCredentialHistoryEvidence({
    ledger,
    ledgerValidation,
    legacyInventory,
    currentInventory,
    trustComparison,
    generatedAt
  });
}

function validateInventory(inventory) {
  if (
    !inventory
    || !nonEmpty(inventory.ref)
    || !['history', 'tree'].includes(inventory.scope)
    || !OBJECT_ID.test(inventory.tip ?? '')
    || !Array.isArray(inventory.records)
  ) throw new ValidationError('Credential inventory is invalid');
}

function validateExternalRevocation(revocation) {
  const allowed = new Set(['attestation-required', 'verified', 'not-applicable']);
  if (!allowed.has(revocation?.status) || !Array.isArray(revocation?.evidence)) {
    throw new ValidationError('External credential revocation state is invalid');
  }
  if (revocation.status === 'attestation-required') {
    if (revocation.evidence.length || !nonEmpty(revocation.rationale)) {
      throw new ValidationError('Pending external revocation must have rationale and no evidence claim');
    }
    return;
  }
  if (!nonEmpty(revocation.rationale)) {
    throw new ValidationError('External credential revocation disposition requires a rationale');
  }
  if (revocation.status === 'verified') {
    if (!revocation.evidence.length) {
      throw new ValidationError('Verified external revocation requires evidence');
    }
    for (const evidence of revocation.evidence) {
      if (
        !nonEmpty(evidence?.reference)
        || !DIGEST.test(evidence?.sha256 ?? '')
        || !normalizeTimestamp(evidence?.verified_at)
      ) throw new ValidationError('External revocation evidence metadata is invalid');
    }
  } else if (revocation.evidence.length) {
    throw new ValidationError('Not-applicable external revocation may not claim evidence');
  }
}

function ledgerSummary(entries) {
  const summary = {
    credentials: entries.length,
    repository_revoked: 0,
    external_attestation_required: 0,
    external_verified: 0,
    external_not_applicable: 0,
    external_complete: true
  };
  for (const entry of entries) {
    if (entry.repository_revocation?.status === 'revoked') summary.repository_revoked += 1;
    if (entry.external_revocation?.status === 'attestation-required') {
      summary.external_attestation_required += 1;
      summary.external_complete = false;
    } else if (entry.external_revocation?.status === 'verified') {
      summary.external_verified += 1;
    } else if (entry.external_revocation?.status === 'not-applicable') {
      summary.external_not_applicable += 1;
    }
  }
  return summary;
}

function projectInventoryRecord(entry) {
  return {
    credential_id: entry.credential_id,
    kinds: entry.kinds,
    labels: entry.labels,
    paths: entry.paths,
    blob_occurrences: entry.blob_occurrences
  };
}

function parseSensitiveAssignment(line, path) {
  if (!line || /^\s*(?:#|\/\/|\*)/.test(line)) return null;
  const match = line.match(
    /^\s*(?:(?:export|const|let|var)\s+)?["']?([A-Za-z][A-Za-z0-9_.-]{1,127})["']?\s*[:=]\s*(.*?)\s*[,;]?\s*$/
  );
  if (
    !match
    || !TEXT_SECRET_NAME.test(match[1])
    || NON_SECRET_NAME.test(match[1])
  ) return null;
  let value = match[2].trim();
  if (!value || /^(?:process\.env|os\.getenv|env\.|getenv\(|secret\(|vault\()/i.test(value)) return null;
  const quote = value[0];
  const quoted = (quote === '"' || quote === "'" || quote === '`') && value.at(-1) === quote;
  if (quoted) {
    value = value.slice(1, -1);
  } else {
    if (!BARE_ASSIGNMENT_PATH.test(normalizePath(path))) return null;
    value = value.replace(/\s+#.*$/, '').trim();
  }
  if (!value || value.includes('${') || (!quoted && /[\s()[\]{},;]/.test(value))) return null;
  return { name: match[1], value };
}

function isPlaceholder(value) {
  const text = String(value).trim();
  return (
    text.length === 0
    || PLACEHOLDER.test(text)
    || /^\$\w+$/.test(text)
    || /^\{\{.*}}$/.test(text)
    || /^(?:true|false|0|1)$/i.test(text)
  );
}

function normalizeSecret(secret) {
  if (Buffer.isBuffer(secret)) return trimBuffer(secret);
  return trimBuffer(Buffer.from(String(secret).replace(/\r\n?/g, '\n')));
}

function trimBuffer(content) {
  let start = 0;
  let end = content.length;
  while (start < end && /\s/.test(String.fromCharCode(content[start]))) start += 1;
  while (end > start && /\s/.test(String.fromCharCode(content[end - 1]))) end -= 1;
  return content.subarray(start, end);
}

function credentialId(secret, auditKey) {
  const hmac = createHmac('sha256', auditKey);
  hmac.update('AXIOM-CREDENTIAL-HISTORY-V1\0');
  hmac.update(secret);
  return `hmac-sha256:${hmac.digest('hex')}`;
}

function inspectObjects(gitExecutable, repositoryRoot, objects) {
  if (!objects.length) return [];
  const input = `${objects.map(item => item.id).join('\n')}\n`;
  const output = gitBuffer(
    gitExecutable,
    ['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'],
    repositoryRoot,
    input
  ).toString('utf8').trim();
  const byId = new Map(objects.map(item => [item.id, item]));
  return output.split(/\r?\n/).map(line => {
    const [id, type, sizeText] = line.split(' ');
    const source = byId.get(id);
    const size = Number(sizeText);
    if (!source || !['blob', 'tree', 'commit', 'tag'].includes(type) || !Number.isSafeInteger(size)) {
      throw new ValidationError('Git credential audit object metadata is invalid');
    }
    return { ...source, type, size };
  });
}

function readObjectBatch(gitExecutable, repositoryRoot, batch) {
  const input = `${batch.map(item => item.id).join('\n')}\n`;
  const output = gitBuffer(gitExecutable, ['cat-file', '--batch'], repositoryRoot, input);
  const contents = new Map();
  let cursor = 0;
  for (const expected of batch) {
    const newline = output.indexOf(0x0a, cursor);
    if (newline < 0) throw new ValidationError('Git credential audit batch header is truncated');
    const header = output.subarray(cursor, newline).toString('ascii').trim().split(' ');
    const [id, type, sizeText] = header;
    const size = Number(sizeText);
    if (id !== expected.id || type !== 'blob' || size !== expected.size) {
      throw new ValidationError('Git credential audit batch returned an unexpected object');
    }
    const start = newline + 1;
    const end = start + size;
    if (end >= output.length || output[end] !== 0x0a) {
      throw new ValidationError('Git credential audit batch content is truncated');
    }
    contents.set(id, output.subarray(start, end));
    cursor = end + 1;
  }
  if (cursor !== output.length) throw new ValidationError('Git credential audit batch has trailing data');
  return contents;
}

function batchObjects(objects) {
  const batches = [];
  let current = [];
  let bytes = 0;
  for (const object of objects) {
    if (
      current.length
      && (current.length >= MAX_BATCH_OBJECTS || bytes + object.size > MAX_BATCH_BYTES)
    ) {
      batches.push(current);
      current = [];
      bytes = 0;
    }
    current.push(object);
    bytes += object.size;
  }
  if (current.length) batches.push(current);
  return batches;
}

function parseObjectList(output) {
  const seen = new Set();
  const objects = [];
  for (const line of output.split(/\r?\n/)) {
    if (!line) continue;
    const separator = line.indexOf(' ');
    const id = separator < 0 ? line : line.slice(0, separator);
    const path = separator < 0 ? '' : normalizePath(line.slice(separator + 1));
    if (!OBJECT_ID.test(id) || seen.has(id)) continue;
    seen.add(id);
    objects.push({ id, path });
  }
  return objects;
}

function gitText(executable, args, cwd) {
  return gitBuffer(executable, args, cwd).toString('utf8').trim();
}

function gitBuffer(executable, args, cwd, input) {
  try {
    return execFileSync(executable, args, {
      cwd,
      input,
      encoding: null,
      maxBuffer: 96 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    });
  } catch {
    throw new ValidationError(`Credential history audit Git operation failed: ${args[0]}`);
  }
}

function normalizePath(path) {
  return String(path).replaceAll('\\', '/');
}

function validateStringArray(value, label) {
  if (
    !Array.isArray(value)
    || !value.length
    || value.some(item => !nonEmpty(item) || item.length > 512)
    || new Set(value).size !== value.length
    || canonicalJson([...value].sort()) !== canonicalJson(value)
  ) throw new ValidationError(`${label} are invalid or unsorted`);
}

function compareCredentialRecords(left, right) {
  return left.credential_id.localeCompare(right.credential_id);
}

function normalizeTimestamp(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new ValidationError('Credential audit timestamp is invalid');
  }
  return new Date(value).toISOString();
}

function assertAuditKey(auditKey) {
  if (!Buffer.isBuffer(auditKey) || auditKey.length !== 32) {
    throw new ValidationError('Credential audit key must contain exactly 32 bytes');
  }
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function option(name, fallback) {
  const prefix = `--${name}=`;
  const entry = process.argv.find(argument => argument.startsWith(prefix));
  return entry ? entry.slice(prefix.length) : fallback;
}

async function main() {
  const command = process.argv[2];
  const repositoryRoot = resolve(option('repository', REPOSITORY_ROOT));
  const deprecatedRef = option('deprecated-ref', DEFAULT_DEPRECATED_REF);
  const currentRef = option('current-ref', 'HEAD');
  const ledgerPath = resolve(
    option('ledger', resolve(MESH_ROOT, 'config', 'credential-revocations.json'))
  );
  const auditKey = decodeAuditKey();
  const gitExecutable = process.env.AXIOM_GIT_EXECUTABLE || 'git';
  if (command === 'generate-ledger') {
    if (!process.argv.includes('--write')) {
      throw new ValidationError('Ledger generation requires explicit --write');
    }
    const legacyInventory = scanGitHistory({
      repositoryRoot,
      ref: deprecatedRef,
      auditKey,
      gitExecutable
    });
    const ledger = createCredentialRevocationLedger({
      legacyInventory,
      deprecatedRef,
      auditKey
    });
    await writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx'
    });
    process.stdout.write(`${JSON.stringify({
      valid: true,
      ledger: ledgerPath,
      credentials: ledger.entries.length,
      external_attestation_required: ledger.summary.external_attestation_required
    }, null, 2)}\n`);
    return;
  }
  if (command !== 'verify') {
    throw new ValidationError('Usage: credential-history-audit.mjs <generate-ledger|verify>');
  }
  const evidence = await runCredentialHistoryAudit({
    repositoryRoot,
    deprecatedRef,
    currentRef,
    ledgerPath,
    auditKey,
    gitExecutable
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
