import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson
} from './canonical.mjs';

export const AUTHORITY_COMPOSITION_CONTEXT_SCHEMA =
  'axiom-authority-composition-context.v1';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,191}$/;
const SHA256 = /^[a-f0-9]{64}$/;

function exactObject(raw, fields, label) {
  const value = assertPlainObject(raw, label);
  const allowed = new Set(fields);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${label} contains unsupported field ${key}`);
  }
  for (const key of fields) {
    if (!Object.hasOwn(value, key)) throw new ValidationError(`${label} is missing required field ${key}`);
  }
  return value;
}

function id(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: ID });
}

function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: SHA256 });
}

function timestamp(value, label) {
  const text = assertString(value, label, { min: 24, max: 24 });
  const parsed = new Date(text);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== text) {
    throw new ValidationError(`${label} must be canonical UTC ISO`);
  }
  return text;
}

function stringSet(raw, label, { maxItems = 128 } = {}) {
  if (!Array.isArray(raw) || raw.length > maxItems) {
    throw new ValidationError(`${label} must be an array of at most ${maxItems} strings`);
  }
  const normalized = raw.map((entry, index) =>
    assertString(entry, `${label}[${index}]`, { min: 1, max: 256 })
  );
  const canonical = [...new Set(normalized)].sort();
  if (canonicalJson(normalized) !== canonicalJson(canonical)) {
    throw new ValidationError(`${label} must be sorted and unique`);
  }
  return Object.freeze(canonical);
}

function orderedStringList(raw, label, { maxItems = 16 } = {}) {
  if (!Array.isArray(raw) || raw.length > maxItems) {
    throw new ValidationError(`${label} must be an array of at most ${maxItems} strings`);
  }
  return Object.freeze(raw.map((entry, index) =>
    assertString(entry, `${label}[${index}]`, { min: 1, max: 256 })
  ));
}

function normalizeGrant(raw) {
  const value = exactObject(raw, [
    'verified',
    'grant_id',
    'issuer',
    'principal_id',
    'resources',
    'actions',
    'purposes',
    'destinations',
    'expires_at',
    'policy_digest'
  ], 'authority grant');

  if (value.verified !== true) {
    throw new ValidationError('authority grant must be independently verified before composition evaluation');
  }

  return Object.freeze({
    verified: true,
    grant_id: id(value.grant_id, 'authority grant grant_id'),
    issuer: id(value.issuer, 'authority grant issuer'),
    principal_id: id(value.principal_id, 'authority grant principal_id'),
    resources: stringSet(value.resources, 'authority grant resources'),
    actions: stringSet(value.actions, 'authority grant actions'),
    purposes: stringSet(value.purposes, 'authority grant purposes'),
    destinations: stringSet(value.destinations, 'authority grant destinations'),
    expires_at: timestamp(value.expires_at, 'authority grant expires_at'),
    policy_digest: digest(value.policy_digest, 'authority grant policy_digest')
  });
}

function normalizeIntent(raw) {
  const value = exactObject(raw, ['bound','actions','purposes','destinations','resources'], 'authority intent');
  if (value.bound !== true) {
    throw new ValidationError('authority intent must be pre-bound by a trusted application boundary');
  }
  return Object.freeze({
    bound: true,
    actions: stringSet(value.actions, 'authority intent actions'),
    purposes: stringSet(value.purposes, 'authority intent purposes'),
    destinations: stringSet(value.destinations, 'authority intent destinations'),
    resources: stringSet(value.resources, 'authority intent resources')
  });
}

function normalizeRequest(raw) {
  const value = exactObject(raw, ['principal_id','resource','action','purpose','destination','protocol','causal_scope_id','policy_digest'], 'authority request');
  return Object.freeze({
    principal_id: id(value.principal_id, 'authority request principal_id'),
    resource: id(value.resource, 'authority request resource'),
    action: id(value.action, 'authority request action'),
    purpose: id(value.purpose, 'authority request purpose'),
    destination: id(value.destination, 'authority request destination'),
    protocol: id(value.protocol, 'authority request protocol'),
    causal_scope_id: id(value.causal_scope_id, 'authority request causal_scope_id'),
    policy_digest: digest(value.policy_digest, 'authority request policy_digest')
  });
}

function normalizeHistory(raw) {
  if (!Array.isArray(raw) || raw.length > 4096) {
    throw new ValidationError('authority history must be an array of at most 4096 entries');
  }
  return Object.freeze(raw.map((entry, index) => {
    const value = exactObject(entry, ['causal_scope_id','action','resource','purpose','destination'], `authority history[${index}]`);
    return Object.freeze({
      causal_scope_id: id(value.causal_scope_id, `authority history[${index}].causal_scope_id`),
      action: id(value.action, `authority history[${index}].action`),
      resource: id(value.resource, `authority history[${index}].resource`),
      purpose: id(value.purpose, `authority history[${index}].purpose`),
      destination: id(value.destination, `authority history[${index}].destination`)
    });
  }));
}

function normalizeRestrictions(raw) {
  if (!Array.isArray(raw) || raw.length > 256) {
    throw new ValidationError('composition restrictions must be an array of at most 256 entries');
  }
  return Object.freeze(raw.map((entry, index) => {
    const value = exactObject(entry, ['id', 'ordered_actions'], `composition restrictions[${index}]`);
    const actions = orderedStringList(value.ordered_actions, `composition restrictions[${index}].ordered_actions`, { maxItems: 16 });
    if (actions.length < 2) {
      throw new ValidationError('composition restriction must contain at least two actions');
    }
    return Object.freeze({
      id: id(value.id, `composition restrictions[${index}].id`),
      ordered_actions: actions
    });
  }));
}

function containsAll(parent, child) {
  const allowed = new Set(parent);
  return child.every(value => allowed.has(value));
}

export function verifyIntentAttenuation(grant, intent) {
  const normalizedGrant = normalizeGrant(grant);
  const normalizedIntent = normalizeIntent(intent);
  const checks = Object.freeze({
    actions: containsAll(normalizedGrant.actions, normalizedIntent.actions),
    purposes: containsAll(normalizedGrant.purposes, normalizedIntent.purposes),
    destinations: containsAll(normalizedGrant.destinations, normalizedIntent.destinations),
    resources: containsAll(normalizedGrant.resources, normalizedIntent.resources)
  });
  return Object.freeze({ valid: Object.values(checks).every(Boolean), checks });
}

function matchesOrderedSubsequence(actions, pattern) {
  let cursor = 0;
  for (const action of actions) {
    if (action === pattern[cursor]) cursor += 1;
    if (cursor === pattern.length) return true;
  }
  return false;
}

export function evaluateAuthorityComposition({ grant, intent, request, history = [], restrictions = [], now = new Date() }) {
  const normalizedGrant = normalizeGrant(grant);
  const normalizedIntent = normalizeIntent(intent);
  const normalizedRequest = normalizeRequest(request);
  const normalizedHistory = normalizeHistory(history);
  const normalizedRestrictions = normalizeRestrictions(restrictions);

  const denial = [];
  const nowMs = now instanceof Date ? now.valueOf() : new Date(now).valueOf();
  if (!Number.isFinite(nowMs)) throw new ValidationError('authority evaluation now is invalid');

  if (new Date(normalizedGrant.expires_at).valueOf() <= nowMs) denial.push('grant-expired');
  if (normalizedRequest.principal_id !== normalizedGrant.principal_id) denial.push('principal-mismatch');
  if (normalizedRequest.policy_digest !== normalizedGrant.policy_digest) denial.push('policy-mismatch');
  if (!normalizedGrant.resources.includes(normalizedRequest.resource)) denial.push('resource-outside-grant');
  if (!normalizedGrant.actions.includes(normalizedRequest.action)) denial.push('action-outside-grant');
  if (!normalizedGrant.purposes.includes(normalizedRequest.purpose)) denial.push('purpose-outside-grant');
  if (!normalizedGrant.destinations.includes(normalizedRequest.destination)) denial.push('destination-outside-grant');

  const intentCheck = verifyIntentAttenuation(normalizedGrant, normalizedIntent);
  if (!intentCheck.valid) denial.push('intent-widens-grant');
  if (!normalizedIntent.resources.includes(normalizedRequest.resource)) denial.push('resource-outside-intent');
  if (!normalizedIntent.actions.includes(normalizedRequest.action)) denial.push('action-outside-intent');
  if (!normalizedIntent.purposes.includes(normalizedRequest.purpose)) denial.push('purpose-outside-intent');
  if (!normalizedIntent.destinations.includes(normalizedRequest.destination)) denial.push('destination-outside-intent');

  const sameCausalHistory = normalizedHistory.filter(entry => entry.causal_scope_id === normalizedRequest.causal_scope_id);
  const candidateActions = [...sameCausalHistory.map(entry => entry.action), normalizedRequest.action];
  for (const restriction of normalizedRestrictions) {
    if (matchesOrderedSubsequence(candidateActions, restriction.ordered_actions)) {
      denial.push(`composition-blocked:${restriction.id}`);
    }
  }

  return Object.freeze({
    allow: denial.length === 0,
    reasons: Object.freeze([...new Set(denial)]),
    authority_effect: denial.length === 0 ? 'bounded-request-admissible' : 'none',
    protocol_is_authority: false,
    identity_is_authority: false,
    intent_can_expand_authority: false,
    composition_scope: 'causal_scope_id',
    evaluated_protocol: normalizedRequest.protocol
  });
}
