import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject
} from './canonical.mjs';
import { normalizeMachinePrincipalDefinition } from './machine-principal.mjs';
import { validateMachineDiscovery } from './machine-discovery.mjs';
import { PolicyEngine, validatePolicy } from './policy.mjs';
import { effectDestinationForTool } from './effect-destination.mjs';
import { verifyMachineIdentityCredential } from './agent-trust-machine-identity.mjs';

export const AGENT_AUTHORITY_MANIFEST_SCHEMA = 'axiom-agent-authority-manifest.v1';
export const AGENT_AUTHORITY_MANIFEST_NOTICE = 'authority_projection_is_not_authorization';

const DIGEST = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const MAX_MANIFEST_LIFETIME_MS = 15 * 60 * 1000;
const SEMANTICS = Object.freeze({
  projection_kind: 'authority-ceiling-and-requestability-snapshot',
  bearer_token: false,
  presentation_grants_authority: false,
  execution_authorized: false,
  delegation_authorized: false,
  discovery_is_authorization: false,
  reputation_is_authority: false,
  global_currentness_claimed: false,
  requires_live_revalidation: true,
  authority_effect: 'none'
});

const TOP_LEVEL_KEYS = new Set([
  'schema', 'notice', 'principal', 'identity', 'authority', 'evaluation',
  'validity', 'semantics', 'manifest_digest'
]);
const PRINCIPAL_KEYS = new Set([
  'id', 'type', 'sponsor', 'lifetime', 'roles', 'scopes',
  'runtime_id', 'runtime_kind', 'runtime_software_digest',
  'principal_definition_digest', 'principal_authority_digest'
]);
const IDENTITY_KEYS = new Set([
  'credential_digest', 'issuer_id', 'issuer_key_id', 'operational_key_id',
  'key_epoch', 'valid_from', 'expires_at'
]);
const AUTHORITY_KEYS = new Set([
  'purposes', 'destinations', 'budgets', 'delegation', 'requestable_actions'
]);
const BUDGET_KEYS = new Set([
  'max_requests_per_minute', 'max_concurrent_requests', 'max_execution_ms',
  'max_request_bytes', 'max_response_bytes'
]);
const DELEGATION_KEYS = new Set(['allowed', 'max_depth']);
const ACTION_KEYS = new Set([
  'id', 'risk', 'effect_destination', 'required_assurance',
  'required_confirmations', 'required_confirmation_values',
  'requires_independent_approval', 'timeout_ms'
]);
const EVALUATION_KEYS = new Set([
  'kernel_version', 'policy_version', 'policy_digest', 'discovery_digest',
  'capability_registry_digest'
]);
const VALIDITY_KEYS = new Set(['created_at', 'expires_at']);
const SEMANTICS_KEYS = new Set(Object.keys(SEMANTICS));

function exactObject(raw, allowed, label) {
  const value = assertPlainObject(raw, label);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${label} contains unsupported field ${key}`);
  }
  return value;
}

function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function identifier(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: ID });
}

function canonicalTimestamp(value, label) {
  const text = assertString(value, label, { min: 24, max: 24 });
  const parsed = new Date(text);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== text) {
    throw new ValidationError(`${label} must be a canonical UTC ISO timestamp`);
  }
  return text;
}

function canonicalStringSet(raw, label, { maxItems = 256, maxLength = 256 } = {}) {
  if (!Array.isArray(raw) || raw.length > maxItems) {
    throw new ValidationError(`${label} must contain at most ${maxItems} strings`);
  }
  const values = raw.map((item, index) => assertString(item, `${label}[${index}]`, {
    min: 1,
    max: maxLength
  }));
  const canonical = [...new Set(values)].sort();
  if (canonicalJson(values) !== canonicalJson(canonical)) {
    throw new ValidationError(`${label} must be sorted and unique`);
  }
  return canonical;
}

function normalizePrincipal(raw, { knownHumanPrincipals = null, now = new Date() } = {}) {
  const value = assertPlainObject(raw, 'machine principal');
  if (value.schema === 'axiom-machine-principal.v1') {
    const { schema, authority_digest: suppliedAuthorityDigest, ...definition } = value;
    const normalized = normalizeMachinePrincipalDefinition(definition, { knownHumanPrincipals, now });
    if (suppliedAuthorityDigest !== normalized.authority_digest) {
      throw new ValidationError('machine principal authority digest does not match its definition');
    }
    return normalized;
  }
  return normalizeMachinePrincipalDefinition(value, { knownHumanPrincipals, now });
}

function principalDefinitionDigest(principal) {
  const { schema, authority_digest: ignored, ...definition } = principal;
  return digestObject(definition);
}

function capabilityRegistryDigest(raw) {
  const value = assertPlainObject(raw, 'capability registry');
  if (value.schema !== 'axiom-capabilities.v1' || !Array.isArray(value.capabilities)) {
    throw new ValidationError('capability registry must use axiom-capabilities.v1 with capabilities');
  }
  return digestObject(value);
}

function normalizeAction(raw, index) {
  const value = exactObject(raw, ACTION_KEYS, `authority requestable_actions[${index}]`);
  if (!Number.isSafeInteger(value.required_confirmations)
    || value.required_confirmations < 0
    || value.required_confirmations > 16) {
    throw new ValidationError(`authority requestable_actions[${index}].required_confirmations is invalid`);
  }
  if (!Number.isSafeInteger(value.timeout_ms) || value.timeout_ms < 1 || value.timeout_ms > 300_000) {
    throw new ValidationError(`authority requestable_actions[${index}].timeout_ms is invalid`);
  }
  if (typeof value.requires_independent_approval !== 'boolean') {
    throw new ValidationError(`authority requestable_actions[${index}].requires_independent_approval must be boolean`);
  }
  return Object.freeze({
    id: assertString(value.id, `authority requestable_actions[${index}].id`, {
      min: 2, max: 128, pattern: /^[a-z][a-z0-9.-]{1,127}$/
    }),
    risk: assertString(value.risk, `authority requestable_actions[${index}].risk`, { min: 1, max: 32 }),
    effect_destination: assertString(
      value.effect_destination,
      `authority requestable_actions[${index}].effect_destination`,
      { min: 1, max: 256 }
    ),
    required_assurance: assertString(
      value.required_assurance,
      `authority requestable_actions[${index}].required_assurance`,
      { min: 2, max: 16, pattern: /^A[0-9]+$/ }
    ),
    required_confirmations: value.required_confirmations,
    required_confirmation_values: canonicalStringSet(
      value.required_confirmation_values,
      `authority requestable_actions[${index}].required_confirmation_values`,
      { maxItems: 64, maxLength: 160 }
    ),
    requires_independent_approval: value.requires_independent_approval,
    timeout_ms: value.timeout_ms
  });
}

function normalizeBudgets(raw) {
  const value = exactObject(raw, BUDGET_KEYS, 'authority budgets');
  const result = {};
  for (const key of BUDGET_KEYS) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 1) {
      throw new ValidationError(`authority budgets.${key} must be a positive safe integer`);
    }
    result[key] = value[key];
  }
  return Object.freeze(result);
}

function normalizeDelegation(raw) {
  const value = exactObject(raw, DELEGATION_KEYS, 'authority delegation');
  if (value.allowed !== false || value.max_depth !== 0) {
    throw new ValidationError('authority manifest v1 cannot enable delegation');
  }
  return Object.freeze({ allowed: false, max_depth: 0 });
}

function normalizeSemantics(raw) {
  const value = exactObject(raw, SEMANTICS_KEYS, 'authority manifest semantics');
  if (canonicalJson(value) !== canonicalJson(SEMANTICS)) {
    throw new ValidationError('authority manifest semantics widen the non-authorizing boundary');
  }
  return SEMANTICS;
}

function assertSortedActionIds(actions) {
  const ids = actions.map(item => item.id);
  if (canonicalJson(ids) !== canonicalJson([...ids].sort())) {
    throw new ValidationError('authority requestable_actions must be sorted by id');
  }
  if (new Set(ids).size !== ids.length) {
    throw new ValidationError('authority requestable_actions contain duplicate ids');
  }
}

function syntheticConfirmations(rule) {
  const requiredValues = [...new Set(rule.required_confirmation_values ?? [])];
  const requiredCount = Number(rule.required_confirmations ?? 0);
  const values = [...requiredValues];
  for (let index = values.length; index < requiredCount; index += 1) {
    values.push(`axiom-manifest-confirmation-${index}`);
  }
  return values;
}

function computeRequestableActions(principal, rawPolicy) {
  validatePolicy(rawPolicy);
  const engine = new PolicyEngine(rawPolicy);
  const actions = [];
  for (const actionId of principal.constraints.actions) {
    const rule = Object.hasOwn(engine.policy.actions, actionId) ? engine.policy.actions[actionId] : null;
    if (!rule || rule.decision !== 'allow') continue;
    let destination;
    try {
      destination = effectDestinationForTool(rule.tool);
    } catch {
      continue;
    }
    if (!principal.constraints.destinations.includes(destination)) continue;
    const decision = engine.evaluate({
      action: actionId,
      principal,
      intent: { confirmations: syntheticConfirmations(rule) }
    });
    if (decision.allow !== true) continue;
    actions.push(Object.freeze({
      id: actionId,
      risk: decision.risk,
      effect_destination: destination,
      required_assurance: decision.required_assurance,
      required_confirmations: Number(rule.required_confirmations ?? 0),
      required_confirmation_values: Object.freeze([...new Set(rule.required_confirmation_values ?? [])].sort()),
      requires_independent_approval: rule.requires_independent_approval === true,
      timeout_ms: Math.min(Number(decision.timeout_ms ?? 10_000), principal.constraints.budgets.max_execution_ms)
    }));
  }
  actions.sort((left, right) => left.id.localeCompare(right.id));
  return Object.freeze({ engine, actions: Object.freeze(actions) });
}

function discoveryActionProjection(actions) {
  return actions.map(item => ({
    id: item.id,
    risk: item.risk,
    effect_destination: item.effect_destination,
    required_confirmations: item.required_confirmations,
    required_confirmation_values: [...item.required_confirmation_values],
    requires_independent_approval: item.requires_independent_approval,
    timeout_ms: item.timeout_ms
  }));
}

function validateDiscoveryAgainstEvidence(discovery, principal, policyEngine, actions) {
  if (
    discovery.principal.id !== principal.id
    || discovery.principal.type !== principal.type
    || discovery.principal.sponsor !== principal.sponsor
    || discovery.principal.runtime_id !== principal.runtime.id
    || discovery.principal.runtime_kind !== principal.runtime.kind
    || discovery.principal.authority_digest !== principal.authority_digest
  ) throw new ValidationError('machine discovery does not match the principal authority binding');

  if (discovery.policy.version !== policyEngine.policy.version || discovery.policy.digest !== policyEngine.digest) {
    throw new ValidationError('machine discovery does not match the supplied policy snapshot');
  }
  if (canonicalJson(discovery.purposes) !== canonicalJson(principal.constraints.purposes)) {
    throw new ValidationError('machine discovery purpose ceiling does not match principal');
  }
  if (canonicalJson(discovery.destinations) !== canonicalJson(principal.constraints.destinations)) {
    throw new ValidationError('machine discovery destination ceiling does not match principal');
  }
  const expectedLimits = {
    ...principal.constraints.budgets,
    delegation_allowed: false,
    max_delegation_depth: 0
  };
  if (canonicalJson(discovery.limits) !== canonicalJson(expectedLimits)) {
    throw new ValidationError('machine discovery limits do not match principal');
  }
  if (canonicalJson(discovery.actions) !== canonicalJson(discoveryActionProjection(actions))) {
    throw new ValidationError('machine discovery requestability does not reproduce from policy and principal');
  }
}

function buildBody({ principal, credential, discovery, policyEngine, actions, capabilityDigest, createdAt, expiresAt }) {
  return Object.freeze({
    schema: AGENT_AUTHORITY_MANIFEST_SCHEMA,
    notice: AGENT_AUTHORITY_MANIFEST_NOTICE,
    principal: Object.freeze({
      id: principal.id,
      type: principal.type,
      sponsor: principal.sponsor,
      lifetime: principal.lifetime,
      roles: Object.freeze([...principal.roles]),
      scopes: Object.freeze([...principal.scopes]),
      runtime_id: principal.runtime.id,
      runtime_kind: principal.runtime.kind,
      runtime_software_digest: principal.runtime.software_digest ?? null,
      principal_definition_digest: principalDefinitionDigest(principal),
      principal_authority_digest: principal.authority_digest
    }),
    identity: Object.freeze({
      credential_digest: credential.credential_digest,
      issuer_id: credential.statement.issuer_id,
      issuer_key_id: credential.statement.issuer_key_id,
      operational_key_id: credential.statement.operational_key_id,
      key_epoch: credential.statement.key_epoch,
      valid_from: credential.statement.valid_from,
      expires_at: credential.statement.expires_at
    }),
    authority: Object.freeze({
      purposes: Object.freeze([...principal.constraints.purposes]),
      destinations: Object.freeze([...principal.constraints.destinations]),
      budgets: Object.freeze({ ...principal.constraints.budgets }),
      delegation: Object.freeze({ ...principal.constraints.delegation }),
      requestable_actions: actions
    }),
    evaluation: Object.freeze({
      kernel_version: discovery.kernel_version,
      policy_version: policyEngine.policy.version,
      policy_digest: policyEngine.digest,
      discovery_digest: discovery.digest,
      capability_registry_digest: capabilityDigest
    }),
    validity: Object.freeze({ created_at: createdAt, expires_at: expiresAt }),
    semantics: SEMANTICS
  });
}

export function createAgentAuthorityManifest({
  principal: rawPrincipal,
  identityCredential,
  trustedIssuerPublicKey,
  discovery: rawDiscovery,
  policy,
  capabilityRegistry,
  createdAt,
  expiresAt,
  knownHumanPrincipals = null
} = {}) {
  const created = canonicalTimestamp(createdAt, 'authority manifest createdAt');
  const expiry = canonicalTimestamp(expiresAt, 'authority manifest expiresAt');
  const createdMs = new Date(created).valueOf();
  const expiryMs = new Date(expiry).valueOf();
  if (expiryMs <= createdMs) throw new ValidationError('authority manifest expiry must follow creation');
  if (expiryMs - createdMs > MAX_MANIFEST_LIFETIME_MS) {
    throw new ValidationError('authority manifest lifetime exceeds the 15 minute laboratory ceiling');
  }

  const principal = normalizePrincipal(rawPrincipal, {
    knownHumanPrincipals,
    now: new Date(Math.max(0, createdMs - 1))
  });
  const definitionDigest = principalDefinitionDigest(principal);
  const credential = verifyMachineIdentityCredential(identityCredential, {
    trustedIssuerPublicKey,
    expectedPrincipalId: principal.id,
    expectedPrincipalDefinitionDigest: definitionDigest
  });
  if (credential.statement.principal_authority_digest !== principal.authority_digest) {
    throw new ValidationError('machine identity credential authority digest does not match principal');
  }
  if (
    credential.statement.principal_type !== principal.type
    || credential.statement.sponsor !== principal.sponsor
    || credential.statement.runtime_id !== principal.runtime.id
    || credential.statement.runtime_kind !== principal.runtime.kind
    || credential.statement.runtime_software_digest !== (principal.runtime.software_digest ?? null)
  ) throw new ValidationError('machine identity credential does not match the principal runtime/sponsor binding');

  if (created < credential.statement.valid_from || created >= credential.statement.expires_at) {
    throw new ValidationError('authority manifest must be created while the identity credential is valid');
  }
  if (expiry > credential.statement.expires_at) {
    throw new ValidationError('authority manifest cannot outlive the identity credential');
  }
  if (principal.expires_at !== undefined && expiry > principal.expires_at) {
    throw new ValidationError('authority manifest cannot outlive the machine principal');
  }

  const discovery = validateMachineDiscovery(rawDiscovery);
  const { engine: policyEngine, actions } = computeRequestableActions(principal, policy);
  validateDiscoveryAgainstEvidence(discovery, principal, policyEngine, actions);
  const capabilityDigest = capabilityRegistryDigest(capabilityRegistry);
  const body = buildBody({
    principal, credential, discovery, policyEngine, actions,
    capabilityDigest, createdAt: created, expiresAt: expiry
  });
  return Object.freeze({ ...body, manifest_digest: digestObject(body) });
}

export function verifyAgentAuthorityManifest(raw, evidence = {}) {
  const value = exactObject(raw, TOP_LEVEL_KEYS, 'agent authority manifest');
  if (value.schema !== AGENT_AUTHORITY_MANIFEST_SCHEMA) {
    throw new ValidationError('agent authority manifest schema is unsupported');
  }
  if (value.notice !== AGENT_AUTHORITY_MANIFEST_NOTICE) {
    throw new ValidationError('agent authority manifest notice is invalid');
  }
  const suppliedDigest = digest(value.manifest_digest, 'agent authority manifest manifest_digest');
  const { manifest_digest: ignored, ...body } = value;
  if (digestObject(body) !== suppliedDigest) {
    throw new ValidationError('agent authority manifest digest mismatch');
  }

  const principalSection = exactObject(value.principal, PRINCIPAL_KEYS, 'agent authority manifest principal');
  const identitySection = exactObject(value.identity, IDENTITY_KEYS, 'agent authority manifest identity');
  const authoritySection = exactObject(value.authority, AUTHORITY_KEYS, 'agent authority manifest authority');
  const evaluationSection = exactObject(value.evaluation, EVALUATION_KEYS, 'agent authority manifest evaluation');
  const validitySection = exactObject(value.validity, VALIDITY_KEYS, 'agent authority manifest validity');
  normalizeSemantics(value.semantics);

  identifier(principalSection.id, 'agent authority manifest principal.id');
  identifier(principalSection.sponsor, 'agent authority manifest principal.sponsor');
  digest(principalSection.principal_definition_digest, 'agent authority manifest principal_definition_digest');
  digest(principalSection.principal_authority_digest, 'agent authority manifest principal_authority_digest');
  digest(identitySection.credential_digest, 'agent authority manifest identity.credential_digest');
  digest(identitySection.issuer_key_id, 'agent authority manifest identity.issuer_key_id');
  digest(identitySection.operational_key_id, 'agent authority manifest identity.operational_key_id');
  digest(evaluationSection.policy_digest, 'agent authority manifest evaluation.policy_digest');
  digest(evaluationSection.discovery_digest, 'agent authority manifest evaluation.discovery_digest');
  digest(evaluationSection.capability_registry_digest, 'agent authority manifest evaluation.capability_registry_digest');
  canonicalTimestamp(validitySection.created_at, 'agent authority manifest validity.created_at');
  canonicalTimestamp(validitySection.expires_at, 'agent authority manifest validity.expires_at');
  canonicalStringSet(principalSection.roles, 'agent authority manifest principal.roles', { maxItems: 32, maxLength: 64 });
  canonicalStringSet(principalSection.scopes, 'agent authority manifest principal.scopes', { maxItems: 128, maxLength: 160 });
  canonicalStringSet(authoritySection.purposes, 'agent authority manifest authority.purposes', { maxItems: 64, maxLength: 160 });
  canonicalStringSet(authoritySection.destinations, 'agent authority manifest authority.destinations', { maxItems: 64, maxLength: 256 });
  normalizeBudgets(authoritySection.budgets);
  normalizeDelegation(authoritySection.delegation);
  if (!Array.isArray(authoritySection.requestable_actions) || authoritySection.requestable_actions.length > 128) {
    throw new ValidationError('agent authority manifest requestable_actions must contain at most 128 actions');
  }
  const normalizedActions = authoritySection.requestable_actions.map(normalizeAction);
  assertSortedActionIds(normalizedActions);

  const expected = createAgentAuthorityManifest({
    ...evidence,
    createdAt: validitySection.created_at,
    expiresAt: validitySection.expires_at
  });
  const { manifest_digest: expectedDigest, ...expectedBody } = expected;
  if (canonicalJson(body) !== canonicalJson(expectedBody) || suppliedDigest !== expectedDigest) {
    throw new ValidationError('agent authority manifest does not reproduce from its bound evidence');
  }
  return expected;
}
