import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validateKeyLifecycleEvent } from '../src/lib/key-lifecycle-event.mjs';

const exampleUrl = new URL('../../agent-commons/examples/key-lifecycle-event.v1.json', import.meta.url);
const lifecycleProfileUrl = new URL('../../agent-commons/key-lifecycle-profile.v1.json', import.meta.url);

test('key lifecycle evidence is purpose-bound and non-authoritative', async () => {
  const event = JSON.parse(await readFile(exampleUrl, 'utf8'));
  const result = validateKeyLifecycleEvent(event);
  assert.equal(result.valid, true);
  assert.equal(result.transition, 'active->rotating');
  assert.equal(result.key_purpose, 'signing');
  assert.equal(result.authority_effect, 'none');
});

test('key lifecycle evidence cannot embed secret material', async () => {
  const event = JSON.parse(await readFile(exampleUrl, 'utf8'));
  event.secret_material_present = true;
  assert.throws(() => validateKeyLifecycleEvent(event), /never embed secret material/);
});

test('unsupported lifecycle shortcuts fail closed', async () => {
  const event = JSON.parse(await readFile(exampleUrl, 'utf8'));
  event.from_state = 'generated';
  event.to_state = 'active';
  assert.throws(() => validateKeyLifecycleEvent(event), /transition is not allowed/);
});

test('offline activation cannot bypass required external key status', async () => {
  const event = JSON.parse(await readFile(exampleUrl, 'utf8'));
  event.from_state = 'staged';
  event.to_state = 'active';
  event.offline_context.fresh_external_status_required = true;
  event.offline_context.fresh_external_status_satisfied = false;
  assert.throws(() => validateKeyLifecycleEvent(event), /requires satisfied external status/);
});

test('cryptographic profile keeps primitives separate from authority', async () => {
  const profile = JSON.parse(await readFile(
    new URL('../../agent-commons/cryptographic-protection-profile.v1.json', import.meta.url),
    'utf8'
  ));
  assert.ok(profile.current_compatible_profiles.length >= 4);
  assert.ok(profile.current_compatible_profiles.every(({ authority_effect }) => authority_effect === 'none'));
  assert.ok(profile.key_separation_rules.includes('signing keys are not data-encryption keys'));
});

test('key lifecycle limitations must contain only bounded strings', async () => {
  const event = JSON.parse(await readFile(exampleUrl, 'utf8'));
  event.limitations = [42];
  assert.throws(() => validateKeyLifecycleEvent(event), /limitations/);

  event.limitations = ['x'.repeat(513)];
  assert.throws(() => validateKeyLifecycleEvent(event), /limitations/);
});

test('key lifecycle limitations have a bounded item count', async () => {
  const event = JSON.parse(await readFile(exampleUrl, 'utf8'));
  event.limitations = Array.from({ length: 65 }, (_, index) => `limitation-${index}`);
  assert.throws(() => validateKeyLifecycleEvent(event), /limitations/);
});

test('key lifecycle profile fixes the canonical state and transition graph', async () => {
  const profile = JSON.parse(await readFile(lifecycleProfileUrl, 'utf8'));
  assert.equal(profile.schema, 'axiom-key-lifecycle-profile.v1');
  assert.deepEqual(profile.states, [
    'generated',
    'staged',
    'active',
    'rotating',
    'retired',
    'compromised',
    'recovery_only',
    'destroyed'
  ]);
  assert.deepEqual(profile.transitions, [
    ['generated', 'staged'],
    ['staged', 'active'],
    ['active', 'rotating'],
    ['rotating', 'retired'],
    ['active', 'compromised'],
    ['retired', 'compromised'],
    ['generated', 'destroyed'],
    ['staged', 'destroyed'],
    ['retired', 'destroyed'],
    ['compromised', 'destroyed'],
    ['retired', 'recovery_only'],
    ['recovery_only', 'destroyed']
  ]);
  assert.equal(
    profile.transitions.some(([from, to]) => from === 'generated' && to === 'active'),
    false
  );
});
