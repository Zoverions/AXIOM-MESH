import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  AxiomError,
  ValidationError,
  assertString,
  digestObject
} from './canonical.mjs';
import {
  normalizeDelegationAuthority,
  resolveDelegationChain
} from './delegation-graph.mjs';
import { readDelegationLedger } from './delegation-ledger.mjs';

export const DELEGATION_INSPECTOR_SCHEMA = 'axiom-delegation-inspector.v1';

const ROOT_AUTHORITY_FILE = 'delegation-root-authority.json';
const LEDGER_FILE = 'delegation-ledger.jsonl';
const MAX_INSPECTOR_GRANTS = 128;
const MAX_INSPECTOR_REVOCATIONS = 128;

export async function readDelegationInspector({
  data_dir,
  owner,
  now = new Date()
} = {}) {
  const dataDir = assertString(data_dir, 'delegation inspector data_dir', { max: 8192 });
  const ownerId = assertString(owner, 'delegation inspector owner', { max: 160 });
  const evaluatedAt = normalizeDate(now);
  const rootPath = join(dataDir, ROOT_AUTHORITY_FILE);
  const ledgerPath = join(dataDir, LEDGER_FILE);

  const rootRaw = await readOptionalRoot(rootPath);
  if (rootRaw === null) {
    const ledger = await readLedgerOrFail(ledgerPath);
    if (ledger.entries.length > 0) {
      throw new AxiomError(
        'dependency_unavailable',
        'Delegation history exists without a root authority record',
        503
      );
    }
    return finalizeSnapshot({
      owner: ownerId,
      configured: false,
      evaluatedAt,
      rootAuthority: null,
      ledger,
      grants: [],
      revocations: []
    });
  }

  let rootAuthority;
  try {
    rootAuthority = normalizeDelegationAuthority(rootRaw);
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    throw new AxiomError(
      'dependency_unavailable',
      'Delegation root authority record is invalid',
      503
    );
  }

  if (rootAuthority.holder !== ownerId) {
    throw new AxiomError(
      'forbidden',
      'Delegation authority belongs to another owner',
      403
    );
  }

  const ledger = await readLedgerOrFail(ledgerPath);
  if (
    ledger.grants.length > MAX_INSPECTOR_GRANTS
    || ledger.revocations.length > MAX_INSPECTOR_REVOCATIONS
  ) {
    throw new AxiomError(
      'dependency_unavailable',
      'Delegation history exceeds the bounded inspector projection',
      503
    );
  }

  const grants = ledger.grants.map(grant => inspectGrant({
    rootAuthority,
    ledger,
    grant,
    evaluatedAt
  }));

  return finalizeSnapshot({
    owner: ownerId,
    configured: true,
    evaluatedAt,
    rootAuthority,
    ledger,
    grants,
    revocations: ledger.revocations
  });
}

function inspectGrant({ rootAuthority, ledger, grant, evaluatedAt }) {
  try {
    const currentResolution = resolveDelegationChain({
      root_authority: rootAuthority,
      grants: ledger.grants,
      revocations: ledger.revocations,
      target_grant_id: grant.id,
      now: evaluatedAt
    });
    return {
      ...grant,
      lifecycle: {
        state: 'active',
        revocation_id: null
      },
      current_resolution: currentResolution
    };
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    const state = lifecycleState(error.message);
    if (state === null) {
      throw new AxiomError(
        'dependency_unavailable',
        'Delegation history cannot be resolved safely',
        503
      );
    }
    const revocation = state === 'revoked'
      ? activeDirectRevocation(ledger.revocations, grant.id, evaluatedAt)
      : null;
    return {
      ...grant,
      lifecycle: {
        state,
        revocation_id: revocation?.id ?? null
      },
      current_resolution: null
    };
  }
}

function lifecycleState(message) {
  if (message === 'Delegation grant is revoked') return 'revoked';
  if (
    message === 'Delegation grant authority is expired'
    || message === 'Root delegation authority is expired'
  ) return 'expired';
  if (message === 'Delegation grant is not active yet') return 'not_active';
  return null;
}

function activeDirectRevocation(revocations, grantId, evaluatedAt) {
  return revocations
    .filter(item => (
      item.grant_id === grantId
      && new Date(item.revoked_at) <= evaluatedAt
    ))
    .sort((left, right) => left.revoked_at.localeCompare(right.revoked_at))[0] ?? null;
}

function finalizeSnapshot({
  owner,
  configured,
  evaluatedAt,
  rootAuthority,
  ledger,
  grants,
  revocations
}) {
  const core = {
    schema: DELEGATION_INSPECTOR_SCHEMA,
    owner,
    configured,
    evaluated_at: evaluatedAt.toISOString(),
    root_authority: rootAuthority,
    ledger: {
      schema: ledger.schema,
      entry_count: ledger.entries.length,
      grant_count: ledger.grants.length,
      revocation_count: ledger.revocations.length,
      head_entry_digest: ledger.head_entry_digest,
      ledger_digest: ledger.ledger_digest,
      execution_authority_granted: false
    },
    grants,
    revocations,
    execution_authority_granted: false
  };
  return {
    ...core,
    digest: digestObject(core)
  };
}

async function readOptionalRoot(path) {
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw new AxiomError(
      'dependency_unavailable',
      'Delegation root authority record is unavailable',
      503
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new AxiomError(
      'dependency_unavailable',
      'Delegation root authority record is invalid JSON',
      503
    );
  }
}

async function readLedgerOrFail(ledgerPath) {
  try {
    return await readDelegationLedger({ ledger_path: ledgerPath });
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    throw new AxiomError(
      'dependency_unavailable',
      'Delegation ledger failed integrity validation',
      503
    );
  }
}

function normalizeDate(value) {
  const date = value instanceof Date ? new Date(value.valueOf()) : new Date(value);
  if (Number.isNaN(date.valueOf())) {
    throw new ValidationError('delegation inspector evaluation time is invalid');
  }
  return date;
}
