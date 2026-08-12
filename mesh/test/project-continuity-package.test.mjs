import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { sha256 } from '../src/lib/canonical.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import {
  PROJECT_EVENT_OBSERVATION_SCHEMA,
  PROJECT_EVENT_SCHEMA,
  normalizeProjectEvent,
  normalizeProjectEventObservation
} from '../src/lib/project-continuity-events.mjs';
import {
  PROJECT_CONTINUITY_PACKAGE_LIMITS,
  buildProjectContinuityImportPlan,
  buildProjectContinuityPackage,
  verifyProjectContinuityPackage
} from '../src/lib/project-continuity-package.mjs';
import {
  SOURCE_CONTENT_ADDRESS_PROFILE,
  SOURCE_STATE_SCHEMA,
  normalizeSourceState
} from '../src/lib/source-continuity.mjs';
import { ProjectContinuityGridStore } from '../src/grid/project-continuity-store.mjs';

const EXPORTED_AT = '2026-08-12T13:00:00.000Z';
const PROTECTED_REF = 'protected:security-finding-evidence-001';
const SECRET_TEXT = 'sensitive review detail that must not be packaged inline';

function publicContent(text) {
  const bytes = Buffer.from(text, 'utf8');
  return {
    visibility: 'public',
    mode: 'inline_public',
    media_type: 'text/markdown',
    content_digest: sha256(bytes),
    byte_length: bytes.length,
    inline_utf8: text
  };
}

function digestContent(text) {
  const bytes = Buffer.from(text, 'utf8');
  return {
    visibility: 'public',
    mode: 'digest_only',
    media_type: 'application/json',
    content_digest: sha256(bytes),
    byte_length: bytes.length
  };
}

function protectedContent() {
  const bytes = Buffer.from(SECRET_TEXT, 'utf8');
  return {
    visibility: 'sensitive',
    mode: 'protected_reference',
    media_type: 'application/json',
    content_digest: sha256(bytes),
    byte_length: bytes.length,
    protected_ref: PROTECTED_REF
  };
}

function event({
  objectId,
  objectKind,
  eventKind,
  occurredAt,
  content,
  previous = null,
  sourceStateDigest = null,
  ciOutcome = null
}) {
  return normalizeProjectEvent({
    schema: PROJECT_EVENT_SCHEMA,
    project_id: 'axiom-mesh',
    project_object_id: objectId,
    object_kind: objectKind,
    event_kind: eventKind,
    occurred_at: occurredAt,
    time_assurance: 'axiom_observed',
    actor: { actor_id: null, actor_binding_digest: null },
    content,
    source_state_digest: sourceStateDigest,
    previous_event_digest: previous,
    related_object_ids: [],
    ci_outcome: ciOutcome,
    governance_authority_granted: false,
    capability_promotion: false,
    content_address_profile: SOURCE_CONTENT_ADDRESS_PROFILE
  });
}

function observation(canonical, {
  provider = 'github',
  objectId = 'issue:1012',
  observedAt = '2026-08-12T12:10:00.000Z'
} = {}) {
  return normalizeProjectEventObservation({
    schema: PROJECT_EVENT_OBSERVATION_SCHEMA,
    project_id: canonical.project_id,
    event_digest: canonical.event_digest,
    provider,
    external_project_id: provider === 'github' ? 'Zoverions/AXIOM-MESH' : 'mesh/axiom',
    external_object_id: objectId,
    external_event_id: `${objectId}:event`,
    external_revision: '1',
    external_actor_id: `${provider}:user-1`,
    actor_binding_digest: null,
    actor_binding_verified: false,
    locator: `https://${provider}.example.invalid/${objectId}`,
    provider_evidence_digest: sha256(`provider:${provider}:${objectId}`),
    provider_authenticity_verified: true,
    event_content_reproduced: true,
    observed_at: observedAt,
    non_authoritative: true,
    content_address_profile: SOURCE_CONTENT_ADDRESS_PROFILE
  });
}

function sourceState() {
  return normalizeSourceState({
    schema: SOURCE_STATE_SCHEMA,
    repository_id: 'axiom-mesh',
    vcs: 'git',
    object_format: 'sha1',
    commit_oid: '1'.repeat(40),
    tree_oid: '2'.repeat(40),
    source_manifest_digest: sha256('package-source-manifest'),
    build: {
      kernel_version: '0.12.0-dev.3',
      capability_registry_digest: sha256('package-registry'),
      capability_evidence_digest: sha256('package-capability-evidence'),
      release_boundary_digest: sha256('package-release-boundary')
    },
    content_address_profile: SOURCE_CONTENT_ADDRESS_PROFILE
  });
}

async function fixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-project-package-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const otherIdentity = await ensureMeshIdentity(dataDir, 'hypervisor', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const store = new ProjectContinuityGridStore({
    path: join(dataDir, 'grid.sqlite'),
    dataDir,
    identity,
    protector
  });
  t.after(async () => {
    store.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  const created = event({
    objectId: 'project-object:issue-001',
    objectKind: 'issue',
    eventKind: 'issue.created',
    occurredAt: '2026-08-12T12:00:00.000Z',
    content: publicContent('Portable issue opened')
  });
  store.recordProjectEvent({ actor: 'human:operator', traceId: 'trace-created', event: created });
  store.recordProjectEventObservation({
    actor: 'service:github-adapter',
    traceId: 'trace-created-observation',
    observation: observation(created)
  });

  const updated = event({
    objectId: 'project-object:issue-001',
    objectKind: 'issue',
    eventKind: 'issue.updated',
    occurredAt: '2026-08-12T12:15:00.000Z',
    content: publicContent('Portable issue updated'),
    previous: created.event_digest
  });
  store.recordProjectEvent({ actor: 'human:operator', traceId: 'trace-updated', event: updated });

  const security = event({
    objectId: 'project-object:security-001',
    objectKind: 'security_finding',
    eventKind: 'security.finding_recorded',
    occurredAt: '2026-08-12T12:20:00.000Z',
    content: protectedContent()
  });
  store.recordProjectEvent({ actor: 'service:security', traceId: 'trace-security', event: security });

  const state = sourceState();
  store.recordSourceState({
    actor: 'human:source-operator',
    traceId: 'trace-source',
    state
  });
  const ci = event({
    objectId: 'project-object:ci-001',
    objectKind: 'ci_check',
    eventKind: 'ci.check_completed',
    occurredAt: '2026-08-12T12:30:00.000Z',
    content: digestContent('clean-kernel-passed'),
    sourceStateDigest: state.state_digest,
    ciOutcome: 'passed'
  });
  store.recordProjectEvent({ actor: 'service:ci', traceId: 'trace-ci', event: ci });
  store.recordProjectEventObservation({
    actor: 'service:github-adapter',
    traceId: 'trace-ci-observation',
    observation: observation(ci, {
      objectId: 'check-run:31594447350',
      observedAt: '2026-08-12T12:31:00.000Z'
    })
  });

  const ledger = store.getProjectContinuity('axiom-mesh');
  return { dataDir, identity, otherIdentity, store, ledger, created, updated, security, ci, state };
}

test('Grid signs a bounded portable project-history package that verifies offline', async t => {
  const { identity, ledger, state } = await fixture(t);
  const pkg = buildProjectContinuityPackage({
    ledger,
    identity,
    exported_at: EXPORTED_AT
  });
  const verified = verifyProjectContinuityPackage(pkg, { public_key: identity.publicKey });

  assert.deepEqual(verified, pkg);
  assert.match(pkg.package_id, /^project-continuity-package:[a-f0-9]{64}$/);
  assert.match(pkg.package_digest, /^[a-f0-9]{64}$/);
  assert.equal(pkg.signature.algorithm, 'Ed25519');
  assert.equal(pkg.signature.key_id, identity.keyId);
  assert.equal(pkg.canonical_event_count, 4);
  assert.equal(pkg.provider_observation_count, 2);
  assert.deepEqual(pkg.source_state_dependencies, [state.state_digest]);
  assert.deepEqual(pkg.protected_references, [PROTECTED_REF]);
  assert.equal(pkg.history_completeness_claimed, false);
  assert.equal(pkg.originating_full_grid_chain_included, false);
  assert.equal(pkg.provider_restore_performed, false);
  assert.equal(pkg.import_authorized, false);
  assert.equal(pkg.producer_claimed_grid_chain_verified_at_export, true);
  assert.equal(pkg.producer_claimed_retained_project_snapshot_complete, true);
});

test('protected project commitments survive export without leaking protected bytes', async t => {
  const { identity, ledger } = await fixture(t);
  const pkg = buildProjectContinuityPackage({ ledger, identity, exported_at: EXPORTED_AT });
  const serialized = JSON.stringify(pkg);
  assert.equal(serialized.includes(SECRET_TEXT), false);
  assert.equal(serialized.includes(PROTECTED_REF), true);
  assert.equal(pkg.protected_content_bytes_included, false);
});

test('package signature is bound to the Grid exporter and fails under another trusted key', async t => {
  const { identity, otherIdentity, ledger } = await fixture(t);
  const pkg = buildProjectContinuityPackage({ ledger, identity, exported_at: EXPORTED_AT });
  assert.throws(
    () => verifyProjectContinuityPackage(pkg, { public_key: otherIdentity.publicKey }),
    /signature is invalid/
  );
  assert.throws(
    () => buildProjectContinuityPackage({
      ledger,
      identity: otherIdentity,
      exported_at: EXPORTED_AT
    }),
    /requires Grid identity/
  );
});

test('event, dependency, claim-boundary, and signature tampering fail offline verification', async t => {
  const { identity, ledger } = await fixture(t);
  const pkg = buildProjectContinuityPackage({ ledger, identity, exported_at: EXPORTED_AT });

  const eventTamper = structuredClone(pkg);
  eventTamper.canonical_events[0].event.content.inline_utf8 = 'tampered';
  assert.throws(
    () => verifyProjectContinuityPackage(eventTamper, { public_key: identity.publicKey }),
    /byte commitment|digest does not match|does not match its byte commitment/
  );

  const dependencyTamper = structuredClone(pkg);
  dependencyTamper.source_state_dependencies = [];
  assert.throws(
    () => verifyProjectContinuityPackage(dependencyTamper, { public_key: identity.publicKey }),
    /dependencies are incomplete or substituted/
  );

  const claimTamper = structuredClone(pkg);
  claimTamper.history_completeness_claimed = true;
  assert.throws(
    () => verifyProjectContinuityPackage(claimTamper, { public_key: identity.publicKey }),
    /claim boundary is weakened/
  );

  const signatureTamper = structuredClone(pkg);
  signatureTamper.signature.signature = `${signatureTamper.signature.signature.slice(0, -1)}A`;
  assert.throws(
    () => verifyProjectContinuityPackage(signatureTamper, { public_key: identity.publicKey }),
    /signature is invalid/
  );
});

test('package builder re-verifies Grid sequence uniqueness and explicit predecessor retention', async t => {
  const { identity, ledger } = await fixture(t);

  const duplicateSeq = structuredClone(ledger);
  duplicateSeq.provider_observations[0].event_seq = duplicateSeq.canonical_events[0].event_seq;
  assert.throws(
    () => buildProjectContinuityPackage({
      ledger: duplicateSeq,
      identity,
      exported_at: EXPORTED_AT
    }),
    /reuses a Grid event sequence/
  );

  const missingPredecessor = structuredClone(ledger);
  missingPredecessor.canonical_events = missingPredecessor.canonical_events.slice(1);
  missingPredecessor.canonical_event_count = missingPredecessor.canonical_events.length;
  assert.throws(
    () => buildProjectContinuityPackage({
      ledger: missingPredecessor,
      identity,
      exported_at: EXPORTED_AT
    }),
    /explicit predecessor is absent or not earlier/
  );
});

test('bounded package refuses silent truncation when retained history exceeds the v1 ceiling', async t => {
  const { identity, ledger } = await fixture(t);
  const oversized = structuredClone(ledger);
  oversized.canonical_events = Array.from(
    { length: PROJECT_CONTINUITY_PACKAGE_LIMITS.max_canonical_events + 1 },
    () => ledger.canonical_events[0]
  );
  oversized.canonical_event_count = oversized.canonical_events.length;
  assert.throws(
    () => buildProjectContinuityPackage({
      ledger: oversized,
      identity,
      exported_at: EXPORTED_AT
    }),
    /exceeds 4096 canonical events/
  );
});

test('import plan restores only explicitly supported event kinds and retains all unmappable evidence', async t => {
  const { identity, ledger, created, updated, security, ci } = await fixture(t);
  const pkg = buildProjectContinuityPackage({ ledger, identity, exported_at: EXPORTED_AT });
  const plan = buildProjectContinuityImportPlan({
    package: pkg,
    public_key: identity.publicKey,
    target_provider: 'forgejo',
    supported_event_kinds: ['issue.created', 'issue.updated'],
    created_at: '2026-08-12T13:05:00.000Z'
  });

  assert.deepEqual(plan.restorable_event_digests, [created.event_digest, updated.event_digest].sort());
  assert.deepEqual(
    plan.retained_unmapped_event_digests,
    [security.event_digest, ci.event_digest].sort()
  );
  assert.deepEqual(
    plan.retained_provider_observation_digests,
    pkg.provider_observations.map(entry => entry.observation.observation_digest).sort()
  );
  assert.equal(plan.provider_observations_replayed_as_provider_state, false);
  assert.equal(plan.unmapped_evidence_discarded, false);
  assert.equal(plan.canonical_project_ids_preserved, true);
  assert.equal(plan.provider_mutation_performed, false);
  assert.equal(plan.execution_authorized, false);
  assert.match(plan.plan_id, /^project-continuity-import-plan:[a-f0-9]{64}$/);
});

test('import target cannot declare a non-canonical event kind as restorable', async t => {
  const { identity, ledger } = await fixture(t);
  const pkg = buildProjectContinuityPackage({ ledger, identity, exported_at: EXPORTED_AT });
  assert.throws(
    () => buildProjectContinuityImportPlan({
      package: pkg,
      public_key: identity.publicKey,
      target_provider: 'forgejo',
      supported_event_kinds: ['github.secret_event'],
      created_at: '2026-08-12T13:05:00.000Z'
    }),
    /declares unsupported canonical event kind/
  );
});

test('same retained ledger and export instant produce deterministic signed package bytes', async t => {
  const { identity, ledger } = await fixture(t);
  const first = buildProjectContinuityPackage({ ledger, identity, exported_at: EXPORTED_AT });
  const second = buildProjectContinuityPackage({ ledger, identity, exported_at: EXPORTED_AT });
  assert.deepEqual(first, second);
});
