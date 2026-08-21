import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const policyUrl = new URL('../config/circle-member-eligibility-lifecycle.v0.json', import.meta.url);
const sourceUrl = new URL('../../packages/axiom-circle-member-eligibility/index.mjs', import.meta.url);

const RESTRICTION_EVENTS = new Set([
  'membership-suspend',
  'membership-revoke',
  'membership-exit',
  'role-narrow'
]);

test('Circle eligibility v0 event inventory can only preserve or reduce eligibility', async () => {
  const policy = JSON.parse(await readFile(policyUrl, 'utf8'));
  assert.deepEqual(new Set(policy.event_kinds), RESTRICTION_EVENTS);
  assert.equal(policy.event_kinds.length, RESTRICTION_EVENTS.size);
  assert.equal(policy.requirements.status_changes_are_monotonic_restrictions, true);
  assert.equal(policy.requirements.membership_resume_supported, false);
  assert.equal(policy.requirements.role_widening_supported, false);
  assert.equal(policy.requirements.role_narrowing_only, true);

  for (const forbidden of [
    'membership-resume',
    'membership-reactivate',
    'role-add',
    'role-grant',
    'role-restore',
    'role-widen'
  ]) assert.equal(policy.event_kinds.includes(forbidden), false, `eligibility-widening event leaked into v0: ${forbidden}`);
});

test('implementation has no transition that restores suspended or terminal membership', async () => {
  const source = await readFile(sourceUrl, 'utf8');
  assert.doesNotMatch(source, /event\.kind\s*===\s*['"]membership-resume['"]/);
  assert.doesNotMatch(source, /state\s*=\s*\{[^}]*status:\s*['"]active['"][^}]*\}/s);
  assert.ok(source.includes('Circle member eligibility terminal state is irreversible'));
  assert.ok(source.includes('Circle role narrowing cannot add or substitute roles'));
});
