import { lstat, mkdir, open, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject
} from './canonical.mjs';
import {
  normalizeDelegationAuthority,
  normalizeDelegationGrant,
  normalizeDelegationRevocation,
  resolveDelegationChain
} from './delegation-graph.mjs';

export const DELEGATION_ROOT_BINDING_SCHEMA = 'axiom-delegation-root-binding.v1';
export const DELEGATION_LEDGER_ENTRY_SCHEMA = 'axiom-delegation-ledger-entry.v1';
export const DELEGATION_LEDGER_SCHEMA = 'axiom-delegation-ledger.v1';
export const DELEGATION_LEDGER_PROJECTION_SCHEMA = 'axiom-delegation-ledger-projection.v1';

const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DEFAULT_MAX_STATE_BYTES = 64 * 1024 * 1024;
const HARD_MAX_STATE_BYTES = 512 * 1024 * 1024;
const DEFAULT_MAX_ENTRY_BYTES = 2 * 1024 * 1024;
const HARD_MAX_ENTRY_BYTES = 16 * 1024 * 1024;
const ROOT_BINDING_KEYS = Object.freeze([
  'schema',
  'root_holder',
  'root_authority_digest',
  'execution_authority_granted',
  'authority_effect',
  'binding_digest'
]);
const ENTRY_KEYS = Object.freeze([
  'schema',
  'sequence',
  'kind',
  'record',
  'previous_entry_digest',
  'entry_digest'
]);

export async function readDelegationLedger({
  ledger_path,
  root_authority,
  max_state_bytes,
  max_entry_bytes
} = {}) {
  const ledgerPath = validateLedgerPath(ledger_path);
  const limits = normalizeLedgerLimits({ max_state_bytes, max_entry_bytes });
  const text = await readLedgerText(ledgerPath, limits.maxStateBytes);
  const records = parseLedgerRecords(text, limits.maxEntryBytes);
  const rootBinding = records[0]?.schema === DELEGATION_ROOT_BINDING_SCHEMA
    ? normalizeRootBinding(records[0])
    : null;
  const entries = rootBinding === null ? records : records.slice(1);
  const grants = [];
  const revocations = [];
  const grantsById = new Map();
  const grantIds = new Set();
  const revocationIds = new Set();

  let previousDigest = rootBinding?.binding_digest ?? null;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = normalizeLedgerEntry(entries[index], index + 1, previousDigest);
    entries[index] = entry;
    previousDigest = entry.entry_digest;

    if (entry.kind === 'grant') {
      if (grantIds.has(entry.record.id)) {
        throw new ValidationError(`Duplicate delegation grant id: ${entry.record.id}`);
      }
      grantIds.add(entry.record.id);
      grantsById.set(entry.record.id, entry.record);
      grants.push(entry.record);
      continue;
    }

    if (revocationIds.has(entry.record.id)) {
      throw new ValidationError(`Duplicate delegation revocation id: ${entry.record.id}`);
    }
    revocationIds.add(entry.record.id);
    const target = grantsById.get(entry.record.grant_id);
    if (!target) {
      throw new ValidationError(
        `Delegation revocation ${entry.record.id} must reference an earlier delegation grant`
      );
    }
    assertRevocationAuthorized(target, entry.record);
    revocations.push(entry.record);
  }

  if (root_authority !== undefined) {
    if (rootBinding === null && entries.length > 0) {
      throw new ValidationError(
        'Delegation ledger is unbound; explicit root migration is required'
      );
    }
    if (rootBinding !== null) {
      assertRootBindingMatches(rootBinding, root_authority);
    }
  }

  const core = {
    schema: DELEGATION_LEDGER_SCHEMA,
    root_bound: rootBinding !== null,
    root_binding: rootBinding,
    root_authority_digest: rootBinding?.root_authority_digest ?? null,
    entries,
    grants,
    revocations,
    head_entry_digest: entries.length > 0 ? previousDigest : null,
    execution_authority_granted: false,
    authority_effect: 'none'
  };
  return {
    ...core,
    ledger_digest: digestObject(core)
  };
}

export async function appendDelegationGrant({
  ledger_path,
  root_authority,
  grant,
  now = new Date(),
  max_state_bytes,
  max_entry_bytes
} = {}) {
  const ledgerPath = validateLedgerPath(ledger_path);
  const limits = normalizeLedgerLimits({ max_state_bytes, max_entry_bytes });
  const normalizedRoot = normalizeDelegationAuthority(root_authority);
  const ledger = await readDelegationLedger({
    ledger_path: ledgerPath,
    max_state_bytes: limits.maxStateBytes,
    max_entry_bytes: limits.maxEntryBytes
  });
  const normalizedGrant = normalizeDelegationGrant(grant);

  if (ledger.grants.some(item => item.id === normalizedGrant.id)) {
    throw new ValidationError(`Duplicate delegation grant id: ${normalizedGrant.id}`);
  }
  if (!ledger.root_bound && ledger.entries.length > 0) {
    throw new ValidationError(
      'Delegation ledger is unbound; explicit root migration is required'
    );
  }
  if (ledger.root_bound) {
    assertRootBindingMatches(ledger.root_binding, normalizedRoot);
  }

  resolveDelegationChain({
    root_authority: normalizedRoot,
    grants: [...ledger.grants, normalizedGrant],
    revocations: ledger.revocations,
    target_grant_id: normalizedGrant.id,
    now
  });

  const rootBinding = ledger.root_binding ?? makeRootBinding(normalizedRoot);
  const entry = makeLedgerEntry({
    sequence: ledger.entries.length + 1,
    kind: 'grant',
    record: normalizedGrant,
    previousEntryDigest: ledger.head_entry_digest ?? rootBinding.binding_digest
  });
  const records = ledger.root_binding === null
    ? [rootBinding, entry]
    : [entry];
  await appendLedgerRecords(ledgerPath, records, limits);
  return entry;
}

export async function appendDelegationRevocation({
  ledger_path,
  revocation,
  max_state_bytes,
  max_entry_bytes
} = {}) {
  const ledgerPath = validateLedgerPath(ledger_path);
  const limits = normalizeLedgerLimits({ max_state_bytes, max_entry_bytes });
  const ledger = await readDelegationLedger({
    ledger_path: ledgerPath,
    max_state_bytes: limits.maxStateBytes,
    max_entry_bytes: limits.maxEntryBytes
  });
  const normalizedRevocation = normalizeDelegationRevocation(revocation);

  if (ledger.revocations.some(item => item.id === normalizedRevocation.id)) {
    throw new ValidationError(`Duplicate delegation revocation id: ${normalizedRevocation.id}`);
  }
  const target = ledger.grants.find(item => item.id === normalizedRevocation.grant_id);
  if (!target) {
    throw new ValidationError(
      `Delegation revocation ${normalizedRevocation.id} references an unknown delegation grant`
    );
  }
  assertRevocationAuthorized(target, normalizedRevocation);

  const entry = makeLedgerEntry({
    sequence: ledger.entries.length + 1,
    kind: 'revocation',
    record: normalizedRevocation,
    previousEntryDigest: ledger.head_entry_digest
  });
  await appendLedgerRecords(ledgerPath, [entry], limits);
  return entry;
}

export async function projectDelegationLedger({
  ledger_path,
  root_authority,
  target_grant_id,
  now = new Date(),
  max_state_bytes,
  max_entry_bytes
} = {}) {
  const ledger = await readDelegationLedger({
    ledger_path,
    root_authority,
    max_state_bytes,
    max_entry_bytes
  });
  if (!ledger.root_bound) {
    throw new ValidationError(
      'Delegation ledger is unbound; explicit root migration is required before projection'
    );
  }
  const chainResolution = resolveDelegationChain({
    root_authority,
    grants: ledger.grants,
    revocations: ledger.revocations,
    target_grant_id,
    now
  });
  const core = {
    schema: DELEGATION_LEDGER_PROJECTION_SCHEMA,
    ledger_digest: ledger.ledger_digest,
    root_binding_digest: ledger.root_binding.binding_digest,
    root_authority_digest: ledger.root_authority_digest,
    head_entry_digest: ledger.head_entry_digest,
    entry_count: ledger.entries.length,
    grant_count: ledger.grants.length,
    revocation_count: ledger.revocations.length,
    chain_resolution: chainResolution,
    execution_authority_granted: false,
    authority_effect: 'none'
  };
  return {
    ...core,
    projection_digest: digestObject(core)
  };
}

function makeRootBinding(rootAuthority) {
  const root = normalizeDelegationAuthority(rootAuthority);
  const core = {
    schema: DELEGATION_ROOT_BINDING_SCHEMA,
    root_holder: root.holder,
    root_authority_digest: root.authority_digest,
    execution_authority_granted: false,
    authority_effect: 'none'
  };
  return {
    ...core,
    binding_digest: digestObject(core)
  };
}

function normalizeRootBinding(raw) {
  assertPlainObject(raw, 'delegation root binding');
  assertExactKeys(raw, 'delegation root binding', ROOT_BINDING_KEYS);
  if (raw.schema !== DELEGATION_ROOT_BINDING_SCHEMA) {
    throw new ValidationError('Delegation root binding schema is invalid');
  }
  const rootHolder = assertString(raw.root_holder, 'delegation root binding root_holder', {
    min: 1,
    max: 160,
    pattern: IDENTIFIER_PATTERN
  });
  const rootAuthorityDigest = assertString(
    raw.root_authority_digest,
    'delegation root binding root_authority_digest',
    { min: 64, max: 64, pattern: DIGEST_PATTERN }
  );
  if (raw.execution_authority_granted !== false || raw.authority_effect !== 'none') {
    throw new ValidationError('Delegation root binding cannot grant execution authority');
  }
  const bindingDigest = assertString(
    raw.binding_digest,
    'delegation root binding binding_digest',
    { min: 64, max: 64, pattern: DIGEST_PATTERN }
  );
  const core = {
    schema: DELEGATION_ROOT_BINDING_SCHEMA,
    root_holder: rootHolder,
    root_authority_digest: rootAuthorityDigest,
    execution_authority_granted: false,
    authority_effect: 'none'
  };
  const expectedDigest = digestObject(core);
  if (bindingDigest !== expectedDigest) {
    throw new ValidationError('Delegation root binding digest does not match normalized binding');
  }
  return {
    ...core,
    binding_digest: expectedDigest
  };
}

function assertRootBindingMatches(bindingRaw, rootAuthorityRaw) {
  const binding = normalizeRootBinding(bindingRaw);
  const root = normalizeDelegationAuthority(rootAuthorityRaw);
  if (
    binding.root_holder !== root.holder
    || binding.root_authority_digest !== root.authority_digest
  ) {
    throw new ValidationError('Delegation root authority does not match ledger binding');
  }
  return root;
}

function makeLedgerEntry({ sequence, kind, record, previousEntryDigest }) {
  const core = {
    schema: DELEGATION_LEDGER_ENTRY_SCHEMA,
    sequence,
    kind,
    record,
    previous_entry_digest: previousEntryDigest
  };
  return {
    ...core,
    entry_digest: digestObject(core)
  };
}

function normalizeLedgerEntry(raw, expectedSequence, expectedPreviousDigest) {
  assertPlainObject(raw, 'delegation ledger entry');
  assertExactKeys(raw, 'delegation ledger entry', ENTRY_KEYS);
  if (raw.schema !== DELEGATION_LEDGER_ENTRY_SCHEMA) {
    throw new ValidationError('Delegation ledger entry schema is invalid');
  }
  if (!Number.isSafeInteger(raw.sequence) || raw.sequence !== expectedSequence) {
    throw new ValidationError(
      `Delegation ledger sequence must be ${expectedSequence}`
    );
  }
  if (raw.kind !== 'grant' && raw.kind !== 'revocation') {
    throw new ValidationError('Delegation ledger entry kind is invalid');
  }
  if (raw.previous_entry_digest !== expectedPreviousDigest) {
    throw new ValidationError('Delegation ledger previous entry digest does not match history');
  }
  if (raw.previous_entry_digest !== null && !DIGEST_PATTERN.test(raw.previous_entry_digest)) {
    throw new ValidationError('Delegation ledger previous entry digest is invalid');
  }
  if (typeof raw.entry_digest !== 'string' || !DIGEST_PATTERN.test(raw.entry_digest)) {
    throw new ValidationError('Delegation ledger entry digest is invalid');
  }

  const record = raw.kind === 'grant'
    ? normalizeDelegationGrant(raw.record)
    : normalizeDelegationRevocation(raw.record);
  const core = {
    schema: DELEGATION_LEDGER_ENTRY_SCHEMA,
    sequence: raw.sequence,
    kind: raw.kind,
    record,
    previous_entry_digest: raw.previous_entry_digest
  };
  const expectedDigest = digestObject(core);
  if (raw.entry_digest !== expectedDigest) {
    throw new ValidationError('Delegation ledger entry digest does not match normalized entry');
  }
  return {
    ...core,
    entry_digest: expectedDigest
  };
}

function assertRevocationAuthorized(grant, revocation) {
  if (revocation.revoked_by !== grant.delegator) {
    throw new ValidationError(
      'Delegation revocation must be issued by the grant delegator'
    );
  }
  if (Date.parse(revocation.revoked_at) < Date.parse(grant.issued_at)) {
    throw new ValidationError('Delegation revocation cannot predate the grant');
  }
}

async function appendLedgerRecords(ledgerPath, records, limits) {
  if (!Array.isArray(records) || records.length < 1) {
    throw new ValidationError('Delegation ledger append requires at least one record');
  }
  await mkdir(dirname(ledgerPath), { recursive: true, mode: 0o700 });
  const serializedRecords = records.map(record => canonicalJson(record));
  for (const serialized of serializedRecords) {
    if (Buffer.byteLength(serialized, 'utf8') > limits.maxEntryBytes) {
      throw new ValidationError('Delegation ledger entry exceeds configured byte limit');
    }
  }
  const payload = `${serializedRecords.join('\n')}\n`;
  const payloadBytes = Buffer.byteLength(payload, 'utf8');

  let handle;
  try {
    const info = await lstat(ledgerPath);
    assertRegularLedgerFile(info);
    if (info.size + payloadBytes > limits.maxStateBytes) {
      throw new ValidationError('Delegation ledger state exceeds configured byte limit');
    }
    handle = await open(ledgerPath, 'a');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    if (payloadBytes > limits.maxStateBytes) {
      throw new ValidationError('Delegation ledger state exceeds configured byte limit');
    }
    try {
      handle = await open(ledgerPath, 'ax', 0o600);
    } catch (createError) {
      if (createError?.code !== 'EEXIST') throw createError;
      const info = await lstat(ledgerPath);
      assertRegularLedgerFile(info);
      if (info.size + payloadBytes > limits.maxStateBytes) {
        throw new ValidationError('Delegation ledger state exceeds configured byte limit');
      }
      handle = await open(ledgerPath, 'a');
    }
  }

  try {
    const pathInfo = await lstat(ledgerPath);
    assertRegularLedgerFile(pathInfo);
    await handle.writeFile(payload, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function readLedgerText(ledgerPath, maxStateBytes) {
  try {
    const info = await lstat(ledgerPath);
    assertRegularLedgerFile(info);
    if (info.size > maxStateBytes) {
      throw new ValidationError('Delegation ledger state exceeds configured byte limit');
    }
    const bytes = await readFile(ledgerPath);
    if (bytes.length > maxStateBytes) {
      throw new ValidationError('Delegation ledger state exceeds configured byte limit');
    }
    return bytes.toString('utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return '';
    throw error;
  }
}

function parseLedgerRecords(text, maxEntryBytes) {
  if (text.length === 0) return [];
  if (!text.endsWith('\n')) {
    throw new ValidationError('Delegation ledger has an incomplete trailing record');
  }
  const lines = text.slice(0, -1).split('\n');
  if (lines.length === 0) return [];

  return lines.map((line, index) => {
    if (line.length === 0) {
      throw new ValidationError(`Delegation ledger contains an empty line at ${index + 1}`);
    }
    if (Buffer.byteLength(line, 'utf8') > maxEntryBytes) {
      throw new ValidationError(
        `Delegation ledger entry ${index + 1} exceeds configured byte limit`
      );
    }
    try {
      const parsed = JSON.parse(line);
      if (canonicalJson(parsed) !== line) {
        throw new ValidationError(
          `Delegation ledger line ${index + 1} is not canonical JSON`
        );
      }
      return parsed;
    } catch (error) {
      if (error instanceof ValidationError) throw error;
      throw new ValidationError(
        `Delegation ledger contains invalid JSON at line ${index + 1}`
      );
    }
  });
}

function validateLedgerPath(value) {
  return assertString(value, 'delegation ledger path', { max: 8192 });
}

function normalizeLedgerLimits({ max_state_bytes, max_entry_bytes }) {
  const maxStateBytes = boundedPositiveInteger(
    max_state_bytes,
    'delegation ledger max_state_bytes',
    DEFAULT_MAX_STATE_BYTES,
    HARD_MAX_STATE_BYTES
  );
  const defaultEntryBytes = Math.min(DEFAULT_MAX_ENTRY_BYTES, maxStateBytes);
  const maxEntryBytes = boundedPositiveInteger(
    max_entry_bytes,
    'delegation ledger max_entry_bytes',
    defaultEntryBytes,
    HARD_MAX_ENTRY_BYTES
  );
  if (max_entry_bytes !== undefined && maxEntryBytes > maxStateBytes) {
    throw new ValidationError('Delegation ledger max_entry_bytes cannot exceed max_state_bytes');
  }
  return { maxStateBytes, maxEntryBytes };
}

function boundedPositiveInteger(value, name, fallback, hardMaximum) {
  const normalized = value === undefined ? fallback : value;
  if (
    !Number.isSafeInteger(normalized)
    || normalized < 1
    || normalized > hardMaximum
  ) {
    throw new ValidationError(`${name} must be a positive safe integer no greater than ${hardMaximum}`);
  }
  return normalized;
}

function assertRegularLedgerFile(info) {
  if (info.isSymbolicLink() || !info.isFile()) {
    throw new ValidationError('Delegation ledger path must be a regular non-symlink file');
  }
}

function assertExactKeys(value, name, keys) {
  const expected = [...keys].sort();
  const actual = Object.keys(value).sort();
  if (
    expected.length !== actual.length
    || expected.some((key, index) => key !== actual[index])
  ) {
    throw new ValidationError(`${name} contains unsupported or missing fields`);
  }
}
