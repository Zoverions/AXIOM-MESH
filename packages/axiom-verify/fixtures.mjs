import { digestObject, sha256 } from './canonical.mjs';
import { generateEd25519Identity, signObject } from './crypto.mjs';
import {
  CLAIM_BUILD_CONTEXT_SCHEMA,
  EVIDENCE_BUNDLE_ARTIFACT,
  EXPORT_CONTINUITY_MODE,
  EXPORT_PACKAGE_FORMAT,
  GRID_CONTINUITY_ANCHOR_SCHEMA,
  GRID_CONTINUITY_MODE,
  MACHINE_INTENT_RECEIPT_SCHEMA,
  MACHINE_INTENT_RECEIPT_STATEMENT_SCHEMA
} from './schemas.mjs';
const GENESIS_HASH = '0'.repeat(64);

/**
 * Build a signed machine-receipt-like fixture for offline Verify tests.
 * Not a Mesh authority client; fixture-only helper for the experimental scaffold.
 */
export function createSignedReceiptFixture(overrides = {}) {
  const identity = overrides.identity ?? generateEd25519Identity('grid');
  const intentId = overrides.intent_id ?? `intent_${'a'.repeat(64)}`;
  const statement = {
    schema: MACHINE_INTENT_RECEIPT_STATEMENT_SCHEMA,
    kernel_version: overrides.kernel_version ?? '0.12.0-dev.3',
    intent: {
      intent_id: intentId,
      trace_id: overrides.trace_id ?? 'trace.verify-fixture',
      principal: overrides.principal ?? 'agent.verify-fixture',
      action: overrides.action ?? 'system.echo',
      risk: 'low',
      status: overrides.status ?? 'completed',
      input_digest: '1'.repeat(64),
      request_digest: '2'.repeat(64),
      created_at: '2026-09-05T00:00:00.000Z',
      updated_at: '2026-09-05T00:00:01.000Z'
    },
    authority: {
      invocation_digest: '3'.repeat(64),
      machine_authority_digest: '4'.repeat(64)
    },
    outcome: {
      kind: 'intent.completed',
      result_digest: '5'.repeat(64),
      terminal_payload_digest: '6'.repeat(64)
    },
    evidence_events: [
      {
        seq: 10,
        event_id: 'evt.accepted',
        kind: 'intent.accepted',
        occurred_at: '2026-09-05T00:00:00.000Z',
        payload_digest: '7'.repeat(64),
        event_hash: '8'.repeat(64),
        signer_key_id: identity.keyId
      },
      {
        seq: 11,
        event_id: 'evt.terminal',
        kind: 'intent.completed',
        occurred_at: '2026-09-05T00:00:01.000Z',
        payload_digest: '9'.repeat(64),
        event_hash: 'a'.repeat(64),
        signer_key_id: identity.keyId
      }
    ],
    chain: {
      valid: true,
      head: 'b'.repeat(64),
      events: 11,
      verification_mode: 'checkpoint',
      prefix_assurance: 'signed_checkpoint',
      verified_events: 1,
      verified_from_seq: 11,
      verified_through_seq: 11,
      checkpoint_count: 1,
      checkpoint_seq: 10,
      full_verification_required_for_checkpointed_prefix_revalidation: true
    },
    verification: {
      owner_bound: true,
      request_bound: true,
      terminal_bound: true,
      event_signatures_and_hashes_verified: true,
      chain_verified: true
    }
  };

  const attestation = signObject(statement, identity);
  const envelope = {
    schema: MACHINE_INTENT_RECEIPT_SCHEMA,
    statement,
    attestation
  };
  const receipt = {
    ...envelope,
    receipt_digest: digestObject(envelope)
  };

  return {
    identity,
    publicKeyPem: identity.publicPem,
    receipt
  };
}

function buildClaimContext(suffix = 'verify') {
  const base = {
    schema: CLAIM_BUILD_CONTEXT_SCHEMA,
    kernel_version: '0.12.0-dev.3',
    claim_source_digest: digestObject({
      schema: 'axiom-capability-registry.v1',
      kernel_version: '0.12.0-dev.3',
      capabilities: [{ id: `test.${suffix}`, status: 'implemented' }]
    })
  };
  return { ...base, build_context_digest: digestObject(base) };
}

/**
 * Build a genesis→head hash-linked chain segment fixture (offline, no Grid DB).
 */
export function createChainSegmentFixture({ eventCount = 2, identity } = {}) {
  const events = [];
  let prevHash = GENESIS_HASH;
  for (let seq = 1; seq <= eventCount; seq += 1) {
    const envelope = {
      seq,
      event_id: `evt.verify_${String(seq).padStart(4, '0')}`,
      trace_id: `trace.verify_${String(seq).padStart(4, '0')}`,
      actor: 'agent.verify-fixture',
      kind: 'intent.accepted',
      subject: `intent_verify_${String(seq).padStart(4, '0')}`,
      occurred_at: `2026-09-05T00:00:${String(seq).padStart(2, '0')}.000Z`,
      payload_digest: digestObject({ index: seq, note: 'verify-fixture' }),
      prev_hash: prevHash
    };
    const event_hash = digestObject(envelope);
    const signature = identity ? signObject({ event_hash }, identity) : undefined;
    events.push({ ...envelope, event_hash, signature });
    prevHash = event_hash;
  }
  return {
    events,
    head: prevHash,
    genesis: GENESIS_HASH
  };
}

/**
 * Build a signed continuity-anchor fixture plus matching chain segment.
 * Retained head defaults to the segment tip (exact match). Pass extendBy to
 * append extra events after the retained head (relation: extends).
 */
export function createContinuityAnchorFixture(overrides = {}) {
  const identity = overrides.identity ?? generateEd25519Identity('grid');
  const retainedCount = overrides.retained_events ?? 2;
  const extendBy = overrides.extend_by ?? 0;
  const segment = createChainSegmentFixture({
    eventCount: retainedCount + extendBy,
    identity
  });
  const retainedHead = segment.events[retainedCount - 1]?.event_hash ?? GENESIS_HASH;
  const retainedSeq = retainedCount;

  const build = overrides.build ?? buildClaimContext(overrides.build_suffix ?? 'continuity');
  const context = {
    purpose: 'grid.external-continuity',
    source_format: EXPORT_PACKAGE_FORMAT,
    export_id: overrides.export_id ?? 'export_verify_continuity_0001',
    principal: overrides.principal ?? 'person:verify-fixture',
    scope_digest: overrides.scope_digest ?? digestObject({ types: ['events'] }),
    source_manifest_digest: overrides.source_manifest_digest ?? 'c'.repeat(64),
    source_signer_key_id: identity.keyId
  };
  const base = {
    schema: GRID_CONTINUITY_ANCHOR_SCHEMA,
    mode: GRID_CONTINUITY_MODE,
    grid_key_id: identity.keyId,
    evidence_seq: retainedSeq,
    evidence_head: retainedHead,
    build,
    context,
    context_digest: digestObject(context),
    created_at: overrides.created_at ?? '2026-09-05T12:00:00.000Z'
  };
  const statement = {
    ...base,
    anchor_id: `gca_${digestObject(base)}`
  };
  const attestation = signObject(statement, identity);
  const record = { statement, attestation };
  const anchor = {
    ...record,
    anchor_digest: digestObject(record)
  };

  return {
    identity,
    publicKeyPem: identity.publicPem,
    anchor,
    chainSegment: segment.events,
    retained_seq: retainedSeq,
    retained_head: retainedHead,
    relation: extendBy > 0 ? 'extends' : 'exact'
  };
}

/**
 * Build a selective-export / evidence-bundle package fixture with matching digests.
 */
export function createExportPackageFixture(overrides = {}) {
  const identity = overrides.identity ?? generateEd25519Identity('grid');
  const bundleText = overrides.bundle_text
    ?? `${JSON.stringify({ kind: 'verify.fixture', n: 1 })}\n`;
  const bundleBytes = Buffer.from(bundleText, 'utf8');
  const fileName = overrides.file_name ?? 'bundle.jsonl';
  const unsigned = {
    format: EXPORT_PACKAGE_FORMAT,
    schema_versions: {
      manifest: 1,
      records: overrides.records_version ?? 2,
      scope: overrides.scope_version ?? 2,
      evidence: 1
    },
    export_id: overrides.export_id ?? 'export_verify_bundle_0001',
    principal: overrides.principal ?? 'person:verify-fixture',
    scope: overrides.scope ?? { types: ['events'] },
    created_at: overrides.created_at ?? '2026-09-05T12:00:00.000Z',
    record_count: overrides.record_count ?? 1,
    files: [
      {
        name: fileName,
        media_type: overrides.media_type ?? 'application/x-ndjson',
        bytes: bundleBytes.length,
        sha256: sha256(bundleBytes)
      }
    ],
    continuity: {
      mode: EXPORT_CONTINUITY_MODE,
      evidence_head: overrides.evidence_head ?? 'd'.repeat(64)
    }
  };
  const manifest = {
    ...unsigned,
    attestation: signObject(unsigned, identity)
  };

  return {
    identity,
    publicKeyPem: identity.publicPem,
    artifact: EVIDENCE_BUNDLE_ARTIFACT,
    package: {
      manifest,
      files: {
        [fileName]: bundleBytes
      }
    },
    bundleBytes,
    fileName
  };
}
