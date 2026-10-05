import { digestObject, VerifyError } from './canonical.mjs';
import { loadPublicKey, verifyObjectSignature } from './crypto.mjs';
import {
  CLAIM_BUILD_CONTEXT_SCHEMA,
  GRID_CONTINUITY_ANCHOR_SCHEMA,
  GRID_CONTINUITY_MODE,
  isKnownContinuitySchema
} from './schemas.mjs';
import { buildVerificationReport } from './report.mjs';

const DIGEST = /^[a-f0-9]{64}$/;
const GENESIS_HASH = '0'.repeat(64);
const ANCHOR_ID = /^gca_[a-f0-9]{64}$/;
const PURPOSE = 'grid.external-continuity';
const EXPORT_FORMAT = 'axiom-export.v1';

/**
 * Verify an axiom-grid-continuity-anchor.v1 record against a provided chain
 * segment from genesis through the retained head (PROJECT-STATUS retained-head
 * rules). Offline only — no Grid store / kernel authority client.
 */
export function verifyContinuityAnchor(artifact, options = {}) {
  let parsed;
  if (typeof artifact === 'string') {
    try {
      parsed = JSON.parse(artifact);
    } catch {
      return failClosed('invalid_json', 'Artifact is not valid JSON', null);
    }
  } else {
    try {
      parsed = structuredClone(artifact);
    } catch {
      return failClosed(
        'non_cloneable',
        'Artifact could not be cloned for verification (non-cloneable input)',
        null
      );
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return failClosed('invalid_shape', 'Continuity anchor must be a plain object', null);
  }

  const schema = parsed.statement?.schema ?? parsed.schema;
  if (typeof schema !== 'string' || !schema.length) {
    return failClosed(
      'missing_schema',
      'Continuity anchor is missing a schema id; Verify fails closed without a recognized schema',
      null
    );
  }

  if (!isKnownContinuitySchema(schema)) {
    return failClosed(
      'unknown_schema',
      `Unknown schema id '${schema}'. Verify fails closed for unrecognized schemas in this experimental MVP scaffold.`,
      schema
    );
  }

  return verifyAnchorRecord(parsed, options);
}

function verifyAnchorRecord(anchor, { publicKeyPem, chainSegment } = {}) {
  if (!publicKeyPem) {
    return failClosed(
      'missing_public_key',
      'Public key material is required to verify a continuity anchor',
      GRID_CONTINUITY_ANCHOR_SCHEMA
    );
  }

  const statement = anchor.statement;
  if (!statement || typeof statement !== 'object' || Array.isArray(statement)) {
    return failClosed(
      'missing_statement',
      'Continuity anchor is missing a statement block',
      GRID_CONTINUITY_ANCHOR_SCHEMA
    );
  }

  if (statement.schema !== GRID_CONTINUITY_ANCHOR_SCHEMA) {
    return failClosed(
      'invalid_statement_schema',
      `Anchor statement schema must be '${GRID_CONTINUITY_ANCHOR_SCHEMA}'`,
      GRID_CONTINUITY_ANCHOR_SCHEMA
    );
  }

  if (statement.mode !== GRID_CONTINUITY_MODE) {
    return failClosed(
      'invalid_mode',
      `Anchor mode must be '${GRID_CONTINUITY_MODE}' (externally retained signed Grid head)`,
      GRID_CONTINUITY_ANCHOR_SCHEMA
    );
  }

  if (!DIGEST.test(anchor.anchor_digest ?? '')) {
    return failClosed(
      'invalid_anchor_digest',
      'Continuity anchor digest is missing or not a 64-character hex SHA-256',
      GRID_CONTINUITY_ANCHOR_SCHEMA
    );
  }

  const { anchor_digest: claimedDigest, ...record } = anchor;
  let computedDigest;
  try {
    computedDigest = digestObject(record);
  } catch (error) {
    return failClosed(
      'canonicalization_failed',
      `Anchor bytes could not be canonicalized: ${error.message}`,
      GRID_CONTINUITY_ANCHOR_SCHEMA
    );
  }

  if (computedDigest !== claimedDigest) {
    return failClosed(
      'digest_mismatch',
      'Altered or substituted continuity-anchor bytes: anchor_digest does not match the statement + attestation envelope',
      GRID_CONTINUITY_ANCHOR_SCHEMA,
      { anchor_digest: claimedDigest, anchor_id: statement.anchor_id ?? null }
    );
  }

  const buildCheck = normalizeBuildContext(statement.build);
  if (!buildCheck.ok) {
    return failClosed(buildCheck.code, buildCheck.reason, GRID_CONTINUITY_ANCHOR_SCHEMA, {
      anchor_digest: claimedDigest,
      anchor_id: statement.anchor_id ?? null
    });
  }

  const contextCheck = normalizeContext(statement.context, statement.context_digest);
  if (!contextCheck.ok) {
    return failClosed(contextCheck.code, contextCheck.reason, GRID_CONTINUITY_ANCHOR_SCHEMA, {
      anchor_digest: claimedDigest,
      anchor_id: statement.anchor_id ?? null
    });
  }

  const evidenceSeq = statement.evidence_seq;
  if (!Number.isSafeInteger(evidenceSeq) || evidenceSeq < 0) {
    return failClosed(
      'invalid_evidence_seq',
      'anchor.evidence_seq must be a non-negative safe integer',
      GRID_CONTINUITY_ANCHOR_SCHEMA,
      { anchor_digest: claimedDigest, anchor_id: statement.anchor_id ?? null }
    );
  }

  if (!DIGEST.test(statement.evidence_head ?? '')) {
    return failClosed(
      'invalid_evidence_head',
      'anchor.evidence_head must be a 64-character hex SHA-256 retained head',
      GRID_CONTINUITY_ANCHOR_SCHEMA,
      { anchor_digest: claimedDigest, anchor_id: statement.anchor_id ?? null }
    );
  }

  const idBase = {
    schema: GRID_CONTINUITY_ANCHOR_SCHEMA,
    mode: GRID_CONTINUITY_MODE,
    grid_key_id: statement.grid_key_id,
    evidence_seq: evidenceSeq,
    evidence_head: statement.evidence_head,
    build: buildCheck.build,
    context: contextCheck.context,
    context_digest: digestObject(contextCheck.context),
    created_at: statement.created_at
  };
  const expectedAnchorId = `gca_${digestObject(idBase)}`;
  if (
    typeof statement.anchor_id !== 'string'
    || !ANCHOR_ID.test(statement.anchor_id)
    || statement.anchor_id !== expectedAnchorId
  ) {
    return failClosed(
      'anchor_id_mismatch',
      'Anchor ID does not match its signed statement under retained-head construction rules',
      GRID_CONTINUITY_ANCHOR_SCHEMA,
      { anchor_digest: claimedDigest, anchor_id: statement.anchor_id ?? null }
    );
  }

  if (statement.context_digest !== digestObject(contextCheck.context)) {
    return failClosed(
      'context_digest_mismatch',
      'Anchor context_digest does not match the declared context object',
      GRID_CONTINUITY_ANCHOR_SCHEMA,
      { anchor_digest: claimedDigest, anchor_id: statement.anchor_id }
    );
  }

  if (!anchor.attestation || typeof anchor.attestation !== 'object') {
    return failClosed(
      'missing_attestation',
      'Continuity anchor is missing an attestation block',
      GRID_CONTINUITY_ANCHOR_SCHEMA,
      { anchor_digest: claimedDigest, anchor_id: statement.anchor_id }
    );
  }

  let publicKey;
  try {
    publicKey = loadPublicKey(publicKeyPem);
  } catch {
    return failClosed(
      'invalid_public_key',
      'Public key material could not be parsed as an SPKI PEM key',
      GRID_CONTINUITY_ANCHOR_SCHEMA,
      { anchor_digest: claimedDigest, anchor_id: statement.anchor_id }
    );
  }

  if (
    anchor.attestation.key_id !== statement.grid_key_id
    || !verifyObjectSignature(statement, anchor.attestation, publicKey)
  ) {
    return failClosed(
      'signature_invalid',
      'Ed25519 continuity-anchor attestation does not verify under the supplied public key (bad signature, wrong key, or altered statement)',
      GRID_CONTINUITY_ANCHOR_SCHEMA,
      { anchor_digest: claimedDigest, anchor_id: statement.anchor_id }
    );
  }

  const segmentResult = verifyChainSegmentAgainstRetainedHead(chainSegment, {
    evidenceSeq,
    evidenceHead: statement.evidence_head
  });
  if (!segmentResult.ok) {
    return failClosed(segmentResult.code, segmentResult.reason, GRID_CONTINUITY_ANCHOR_SCHEMA, {
      anchor_digest: claimedDigest,
      anchor_id: statement.anchor_id,
      evidence_seq: evidenceSeq,
      evidence_head: statement.evidence_head
    });
  }

  const okResult = {
    ok: true,
    code: 'pass',
    schema: GRID_CONTINUITY_ANCHOR_SCHEMA,
    anchor_digest: claimedDigest,
    anchor_id: statement.anchor_id,
    evidence_seq: evidenceSeq,
    evidence_head: statement.evidence_head,
    relation: segmentResult.relation,
    segment_events: segmentResult.events,
    reason: null
  };
  return { ...okResult, report: buildVerificationReport(okResult) };
}

function normalizeBuildContext(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, code: 'missing_build_context', reason: 'Anchor build context is missing' };
  }
  if (raw.schema !== CLAIM_BUILD_CONTEXT_SCHEMA) {
    return {
      ok: false,
      code: 'invalid_build_context_schema',
      reason: `Claim build context schema must be '${CLAIM_BUILD_CONTEXT_SCHEMA}'`
    };
  }
  if (!DIGEST.test(raw.claim_source_digest ?? '') || typeof raw.kernel_version !== 'string') {
    return {
      ok: false,
      code: 'invalid_build_context',
      reason: 'Claim build context is missing kernel_version or claim_source_digest'
    };
  }
  const base = {
    schema: CLAIM_BUILD_CONTEXT_SCHEMA,
    kernel_version: raw.kernel_version,
    claim_source_digest: raw.claim_source_digest
  };
  const digest = digestObject(base);
  if (raw.build_context_digest !== digest) {
    return {
      ok: false,
      code: 'build_context_digest_mismatch',
      reason: 'Claim build context digest is invalid'
    };
  }
  return { ok: true, build: { ...base, build_context_digest: digest } };
}

function normalizeContext(raw, claimedDigest) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, code: 'missing_context', reason: 'Anchor source context is missing' };
  }
  const context = {
    purpose: raw.purpose,
    source_format: raw.source_format,
    export_id: raw.export_id,
    principal: raw.principal,
    scope_digest: raw.scope_digest,
    source_manifest_digest: raw.source_manifest_digest,
    source_signer_key_id: raw.source_signer_key_id
  };
  if (context.purpose !== PURPOSE || context.source_format !== EXPORT_FORMAT) {
    return {
      ok: false,
      code: 'invalid_source_context',
      reason: 'Anchor source context purpose/format is invalid for grid external continuity'
    };
  }
  for (const key of [
    'export_id',
    'principal',
    'scope_digest',
    'source_manifest_digest',
    'source_signer_key_id'
  ]) {
    if (typeof context[key] !== 'string' || !context[key].length) {
      return {
        ok: false,
        code: 'invalid_source_context',
        reason: `Anchor source context field '${key}' is missing or empty`
      };
    }
  }
  if (!DIGEST.test(context.scope_digest) || !DIGEST.test(context.source_manifest_digest)) {
    return {
      ok: false,
      code: 'invalid_source_context',
      reason: 'Anchor source context digests must be 64-character hex SHA-256'
    };
  }
  if (claimedDigest !== undefined && claimedDigest !== digestObject(context)) {
    return {
      ok: false,
      code: 'context_digest_mismatch',
      reason: 'Anchor context_digest does not match the declared context object'
    };
  }
  return { ok: true, context };
}

/**
 * Retained-head rules (PROJECT-STATUS): a valid segment proves current history
 * equals or extends the retained head through the newest retained anchor.
 * Gaps / broken prev_hash links / truncation before the retained seq FAIL.
 */
export function verifyChainSegmentAgainstRetainedHead(chainSegment, {
  evidenceSeq,
  evidenceHead
}) {
  if (chainSegment === undefined || chainSegment === null) {
    return {
      ok: false,
      code: 'missing_chain_segment',
      reason:
        'A chain segment from genesis through the retained head is required to verify continuity-anchor retained-head rules'
    };
  }

  let segment;
  try {
    segment = typeof chainSegment === 'string' ? JSON.parse(chainSegment) : structuredClone(chainSegment);
  } catch {
    return {
      ok: false,
      code: 'invalid_chain_segment',
      reason: 'Chain segment could not be parsed or cloned'
    };
  }

  if (!Array.isArray(segment)) {
    return {
      ok: false,
      code: 'invalid_chain_segment',
      reason: 'Chain segment must be an array of evidence events ordered from genesis'
    };
  }

  if (evidenceSeq === 0) {
    if (evidenceHead !== GENESIS_HASH) {
      return {
        ok: false,
        code: 'continuity_anchor_mismatch',
        reason: 'Genesis retained head must be the all-zero genesis hash'
      };
    }
    if (segment.length === 0) {
      return { ok: true, relation: 'exact', events: 0, head: GENESIS_HASH };
    }
    // Extension beyond genesis is allowed; still verify links from genesis.
  }

  if (segment.length < evidenceSeq) {
    return {
      ok: false,
      code: 'continuity_truncation',
      reason:
        `Chain segment ends before the externally retained continuity anchor (segment events=${segment.length}, retained seq=${evidenceSeq}). Truncation or incomplete segment — FAIL under retained-head rules.`
    };
  }

  let previous = GENESIS_HASH;
  let expectedSeq = 1;
  for (const row of segment) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      return {
        ok: false,
        code: 'invalid_chain_event',
        reason: `Chain segment event at expected seq ${expectedSeq} is not a plain object`
      };
    }
    if (row.seq !== expectedSeq) {
      return {
        ok: false,
        code: 'sequence_gap',
        reason:
          `Gap in chain segment: expected seq ${expectedSeq} but found seq ${row.seq}. Human explanation: the provided history is missing or reordered events between genesis and the retained head.`
      };
    }
    if (!DIGEST.test(row.prev_hash ?? '') || row.prev_hash !== previous) {
      return {
        ok: false,
        code: 'broken_link',
        reason:
          `Broken hash link at seq ${row.seq}: prev_hash does not equal the previous event_hash (or genesis). Human explanation: the chain segment is not a continuous hash-linked history from genesis through the retained head.`
      };
    }
    if (!DIGEST.test(row.event_hash ?? '')) {
      return {
        ok: false,
        code: 'invalid_event_hash',
        reason: `Chain segment event at seq ${row.seq} is missing a 64-character hex event_hash`
      };
    }

    const envelope = {
      seq: row.seq,
      event_id: row.event_id,
      trace_id: row.trace_id,
      actor: row.actor,
      kind: row.kind,
      subject: row.subject,
      occurred_at: row.occurred_at,
      payload_digest: row.payload_digest,
      prev_hash: row.prev_hash
    };
    let computed;
    try {
      computed = digestObject(envelope);
    } catch (error) {
      return {
        ok: false,
        code: 'event_canonicalization_failed',
        reason: `Chain segment event at seq ${row.seq} could not be canonicalized: ${error.message}`
      };
    }
    if (computed !== row.event_hash) {
      return {
        ok: false,
        code: 'event_hash_mismatch',
        reason:
          `Broken event digest at seq ${row.seq}: event_hash does not match the canonical envelope. Human explanation: the provided chain segment was altered or is not self-consistent.`
      };
    }

    previous = row.event_hash;
    expectedSeq += 1;
  }

  if (evidenceSeq === 0) {
    return {
      ok: true,
      relation: segment.length === 0 ? 'exact' : 'extends',
      events: segment.length,
      head: previous
    };
  }

  const anchored = segment[evidenceSeq - 1];
  if (!anchored || anchored.event_hash !== evidenceHead) {
    return {
      ok: false,
      code: 'continuity_anchor_mismatch',
      reason:
        `Verified chain segment does not contain the externally retained head at seq ${evidenceSeq}. Human explanation: retained-head rules require the event at the anchor sequence to equal the signed evidence_head.`
    };
  }

  if (segment.length === evidenceSeq && previous !== evidenceHead) {
    return {
      ok: false,
      code: 'continuity_anchor_mismatch',
      reason: 'Current segment head does not equal the externally retained anchor head'
    };
  }

  const relation = segment.length === evidenceSeq ? 'exact' : 'extends';
  return { ok: true, relation, events: segment.length, head: previous };
}

function failClosed(code, reason, schema, extra = {}) {
  const result = {
    ok: false,
    code,
    schema,
    reason,
    anchor_digest: extra.anchor_digest ?? null,
    anchor_id: extra.anchor_id ?? null,
    evidence_seq: extra.evidence_seq ?? null,
    evidence_head: extra.evidence_head ?? null
  };
  return { ...result, report: buildVerificationReport(result) };
}

export { VerifyError, GENESIS_HASH };
