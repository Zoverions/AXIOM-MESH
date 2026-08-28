import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject
} from './canonical.mjs';
import {
  normalizeDelegationGrant,
  normalizeDelegationRevocation,
  resolveDelegationChain
} from './delegation-graph.mjs';

export const DELEGATION_LEDGER_ENTRY_SCHEMA = 'axiom-delegation-ledger-entry.v1';
export const DELEGATION_LEDGER_SCHEMA = 'axiom-delegation-ledger.v1';
export const DELEGATION_LEDGER_PROJECTION_SCHEMA = 'axiom-delegation-ledger-projection.v1';

const DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const ENTRY_KEYS = Object.freeze([
  'schema',
  'sequence',
  'kind',
  'record',
  'previous_entry_digest',
  'entry_digest'
]);

export async function readDelegationLedger({ ledger_path } = {}) {
  const ledgerPath = validateLedgerPath(ledger_path);
  const text = await readLedgerText(ledgerPath);
  const entries = parseLedgerEntries(text);
  const grants = [];
  const revocations = [];
  const grantsById = new Map();
  const grantIds = new Set();
  const revocationIds = new Set();

  let previousDigest = null;
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

  const core = {
    schema: DELEGATION_LEDGER_SCHEMA,
    entries,
    grants,
    revocations,
    head_entry_digest: previousDigest,
    execution_authority_granted: false
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
  now = new Date()
} = {}) {
  const ledgerPath = validateLedgerPath(ledger_path);
  const ledger = await readDelegationLedger({ ledger_path: ledgerPath });
  const normalizedGrant = normalizeDelegationGrant(grant);

  if (ledger.grants.some(item => item.id === normalizedGrant.id)) {
    throw new ValidationError(`Duplicate delegation grant id: ${normalizedGrant.id}`);
  }

  resolveDelegationChain({
    root_authority,
    grants: [...ledger.grants, normalizedGrant],
    revocations: ledger.revocations,
    target_grant_id: normalizedGrant.id,
    now
  });

  const entry = makeLedgerEntry({
    sequence: ledger.entries.length + 1,
    kind: 'grant',
    record: normalizedGrant,
    previousEntryDigest: ledger.head_entry_digest
  });
  await appendLedgerEntry(ledgerPath, entry);
  return entry;
}

export async function appendDelegationRevocation({ ledger_path, revocation } = {}) {
  const ledgerPath = validateLedgerPath(ledger_path);
  const ledger = await readDelegationLedger({ ledger_path: ledgerPath });
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
  await appendLedgerEntry(ledgerPath, entry);
  return entry;
}

export async function projectDelegationLedger({
  ledger_path,
  root_authority,
  target_grant_id,
  now = new Date()
} = {}) {
  const ledger = await readDelegationLedger({ ledger_path });
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
    head_entry_digest: ledger.head_entry_digest,
    entry_count: ledger.entries.length,
    grant_count: ledger.grants.length,
    revocation_count: ledger.revocations.length,
    chain_resolution: chainResolution,
    execution_authority_granted: false
  };
  return {
    ...core,
    projection_digest: digestObject(core)
  };
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

async function appendLedgerEntry(ledgerPath, entry) {
  await mkdir(dirname(ledgerPath), { recursive: true });
  await appendFile(ledgerPath, `${canonicalJson(entry)}\n`, {
    encoding: 'utf8',
    flag: 'a'
  });
}

async function readLedgerText(ledgerPath) {
  try {
    return await readFile(ledgerPath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return '';
    throw error;
  }
}

function parseLedgerEntries(text) {
  if (text.length === 0) return [];
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  if (lines.length === 0) return [];

  return lines.map((line, index) => {
    if (line.length === 0) {
      throw new ValidationError(`Delegation ledger contains an empty line at ${index + 1}`);
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
