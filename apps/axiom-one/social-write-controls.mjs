/**
 * AXIOM One — Social write controls (LAB-GRADE, review-only).
 *
 * This module may explain and freeze the kernel's existing owner-local Social
 * write actions, but it does not create authority and it cannot execute an
 * effect. Executable authority must continue to come from the existing
 * authenticated Gateway -> policy -> Hypervisor -> Sandbox -> Grid path.
 */
import { createHash } from 'node:crypto';

export const WRITE_CONTROLS_SCHEMA = 'axiom-one-social-write-controls.v1';
export const WRITE_CONTROLS_STATUS = 'experimental-social-write-controls';
const SOCIAL_WRITE_SCOPE = 'social:write';
const KERNEL_AUTHORITY_REQUIRED = 'kernel_authority_required';

export const SOCIAL_WRITE_ACTIONS = Object.freeze({
  'social.actor.create': Object.freeze({
    label: 'Create a local Social actor identity',
    consequence: 'durable-local-social-write',
    scope: SOCIAL_WRITE_SCOPE,
    risk: 'medium',
    assurance: 'standard',
    required_confirmations: Object.freeze([]),
    independent_approval: false,
    external_egress: false,
    reversibility: 'The actor identity persists on this node; no preview action removes it.',
  }),
  'social.persona.create': Object.freeze({
    label: 'Create a local publication persona',
    consequence: 'durable-local-social-write',
    scope: SOCIAL_WRITE_SCOPE,
    risk: 'medium',
    assurance: 'standard',
    required_confirmations: Object.freeze([]),
    independent_approval: false,
    external_egress: false,
    reversibility: 'The persona persists on this node; no preview action removes it.',
  }),
  'social.publication.create': Object.freeze({
    label: 'Create a local Social publication',
    consequence: 'durable-local-publication-write',
    scope: SOCIAL_WRITE_SCOPE,
    risk: 'medium',
    assurance: 'A2',
    required_confirmations: Object.freeze([]),
    independent_approval: false,
    external_egress: false,
    reversibility: 'The publication becomes part of the append-only local corpus; it can only be retracted, never erased.',
  }),
  'social.publication.supersede': Object.freeze({
    label: 'Supersede a local Social publication',
    consequence: 'durable-local-publication-write',
    scope: SOCIAL_WRITE_SCOPE,
    risk: 'medium',
    assurance: 'A2',
    required_confirmations: Object.freeze([]),
    independent_approval: false,
    external_egress: false,
    reversibility: 'Supersede links the new publication to the old one; both remain in the append-only corpus.',
  }),
  'social.publication.retract': Object.freeze({
    label: 'Retract a local Social publication',
    consequence: 'durable-local-publication-retraction',
    scope: SOCIAL_WRITE_SCOPE,
    risk: 'medium',
    assurance: 'A2',
    required_confirmations: Object.freeze(['confirm:social.publication.retract']),
    independent_approval: false,
    external_egress: false,
    reversibility: 'Retraction marks the publication retracted in the local corpus; the retraction record itself is append-only.',
  }),
});

export function socialWriteExplanation(action) {
  const registered = SOCIAL_WRITE_ACTIONS[action];
  if (!registered) return null;
  return Object.freeze({
    action,
    label: registered.label,
    consequence: registered.consequence,
    effect: registered.label + ', owned by the authenticated local principal.',
    provider: 'No browser-local provider or adapter is authorized by this review surface.',
    destination: 'A kernel-authorized local Grid write would remain the destination; this module does not perform it.',
    information_scope: 'Only the fields captured in the frozen review request.',
    external_egress: false,
    cost: 'No external service cost or settlement.',
    retention: 'This review surface stores only facts and request digests in memory.',
    timeout_ms: 10_000,
    cancellation: 'Closing review performs no write. Any future execution must be submitted through the authenticated kernel path.',
    reversibility: registered.reversibility,
    required_confirmations: [...registered.required_confirmations],
    independent_approval: false,
    preview_state: 'Review-only: browser-local scopes, confirmations, or adapters cannot create executable authority.',
  });
}

class FactsViolation extends Error {}
const BANNED_FACT_KEYS = new Set([
  'payload', 'content', 'contents', 'body', 'text', 'message', 'messages',
  'transcript', 'prompt', 'completion', 'completions', 'attachment', 'attachments',
  'file', 'files', 'secret', 'secrets', 'password', 'passwd', 'token', 'tokens',
  'api_key', 'apikey', 'key_bytes', 'private_key', 'seed', 'mnemonic', 'vault',
  'vault_ref', 'vault_id', 'vault_path', 'memoir', 'journal', 'diary', 'note',
  'notes', 'thought', 'thoughts', 'memory', 'memories', 'identifier', 'identifiers',
  'pii', 'email', 'phone', 'address', 'ssn', 'dob', 'date_of_birth', 'plaintext',
  'ciphertext', 'data', 'blob', 'raw', 'audio', 'video', 'image', 'images',
  'recording', 'utterance', 'utterances',
]);
const BANNED_VALUE_SUBSTR = [
  'memoir', 'journal', 'diary', 'plaintext', 'ciphertext', 'payload',
  'vault://', 'begin private key',
];

function lintFactValue(value, depth, where) {
  if (value === null || value === undefined) return;
  if (typeof value === 'boolean' || typeof value === 'number') {
    if (!Number.isFinite(value)) throw new FactsViolation(`${where}: non-finite number`);
    return;
  }
  if (typeof value === 'string') {
    if (value.length > 512) throw new FactsViolation(`${where}: string too long`);
    const low = value.toLowerCase();
    for (const sub of BANNED_VALUE_SUBSTR) {
      if (low.includes(sub)) throw new FactsViolation(`${where}: banned content marker in value`);
    }
    return;
  }
  if (depth >= 3) throw new FactsViolation(`${where}: nesting too deep`);
  if (Array.isArray(value)) {
    value.forEach((item, i) => lintFactValue(item, depth + 1, `${where}[${i}]`));
    return;
  }
  if (typeof value === 'object') {
    lintFactObject(value, depth + 1, where);
    return;
  }
  throw new FactsViolation(`${where}: unsupported value type`);
}

function lintFactObject(obj, depth, where) {
  const keys = Object.keys(obj);
  if (keys.length > 32) throw new FactsViolation(`${where}: too many keys`);
  for (const key of keys) {
    if (typeof key !== 'string' || key.length > 64) throw new FactsViolation(`${where}: bad key`);
    if (BANNED_FACT_KEYS.has(key.toLowerCase())) {
      throw new FactsViolation(`${where}: banned key ${JSON.stringify(key)} — facts only, no payloads`);
    }
    lintFactValue(obj[key], depth, `${where}.${key}`);
  }
}

export function lintPrincipalRef(principalRef) {
  if (typeof principalRef !== 'string' || !principalRef || principalRef.length > 128) {
    throw new FactsViolation('principal_ref: bad value');
  }
  const low = principalRef.toLowerCase();
  for (const sub of BANNED_VALUE_SUBSTR) {
    if (low.includes(sub)) throw new FactsViolation('principal_ref: banned content marker');
  }
  if (principalRef.includes(' ') || principalRef.includes('@')) {
    throw new FactsViolation('principal_ref: must be a namespace id, not an identifier');
  }
  if (!/^[a-z][a-z0-9_-]*(\.[a-z0-9_-]+)+$/.test(principalRef)) {
    throw new FactsViolation('principal_ref: must be a dotted namespace id (e.g. personal.local)');
  }
  return principalRef;
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

export function sha256Hex(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function createWriteControlStore({ now = () => Date.now() } = {}) {
  return { now, facts: [], seq: 0 };
}

function appendFact(store, event, detail) {
  lintFactObject(detail ?? {}, 0, 'detail');
  const record = { seq: store.seq++, ts: store.now(), event, ...structuredClone(detail ?? {}) };
  store.facts.push(record);
  return record;
}

export function auditTrail(store) {
  return store.facts.map(record => structuredClone(record));
}

export function freezeRequest(store, { principalRef, action, request }) {
  lintPrincipalRef(principalRef);
  if (!SOCIAL_WRITE_ACTIONS[action]) throw new Error(`unknown social write action: ${action}`);
  if (request === null || typeof request !== 'object' || Array.isArray(request)) {
    throw new Error('write request must be a JSON object');
  }
  const canonical = stableStringify(request);
  const frozen = {
    schema: WRITE_CONTROLS_SCHEMA,
    action,
    principal_ref: principalRef,
    digest: sha256Hex(canonical),
    frozen_at: store.now(),
  };
  appendFact(store, 'write.frozen', {
    action,
    principal_ref: principalRef,
    frozen_digest: frozen.digest,
  });
  return { frozen, canonical };
}

function denyAuthority(store, { principalRef, action, frozenDigest }) {
  lintPrincipalRef(principalRef);
  const knownAction = Boolean(SOCIAL_WRITE_ACTIONS[action]);
  const reason = knownAction ? KERNEL_AUTHORITY_REQUIRED : 'unknown_action';
  appendFact(store, 'write.authorization.denied', {
    action: String(action),
    principal_ref: principalRef,
    ...(typeof frozenDigest === 'string' ? { frozen_digest: frozenDigest } : {}),
    reason,
  });
  return { granted: false, reason };
}

export function requestAuthorization(store, { principalRef, action, frozenDigest }) {
  return denyAuthority(store, { principalRef, action, frozenDigest });
}

export function issueRetractionIntent(store, { principalRef, frozenDigest }) {
  return denyAuthority(store, {
    principalRef,
    action: 'social.publication.retract',
    frozenDigest,
  });
}

export function confirmRetractionIntent(store, { principalRef = 'personal.local' } = {}) {
  return denyAuthority(store, {
    principalRef,
    action: 'social.publication.retract',
  });
}

export function executeWrite(store, { principalRef, frozen, canonical, adapter }) {
  lintPrincipalRef(principalRef);
  let reason = KERNEL_AUTHORITY_REQUIRED;
  if (!frozen || !SOCIAL_WRITE_ACTIONS[frozen.action]) reason = 'unknown_action';
  else if (frozen.principal_ref !== principalRef) reason = 'principal_mismatch';
  else if (typeof canonical !== 'string' || sha256Hex(canonical) !== frozen.digest) {
    reason = 'frozen_digest_mismatch';
  }
  appendFact(store, 'write.refused', {
    action: frozen?.action ?? 'unknown',
    principal_ref: principalRef,
    ...(typeof frozen?.digest === 'string' ? { frozen_digest: frozen.digest } : {}),
    reason,
  });
  void adapter;
  return { executed: false, reason };
}

export function retryWrite(store, { principalRef, frozen, adapter }) {
  lintPrincipalRef(principalRef);
  appendFact(store, 'write.refused', {
    action: frozen?.action ?? 'unknown',
    principal_ref: principalRef,
    ...(typeof frozen?.digest === 'string' ? { frozen_digest: frozen.digest } : {}),
    reason: 'no_completed_write',
  });
  void adapter;
  return { retried: false, reason: 'no_completed_write' };
}
