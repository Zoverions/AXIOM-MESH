import assert from 'node:assert/strict';
import test from 'node:test';

import { sha256 } from '../src/lib/canonical.mjs';
import { SOURCE_CONTENT_ADDRESS_PROFILE } from '../src/lib/source-continuity.mjs';
import {
  PROJECT_EVENT_OBSERVATION_SCHEMA,
  PROJECT_EVENT_SCHEMA,
  assertProjectEventObservationMatchesEvent,
  normalizeProjectEvent,
  normalizeProjectEventObservation
} from '../src/lib/project-continuity-events.mjs';

const SOURCE_STATE = 'a'.repeat(64);

function digestContent(text) {
  const bytes = Buffer.from(text, 'utf8');
  return {
    content_digest: sha256(bytes),
    byte_length: bytes.length
  };
}

function event(overrides = {}) {
  const text = 'Portable issue content';
  return normalizeProjectEvent({
    schema: PROJECT_EVENT_SCHEMA,
    project_id: 'axiom-mesh',
    project_object_id: 'project-object:issue-portable-001',
    object_kind: 'issue',
    event_kind: 'issue.created',
    occurred_at: '2026-08-12T12:00:00.000Z',
    time_assurance: 'provider_reported',
    actor: {
      actor_id: null,
      actor_binding_digest: null
    },
    content: {
      visibility: 'public',
      mode: 'inline_public',
      media_type: 'text/markdown',
      ...digestContent(text),
      inline_utf8: text
    },
    source_state_digest: null,
    previous_event_digest: null,
    related_object_ids: [],
    ci_outcome: null,
    governance_authority_granted: false,
    capability_promotion: false,
    content_address_profile: SOURCE_CONTENT_ADDRESS_PROFILE,
    ...overrides
  });
}

function observation(canonical, overrides = {}) {
  return normalizeProjectEventObservation({
    schema: PROJECT_EVENT_OBSERVATION_SCHEMA,
    project_id: canonical.project_id,
    event_digest: canonical.event_digest,
    provider: 'github',
    external_project_id: 'Zoverions/AXIOM-MESH',
    external_object_id: 'issue:1012',
    external_event_id: 'timeline:123',
    external_revision: 'rev:1',
    external_actor_id: 'github-user:208527039',
    actor_binding_digest: null,
    actor_binding_verified: false,
    locator: 'https://github.com/Zoverions/AXIOM-MESH/issues/1012',
    provider_evidence_digest: sha256('github-api-response-1012'),
    provider_authenticity_verified: true,
    event_content_reproduced: true,
    observed_at: '2026-08-12T12:01:00.000Z',
    non_authoritative: true,
    content_address_profile: SOURCE_CONTENT_ADDRESS_PROFILE,
    ...overrides
  });
}

test('canonical project event contains no forge identity and is content-addressed', () => {
  const canonical = event();
  assert.match(canonical.event_id, /^project-event:[a-f0-9]{64}$/);
  assert.match(canonical.event_digest, /^[a-f0-9]{64}$/);
  assert.equal('provider' in canonical, false);
  assert.equal('locator' in canonical, false);
  assert.equal('external_object_id' in canonical, false);
  assert.equal(canonical.governance_authority_granted, false);
  assert.equal(canonical.capability_promotion, false);
});

test('GitHub and Forgejo can observe one canonical event without becoming its identity', () => {
  const canonical = event();
  const github = observation(canonical);
  const forgejo = observation(canonical, {
    provider: 'forgejo',
    external_project_id: 'mesh/axiom',
    external_object_id: 'issue:77',
    external_event_id: 'timeline:9',
    external_revision: 'r2',
    locator: 'https://forge.example.invalid/mesh/axiom/issues/77',
    provider_evidence_digest: sha256('forgejo-observation')
  });

  assert.equal(github.event_digest, canonical.event_digest);
  assert.equal(forgejo.event_digest, canonical.event_digest);
  assert.notEqual(github.observation_digest, forgejo.observation_digest);
  assert.equal(github.non_authoritative, true);
  assert.equal(forgejo.non_authoritative, true);
  assert.deepEqual(assertProjectEventObservationMatchesEvent(github, canonical).event, canonical);
  assert.deepEqual(assertProjectEventObservationMatchesEvent(forgejo, canonical).event, canonical);
});

test('provider fields cannot be laundered into canonical project identity', () => {
  assert.throws(
    () => event({ provider: 'github' }),
    /unsupported fields: provider/
  );
  assert.throws(
    () => event({ locator: 'https://github.com/example/repository/issues/1' }),
    /unsupported fields: locator/
  );
  assert.throws(
    () => event({ external_object_id: '1' }),
    /unsupported fields: external_object_id/
  );
});

test('external account identity cannot become AXIOM actor identity without a binding', () => {
  assert.throws(
    () => event({
      actor: { actor_id: 'actor.alice', actor_binding_digest: null }
    }),
    /requires an explicit actor binding digest/
  );

  const bound = event({
    actor: {
      actor_id: 'actor.alice',
      actor_binding_digest: sha256('verified-github-to-actor-alice-binding')
    }
  });
  assert.equal(bound.actor.actor_id, 'actor.alice');
  assert.match(bound.actor.actor_binding_digest, /^[a-f0-9]{64}$/);
});

test('provider actor observation stays external unless a separate binding is verified', () => {
  const canonical = event();
  const unbound = observation(canonical);
  assert.equal(unbound.external_actor_id, 'github-user:208527039');
  assert.equal(unbound.actor_binding_verified, false);
  assert.equal(unbound.actor_binding_digest, null);

  assert.throws(
    () => observation(canonical, {
      actor_binding_verified: true,
      actor_binding_digest: null
    }),
    /requires external actor id and binding digest/
  );
  assert.throws(
    () => observation(canonical, {
      actor_binding_verified: false,
      actor_binding_digest: sha256('unverified-binding')
    }),
    /cannot carry a trusted actor binding digest/
  );

  const bound = observation(canonical, {
    actor_binding_verified: true,
    actor_binding_digest: sha256('verified-provider-actor-binding')
  });
  assert.equal(bound.actor_binding_verified, true);
});

test('private and sensitive project content cannot be retained inline', () => {
  const secret = 'private security review detail';
  assert.throws(
    () => event({
      content: {
        visibility: 'sensitive',
        mode: 'inline_public',
        media_type: 'text/markdown',
        ...digestContent(secret),
        inline_utf8: secret
      }
    }),
    /cannot be retained inline/
  );

  const protectedEvent = event({
    content: {
      visibility: 'sensitive',
      mode: 'protected_reference',
      media_type: 'application/json',
      ...digestContent(secret),
      protected_ref: 'protected:security-finding-blob-001'
    }
  });
  assert.equal(protectedEvent.content.inline_utf8, null);
  assert.equal(protectedEvent.content.protected_ref, 'protected:security-finding-blob-001');

  assert.throws(
    () => event({
      content: {
        visibility: 'private',
        mode: 'protected_reference',
        media_type: 'application/json',
        ...digestContent(secret),
        protected_ref: 'https://storage.example.invalid/private/object'
      }
    }),
    /invalid format/
  );
});

test('inline public content must exactly match its byte commitment', () => {
  const canonical = event();
  assert.equal(canonical.content.inline_utf8, 'Portable issue content');
  assert.throws(
    () => event({
      content: {
        visibility: 'public',
        mode: 'inline_public',
        media_type: 'text/markdown',
        content_digest: sha256('different bytes'),
        byte_length: Buffer.byteLength('Portable issue content'),
        inline_utf8: 'Portable issue content'
      }
    }),
    /does not match its byte commitment/
  );
});

test('CI, release, merge, and artifact publication require exact source-state binding', () => {
  const cases = [
    ['ci_check', 'ci.check_completed', 'passed'],
    ['release', 'release.published', null],
    ['change_proposal', 'change_proposal.merged', null],
    ['artifact', 'artifact.published', null]
  ];
  for (const [objectKind, eventKind, outcome] of cases) {
    assert.throws(
      () => event({
        project_object_id: `project-object:${objectKind}-001`,
        object_kind: objectKind,
        event_kind: eventKind,
        ci_outcome: outcome,
        source_state_digest: null
      }),
      /requires an exact source-state digest/
    );
    const bound = event({
      project_object_id: `project-object:${objectKind}-001`,
      object_kind: objectKind,
      event_kind: eventKind,
      ci_outcome: outcome,
      source_state_digest: SOURCE_STATE
    });
    assert.equal(bound.source_state_digest, SOURCE_STATE);
  }
});

test('CI outcome is portable evidence but never promotion authority', () => {
  const ci = event({
    project_object_id: 'project-object:ci-check-001',
    object_kind: 'ci_check',
    event_kind: 'ci.check_completed',
    ci_outcome: 'passed',
    source_state_digest: SOURCE_STATE,
    content: {
      visibility: 'public',
      mode: 'digest_only',
      media_type: 'application/json',
      content_digest: sha256('ci-result-evidence'),
      byte_length: 4096
    }
  });
  assert.equal(ci.ci_outcome, 'passed');
  assert.equal(ci.capability_promotion, false);
  assert.equal(ci.governance_authority_granted, false);

  assert.throws(
    () => event({ ci_outcome: 'passed' }),
    /valid only for CI completion events/
  );
  assert.throws(
    () => event({
      project_object_id: 'project-object:ci-check-002',
      object_kind: 'ci_check',
      event_kind: 'ci.check_completed',
      ci_outcome: 'success-with-authority',
      source_state_digest: SOURCE_STATE
    }),
    /supported outcome/
  );
});

test('object/event semantic mismatch and authority flags fail closed', () => {
  assert.throws(
    () => event({ object_kind: 'release' }),
    /object kind does not match event kind/
  );
  assert.throws(
    () => event({ governance_authority_granted: true }),
    /cannot itself grant governance authority/
  );
  assert.throws(
    () => event({ capability_promotion: true }),
    /cannot itself grant governance authority or promote capability/
  );
});

test('observation substitution cannot change which canonical event it proves', () => {
  const first = event();
  const second = event({
    project_object_id: 'project-object:issue-portable-002',
    content: {
      visibility: 'public',
      mode: 'digest_only',
      media_type: 'text/markdown',
      content_digest: sha256('other issue'),
      byte_length: 11
    }
  });
  const observed = observation(first);
  assert.throws(
    () => assertProjectEventObservationMatchesEvent(observed, second),
    /bound to a different canonical event/
  );
});

test('content addresses reject event and observation tampering after re-use of ids', () => {
  const canonical = event();
  const forgedEvent = structuredClone(canonical);
  forgedEvent.content.content_digest = sha256('forged');
  assert.throws(
    () => normalizeProjectEvent(forgedEvent),
    /digest does not match canonical content|does not match its byte commitment/
  );

  const observed = observation(canonical);
  const forgedObservation = structuredClone(observed);
  forgedObservation.provider_authenticity_verified = false;
  assert.throws(
    () => normalizeProjectEventObservation(forgedObservation),
    /digest does not match canonical content/
  );
});
