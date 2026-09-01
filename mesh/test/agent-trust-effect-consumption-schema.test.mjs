import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  AGENT_EFFECT_CONSUMPTION_ACTION,
  AGENT_EFFECT_CONSUMPTION_RECORD_SCHEMA,
  AGENT_EFFECT_CONSUMPTION_STORE_POLICY
} from '../src/lib/agent-trust-effect-consumption.mjs';

const schemaUrl = new URL(
  '../../agent-commons/contracts/agent-effect-consumption-record.v1.schema.json',
  import.meta.url
);

test('effect-consumption JSON Schema stays synchronized with runtime boundary and nonclaims', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));
  assert.equal(schema.properties.schema.const, AGENT_EFFECT_CONSUMPTION_RECORD_SCHEMA);
  const statement = schema.properties.statement.properties;
  assert.equal(statement.action.const, AGENT_EFFECT_CONSUMPTION_ACTION);
  assert.equal(statement.store_policy.const, AGENT_EFFECT_CONSUMPTION_STORE_POLICY);
  assert.equal(statement.state.const, 'consumed');
  assert.equal(statement.consumption_kind.const, 'one-time-pre-effect-consumption');
  assert.equal(statement.consume_before_effect_committed.const, true);
  assert.equal(statement.effect_executed.const, false);
  assert.equal(statement.effect_admission_authorized.const, false);
  assert.equal(statement.resume_after_recovery_allowed.const, false);
  assert.equal(statement.global_currentness_claimed.const, false);
  assert.equal(statement.rollback_detection_scope.const, 'retained-record-digest-required');
  assert.equal(statement.media_durability_claimed.const, false);
  assert.equal(statement.production_persistence_claimed.const, false);
  assert.equal(statement.authority_effect.const, 'none');
  assert.equal(statement.delegation_effect.const, 'none');
});
