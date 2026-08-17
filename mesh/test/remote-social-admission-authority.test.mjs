import assert from 'node:assert/strict';
import test from 'node:test';

import { intentRequestDigest } from '../src/lib/intent-binding.mjs';
import {
  REMOTE_SOCIAL_ADMISSION_ACTION,
  REMOTE_SOCIAL_ADMISSION_DATA_SCOPE,
  REMOTE_SOCIAL_ADMISSION_INTENT_INPUT_SCHEMA,
  REMOTE_SOCIAL_ADMISSION_PURPOSE,
  assertRemoteSocialAdmissionIntentMatchesStage,
  normalizeRemoteSocialAdmissionIntentInput,
  remoteSocialAdmissionIntentInputFromStage
} from '../src/lib/remote-social-admission-authority.mjs';
import { buildRemoteSocialAdmissionRequest } from '../src/grid/remote-social-admission-store.mjs';

function stageFixture() {
  return {
    owner: 'principal-local-owner',
    stage_id: `remote_stage_${'1'.repeat(64)}`,
    package_digest: '2'.repeat(64),
    exporter_grid_id: 'grid-remote-one',
    exporter_key_id: '3'.repeat(64),
    trust_label: 'manual-review',
    import_plan_json: {
      plan_digest: '4'.repeat(64),
      admitted_objects: {
        persona_projection_digests: ['5'.repeat(64)],
        publication_digests: ['6'.repeat(64)],
        transition_digests: []
      }
    },
    package_json: { private_for_authority_test: true },
    trusted_exporter_json: { public_key: 'not-disclosed-by-intent' }
  };
}

function intentFor(stage, overrides = {}) {
  return {
    action: REMOTE_SOCIAL_ADMISSION_ACTION,
    input: remoteSocialAdmissionIntentInputFromStage(stage),
    purpose: REMOTE_SOCIAL_ADMISSION_PURPOSE,
    data_scopes: [REMOTE_SOCIAL_ADMISSION_DATA_SCOPE],
    principal: { id: stage.owner, kind: 'human' },
    ...overrides
  };
}

test('operator-visible admission input is exact, public-safe and derivable from review summary facts', () => {
  const stage = stageFixture();
  const input = remoteSocialAdmissionIntentInputFromStage(stage);
  assert.deepEqual(input, {
    schema: REMOTE_SOCIAL_ADMISSION_INTENT_INPUT_SCHEMA,
    stage_id: stage.stage_id,
    package_digest: stage.package_digest,
    exporter_grid_id: stage.exporter_grid_id,
    exporter_key_id: stage.exporter_key_id,
    import_plan_digest: stage.import_plan_json.plan_digest,
    trust_label: stage.trust_label
  });
  const serialized = JSON.stringify(input);
  for (const forbidden of [
    'owner',
    'package_json',
    'trusted_exporter_json',
    'public_key',
    'admitted_objects',
    'persona_projection_digests',
    'publication_digests'
  ]) {
    assert.equal(serialized.includes(forbidden), false, `intent input leaked ${forbidden}`);
  }
});

test('runtime admission authority digest is exactly the ordinary intentRequestDigest', () => {
  const stage = stageFixture();
  const intent = intentFor(stage);
  const verified = assertRemoteSocialAdmissionIntentMatchesStage(intent, stage);
  assert.equal(verified.intent_request_digest, intentRequestDigest(intent));
  assert.equal(verified.binding.action, REMOTE_SOCIAL_ADMISSION_ACTION);
  assert.deepEqual(verified.binding.input, intent.input);
  assert.equal(verified.binding.purpose, REMOTE_SOCIAL_ADMISSION_PURPOSE);
  assert.deepEqual(verified.binding.data_scopes, [REMOTE_SOCIAL_ADMISSION_DATA_SCOPE]);
});

test('operator intent digest and resolved staged materialization digest remain distinct commitments', () => {
  const stage = stageFixture();
  const intent = intentFor(stage);
  const intentAuthority = assertRemoteSocialAdmissionIntentMatchesStage(intent, stage);
  const resolvedAdmission = buildRemoteSocialAdmissionRequest(stage);
  assert.notEqual(intentAuthority.intent_request_digest, resolvedAdmission.request_digest);
});

test('every review-plan or exporter summary substitution changes or invalidates runtime authority', () => {
  const base = stageFixture();
  const baseIntent = intentFor(base);
  const baseDigest = assertRemoteSocialAdmissionIntentMatchesStage(baseIntent, base).intent_request_digest;

  const variants = [
    { ...base, stage_id: `remote_stage_${'a'.repeat(64)}` },
    { ...base, package_digest: 'b'.repeat(64) },
    { ...base, exporter_grid_id: 'grid-remote-two' },
    { ...base, exporter_key_id: 'c'.repeat(64) },
    { ...base, trust_label: 'second-review' },
    {
      ...base,
      import_plan_json: { ...base.import_plan_json, plan_digest: 'd'.repeat(64) }
    }
  ];

  for (const variant of variants) {
    const variantIntent = intentFor(variant);
    const variantDigest = assertRemoteSocialAdmissionIntentMatchesStage(
      variantIntent,
      variant
    ).intent_request_digest;
    assert.notEqual(variantDigest, baseDigest);
    assert.throws(
      () => assertRemoteSocialAdmissionIntentMatchesStage(baseIntent, variant),
      /does not match the exact staged review summary/
    );
  }
});

test('admission intent input rejects owner override and hidden or resolved-package fields', () => {
  const stage = stageFixture();
  const base = remoteSocialAdmissionIntentInputFromStage(stage);
  for (const [field, value] of [
    ['owner', stage.owner],
    ['package_json', {}],
    ['trusted_exporter_json', {}],
    ['admitted_objects', stage.import_plan_json.admitted_objects]
  ]) {
    assert.throws(
      () => normalizeRemoteSocialAdmissionIntentInput({ ...base, [field]: value }),
      /fields are invalid/
    );
  }
});

test('admission authority fixes action, purpose and one exact data scope', () => {
  const stage = stageFixture();
  const base = intentFor(stage);
  assert.throws(
    () => assertRemoteSocialAdmissionIntentMatchesStage(
      { ...base, action: 'social.publication.create' },
      stage
    ),
    /action is invalid/
  );
  assert.throws(
    () => assertRemoteSocialAdmissionIntentMatchesStage(
      { ...base, purpose: 'different-purpose' },
      stage
    ),
    /purpose is invalid/
  );
  for (const data_scopes of [
    [],
    ['social:write'],
    [REMOTE_SOCIAL_ADMISSION_DATA_SCOPE, 'social:write']
  ]) {
    assert.throws(
      () => assertRemoteSocialAdmissionIntentMatchesStage(
        { ...base, data_scopes },
        stage
      ),
      /data scope is invalid/
    );
  }
});
