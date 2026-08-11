import { readFile } from 'node:fs/promises';

import {
  AxiomError,
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject
} from '../lib/canonical.mjs';
import { verifyObjectSignature } from '../lib/identity.mjs';

export const GRID_CONTINUITY_ANCHOR_SCHEMA = 'axiom-grid-continuity-anchor.v1';
export const CLAIM_BUILD_CONTEXT_SCHEMA = 'axiom-claim-build-context.v1';
export const GRID_CONTINUITY_MODE = 'externally-retained-signed-grid-head';

const EXPORT_FORMAT = 'axiom-export.v1';
const EXPORT_CONTINUITY_MODE = 'signed-transparency-log-head';
const PURPOSE = 'grid.external-continuity';
const GENESIS_HASH = '0'.repeat(64);
const DIGEST = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const ANCHOR_ID = /^gca_[a-f0-9]{64}$/;

function assertDigest(value, name) {
  return assertString(value, name, { min: 64, max: 64, pattern: DIGEST });
}

function isoDate(value, name) {
  const raw = assertString(value, name, { min: 1, max: 64 });
  const timestamp = new Date(raw);
  if (Number.isNaN(timestamp.valueOf())) {
    throw new ValidationError(`${name} must be an ISO timestamp`);
  }
  return timestamp.toISOString();
}

export function buildClaimBuildContext(capabilityRegistry) {
  const registry = structuredClone(assertPlainObject(capabilityRegistry, 'capability registry'));
  const base = {
    schema: CLAIM_BUILD_CONTEXT_SCHEMA,
    kernel_version: assertString(registry.kernel_version, 'kernel_version', { min: 1, max: 64 }),
    claim_source_digest: digestObject(registry)
  };
  return {
    ...base,
    build_context_digest: digestObject(base)
  };
}

export async function loadClaimBuildContext(capabilitiesPath) {
  const serialized = await readFile(capabilitiesPath, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new ValidationError('Capability registry is not valid JSON');
  }
  return buildClaimBuildContext(parsed);
}

export function normalizeClaimBuildContext(raw) {
  const value = assertPlainObject(raw, 'claim build context');
  if (value.schema !== CLAIM_BUILD_CONTEXT_SCHEMA) {
    throw new ValidationError(`claim build context schema must be ${CLAIM_BUILD_CONTEXT_SCHEMA}`);
  }
  const base = {
    schema: CLAIM_BUILD_CONTEXT_SCHEMA,
    kernel_version: assertString(value.kernel_version, 'build.kernel_version', { min: 1, max: 64 }),
    claim_source_digest: assertDigest(value.claim_source_digest, 'build.claim_source_digest')
  };
  const digest = digestObject(base);
  if (assertDigest(value.build_context_digest, 'build.build_context_digest') !== digest) {
    throw new ValidationError('Claim build context digest is invalid');
  }
  return { ...base, build_context_digest: digest };
}

function parseManifest(raw) {
  if (typeof raw !== 'string') return structuredClone(assertPlainObject(raw, 'export manifest'));
  try {
    return assertPlainObject(JSON.parse(raw), 'export manifest');
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError('Export manifest is not valid JSON');
  }
}

export function verifyExportManifestForContinuity(rawManifest, {
  verificationKeys,
  expectedExportId,
  expectedPrincipal
} = {}) {
  const manifest = parseManifest(rawManifest);
  if (manifest.format !== EXPORT_FORMAT) {
    throw new ValidationError(`Continuity source manifest must use ${EXPORT_FORMAT}`);
  }
  if (
    manifest.schema_versions?.manifest !== 1
    || manifest.schema_versions?.evidence !== 1
  ) {
    throw new ValidationError('Continuity source manifest schema is unsupported');
  }
  const exportId = assertString(manifest.export_id, 'manifest.export_id', {
    min: 1,
    max: 160,
    pattern: ID
  });
  const principal = assertString(manifest.principal, 'manifest.principal', {
    min: 1,
    max: 160,
    pattern: ID
  });
  const scope = structuredClone(assertPlainObject(manifest.scope, 'manifest.scope'));
  if (
    manifest.continuity?.mode !== EXPORT_CONTINUITY_MODE
    || !DIGEST.test(manifest.continuity?.evidence_head ?? '')
  ) {
    throw new ValidationError('Export manifest continuity head is invalid');
  }
  const attestation = assertPlainObject(manifest.attestation, 'manifest.attestation');
  const signerKeyId = assertString(attestation.key_id, 'manifest.attestation.key_id', {
    min: 1,
    max: 160,
    pattern: ID
  });
  if (!(verificationKeys instanceof Map)) {
    throw new ValidationError('Grid verification-key inventory is required');
  }
  const key = verificationKeys.get(signerKeyId);
  if (!key) throw new ValidationError('Continuity source manifest signer is not trusted by this Grid');
  const unsigned = structuredClone(manifest);
  delete unsigned.attestation;
  if (!verifyObjectSignature(unsigned, attestation, key)) {
    throw new ValidationError('Continuity source manifest signature is invalid');
  }
  if (expectedExportId !== undefined && exportId !== expectedExportId) {
    throw new ValidationError('Continuity source export_id does not match the expected context');
  }
  if (expectedPrincipal !== undefined && principal !== expectedPrincipal) {
    throw new ValidationError('Continuity source principal does not match the expected context');
  }
  return {
    manifest,
    export_id: exportId,
    principal,
    scope_digest: digestObject(scope),
    evidence_head: manifest.continuity.evidence_head,
    signer_key_id: signerKeyId,
    manifest_digest: digestObject(manifest)
  };
}

function sourceContext(source) {
  return {
    purpose: PURPOSE,
    source_format: EXPORT_FORMAT,
    export_id: source.export_id,
    principal: source.principal,
    scope_digest: source.scope_digest,
    source_manifest_digest: source.manifest_digest,
    source_signer_key_id: source.signer_key_id
  };
}

function eventAtAnchor(store, evidenceHead) {
  if (evidenceHead === GENESIS_HASH) return { seq: 0, event_hash: GENESIS_HASH };
  const row = store.db.prepare(
    'SELECT seq, event_hash FROM events WHERE event_hash = ?'
  ).get(evidenceHead);
  if (!row) {
    throw new AxiomError(
      'continuity_anchor_head_not_found',
      'The signed continuity source head is not present in the verified Grid history',
      409
    );
  }
  return row;
}

export function buildGridContinuityAnchor({
  store,
  sourceManifest,
  identity,
  buildContext,
  createdAt = new Date().toISOString()
}) {
  if (!store || typeof store.verifyFullChain !== 'function' || !store.db) {
    throw new ValidationError('Grid store is required to build a continuity anchor');
  }
  if (!identity?.keyId || typeof identity.signObject !== 'function') {
    throw new ValidationError('Grid identity is required to sign a continuity anchor');
  }
  const chain = store.verifyFullChain();
  if (!chain.valid) {
    throw new AxiomError(
      'integrity_verification_failed',
      `Grid evidence chain is invalid: ${chain.reason ?? 'unknown reason'}`,
      503
    );
  }
  const source = verifyExportManifestForContinuity(sourceManifest, {
    verificationKeys: store.verificationKeys
  });
  const event = eventAtAnchor(store, source.evidence_head);
  const build = normalizeClaimBuildContext(buildContext);
  const context = sourceContext(source);
  const base = {
    schema: GRID_CONTINUITY_ANCHOR_SCHEMA,
    mode: GRID_CONTINUITY_MODE,
    grid_key_id: identity.keyId,
    evidence_seq: event.seq,
    evidence_head: event.event_hash,
    build,
    context,
    context_digest: digestObject(context),
    created_at: isoDate(createdAt, 'anchor.created_at')
  };
  const statement = {
    ...base,
    anchor_id: `gca_${digestObject(base)}`
  };
  const record = {
    statement,
    attestation: identity.signObject(statement)
  };
  return {
    ...record,
    anchor_digest: digestObject(record)
  };
}

export function normalizeGridContinuityAnchor(raw) {
  const value = assertPlainObject(raw, 'Grid continuity anchor');
  const statement = assertPlainObject(value.statement, 'anchor.statement');
  if (statement.schema !== GRID_CONTINUITY_ANCHOR_SCHEMA) {
    throw new ValidationError(`anchor schema must be ${GRID_CONTINUITY_ANCHOR_SCHEMA}`);
  }
  if (statement.mode !== GRID_CONTINUITY_MODE) {
    throw new ValidationError(`anchor mode must be ${GRID_CONTINUITY_MODE}`);
  }
  const build = normalizeClaimBuildContext(statement.build);
  const context = assertPlainObject(statement.context, 'anchor.context');
  const normalizedContext = {
    purpose: assertString(context.purpose, 'anchor.context.purpose', { min: 1, max: 80 }),
    source_format: assertString(context.source_format, 'anchor.context.source_format', { min: 1, max: 80 }),
    export_id: assertString(context.export_id, 'anchor.context.export_id', { min: 1, max: 160, pattern: ID }),
    principal: assertString(context.principal, 'anchor.context.principal', { min: 1, max: 160, pattern: ID }),
    scope_digest: assertDigest(context.scope_digest, 'anchor.context.scope_digest'),
    source_manifest_digest: assertDigest(
      context.source_manifest_digest,
      'anchor.context.source_manifest_digest'
    ),
    source_signer_key_id: assertString(
      context.source_signer_key_id,
      'anchor.context.source_signer_key_id',
      { min: 1, max: 160, pattern: ID }
    )
  };
  if (
    normalizedContext.purpose !== PURPOSE
    || normalizedContext.source_format !== EXPORT_FORMAT
  ) {
    throw new ValidationError('Anchor source context is invalid');
  }
  if (assertDigest(statement.context_digest, 'anchor.context_digest') !== digestObject(normalizedContext)) {
    throw new ValidationError('Anchor context digest is invalid');
  }
  const evidenceSeq = statement.evidence_seq;
  if (!Number.isSafeInteger(evidenceSeq) || evidenceSeq < 0) {
    throw new ValidationError('anchor.evidence_seq must be a non-negative safe integer');
  }
  const base = {
    schema: GRID_CONTINUITY_ANCHOR_SCHEMA,
    mode: GRID_CONTINUITY_MODE,
    grid_key_id: assertString(statement.grid_key_id, 'anchor.grid_key_id', {
      min: 1,
      max: 160,
      pattern: ID
    }),
    evidence_seq: evidenceSeq,
    evidence_head: assertDigest(statement.evidence_head, 'anchor.evidence_head'),
    build,
    context: normalizedContext,
    context_digest: digestObject(normalizedContext),
    created_at: isoDate(statement.created_at, 'anchor.created_at')
  };
  const anchorId = `gca_${digestObject(base)}`;
  if (assertString(statement.anchor_id, 'anchor.anchor_id', {
    min: 68,
    max: 68,
    pattern: ANCHOR_ID
  }) !== anchorId) {
    throw new ValidationError('Anchor ID does not match its signed statement');
  }
  const normalizedStatement = { ...base, anchor_id: anchorId };
  const attestation = structuredClone(assertPlainObject(value.attestation, 'anchor.attestation'));
  const record = { statement: normalizedStatement, attestation };
  if (assertDigest(value.anchor_digest, 'anchor.anchor_digest') !== digestObject(record)) {
    throw new ValidationError('Anchor digest is invalid');
  }
  return { ...record, anchor_digest: digestObject(record) };
}

export function verifyGridContinuityAnchor({
  store,
  anchor,
  sourceManifest,
  expectedBuildContext
}) {
  if (!store || typeof store.verifyFullChain !== 'function' || !store.db) {
    throw new ValidationError('Grid store is required to verify a continuity anchor');
  }
  const record = normalizeGridContinuityAnchor(anchor);
  const expectedBuild = normalizeClaimBuildContext(expectedBuildContext);
  if (canonicalJson(record.statement.build) !== canonicalJson(expectedBuild)) {
    throw new ValidationError('Continuity anchor build context is stale or belongs to another build');
  }
  const anchorKey = store.verificationKeys.get(record.attestation.key_id);
  if (
    record.attestation.key_id !== record.statement.grid_key_id
    || !anchorKey
    || !verifyObjectSignature(record.statement, record.attestation, anchorKey)
  ) {
    throw new ValidationError('Continuity anchor signature or Grid signer binding is invalid');
  }
  const source = verifyExportManifestForContinuity(sourceManifest, {
    verificationKeys: store.verificationKeys,
    expectedExportId: record.statement.context.export_id,
    expectedPrincipal: record.statement.context.principal
  });
  const expectedContext = sourceContext(source);
  if (
    canonicalJson(expectedContext) !== canonicalJson(record.statement.context)
    || digestObject(expectedContext) !== record.statement.context_digest
  ) {
    throw new ValidationError('Continuity anchor was re-addressed to a different source context');
  }
  if (source.evidence_head !== record.statement.evidence_head) {
    throw new ValidationError('Continuity anchor head does not match its signed export source');
  }

  const chain = store.verifyFullChain();
  if (!chain.valid) {
    throw new AxiomError(
      'integrity_verification_failed',
      `Grid evidence chain is invalid: ${chain.reason ?? 'unknown reason'}`,
      503
    );
  }
  if (chain.events < record.statement.evidence_seq) {
    throw new AxiomError(
      'continuity_truncation_detected',
      'Grid history ends before the externally retained continuity anchor',
      409,
      {
        anchor_seq: record.statement.evidence_seq,
        current_seq: chain.events
      }
    );
  }
  const anchoredEvent = record.statement.evidence_seq === 0
    ? { event_hash: GENESIS_HASH }
    : store.db.prepare('SELECT event_hash FROM events WHERE seq = ?').get(
      record.statement.evidence_seq
    );
  if (!anchoredEvent || anchoredEvent.event_hash !== record.statement.evidence_head) {
    throw new AxiomError(
      'continuity_anchor_mismatch',
      'Verified Grid history does not contain the externally retained anchor at its committed sequence',
      409
    );
  }
  const relation = chain.events === record.statement.evidence_seq
    ? 'exact'
    : 'extends';
  if (relation === 'exact' && chain.head !== record.statement.evidence_head) {
    throw new AxiomError(
      'continuity_anchor_mismatch',
      'Current Grid head does not equal the externally retained anchor',
      409
    );
  }
  return {
    valid: true,
    verification_mode: 'full-plus-external-anchor',
    local_chain_verification: 'full-genesis-reverification',
    relation,
    anchor_id: record.statement.anchor_id,
    anchor_digest: record.anchor_digest,
    anchor_seq: record.statement.evidence_seq,
    anchor_head: record.statement.evidence_head,
    current_seq: chain.events,
    current_head: chain.head,
    truncation_detectable_through_seq: record.statement.evidence_seq,
    build_context_digest: record.statement.build.build_context_digest,
    source_manifest_digest: record.statement.context.source_manifest_digest
  };
}
