import {
  ValidationError,
  assertPlainObject,
  assertString,
  canonicalJson,
  digestObject
} from './canonical.mjs';
import { verifyAgentAuthorityManifest } from './agent-trust-authority-manifest.mjs';

export const AGENT_PROTOCOL_ADAPTER_PROFILE_SCHEMA = 'axiom-agent-protocol-adapter-profile.v1';
export const AGENT_PROTOCOL_REQUEST_CANDIDATE_SCHEMA = 'axiom-agent-protocol-request-candidate.v1';
export const AGENT_PROTOCOL_RESULT_PROJECTION_SCHEMA = 'axiom-agent-protocol-result-projection.v1';

const PROTOCOLS = new Set(['native', 'mcp', 'a2a']);
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,191}$/;
const ACTION = /^[a-z][a-z0-9._:-]{1,127}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const EXTERNAL_ID = /^[A-Za-z0-9][A-Za-z0-9_.:\/-]{0,191}$/;

const PROFILE_KEYS = new Set(['schema', 'profile_id', 'protocol', 'entries', 'semantics', 'profile_digest']);
const ENTRY_KEYS = new Set(['external_id', 'axiom_action']);
const PROFILE_SEMANTIC_KEYS = new Set([
  'native_axiom_semantics_authoritative',
  'profile_is_authority',
  'discovery_is_permission',
  'adapter_metadata_trusted',
  'protocol_switch_can_expand_authority',
  'protocol_conformance_claimed',
  'authority_effect',
  'delegation_effect'
]);
const PROFILE_SEMANTICS = Object.freeze({
  native_axiom_semantics_authoritative: true,
  profile_is_authority: false,
  discovery_is_permission: false,
  adapter_metadata_trusted: false,
  protocol_switch_can_expand_authority: false,
  protocol_conformance_claimed: false,
  authority_effect: 'none',
  delegation_effect: 'none'
});

const COMMON_REQUEST_KEYS = [
  'principal_id', 'principal_credential_digest', 'purpose', 'destination', 'input_digest', 'metadata'
];
const REQUEST_KEYS = Object.freeze({
  native: new Set([...COMMON_REQUEST_KEYS, 'action']),
  mcp: new Set([...COMMON_REQUEST_KEYS, 'tool_name']),
  a2a: new Set([...COMMON_REQUEST_KEYS, 'skill_id'])
});

function exactObject(raw, allowed, label, { requireAll = true } = {}) {
  const value = assertPlainObject(raw, label);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new ValidationError(`${label} contains unsupported field ${key}`);
  }
  if (requireAll) {
    for (const key of allowed) {
      if (!Object.hasOwn(value, key)) throw new ValidationError(`${label} is missing required field ${key}`);
    }
  }
  return value;
}

function identifier(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: ID });
}

function actionId(value, label) {
  return assertString(value, label, { min: 2, max: 128, pattern: ACTION });
}

function externalId(value, label) {
  return assertString(value, label, { min: 1, max: 192, pattern: EXTERNAL_ID });
}

function digest(value, label) {
  return assertString(value, label, { min: 64, max: 64, pattern: DIGEST });
}

function protocol(value, label = 'agent protocol') {
  const text = assertString(value, label, { min: 3, max: 16 });
  if (!PROTOCOLS.has(text)) throw new ValidationError(`${label} is unsupported`);
  return text;
}

function normalizeProfileSemantics(raw) {
  const value = exactObject(raw, PROFILE_SEMANTIC_KEYS, 'agent protocol profile semantics');
  if (canonicalJson(value) !== canonicalJson(PROFILE_SEMANTICS)) {
    throw new ValidationError('agent protocol profile semantics widen the non-authorizing boundary');
  }
  return PROFILE_SEMANTICS;
}

function normalizeEntries(raw) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 256) {
    throw new ValidationError('agent protocol adapter entries must contain 1-256 mappings');
  }
  const entries = raw.map((item, index) => {
    const value = exactObject(item, ENTRY_KEYS, `agent protocol adapter entry[${index}]`);
    return Object.freeze({
      external_id: externalId(value.external_id, `agent protocol adapter entry[${index}].external_id`),
      axiom_action: actionId(value.axiom_action, `agent protocol adapter entry[${index}].axiom_action`)
    });
  });
  const ids = entries.map(item => item.external_id);
  if (new Set(ids).size !== ids.length) {
    throw new ValidationError('agent protocol adapter entries contain duplicate external IDs');
  }
  const sorted = [...entries].sort((a, b) => a.external_id.localeCompare(b.external_id));
  if (canonicalJson(entries) !== canonicalJson(sorted)) {
    throw new ValidationError('agent protocol adapter entries must be sorted by external_id');
  }
  return Object.freeze(entries);
}

export function normalizeAgentProtocolAdapterProfile(raw) {
  const value = exactObject(raw, PROFILE_KEYS, 'agent protocol adapter profile');
  if (value.schema !== AGENT_PROTOCOL_ADAPTER_PROFILE_SCHEMA) {
    throw new ValidationError(`agent protocol adapter profile schema must be ${AGENT_PROTOCOL_ADAPTER_PROFILE_SCHEMA}`);
  }
  const body = Object.freeze({
    schema: AGENT_PROTOCOL_ADAPTER_PROFILE_SCHEMA,
    profile_id: identifier(value.profile_id, 'agent protocol adapter profile_id'),
    protocol: protocol(value.protocol, 'agent protocol adapter protocol'),
    entries: normalizeEntries(value.entries),
    semantics: normalizeProfileSemantics(value.semantics)
  });
  const computed = digestObject(body);
  if (digest(value.profile_digest, 'agent protocol adapter profile_digest') !== computed) {
    throw new ValidationError('agent protocol adapter profile digest mismatch');
  }
  return Object.freeze({ ...body, profile_digest: computed });
}

export function createAgentProtocolAdapterProfile({ profileId, protocol: protocolName, entries } = {}) {
  const body = Object.freeze({
    schema: AGENT_PROTOCOL_ADAPTER_PROFILE_SCHEMA,
    profile_id: identifier(profileId, 'agent protocol adapter profileId'),
    protocol: protocol(protocolName, 'agent protocol adapter protocol'),
    entries: Object.freeze((entries ?? []).map(item => Object.freeze({ ...item })).sort((a, b) => (
      String(a.external_id).localeCompare(String(b.external_id))
    ))),
    semantics: PROFILE_SEMANTICS
  });
  const profile = Object.freeze({ ...body, profile_digest: digestObject(body) });
  return normalizeAgentProtocolAdapterProfile(profile);
}

function externalActionField(protocolName) {
  if (protocolName === 'native') return 'action';
  if (protocolName === 'mcp') return 'tool_name';
  return 'skill_id';
}

function normalizeMetadata(raw) {
  const value = raw === undefined ? {} : assertPlainObject(raw, 'agent protocol request metadata');
  return Object.freeze({
    metadata_digest: digestObject(value),
    metadata_trusted: false,
    metadata_authority_effect: 'none'
  });
}

function normalizeRequest(profile, raw) {
  const keys = REQUEST_KEYS[profile.protocol];
  const value = exactObject(raw, keys, `agent ${profile.protocol} request`);
  const externalField = externalActionField(profile.protocol);
  const externalAction = externalId(value[externalField], `agent ${profile.protocol} request ${externalField}`);
  const mapping = profile.entries.find(item => item.external_id === externalAction) ?? null;
  const metadata = normalizeMetadata(value.metadata);
  return Object.freeze({
    principal_id: identifier(value.principal_id, `agent ${profile.protocol} request principal_id`),
    principal_credential_digest: digest(
      value.principal_credential_digest,
      `agent ${profile.protocol} request principal_credential_digest`
    ),
    external_action_id: externalAction,
    mapped_action: mapping?.axiom_action ?? null,
    purpose: assertString(value.purpose, `agent ${profile.protocol} request purpose`, { min: 1, max: 160 }),
    destination: assertString(value.destination, `agent ${profile.protocol} request destination`, { min: 1, max: 256 }),
    input_digest: digest(value.input_digest, `agent ${profile.protocol} request input_digest`),
    ...metadata
  });
}

function canonicalCandidate(request) {
  if (request.mapped_action === null) return null;
  const body = Object.freeze({
    schema: AGENT_PROTOCOL_REQUEST_CANDIDATE_SCHEMA,
    principal_id: request.principal_id,
    principal_credential_digest: request.principal_credential_digest,
    action: request.mapped_action,
    purpose: request.purpose,
    destination: request.destination,
    input_digest: request.input_digest
  });
  return Object.freeze({ ...body, candidate_digest: digestObject(body) });
}

function profileWithExpectedDigest(rawProfile, expectedProfileDigest) {
  const profile = normalizeAgentProtocolAdapterProfile(rawProfile);
  const expected = digest(expectedProfileDigest, 'agent protocol expectedProfileDigest');
  if (profile.profile_digest !== expected) {
    throw new ValidationError('agent protocol adapter profile is not the expected pinned profile');
  }
  return profile;
}

export function evaluateAgentProtocolRequest({
  adapterProfile,
  expectedProfileDigest,
  request,
  authorityManifest,
  authorityEvidence
} = {}) {
  const profile = profileWithExpectedDigest(adapterProfile, expectedProfileDigest);
  const manifest = verifyAgentAuthorityManifest(authorityManifest, authorityEvidence);
  const normalizedRequest = normalizeRequest(profile, request);
  if (normalizedRequest.principal_id !== manifest.principal.id) {
    throw new ValidationError('agent protocol request principal does not match verified authority manifest');
  }
  if (normalizedRequest.principal_credential_digest !== manifest.identity.credential_digest) {
    throw new ValidationError('agent protocol request credential does not match verified authority manifest');
  }
  const candidate = canonicalCandidate(normalizedRequest);
  const action = candidate === null
    ? null
    : manifest.authority.requestable_actions.find(item => item.id === candidate.action) ?? null;
  const purposeAllowed = candidate !== null && manifest.authority.purposes.includes(candidate.purpose);
  const destinationAllowed = candidate !== null && manifest.authority.destinations.includes(candidate.destination);
  const requestable = action !== null && purposeAllowed && destinationAllowed;
  const denialReason = candidate === null
    ? 'unmapped-protocol-action'
    : action === null
      ? 'action-not-requestable'
      : !purposeAllowed
        ? 'purpose-outside-authority-ceiling'
        : !destinationAllowed
          ? 'destination-outside-authority-ceiling'
          : null;

  return Object.freeze({
    valid: true,
    schema: 'axiom-agent-protocol-request-evaluation.v1',
    protocol: profile.protocol,
    profile_digest: profile.profile_digest,
    authority_manifest_digest: manifest.manifest_digest,
    external_action_id: normalizedRequest.external_action_id,
    metadata_digest: normalizedRequest.metadata_digest,
    canonical_request: candidate,
    canonical_request_digest: candidate?.candidate_digest ?? null,
    decision: requestable ? 'requestable-under-a2-snapshot' : 'denied-under-a2-snapshot',
    denial_reason: denialReason,
    required_assurance: action?.required_assurance ?? null,
    requestable_under_snapshot: requestable,
    decision_scope: 'a2-requestability-snapshot-only',
    native_axiom_semantics_authoritative: true,
    adapter_metadata_trusted: false,
    discovery_is_permission: false,
    reputation_is_permission: false,
    protocol_switch_can_expand_authority: false,
    live_authorization_performed: false,
    authority_granted: false,
    protocol_conformance_claimed: false,
    authority_effect: 'none',
    delegation_effect: 'none'
  });
}

export function compareAgentProtocolParity(evaluations) {
  if (!Array.isArray(evaluations) || evaluations.length < 2 || evaluations.length > 16) {
    throw new ValidationError('agent protocol parity requires 2-16 evaluations');
  }
  const items = evaluations.map((item, index) => {
    const value = assertPlainObject(item, `agent protocol parity evaluation[${index}]`);
    if (value.schema !== 'axiom-agent-protocol-request-evaluation.v1' || value.valid !== true) {
      throw new ValidationError('agent protocol parity received an invalid evaluation');
    }
    return value;
  });
  const protocols = items.map(item => item.protocol);
  if (new Set(protocols).size !== protocols.length) {
    throw new ValidationError('agent protocol parity requires distinct protocol profiles');
  }
  const reference = items[0];
  for (const item of items.slice(1)) {
    if (item.canonical_request_digest !== reference.canonical_request_digest) {
      throw new ValidationError('agent protocol parity canonical request mismatch');
    }
    if (
      item.decision !== reference.decision
      || item.denial_reason !== reference.denial_reason
      || item.required_assurance !== reference.required_assurance
    ) {
      throw new ValidationError('agent protocol parity authority preflight decision mismatch');
    }
  }
  return Object.freeze({
    valid: true,
    schema: 'axiom-agent-protocol-parity-result.v1',
    protocols: Object.freeze([...protocols].sort()),
    canonical_request_digest: reference.canonical_request_digest,
    decision: reference.decision,
    denial_reason: reference.denial_reason,
    required_assurance: reference.required_assurance,
    equivalent_a2_requestability_decision: true,
    authority_parity_scope: 'a2-requestability-snapshot-only',
    full_runtime_authority_parity_claimed: false,
    protocol_conformance_claimed: false,
    authority_granted: false,
    authority_effect: 'none',
    delegation_effect: 'none'
  });
}

export function projectAgentProtocolDiscovery({
  adapterProfile,
  expectedProfileDigest,
  authorityManifest,
  authorityEvidence
} = {}) {
  const profile = profileWithExpectedDigest(adapterProfile, expectedProfileDigest);
  const manifest = verifyAgentAuthorityManifest(authorityManifest, authorityEvidence);
  const requestable = new Set(manifest.authority.requestable_actions.map(item => item.id));
  const entries = profile.entries
    .filter(item => requestable.has(item.axiom_action))
    .map(item => Object.freeze({
      external_id: item.external_id,
      axiom_action: item.axiom_action
    }));
  const body = Object.freeze({
    schema: 'axiom-agent-protocol-discovery-projection.v1',
    protocol: profile.protocol,
    profile_digest: profile.profile_digest,
    authority_manifest_digest: manifest.manifest_digest,
    principal_id: manifest.principal.id,
    entries: Object.freeze(entries),
    discovery_scope: 'a2-requestability-snapshot-projection',
    discovery_is_permission: false,
    adapter_metadata_trusted: false,
    protocol_conformance_claimed: false,
    authority_granted: false,
    authority_effect: 'none',
    delegation_effect: 'none'
  });
  return Object.freeze({ ...body, projection_digest: digestObject(body) });
}

export function projectAgentProtocolResult({
  adapterProfile,
  expectedProfileDigest,
  sourcePrincipalId,
  sourceIdentityDigest,
  taskId,
  resultDigest,
  metadata = {}
} = {}) {
  const profile = profileWithExpectedDigest(adapterProfile, expectedProfileDigest);
  const metadataProjection = normalizeMetadata(metadata);
  const body = Object.freeze({
    schema: AGENT_PROTOCOL_RESULT_PROJECTION_SCHEMA,
    protocol: profile.protocol,
    profile_digest: profile.profile_digest,
    source_principal_id: identifier(sourcePrincipalId, 'agent protocol result sourcePrincipalId'),
    source_identity_digest: digest(sourceIdentityDigest, 'agent protocol result sourceIdentityDigest'),
    task_id: identifier(taskId, 'agent protocol result taskId'),
    result_digest: digest(resultDigest, 'agent protocol result resultDigest'),
    metadata_digest: metadataProjection.metadata_digest,
    external_result_provenance_preserved: true,
    source_identity_verified: false,
    verified_local_fact: false,
    truth_claimed: false,
    finality_claimed: false,
    authority_granted: false,
    protocol_conformance_claimed: false,
    authority_effect: 'none',
    delegation_effect: 'none'
  });
  return Object.freeze({ ...body, projection_digest: digestObject(body) });
}
