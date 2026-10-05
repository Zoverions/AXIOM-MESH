import {
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject
} from './canonical.mjs';
import {
  assertAuthorityNeutral,
  assertIsoTimestamp,
  assertNoUnknownKeys,
  assertReference,
  assertUniqueStrings
} from '../domain/sovereign-information-common.mjs';
import { validateInformationRightsEnvelope } from '../domain/information-rights.mjs';
import {
  validateEvidenceAssertion,
  validateEvidenceLink,
  validateEvidenceReviewState
} from '../domain/evidence-graph.mjs';
import { validateDelegatedGateMandate } from '../domain/delegated-gate-mandate.mjs';

export const SOVEREIGN_INFORMATION_BUNDLE_SCHEMA = 'axiom-sovereign-information-bundle.v1';

const BUNDLE_KEYS = new Set(['schema', 'exporter', 'created_at', 'records', 'non_claims', 'bundle_digest']);
const RECORD_KEYS = new Set([
  'storage_id', 'object_kind', 'object', 'object_digest', 'lifecycle_status', 'provenance_event_refs'
]);
const OBJECT_KINDS = new Set([
  'information-rights',
  'evidence-assertion',
  'evidence-link',
  'evidence-review',
  'delegated-gate-mandate'
]);
const LIFECYCLE = new Set(['active', 'revoked', 'expired', 'superseded', 'non-authoritative-import']);
const STORAGE_ID = /^siea_[A-Za-z0-9-]{8,100}$/;
const HEX_64 = /^[a-f0-9]{64}$/;
const NON_CLAIMS = Object.freeze([
  'export_does_not_grant_authority',
  'provenance_does_not_establish_truth',
  'import_requires_local_validation_and_authority'
]);

function validateObject(kind, object) {
  switch (kind) {
    case 'information-rights': return validateInformationRightsEnvelope(object);
    case 'evidence-assertion': return validateEvidenceAssertion(object);
    case 'evidence-link': return validateEvidenceLink(object);
    case 'evidence-review': return validateEvidenceReviewState(object);
    case 'delegated-gate-mandate': return validateDelegatedGateMandate(object);
    default: throw new ValidationError('portable sovereign information object kind is unsupported');
  }
}

function normalizeRecord(raw) {
  assertAuthorityNeutral(raw, 'portable sovereign information record');
  assertPlainObject(raw, 'portable sovereign information record');
  const allowedInput = new Set([...RECORD_KEYS]);
  assertNoUnknownKeys(raw, 'portable sovereign information record', allowedInput);
  assertString(raw.storage_id, 'storage_id', { max: 160, pattern: STORAGE_ID });
  if (!OBJECT_KINDS.has(raw.object_kind)) {
    throw new ValidationError('portable sovereign information object kind is unsupported');
  }
  const object = validateObject(raw.object_kind, raw.object);
  const objectDigest = digestObject(object);
  if (raw.object_digest !== undefined) {
    assertString(raw.object_digest, 'object_digest', { max: 64, pattern: HEX_64 });
    if (raw.object_digest !== objectDigest) throw new ValidationError('portable object digest is invalid');
  }
  if (!LIFECYCLE.has(raw.lifecycle_status)) throw new ValidationError('portable lifecycle status is invalid');
  const provenance = assertUniqueStrings(raw.provenance_event_refs, 'provenance_event_refs', { maxItems: 128, itemMax: 160 });
  for (const [index, ref] of provenance.entries()) assertReference(ref, `provenance_event_refs[${index}]`);
  return {
    storage_id: raw.storage_id,
    object_kind: raw.object_kind,
    object,
    object_digest: objectDigest,
    lifecycle_status: raw.lifecycle_status,
    provenance_event_refs: [...provenance]
  };
}

function canonicalCore({ exporter, records, created_at }) {
  assertReference(exporter, 'exporter');
  assertIsoTimestamp(created_at, 'created_at');
  if (!Array.isArray(records) || records.length > 1000) {
    throw new ValidationError('records must be an array with at most 1000 items');
  }
  const normalized = records.map(normalizeRecord).sort((left, right) => (
    left.storage_id.localeCompare(right.storage_id)
    || left.object_kind.localeCompare(right.object_kind)
  ));
  const ids = new Set();
  for (const record of normalized) {
    if (ids.has(record.storage_id)) throw new ValidationError(`duplicate storage_id ${record.storage_id}`);
    ids.add(record.storage_id);
  }
  return {
    schema: SOVEREIGN_INFORMATION_BUNDLE_SCHEMA,
    exporter,
    created_at,
    records: normalized,
    non_claims: [...NON_CLAIMS]
  };
}

export function buildSovereignInformationBundle({ exporter, records, created_at }) {
  const core = canonicalCore({ exporter, records, created_at });
  return {
    ...core,
    bundle_digest: digestObject(core)
  };
}

export function validateSovereignInformationBundle(bundle) {
  assertAuthorityNeutral(bundle, 'sovereign information bundle');
  assertPlainObject(bundle, 'sovereign information bundle');
  assertNoUnknownKeys(bundle, 'sovereign information bundle', BUNDLE_KEYS);
  if (bundle.schema !== SOVEREIGN_INFORMATION_BUNDLE_SCHEMA) {
    throw new ValidationError('sovereign information bundle has unsupported schema');
  }
  assertString(bundle.bundle_digest, 'bundle_digest', { max: 64, pattern: HEX_64 });
  const core = canonicalCore({
    exporter: bundle.exporter,
    records: bundle.records,
    created_at: bundle.created_at
  });
  if (JSON.stringify(bundle.non_claims) !== JSON.stringify(NON_CLAIMS)) {
    throw new ValidationError('sovereign information bundle non-claims are invalid');
  }
  const expected = digestObject(core);
  if (bundle.bundle_digest !== expected) throw new ValidationError('sovereign information bundle digest is invalid');
  return bundle;
}
