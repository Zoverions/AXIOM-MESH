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
  SOURCE_CONTENT_ADDRESS_PROFILE,
  SOURCE_STATE_SCHEMA,
  normalizeSourceState
} from '../src/lib/source-continuity.mjs';
import {
  PROJECT_EVENT_OBSERVED_EVENT,
  PROJECT_EVENT_RECORDED_EVENT,
  ProjectContinuityGridStore
} from '../src/grid/project-continuity-store.mjs';

function content(text, { visibility = 'public', mode = 'inline_public' } = {}) {
  const bytes = Buffer.from(text, 'utf8');
  const base = {
    visibility,
    mode,
    media_type: 'text/markdown',
    content_digest: sha256(bytes),
    byte_length: bytes.length
  };
  if (mode === 'inline_public') return { ...base, inline_utf8: text };
  if (mode === 'protected_reference') {
    return { ...base, protected_ref: `protected:${sha256(text).slice(0, 24)}` };
  }
  return base;
}

function projectEvent({
  objectId = 'project-object:issue-001',
  objectKind = 'issue',
  eventKind = 'issue.created',
  text = 'Portable issue event',
  occurredAt = '2026-08-12T12:00:00.000Z',
  previous = null,
  sourceStateDigest = null,
  ciOutcome = null,
  actorId = null
} = {}) {
  return normalizeProjectEvent({
    schema: PROJECT_EVENT_SCHEMA,
    project_id: 'axiom-mesh',
    project_object_id: objectId,
    object_kind: objectKind,
    event_kind: eventKind,
    occurred_at: occurredAt,
    time_assurance: 'axiom_observed',
    actor: actorId === null
      ? { actor_id: null, actor_binding_digest: null }
      : { actor_id: actorId, actor_binding_digest: sha256(`binding:${actorId}`) },
    content: content(text),
    source_state_digest: sourceStateDigest,
    previous_event_digest: previous,
    related_object_ids: [],
    ci_outcome: ciOutcome,
    governance_authority_granted: false,
    capability_promotion: false,
    content_address_profile: SOURCE_CONTENT_ADDRESS_PROFILE
  });
}

function observation(event, {
  provider = 'github',
  externalObjectId = 'issue:1012',
  observedAt = '2026-08-12T12:01:00.000Z',
  evidence = provider
} = {}) {
  return normalizeProjectEventObservation({
    schema: PROJECT_EVENT_OBSERVATION_SCHEMA,
    project_id: event.project_id,
    event_digest: event.event_digest,
    provider,
    external_project_id: provider === 'github' ? 'Zoverions/AXIOM-MESH' : 'mesh/axiom',
    external_object_id: externalObjectId,
    external_event_id: `${externalObjectId}:event`,
    external_revision: '1',
    external_actor_id: `${provider}:user-1`,
    actor_binding_digest: null,
    actor_binding_verified: false,
    locator: `https://${provider}.example.invalid/${externalObjectId}`,
    provider_evidence_digest: sha256(`provider-evidence:${evidence}`),
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
    source_manifest_digest: sha256('project-continuity-source-manifest'),
    build: {
      kernel_version: '0.12.0-dev.3',
      capability_registry_digest: sha256('project-continuity-registry'),
      capability_evidence_digest: sha256('project-continuity-capability-evidence'),
      release_boundary_digest: sha256('project-continuity-release-boundary')
    },
    content_address_profile: SOURCE_CONTENT_ADDRESS_PROFILE
  });
}

async function storeFixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-project-continuity-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const path = join(dataDir, 'grid.sqlite');
  let store = new ProjectContinuityGridStore({ path, dataDir, identity, protector });
  t.after(async () => {
    try {
      store.close();
    } catch {
      // Restart tests replace the active handle.
    }
    await rm(dataDir, { recursive: true, force: true });
  });
  return {
    dataDir,
    identity,
    protector,
    path,
    get store() {
      return store;
    },
    replaceStore(next) {
      store = next;
    }
  };
}

test('canonical project event and provider observation survive protected Grid restart', async t => {
  const fixture = await storeFixture(t);
  const event = projectEvent();
  const observed = observation(event);

  const recorded = fixture.store.recordProjectEvent({
    actor: 'human:project-operator',
    traceId: 'trace-project-record-001',
    event
  });
  assert.equal(recorded.already_recorded, false);
  assert.equal(recorded.grid_event.kind, PROJECT_EVENT_RECORDED_EVENT);

  const retainedObservation = fixture.store.recordProjectEventObservation({
    actor: 'service:project-observer',
    traceId: 'trace-project-observe-001',
    observation: observed
  });
  assert.equal(retainedObservation.already_recorded, false);
  assert.equal(retainedObservation.grid_event.kind, PROJECT_EVENT_OBSERVED_EVENT);

  const before = fixture.store.getProjectContinuity('axiom-mesh');
  assert.equal(before.canonical_event_count, 1);
  assert.equal(before.provider_observation_count, 1);
  assert.equal(before.canonical_events[0].event.event_digest, event.event_digest);
  assert.equal(before.provider_observations[0].observation.event_digest, event.event_digest);

  fixture.store.close();
  fixture.replaceStore(new ProjectContinuityGridStore({
    path: fixture.path,
    dataDir: fixture.dataDir,
    identity: fixture.identity,
    protector: fixture.protector
  }));

  const after = fixture.store.getProjectContinuity('axiom-mesh');
  assert.equal(after.canonical_event_count, 1);
  assert.equal(after.provider_observation_count, 1);
  assert.equal(after.canonical_events[0].event.event_digest, event.event_digest);
  assert.equal(after.provider_observation_grants_authority, false);
  assert.equal(after.portable_event_grants_governance_authority, false);
  assert.equal(after.portable_event_promotes_capability, false);
  assert.equal(after.history_completeness_claimed, false);
});

test('exact event and observation retries are idempotent rather than duplicate history', async t => {
  const { store } = await storeFixture(t);
  const event = projectEvent();
  const observed = observation(event);

  store.recordProjectEvent({ actor: 'human:operator', traceId: 'trace-e1', event });
  const secondEvent = store.recordProjectEvent({
    actor: 'human:operator',
    traceId: 'trace-e2',
    event
  });
  assert.equal(secondEvent.already_recorded, true);

  store.recordProjectEventObservation({
    actor: 'service:observer',
    traceId: 'trace-o1',
    observation: observed
  });
  const secondObservation = store.recordProjectEventObservation({
    actor: 'service:observer',
    traceId: 'trace-o2',
    observation: observed
  });
  assert.equal(secondObservation.already_recorded, true);

  const ledger = store.getProjectContinuity('axiom-mesh');
  assert.equal(ledger.canonical_event_count, 1);
  assert.equal(ledger.provider_observation_count, 1);
});

test('multiple forges can observe one canonical event without altering canonical identity', async t => {
  const { store } = await storeFixture(t);
  const event = projectEvent({ actorId: 'actor.project-owner' });
  store.recordProjectEvent({ actor: 'human:operator', traceId: 'trace-record', event });

  const github = observation(event, { provider: 'github', externalObjectId: 'issue:1012' });
  const forgejo = observation(event, {
    provider: 'forgejo',
    externalObjectId: 'issue:77',
    evidence: 'forgejo-copy'
  });
  store.recordProjectEventObservation({ actor: 'service:github-adapter', traceId: 'trace-gh', observation: github });
  store.recordProjectEventObservation({ actor: 'service:forgejo-adapter', traceId: 'trace-fj', observation: forgejo });

  const ledger = store.getProjectContinuity('axiom-mesh');
  assert.equal(ledger.canonical_event_count, 1);
  assert.equal(ledger.provider_observation_count, 2);
  assert.deepEqual(
    ledger.provider_observations.map(item => item.observation.provider).sort(),
    ['forgejo', 'github']
  );
  assert.equal(ledger.canonical_events[0].event.actor.actor_id, 'actor.project-owner');
  assert.equal(ledger.canonical_events[0].event.event_digest, event.event_digest);
  assert.equal(ledger.provider_observation_grants_authority, false);
});

test('source-bound CI event fails until its exact source state is already retained', async t => {
  const { store } = await storeFixture(t);
  const state = sourceState();
  const ci = projectEvent({
    objectId: 'project-object:ci-clean-kernel-001',
    objectKind: 'ci_check',
    eventKind: 'ci.check_completed',
    text: 'Clean Kernel passed',
    sourceStateDigest: state.state_digest,
    ciOutcome: 'passed'
  });

  assert.throws(
    () => store.recordProjectEvent({
      actor: 'service:ci-adapter',
      traceId: 'trace-ci-before-source',
      event: ci
    }),
    /requires a previously recorded source state/
  );

  store.recordSourceState({
    actor: 'human:source-operator',
    traceId: 'trace-source-record',
    state
  });
  const recorded = store.recordProjectEvent({
    actor: 'service:ci-adapter',
    traceId: 'trace-ci-after-source',
    event: ci
  });
  assert.equal(recorded.event.source_state_digest, state.state_digest);

  const ledger = store.getProjectContinuity('axiom-mesh');
  assert.equal(ledger.source_state_bindings_reverified, true);
  assert.equal(ledger.canonical_events[0].event.ci_outcome, 'passed');
  assert.equal(ledger.portable_event_promotes_capability, false);
});

test('explicit predecessor must exist earlier and belong to the same project object', async t => {
  const { store } = await storeFixture(t);
  const created = projectEvent();
  const updated = projectEvent({
    eventKind: 'issue.updated',
    text: 'Portable issue updated',
    occurredAt: '2026-08-12T12:02:00.000Z',
    previous: created.event_digest
  });

  assert.throws(
    () => store.recordProjectEvent({ actor: 'human:operator', traceId: 'trace-update-early', event: updated }),
    /previously recorded canonical event/
  );
  store.recordProjectEvent({ actor: 'human:operator', traceId: 'trace-create', event: created });
  store.recordProjectEvent({ actor: 'human:operator', traceId: 'trace-update', event: updated });

  const differentObject = projectEvent({
    objectId: 'project-object:issue-002',
    eventKind: 'issue.updated',
    text: 'Different issue update',
    occurredAt: '2026-08-12T12:03:00.000Z',
    previous: created.event_digest
  });
  assert.throws(
    () => store.recordProjectEvent({
      actor: 'human:operator',
      traceId: 'trace-cross-object',
      event: differentObject
    }),
    /different project object/
  );

  const ledger = store.getProjectContinuity('axiom-mesh');
  assert.equal(ledger.canonical_event_count, 2);
  assert.equal(ledger.predecessor_bindings_reverified, true);
  assert.equal(ledger.history_completeness_claimed, false);
});

test('provider observation cannot be recorded before its canonical event', async t => {
  const { store } = await storeFixture(t);
  const event = projectEvent();
  assert.throws(
    () => store.recordProjectEventObservation({
      actor: 'service:provider-adapter',
      traceId: 'trace-orphan-observation',
      observation: observation(event)
    }),
    /requires a previously recorded canonical event/
  );
  assert.equal(store.getProjectContinuity('axiom-mesh').provider_observation_count, 0);
});

test('generic Grid append cannot forge a provider-bearing canonical project event', async t => {
  const { store } = await storeFixture(t);
  const event = projectEvent();
  const forged = {
    ...event,
    provider: 'github'
  };
  store.appendEvents({
    actor: 'human:generic-grid-writer',
    traceId: 'trace-forged-project-event',
    events: [{
      kind: PROJECT_EVENT_RECORDED_EVENT,
      subject: event.event_id,
      payload: { event: forged }
    }]
  });

  assert.throws(
    () => store.getProjectContinuity('axiom-mesh'),
    /unsupported fields: provider/
  );
});

test('generic Grid append cannot forge an orphan provider observation', async t => {
  const { store } = await storeFixture(t);
  const event = projectEvent();
  const observed = observation(event);
  store.appendEvents({
    actor: 'human:generic-grid-writer',
    traceId: 'trace-forged-observation',
    events: [{
      kind: PROJECT_EVENT_OBSERVED_EVENT,
      subject: observed.observation_id,
      payload: { observation: observed }
    }]
  });

  assert.throws(
    () => store.getProjectContinuity('axiom-mesh'),
    /references an unknown or later canonical event/
  );
});

test('replay rejects source-bound project event whose claimed source state was never retained', async t => {
  const { store } = await storeFixture(t);
  const state = sourceState();
  const ci = projectEvent({
    objectId: 'project-object:ci-forged-001',
    objectKind: 'ci_check',
    eventKind: 'ci.check_completed',
    text: 'Forged CI claim',
    sourceStateDigest: state.state_digest,
    ciOutcome: 'passed'
  });
  store.appendEvents({
    actor: 'human:generic-grid-writer',
    traceId: 'trace-forged-source-binding',
    events: [{
      kind: PROJECT_EVENT_RECORDED_EVENT,
      subject: ci.event_id,
      payload: { event: ci }
    }]
  });

  assert.throws(
    () => store.getProjectContinuity('axiom-mesh'),
    /requires a previously recorded source state/
  );
});
