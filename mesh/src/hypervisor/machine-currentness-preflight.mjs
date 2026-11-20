import {
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject
} from '../lib/canonical.mjs';
import {
  evaluateMachineCurrentnessProductionPreflight
} from '../lib/machine-principal-currentness.mjs';

const DIGEST = /^[a-f0-9]{64}$/;
const REVISION = /^[a-f0-9]{40}$/;
const RUNTIME_GENERATION = /^[A-Za-z0-9_:-]{16,160}$/;
const CONFIGURED_SOURCE_FIELDS = Object.freeze([
  'authority_effect',
  'complete',
  'principal_count',
  'principals',
  'production_activation_authorized',
  'source_available',
  'source_verified'
]);
const PAGE_FIELDS = Object.freeze(['has_more', 'limit', 'next_cursor']);
const PAGE_ENVELOPE_FIELDS = Object.freeze(['items', 'page']);
const REPORT_SEMANTICS = Object.freeze({
  production_activation_authorized: false,
  registry_mutation_authorized: false,
  grid_mutation_authorized: false,
  execution_authorized: false,
  deployment_authorized: false,
  promotion_authorized: false,
  authority_effect: 'none'
});

export async function runMachineCurrentnessProductionPreflightAggregation({
  configuredSource,
  gridGet,
  runtimeGeneration,
  sourceRevision,
  policyVersion,
  policyDigest,
  pageLimit = 100
} = {}) {
  const configured = normalizeConfiguredSource(configuredSource);
  if (typeof gridGet !== 'function') {
    throw new ValidationError('Machine currentness preflight requires authenticated Grid access');
  }
  const revision = assertString(sourceRevision, 'source_revision', {
    max: 40,
    pattern: REVISION
  });
  const generation = assertString(runtimeGeneration, 'runtime_generation', {
    max: 160,
    pattern: RUNTIME_GENERATION
  });
  const version = assertString(policyVersion, 'policy_version', {
    max: 160,
    pattern: /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/
  });
  const policy = assertString(policyDigest, 'policy_digest', {
    max: 64,
    pattern: DIGEST
  });
  if (!Number.isSafeInteger(pageLimit) || pageLimit < 1 || pageLimit > 100) {
    throw new ValidationError('Machine currentness preflight page limit is invalid');
  }

  const retained = [];
  const observedPages = [];
  const seenCursors = new Set();
  const operatorBlockers = [];
  let startStatus = null;
  let endStatus = null;
  let sourceAvailable = false;
  let sourceVerified = false;
  let complete = false;

  try {
    startStatus = normalizeGridStatus(await gridGet('/internal/v1/status'));
    sourceAvailable = true;
    let cursor = null;
    for (let pageNumber = 1; pageNumber <= 10_000; pageNumber += 1) {
      const suffix = cursor === null
        ? `?limit=${pageLimit}`
        : `?limit=${pageLimit}&cursor=${encodeURIComponent(cursor)}`;
      const page = normalizeGridPage(
        await gridGet(`/internal/v1/machine-currentness${suffix}`),
        pageLimit
      );
      observedPages.push(pageNumber);
      retained.push(...page.items);
      if (!page.page.has_more) {
        complete = true;
        break;
      }
      if (page.page.next_cursor === null || seenCursors.has(page.page.next_cursor)) {
        operatorBlockers.push('grid-pagination-cursor-invalid');
        break;
      }
      seenCursors.add(page.page.next_cursor);
      cursor = page.page.next_cursor;
    }
    if (!complete && !operatorBlockers.length) {
      operatorBlockers.push('grid-pagination-bound-exceeded');
    }
    endStatus = normalizeGridStatus(await gridGet('/internal/v1/status'));
    sourceVerified = sameGridSnapshot(startStatus, endStatus);
    if (!sourceVerified) {
      complete = false;
      operatorBlockers.push('grid-snapshot-drift');
    }
  } catch {
    sourceAvailable = false;
    sourceVerified = false;
    complete = false;
    operatorBlockers.push('grid-read-failed');
  }

  const evaluation = evaluateMachineCurrentnessProductionPreflight({
    configuredPrincipals: configured.principals,
    retainedProjections: retained,
    enumeration: {
      source_available: sourceAvailable,
      source_verified: sourceVerified,
      complete,
      expected_page_count: observedPages.length,
      observed_page_numbers: observedPages
    }
  });
  const blockers = [...new Set([...evaluation.blockers, ...operatorBlockers])].sort();
  const stableSnapshot = sourceVerified && startStatus !== null
    ? {
        ...startStatus,
        snapshot_digest: digestObject(startStatus)
      }
    : null;
  const body = {
    schema: 'axiom-machine-currentness-production-preflight-report.v1',
    ready: blockers.length === 0,
    blockers,
    runtime_generation: generation,
    source_revision: revision,
    policy_version: version,
    policy_digest: policy,
    grid_snapshot: stableSnapshot,
    configured_principal_count: evaluation.configured_principal_count,
    retained_projection_count: evaluation.retained_projection_count,
    configured_set_digest: digestObject(evaluation.configured_bindings),
    retained_set_digest: digestObject(evaluation.retained_bindings),
    evaluation,
    semantics: REPORT_SEMANTICS
  };
  return Object.freeze({ ...body, report_digest: digestObject(body) });
}

function normalizeConfiguredSource(input) {
  const value = assertPlainObject(input, 'configured machine principal source');
  if (Object.keys(value).sort().join(',') !== CONFIGURED_SOURCE_FIELDS.join(',')) {
    throw new ValidationError('Configured machine principal source fields are invalid');
  }
  if (
    value.source_available !== true
    || value.source_verified !== true
    || value.complete !== true
    || value.production_activation_authorized !== false
    || value.authority_effect !== 'none'
    || !Array.isArray(value.principals)
    || !Number.isSafeInteger(value.principal_count)
    || value.principal_count < 0
    || value.principal_count !== value.principals.length
  ) {
    throw new ValidationError('Configured machine principal source is not complete and verified');
  }
  return value;
}

function normalizeGridStatus(input) {
  const value = assertPlainObject(input, 'Grid status');
  if (
    value.mode !== 'single-node-transparency-log'
    || value.consensus !== false
    || !Number.isSafeInteger(value.schema_version)
    || value.schema_version < 1
    || !Number.isSafeInteger(value.last_seq)
    || value.last_seq < 0
  ) {
    throw new ValidationError('Grid status is invalid');
  }
  return {
    schema_version: value.schema_version,
    last_seq: value.last_seq,
    last_hash: assertString(value.last_hash, 'Grid last_hash', {
      max: 64,
      pattern: DIGEST
    })
  };
}

function normalizeGridPage(input, expectedLimit) {
  const value = assertPlainObject(input, 'machine currentness Grid page');
  if (Object.keys(value).sort().join(',') !== PAGE_ENVELOPE_FIELDS.join(',')) {
    throw new ValidationError('Machine currentness Grid page fields are invalid');
  }
  if (!Array.isArray(value.items) || value.items.length > expectedLimit) {
    throw new ValidationError('Machine currentness Grid page items are invalid');
  }
  const page = assertPlainObject(value.page, 'machine currentness Grid page metadata');
  if (Object.keys(page).sort().join(',') !== PAGE_FIELDS.join(',')) {
    throw new ValidationError('Machine currentness Grid page metadata fields are invalid');
  }
  if (page.limit !== expectedLimit || typeof page.has_more !== 'boolean') {
    throw new ValidationError('Machine currentness Grid page metadata is invalid');
  }
  if (page.has_more) {
    if (value.items.length === 0) {
      throw new ValidationError('Non-terminal machine currentness page must contain items');
    }
    assertString(page.next_cursor, 'machine currentness next cursor', {
      max: 512,
      pattern: /^[A-Za-z0-9_-]{1,512}$/
    });
  } else if (page.next_cursor !== null) {
    throw new ValidationError('Terminal machine currentness page must not carry a cursor');
  }
  return value;
}

function sameGridSnapshot(left, right) {
  return left.schema_version === right.schema_version
    && left.last_seq === right.last_seq
    && left.last_hash === right.last_hash;
}
