import {
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject,
  sha256
} from './canonical.mjs';

export const AI_PROVIDER_INVOKE_SCHEMA = 'axiom-ai-provider-invoke.v0';
export const AI_PROVIDER_RECEIPT_SCHEMA = 'axiom-ai-provider-receipt.v0';
export const LOCAL_ORGANIZE_PROVIDER_ID = 'local.organize.v0';
export const LOCAL_ORGANIZE_MODEL = 'deterministic-organize-v0';

export const INTEGRITY_VS_TRUTH =
  'Receipt integrity is not external-world truth. Draft suggestions are not verified facts and never authorize Mesh effects.';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const PURPOSE = /^[A-Za-z0-9][A-Za-z0-9 _.:-]{0,511}$/;

const INVOKE_KEYS = Object.freeze([
  'schema',
  'provider_id',
  'model',
  'purpose',
  'data_scope',
  'budget',
  'timeout_ms',
  'cancel',
  'retention',
  'included_text',
  'note_digest',
  'draft_only',
  'principal_id'
]);

const DATA_SCOPE_KEYS = Object.freeze([
  'kind',
  'max_chars'
]);

const BUDGET_KEYS = Object.freeze([
  'max_input_chars',
  'max_output_chars',
  'max_wall_ms'
]);

const CANCEL_KEYS = Object.freeze([
  'allowed',
  'signal'
]);

const RETENTION_KEYS = Object.freeze([
  'kind',
  'persist'
]);

function assertExactKeys(value, allowed, name) {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) {
      throw new ValidationError(`${name} contains unknown field: ${key}`);
    }
  }
  for (const key of allowed) {
    if (!Object.hasOwn(value, key)) {
      throw new ValidationError(`${name} is missing required field: ${key}`);
    }
  }
}

function assertPositiveInteger(value, name, max) {
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new ValidationError(`${name} must be an integer from 1 to ${max}`);
  }
  return value;
}

function assertDigest(value, name) {
  return assertString(value, name, { min: 64, max: 64, pattern: DIGEST });
}

/**
 * Fail-closed validation for the AI provider invoke envelope.
 * Unknown fields, missing purpose/scope/budget/timeout/cancel/retention,
 * draft_only !== true, or note_digest mismatch all deny.
 */
export function validateAiProviderInvoke(request) {
  const value = assertPlainObject(request, 'ai provider invoke');
  assertExactKeys(value, INVOKE_KEYS, 'ai provider invoke');

  if (value.schema !== AI_PROVIDER_INVOKE_SCHEMA) {
    throw new ValidationError(`ai provider invoke schema must be ${AI_PROVIDER_INVOKE_SCHEMA}`);
  }

  const providerId = assertString(value.provider_id, 'provider_id', {
    max: 160,
    pattern: IDENTIFIER
  });
  const model = assertString(value.model, 'model', {
    max: 160,
    pattern: IDENTIFIER
  });
  const purpose = assertString(value.purpose, 'purpose', {
    max: 512,
    pattern: PURPOSE
  });
  const principalId = assertString(value.principal_id, 'principal_id', {
    max: 160,
    pattern: IDENTIFIER
  });

  if (value.draft_only !== true) {
    throw new ValidationError('ai provider invoke draft_only must be true');
  }

  const dataScope = assertPlainObject(value.data_scope, 'data_scope');
  assertExactKeys(dataScope, DATA_SCOPE_KEYS, 'data_scope');
  if (dataScope.kind !== 'owner-selected-note-text') {
    throw new ValidationError('data_scope.kind must be owner-selected-note-text');
  }
  const maxChars = assertPositiveInteger(dataScope.max_chars, 'data_scope.max_chars', 100_000);

  const budget = assertPlainObject(value.budget, 'budget');
  assertExactKeys(budget, BUDGET_KEYS, 'budget');
  const maxInputChars = assertPositiveInteger(budget.max_input_chars, 'budget.max_input_chars', 100_000);
  const maxOutputChars = assertPositiveInteger(budget.max_output_chars, 'budget.max_output_chars', 100_000);
  const maxWallMs = assertPositiveInteger(budget.max_wall_ms, 'budget.max_wall_ms', 600_000);
  if (maxInputChars > maxChars) {
    throw new ValidationError('budget.max_input_chars cannot exceed data_scope.max_chars');
  }

  const timeoutMs = assertPositiveInteger(value.timeout_ms, 'timeout_ms', 600_000);
  if (timeoutMs > maxWallMs) {
    throw new ValidationError('timeout_ms cannot exceed budget.max_wall_ms');
  }

  const cancel = assertPlainObject(value.cancel, 'cancel');
  assertExactKeys(cancel, CANCEL_KEYS, 'cancel');
  if (cancel.allowed !== true) {
    throw new ValidationError('cancel.allowed must be true');
  }
  assertString(cancel.signal, 'cancel.signal', { max: 64, pattern: IDENTIFIER });

  const retention = assertPlainObject(value.retention, 'retention');
  assertExactKeys(retention, RETENTION_KEYS, 'retention');
  if (retention.kind !== 'ephemeral-draft') {
    throw new ValidationError('retention.kind must be ephemeral-draft');
  }
  if (retention.persist !== false) {
    throw new ValidationError('retention.persist must be false');
  }

  const includedText = assertString(value.included_text, 'included_text', {
    min: 1,
    max: maxInputChars
  });
  if (includedText.length > maxChars) {
    throw new ValidationError('included_text exceeds data_scope.max_chars');
  }

  const noteDigest = assertDigest(value.note_digest, 'note_digest');
  const computed = sha256(includedText);
  if (noteDigest !== computed) {
    throw new ValidationError('note_digest does not match included_text bytes');
  }

  return Object.freeze({
    schema: AI_PROVIDER_INVOKE_SCHEMA,
    provider_id: providerId,
    model,
    purpose,
    data_scope: Object.freeze({ kind: dataScope.kind, max_chars: maxChars }),
    budget: Object.freeze({
      max_input_chars: maxInputChars,
      max_output_chars: maxOutputChars,
      max_wall_ms: maxWallMs
    }),
    timeout_ms: timeoutMs,
    cancel: Object.freeze({ allowed: true, signal: cancel.signal }),
    retention: Object.freeze({ kind: 'ephemeral-draft', persist: false }),
    included_text: includedText,
    note_digest: noteDigest,
    draft_only: true,
    principal_id: principalId
  });
}

export function buildAiProviderReceipt({
  invoke,
  suggestion,
  terminal_status = 'completed'
}) {
  const normalized = validateAiProviderInvoke(invoke);
  const draft = assertPlainObject(suggestion, 'suggestion');
  assertExactKeys(draft, [
    'title',
    'headings',
    'bullets',
    'summary_text',
    'truncated',
    'char_count'
  ], 'suggestion');

  if (typeof draft.title !== 'string' || draft.title.length > 200) {
    throw new ValidationError('suggestion.title is invalid');
  }
  if (!Array.isArray(draft.headings) || draft.headings.some(item => typeof item !== 'string')) {
    throw new ValidationError('suggestion.headings is invalid');
  }
  if (!Array.isArray(draft.bullets) || draft.bullets.some(item => typeof item !== 'string')) {
    throw new ValidationError('suggestion.bullets is invalid');
  }
  assertString(draft.summary_text, 'suggestion.summary_text', { min: 1, max: normalized.budget.max_output_chars });
  if (typeof draft.truncated !== 'boolean') {
    throw new ValidationError('suggestion.truncated must be boolean');
  }
  if (!Number.isInteger(draft.char_count) || draft.char_count < 0) {
    throw new ValidationError('suggestion.char_count is invalid');
  }

  if (!['completed', 'cancelled', 'timeout', 'denied'].includes(terminal_status)) {
    throw new ValidationError('terminal_status is invalid');
  }

  const suggestionDigest = digestObject({
    title: draft.title,
    headings: draft.headings,
    bullets: draft.bullets,
    summary_text: draft.summary_text,
    truncated: draft.truncated,
    char_count: draft.char_count
  });

  const unsigned = {
    schema: AI_PROVIDER_RECEIPT_SCHEMA,
    provider_id: normalized.provider_id,
    model: normalized.model,
    purpose: normalized.purpose,
    data_scope: normalized.data_scope,
    budget: normalized.budget,
    timeout_ms: normalized.timeout_ms,
    cancel: normalized.cancel,
    retention: normalized.retention,
    draft_only: true,
    principal_id: normalized.principal_id,
    note_digest: normalized.note_digest,
    suggestion: {
      title: draft.title,
      headings: [...draft.headings],
      bullets: [...draft.bullets],
      summary_text: draft.summary_text,
      truncated: draft.truncated,
      char_count: draft.char_count
    },
    suggestion_digest: suggestionDigest,
    terminal_status,
    integrity_vs_truth: INTEGRITY_VS_TRUTH,
    authority_effect: 'none',
    auto_approve: false,
    network_effect: 'none'
  };

  const terminalOutcomeDigest = digestObject(unsigned);
  return Object.freeze({
    ...unsigned,
    suggestion: Object.freeze({
      ...unsigned.suggestion,
      headings: Object.freeze([...unsigned.suggestion.headings]),
      bullets: Object.freeze([...unsigned.suggestion.bullets])
    }),
    data_scope: Object.freeze({ ...unsigned.data_scope }),
    budget: Object.freeze({ ...unsigned.budget }),
    cancel: Object.freeze({ ...unsigned.cancel }),
    retention: Object.freeze({ ...unsigned.retention }),
    terminal_outcome_digest: terminalOutcomeDigest
  });
}

/**
 * Draft suggestions must never be interpreted as Mesh approvals or grants.
 */
export function assertDraftCannotAuthorize(receiptOrDraft) {
  const value = assertPlainObject(receiptOrDraft, 'draft or receipt');
  if (value.auto_approve === true) {
    throw new ValidationError('draft cannot auto-approve Mesh effects');
  }
  if (value.authority_effect && value.authority_effect !== 'none') {
    throw new ValidationError('draft cannot carry Mesh authority_effect');
  }
  if (value.draft_only !== true) {
    throw new ValidationError('non-draft provider output cannot authorize effects');
  }
  if (
    value.approval
    || value.grant
    || value.capability_grant
    || value.authorized === true
    || value.mesh_effect
  ) {
    throw new ValidationError('draft cannot be treated as approval or grant');
  }
  return true;
}

export function denyCrossPrincipal(invoke, expectedPrincipalId) {
  const normalized = validateAiProviderInvoke(invoke);
  const expected = assertString(expectedPrincipalId, 'expected principal_id', {
    max: 160,
    pattern: IDENTIFIER
  });
  if (normalized.principal_id !== expected) {
    throw new ValidationError('cross-principal ai provider invoke denied');
  }
  return normalized;
}

export function aiProviderInvokeDigest(request) {
  return digestObject(validateAiProviderInvoke(request));
}
