import assert from 'node:assert/strict';
import test from 'node:test';
import { ValidationError } from '../src/lib/canonical.mjs';
import {
  assertDraftCannotAuthorize
} from '../src/lib/ai-provider-invoke.mjs';
import {
  LOCAL_ORGANIZE_MODEL,
  LOCAL_ORGANIZE_PROVIDER_ID,
  buildLocalOrganizeInvoke,
  invokeLocalOrganizeProvider,
  organizeSelectedText
} from '../src/local-organize-provider.mjs';

const SAMPLE = `# Trip notes

## Packing
- passport
- charger

Bring water.
`;

test('local organize provider returns deterministic draft receipt', () => {
  const invoke = buildLocalOrganizeInvoke({
    includedText: SAMPLE,
    purpose: 'owner-local-organize-draft',
    principalId: 'owner.alice'
  });
  const first = invokeLocalOrganizeProvider(invoke, {
    expectedPrincipalId: 'owner.alice'
  });
  const second = invokeLocalOrganizeProvider(invoke, {
    expectedPrincipalId: 'owner.alice'
  });

  assert.equal(first.provider_id, LOCAL_ORGANIZE_PROVIDER_ID);
  assert.equal(first.model, LOCAL_ORGANIZE_MODEL);
  assert.equal(first.draft_only, true);
  assert.equal(first.auto_approve, false);
  assert.equal(first.authority_effect, 'none');
  assert.equal(first.network_effect, 'none');
  assert.equal(first.suggestion.title, 'Trip notes');
  assert.deepEqual([...first.suggestion.headings], ['Trip notes', 'Packing']);
  assert.deepEqual([...first.suggestion.bullets], ['passport', 'charger']);
  assert.match(first.suggestion.summary_text, /Bring water/);
  assert.equal(first.terminal_outcome_digest, second.terminal_outcome_digest);
  assert.equal(first.suggestion_digest, second.suggestion_digest);
  assert.match(first.integrity_vs_truth, /not external-world truth/i);
  assertDraftCannotAuthorize(first);
});

test('organizeSelectedText truncates with explicit bounds', () => {
  const long = `# A\n\n${'word '.repeat(500)}`;
  const suggestion = organizeSelectedText(long, {
    maxInputChars: 40,
    maxOutputChars: 60
  });
  assert.equal(suggestion.truncated, true);
  assert.ok(suggestion.char_count <= 60);
});

test('altered bytes and cross-principal denials fail closed', () => {
  const invoke = buildLocalOrganizeInvoke({
    includedText: SAMPLE,
    purpose: 'owner-local-organize-draft',
    principalId: 'owner.alice'
  });
  const tampered = { ...invoke, included_text: `${SAMPLE}\nTamper` };
  assert.throws(
    () => invokeLocalOrganizeProvider(tampered),
    error => error instanceof ValidationError && /note_digest/i.test(error.message)
  );
  assert.throws(
    () => invokeLocalOrganizeProvider(invoke, { expectedPrincipalId: 'owner.bob' }),
    /cross-principal/
  );
});

test('cancel and timeout paths fail closed without draft authority', () => {
  const invoke = buildLocalOrganizeInvoke({
    includedText: SAMPLE,
    purpose: 'owner-local-organize-draft',
    principalId: 'owner.alice'
  });
  assert.throws(
    () => invokeLocalOrganizeProvider(invoke, { cancelled: true }),
    /cancelled/
  );
  assert.throws(
    () => invokeLocalOrganizeProvider(invoke, { timedOut: true }),
    /timeout/
  );
});

test('draft receipt cannot authorize Mesh effects', () => {
  const receipt = invokeLocalOrganizeProvider(buildLocalOrganizeInvoke({
    includedText: SAMPLE,
    purpose: 'owner-local-organize-draft',
    principalId: 'owner.alice'
  }));
  assert.throws(
    () => assertDraftCannotAuthorize({
      ...receipt,
      grant: { action: 'memory.put' }
    }),
    /cannot be treated as approval or grant/
  );
});
