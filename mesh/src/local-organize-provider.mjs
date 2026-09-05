import { sha256, ValidationError } from './lib/canonical.mjs';
import {
  LOCAL_ORGANIZE_MODEL,
  LOCAL_ORGANIZE_PROVIDER_ID,
  assertDraftCannotAuthorize,
  buildAiProviderReceipt,
  denyCrossPrincipal,
  validateAiProviderInvoke
} from './lib/ai-provider-invoke.mjs';
import { organizeSelectedText } from '../../apps/axiom-one/local-organize.mjs';

export {
  LOCAL_ORGANIZE_MODEL,
  LOCAL_ORGANIZE_PROVIDER_ID,
  organizeSelectedText
};

/**
 * Local, deterministic, no-network organize/summarize provider stub.
 * Returns a draft suggestion receipt. Never auto-approves Mesh effects.
 */
export function invokeLocalOrganizeProvider(request, {
  expectedPrincipalId = null,
  cancelled = false,
  timedOut = false
} = {}) {
  if (cancelled) {
    throw new ValidationError('local organize invoke cancelled by owner signal');
  }
  if (timedOut) {
    throw new ValidationError('local organize invoke exceeded timeout_ms');
  }

  const invoke = expectedPrincipalId
    ? denyCrossPrincipal(request, expectedPrincipalId)
    : validateAiProviderInvoke(request);

  if (invoke.provider_id !== LOCAL_ORGANIZE_PROVIDER_ID) {
    throw new ValidationError(`provider_id must be ${LOCAL_ORGANIZE_PROVIDER_ID}`);
  }
  if (invoke.model !== LOCAL_ORGANIZE_MODEL) {
    throw new ValidationError(`model must be ${LOCAL_ORGANIZE_MODEL}`);
  }

  const suggestion = organizeSelectedText(invoke.included_text, {
    maxInputChars: invoke.budget.max_input_chars,
    maxOutputChars: invoke.budget.max_output_chars
  });

  const receipt = buildAiProviderReceipt({
    invoke,
    suggestion,
    terminal_status: 'completed'
  });
  assertDraftCannotAuthorize(receipt);
  return receipt;
}

export function buildLocalOrganizeInvoke({
  includedText,
  purpose,
  principalId,
  maxInputChars = 8_000,
  maxOutputChars = 4_000,
  timeoutMs = 10_000
}) {
  return {
    schema: 'axiom-ai-provider-invoke.v0',
    provider_id: LOCAL_ORGANIZE_PROVIDER_ID,
    model: LOCAL_ORGANIZE_MODEL,
    purpose,
    data_scope: {
      kind: 'owner-selected-note-text',
      max_chars: maxInputChars
    },
    budget: {
      max_input_chars: maxInputChars,
      max_output_chars: maxOutputChars,
      max_wall_ms: timeoutMs
    },
    timeout_ms: timeoutMs,
    cancel: {
      allowed: true,
      signal: 'owner-abort'
    },
    retention: {
      kind: 'ephemeral-draft',
      persist: false
    },
    included_text: includedText,
    note_digest: sha256(includedText),
    draft_only: true,
    principal_id: principalId
  };
}
