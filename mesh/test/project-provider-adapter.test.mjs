import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { sha256 } from '../src/lib/canonical.mjs';
import { ensureMeshIdentity } from '../src/lib/identity.mjs';
import { loadDataProtector } from '../src/lib/protector.mjs';
import {
  PROJECT_PROVIDER_CAPTURE_SCHEMA,
  adaptProjectProviderCapture
} from '../src/lib/project-provider-adapter.mjs';
import { SOURCE_CONTENT_ADDRESS_PROFILE } from '../src/lib/source-continuity.mjs';
import { ProjectContinuityGridStore } from '../src/grid/project-continuity-store.mjs';

const SOURCE_STATE_DIGEST = 'a'.repeat(64);

function capture(overrides = {}) {
  return {
    schema: PROJECT_PROVIDER_CAPTURE_SCHEMA,
    provider: 'github',
    project_id: 'axiom-mesh',
    project_object_id: 'project-object:issue-001',
    object_kind: 'issue',
    event_kind: 'issue.created',
    occurred_at: '2026-08-12T12:00:00.000Z',
    observed_at: '2026-08-12T12:01:00.000Z',
    external: {
      project_id: 'Zoverions/AXIOM-MESH',
      object_id: 'issue:1012',
      event_id: 'timeline:123',
      revision: '1',
      actor_id: 'github:user-208527039',
      locator: 'https://github.com/Zoverions/AXIOM-MESH/issues/1012',
      semantic_kind: 'issues.opened'
    },
    content: {
      visibility: 'public',
      mode: 'inline_public',
      media_type: 'text/markdown',
      inline_utf8: 'Portable project event'
    },
    source_state_digest: null,
    previous_event_digest: null,
    related_object_ids: [],
    ci_outcome: null,
    actor_binding: null,
    provider_evidence_digest: sha256('github-provider-capture'),
    provider_authenticity_verified: true,
    event_content_reproduced: true,
    unsupported_semantics: [],
    content_address_profile: SOURCE_CONTENT_ADDRESS_PROFILE,
    ...overrides
  };
}

async function storeFixture(t) {
  const dataDir = await mkdtemp(join(tmpdir(), 'axiom-provider-adapter-'));
  const identity = await ensureMeshIdentity(dataDir, 'grid', { create: true });
  const protector = await loadDataProtector({ dataDir, autoBootstrap: true });
  const path = join(dataDir, 'grid.sqlite');
  const store = new ProjectContinuityGridStore({ path, dataDir, identity, protector });
  t.after(async () => {
    store.close();
    await rm(dataDir, { recursive: true, force: true });
  });
  return store;
}

test('provider adaptation keeps provider identity out of the canonical event', () => {
  const result = adaptProjectProviderCapture(capture());
  assert.equal(result.provider, 'github');
  assert.equal(result.canonical_identity_derived_from_provider, false);
  assert.equal(result.network_access_performed, false);
  assert.equal(result.provider_mutation_performed, false);
  assert.equal(result.provider_observation_grants_authority, false);
  assert.equal(result.adaptation_grants_authority, false);

  assert.equal('provider' in result.event, false);
  assert.equal('locator' in result.event, false);
  assert.equal('external_object_id' in result.event, false);
  assert.equal(result.event.project_object_id, 'project-object:issue-001');
  assert.equal(result.observation.provider, 'github');
  assert.equal(result.observation.external_object_id, 'issue:1012');
  assert.equal(result.observation.non_authoritative, true);
});

test('GitHub and Forgejo captures of one logical event produce one canonical event identity', () => {
  const github = adaptProjectProviderCapture(capture());
  const forgejo = adaptProjectProviderCapture(capture({
    provider: 'forgejo',
    external: {
      project_id: 'mesh/axiom',
      object_id: 'issue:77',
      event_id: 'timeline:9',
      revision: 'rev-4',
      actor_id: 'forgejo:user-11',
      locator: 'https://forge.example.invalid/mesh/axiom/issues/77',
      semantic_kind: 'issue.opened'
    },
    provider_evidence_digest: sha256('forgejo-provider-capture')
  }));

  assert.equal(github.event.event_digest, forgejo.event.event_digest);
  assert.equal(github.event.event_id, forgejo.event.event_id);
  assert.notEqual(github.observation.observation_digest, forgejo.observation.observation_digest);
  assert.notEqual(github.adaptation_digest, forgejo.adaptation_digest);
  assert.equal(github.event.project_object_id, forgejo.event.project_object_id);
});

test('changing only provider external object identity never changes canonical project object identity', () => {
  const first = adaptProjectProviderCapture(capture());
  const second = adaptProjectProviderCapture(capture({
    external: {
      ...capture().external,
      object_id: 'issue:9999',
      event_id: 'timeline:9999',
      locator: 'https://github.com/Zoverions/AXIOM-MESH/issues/9999'
    },
    provider_evidence_digest: sha256('same-event-different-provider-location')
  }));
  assert.equal(first.event.project_object_id, 'project-object:issue-001');
  assert.equal(second.event.project_object_id, 'project-object:issue-001');
  assert.equal(first.event.event_digest, second.event.event_digest);
  assert.notEqual(first.observation.observation_digest, second.observation.observation_digest);
});

test('unsupported provider semantics are explicit and cannot silently disappear', () => {
  const complete = adaptProjectProviderCapture(capture());
  const partial = adaptProjectProviderCapture(capture({
    unsupported_semantics: ['github.issue.lock_reason', 'github.timeline.cross_reference']
  }));

  assert.equal(complete.semantics_complete, true);
  assert.deepEqual(complete.unsupported_provider_semantics, []);
  assert.equal(partial.semantics_complete, false);
  assert.deepEqual(partial.unsupported_provider_semantics, [
    'github.issue.lock_reason',
    'github.timeline.cross_reference'
  ]);
  assert.equal(partial.event.event_digest, complete.event.event_digest);
  assert.notEqual(partial.adaptation_digest, complete.adaptation_digest);
});

test('content mode cannot silently discard provider bytes or protected references', () => {
  assert.throws(
    () => adaptProjectProviderCapture(capture({
      content: {
        visibility: 'public',
        mode: 'digest_only',
        media_type: 'text/markdown',
        content_digest: sha256('hidden bytes'),
        byte_length: 12,
        inline_utf8: 'hidden bytes'
      }
    })),
    /cannot carry inline bytes that would be discarded/
  );
  assert.throws(
    () => adaptProjectProviderCapture(capture({
      content: {
        visibility: 'public',
        mode: 'inline_public',
        media_type: 'text/markdown',
        inline_utf8: 'public',
        protected_ref: 'protected:unexpected'
      }
    })),
    /requires only UTF-8 inline text/
  );
  assert.throws(
    () => adaptProjectProviderCapture(capture({
      content: {
        visibility: 'private',
        mode: 'protected_reference',
        media_type: 'application/json',
        content_digest: sha256('private'),
        byte_length: 7
      }
    })),
    /requires an opaque protected reference/
  );
  assert.throws(
    () => adaptProjectProviderCapture(capture({
      content: {
        visibility: 'private',
        mode: 'digest_only',
        media_type: 'application/json',
        content_digest: sha256('private'),
        byte_length: 7,
        protected_ref: 'protected:should-not-be-dropped'
      }
    })),
    /cannot carry a protected reference that would be discarded/
  );
  assert.throws(
    () => adaptProjectProviderCapture(capture({
      content: {
        visibility: 'private',
        mode: 'inline_public',
        media_type: 'text/plain',
        inline_utf8: 'private'
      }
    })),
    /cannot be retained inline/
  );
});

test('provider event occurrence and AXIOM observation time remain distinct and ordered', () => {
  const result = adaptProjectProviderCapture(capture({
    occurred_at: '2026-08-12T12:00:00.000Z',
    observed_at: '2026-08-12T12:05:00.000Z'
  }));
  assert.equal(result.event.occurred_at, '2026-08-12T12:00:00.000Z');
  assert.equal(result.observation.observed_at, '2026-08-12T12:05:00.000Z');

  assert.throws(
    () => adaptProjectProviderCapture(capture({
      occurred_at: '2026-08-12T12:05:00.000Z',
      observed_at: '2026-08-12T12:04:59.000Z'
    })),
    /cannot precede/
  );
});

test('provider evidence booleans must be explicit rather than defaulting to trust or distrust', () => {
  const missingAuthenticity = capture();
  delete missingAuthenticity.provider_authenticity_verified;
  assert.throws(
    () => adaptProjectProviderCapture(missingAuthenticity),
    /provider_authenticity_verified must be a boolean/
  );

  const missingReproduction = capture();
  delete missingReproduction.event_content_reproduced;
  assert.throws(
    () => adaptProjectProviderCapture(missingReproduction),
    /event_content_reproduced must be a boolean/
  );
});

test('external provider actor remains unbound unless a verified AXIOM actor binding is supplied', () => {
  const unbound = adaptProjectProviderCapture(capture());
  assert.equal(unbound.event.actor.actor_id, null);
  assert.equal(unbound.observation.external_actor_id, 'github:user-208527039');
  assert.equal(unbound.actor_identity_bound, false);

  const bindingDigest = sha256('verified-provider-to-actor-binding');
  const bound = adaptProjectProviderCapture(capture({
    actor_binding: {
      actor_id: 'actor.project-owner',
      binding_digest: bindingDigest,
      verified: true
    }
  }));
  assert.equal(bound.event.actor.actor_id, 'actor.project-owner');
  assert.equal(bound.event.actor.actor_binding_digest, bindingDigest);
  assert.equal(bound.observation.actor_binding_verified, true);
  assert.equal(bound.actor_identity_bound, true);

  assert.throws(
    () => adaptProjectProviderCapture(capture({
      actor_binding: {
        actor_id: 'actor.project-owner',
        binding_digest: bindingDigest,
        verified: false
      }
    })),
    /cannot nominate AXIOM actor identity/
  );
  assert.throws(
    () => adaptProjectProviderCapture(capture({
      external: { ...capture().external, actor_id: null },
      actor_binding: {
        actor_id: 'actor.project-owner',
        binding_digest: bindingDigest,
        verified: true
      }
    })),
    /requires the provider external actor id/
  );
});

test('CI provider capture remains evidence only and requires exact source-state binding', () => {
  const ciBase = {
    project_object_id: 'project-object:ci-check-001',
    object_kind: 'ci_check',
    event_kind: 'ci.check_completed',
    external: {
      project_id: 'Zoverions/AXIOM-MESH',
      object_id: 'check-run:31594447350',
      event_id: 'job:verify',
      revision: 'attempt:1',
      actor_id: 'github-actions',
      locator: 'https://github.com/Zoverions/AXIOM-MESH/actions/runs/31594447350',
      semantic_kind: 'checks.completed'
    },
    content: {
      visibility: 'public',
      mode: 'digest_only',
      media_type: 'application/json',
      content_digest: sha256('ci-result'),
      byte_length: 4096
    },
    ci_outcome: 'passed'
  };
  assert.throws(
    () => adaptProjectProviderCapture(capture(ciBase)),
    /requires an exact source-state digest/
  );
  const result = adaptProjectProviderCapture(capture({
    ...ciBase,
    source_state_digest: SOURCE_STATE_DIGEST
  }));
  assert.equal(result.event.source_state_digest, SOURCE_STATE_DIGEST);
  assert.equal(result.event.ci_outcome, 'passed');
  assert.equal(result.event.capability_promotion, false);
  assert.equal(result.event.governance_authority_granted, false);
  assert.equal(result.adaptation_grants_authority, false);
});

test('credentials and unmodeled capture fields fail closed instead of entering adaptation evidence', () => {
  assert.throws(
    () => adaptProjectProviderCapture(capture({ token: 'secret-token' })),
    /unsupported fields: token/
  );
  assert.throws(
    () => adaptProjectProviderCapture(capture({
      external: { ...capture().external, hidden_provider_authority: true }
    })),
    /unsupported fields: hidden_provider_authority/
  );
});

test('adaptation is deterministic and unsupported semantic order is canonicalized', () => {
  const first = adaptProjectProviderCapture(capture({
    unsupported_semantics: ['github.zeta', 'github.alpha']
  }));
  const second = adaptProjectProviderCapture(capture({
    unsupported_semantics: ['github.alpha', 'github.zeta']
  }));
  assert.deepEqual(first, second);
  assert.match(first.adaptation_id, /^project-provider-adaptation:[a-f0-9]{64}$/);
  assert.match(first.adaptation_digest, /^[a-f0-9]{64}$/);
});

test('adapted canonical event and observation feed the M1 Grid boundary unchanged', async t => {
  const store = await storeFixture(t);
  const adapted = adaptProjectProviderCapture(capture());

  store.recordProjectEvent({
    actor: 'service:project-provider-adapter',
    traceId: 'trace-adapted-event',
    event: adapted.event
  });
  store.recordProjectEventObservation({
    actor: 'service:project-provider-adapter',
    traceId: 'trace-adapted-observation',
    observation: adapted.observation
  });

  const ledger = store.getProjectContinuity('axiom-mesh');
  assert.equal(ledger.canonical_event_count, 1);
  assert.equal(ledger.provider_observation_count, 1);
  assert.equal(ledger.canonical_events[0].event.event_digest, adapted.event.event_digest);
  assert.equal(
    ledger.provider_observations[0].observation.observation_digest,
    adapted.observation.observation_digest
  );
  assert.equal(ledger.provider_observation_grants_authority, false);
});
