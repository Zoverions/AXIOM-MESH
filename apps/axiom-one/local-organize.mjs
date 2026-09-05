/**
 * Browser-safe deterministic local organizer for AXIOM One draft suggestions.
 * Pure text algorithm lives in mesh/src/lib/local-organize-text.mjs (shared).
 * Mesh-side contract + receipts live in
 * mesh/src/lib/ai-provider-invoke.mjs and mesh/src/local-organize-provider.mjs.
 */

export { organizeSelectedText } from '../../mesh/src/lib/local-organize-text.mjs';
import { organizeSelectedText } from '../../mesh/src/lib/local-organize-text.mjs';

export const LOCAL_ORGANIZE_PROVIDER_ID = 'local.organize.v0';
export const LOCAL_ORGANIZE_MODEL = 'deterministic-organize-v0';
export const INTEGRITY_VS_TRUTH =
  'Receipt integrity is not external-world truth. Draft suggestions are not verified facts and never authorize Mesh effects.';

const DEFAULT_MAX_INPUT = 8_000;
const DEFAULT_MAX_OUTPUT = 4_000;

export async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Build a browser-facing draft card model. Not a Mesh grant or intent result.
 */
export async function buildBrowserOrganizeDraft({
  includedText,
  purpose = 'owner-local-organize-draft',
  principalId = 'local-owner',
  maxInputChars = DEFAULT_MAX_INPUT,
  maxOutputChars = DEFAULT_MAX_OUTPUT,
  timeoutMs = 10_000
} = {}) {
  if (typeof includedText !== 'string' || includedText.length < 1) {
    throw new TypeError('includedText is required');
  }
  const suggestion = organizeSelectedText(includedText, { maxInputChars, maxOutputChars });
  const noteDigest = await sha256Hex(includedText);
  return Object.freeze({
    provider_id: LOCAL_ORGANIZE_PROVIDER_ID,
    model: LOCAL_ORGANIZE_MODEL,
    purpose,
    principal_id: principalId,
    draft_only: true,
    data_scope: Object.freeze({
      kind: 'owner-selected-note-text',
      max_chars: maxInputChars
    }),
    budget: Object.freeze({
      max_input_chars: maxInputChars,
      max_output_chars: maxOutputChars,
      max_wall_ms: timeoutMs
    }),
    timeout_ms: timeoutMs,
    cancel: Object.freeze({ allowed: true, signal: 'owner-abort' }),
    retention: Object.freeze({ kind: 'ephemeral-draft', persist: false }),
    note_digest: noteDigest,
    suggestion,
    integrity_vs_truth: INTEGRITY_VS_TRUTH,
    authority_effect: 'none',
    auto_approve: false,
    network_effect: 'none',
    mesh_intent_submitted: false
  });
}