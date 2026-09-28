import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createHumanPresenter } from '../../apps/axiom-one/presentation.mjs';

const humanContract = JSON.parse(await readFile(
  new URL('../../apps/axiom-one/human-contract.json', import.meta.url),
  'utf8'
));
const appPolicy = JSON.parse(await readFile(
  new URL('../../apps/axiom-one/app-policy.json', import.meta.url),
  'utf8'
));
const presenter = createHumanPresenter(humanContract);

function facts(model) {
  return Object.fromEntries(model.facts.map(item => [item.label, item.value]));
}

test('whole-state: capability projection separates implementation from availability and authority', () => {
  assert.equal(
    typeof presenter.capability,
    'function',
    'Axiom One has no capability-level human projection yet'
  );

  const model = presenter.capability({
    id: 'consent.receipts',
    family: 'identity',
    status: 'implemented',
    summary: 'Purpose- and revocation-bound consent receipts.',
    evidence: ['mesh/test/kernel.test.mjs']
  });
  const visible = facts(model);

  assert.equal(model.schema, 'axiom-one-human-view.v1');
  assert.equal(model.kind, 'capability');
  assert.equal(visible.Implementation, 'Implemented');
  assert.match(visible.Availability, /unknown/i);
  assert.match(visible.Authorization, /unknown/i);
  assert.doesNotMatch(visible.Authorization, /^authorized$/i);
  assert.match(
    model.guidance.join(' '),
    /discovery|implementation.*not.*author|does not.*author/i
  );
});

test('whole-state: current consent state is inspectable without turning it into authority', () => {
  assert.deepEqual(
    {
      route: appPolicy.gateway_routes.includes('consents.list'),
      presenter: typeof presenter.consent
    },
    {
      route: true,
      presenter: 'function'
    },
    'Axiom One does not yet expose the existing owner-scoped consent route and presenter'
  );

  const now = new Date('2026-09-27T12:00:00.000Z');
  const active = presenter.consent({
    consent_id: 'consent_fixture_active',
    subject: 'local-operator',
    controller: 'capsule:education',
    purpose: 'curriculum-personalization',
    scopes_json: ['learning-progress:read'],
    expires_at: '2026-09-28T12:00:00.000Z',
    status: 'active',
    created_at: '2026-09-27T10:00:00.000Z',
    revoked_at: null
  }, now);
  const activeFacts = facts(active);

  assert.equal(active.kind, 'consent');
  assert.equal(active.state, 'active');
  assert.equal(activeFacts.Purpose, 'curriculum-personalization');
  assert.equal(activeFacts.Controller, 'capsule:education');
  assert.equal(activeFacts.Scopes, 'learning-progress:read');
  assert.equal(activeFacts.Expires, '2026-09-28T12:00:00.000Z');
  assert.match(active.guidance.join(' '), /inspect|does not.*grant|not.*authority/i);

  const revoked = presenter.consent({
    consent_id: 'consent_fixture_revoked',
    subject: 'local-operator',
    controller: 'capsule:education',
    purpose: 'curriculum-personalization',
    scopes_json: ['learning-progress:read'],
    expires_at: '2026-09-28T12:00:00.000Z',
    status: 'revoked',
    created_at: '2026-09-27T10:00:00.000Z',
    revoked_at: '2026-09-27T11:00:00.000Z'
  }, now);

  assert.equal(revoked.state, 'revoked');
  assert.match(revoked.guidance.join(' '), /cannot.*author|no longer.*author/i);
});

test('whole-state: audit verification has a bounded non-authorizing human explanation', () => {
  assert.equal(
    appPolicy.gateway_routes.includes('audit.verify'),
    true,
    'Axiom One already exposes the exact audit verification route'
  );
  assert.equal(
    typeof presenter.verification,
    'function',
    'Axiom One exposes audit.verify only as raw Explore data, not a bounded Verify explanation'
  );

  const valid = presenter.verification({
    valid: true,
    events: 7,
    head: 'a'.repeat(64)
  });
  const validFacts = facts(valid);

  assert.equal(valid.kind, 'verification');
  assert.equal(valid.state, 'valid');
  assert.equal(validFacts.Events, '7');
  assert.equal(validFacts.Head, 'a'.repeat(64));
  assert.match(valid.guidance.join(' '), /does not.*author|not.*authority/i);
  assert.match(valid.guidance.join(' '), /truth|external claim/i);

  const invalid = presenter.verification({
    valid: false,
    seq: 4,
    reason: 'signature_mismatch'
  });
  const invalidFacts = facts(invalid);

  assert.equal(invalid.kind, 'verification');
  assert.equal(invalid.state, 'invalid');
  assert.equal(invalidFacts.Sequence, '4');
  assert.equal(invalidFacts.Reason, 'signature_mismatch');
  assert.notEqual(invalid.tone, 'complete');
  assert.match(invalid.guidance.join(' '), /do not.*treat|invalid|repair|inspect/i);
});
