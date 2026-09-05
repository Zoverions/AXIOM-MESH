import assert from 'node:assert/strict';
import test from 'node:test';
import { sha256, ValidationError } from '../src/lib/canonical.mjs';
import {
  INTEGRITY_VS_TRUTH,
  LOCAL_ORGANIZE_MODEL,
  LOCAL_ORGANIZE_PROVIDER_ID,
  assertDraftCannotAuthorize,
  buildAiProviderReceipt,
  denyCrossPrincipal,
  validateAiProviderInvoke
} from '../src/lib/ai-provider-invoke.mjs';

function validInvoke(overrides = {}) {
  const included_text = overrides.included_text ?? '# Title\n\n- one\n- two\n\nBody line.';
  const {
    included_text: _ignored,
    note_digest: noteDigestOverride,
    ...rest
  } = overrides;
  return {
    schema: 'axiom-ai-provider-invoke.v0',
    provider_id: LOCAL_ORGANIZE_PROVIDER_ID,
    model: LOCAL_ORGANIZE_MODEL,
    purpose: 'owner-local-organize-draft',
    data_scope: {
      kind: 'owner-selected-note-text',
      max_chars: 8_000
    },
    budget: {
      max_input_chars: 8_000,
      max_output_chars: 4_000,
      max_wall_ms: 10_000
    },
    timeout_ms: 10_000,
    cancel: {
      allowed: true,
      signal: 'owner-abort'
    },
    retention: {
      kind: 'ephemeral-draft',
      persist: false
    },
    included_text,
    note_digest: noteDigestOverride ?? sha256(included_text),
    draft_only: true,
    principal_id: 'owner.alice',
    ...rest,
    included_text,
    note_digest: noteDigestOverride ?? sha256(included_text)
  };
}

function validSuggestion() {
  return {
    title: 'Title',
    headings: ['Title'],
    bullets: ['one', 'two'],
    summary_text: 'Headings (1): Title\nBullets (2):\n- one\n- two\nBody:\nBody line.',
    truncated: false,
    char_count: 64
  };
}

test('valid ai provider invoke PASS', () => {
  const normalized = validateAiProviderInvoke(validInvoke());
  assert.equal(normalized.draft_only, true);
  assert.equal(normalized.provider_id, LOCAL_ORGANIZE_PROVIDER_ID);
  assert.equal(normalized.retention.persist, false);
});

test('missing purpose/scope/budget/timeout/cancel/retention FAIL', () => {
  for (const field of ['purpose', 'data_scope', 'budget', 'timeout_ms', 'cancel', 'retention']) {
    const broken = validInvoke();
    delete broken[field];
    assert.throws(
      () => validateAiProviderInvoke(broken),
      error => error instanceof ValidationError && /missing required field/i.test(error.message)
    );
  }
});

test('altered included_text bytes FAIL note_digest check', () => {
  const invoke = validInvoke();
  invoke.included_text = `${invoke.included_text}\nextra`;
  assert.throws(
    () => validateAiProviderInvoke(invoke),
    /note_digest does not match/
  );
});

test('unknown fields fail closed', () => {
  assert.throws(
    () => validateAiProviderInvoke(validInvoke({ egress: 'openai' })),
    /unknown field/i
  );
  assert.throws(
    () => validateAiProviderInvoke(validInvoke({
      data_scope: {
        kind: 'owner-selected-note-text',
        max_chars: 8_000,
        extra: true
      }
    })),
    /unknown field/i
  );
});

test('draft_only must be true and receipt carries integrity-vs-truth', () => {
  assert.throws(
    () => validateAiProviderInvoke(validInvoke({ draft_only: false })),
    /draft_only must be true/
  );
  const receipt = buildAiProviderReceipt({
    invoke: validInvoke(),
    suggestion: validSuggestion()
  });
  assert.equal(receipt.integrity_vs_truth, INTEGRITY_VS_TRUTH);
  assert.equal(receipt.auto_approve, false);
  assert.equal(receipt.authority_effect, 'none');
  assert.match(receipt.terminal_outcome_digest, /^[a-f0-9]{64}$/);
  assertDraftCannotAuthorize(receipt);
});

test('draft cannot be treated as approval or grant', () => {
  assert.throws(
    () => assertDraftCannotAuthorize({
      draft_only: true,
      auto_approve: false,
      authority_effect: 'none',
      approval: { id: 'x' }
    }),
    /cannot be treated as approval/
  );
  assert.throws(
    () => assertDraftCannotAuthorize({
      draft_only: true,
      auto_approve: true,
      authority_effect: 'none'
    }),
    /cannot auto-approve/
  );
});

test('cross-principal denial', () => {
  assert.throws(
    () => denyCrossPrincipal(validInvoke(), 'owner.bob'),
    /cross-principal/
  );
  const ok = denyCrossPrincipal(validInvoke(), 'owner.alice');
  assert.equal(ok.principal_id, 'owner.alice');
});
