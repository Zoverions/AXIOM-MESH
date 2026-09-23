import { digestObject, ValidationError } from '../../mesh/src/lib/canonical.mjs';
import { validateCircleCorePackage } from '../../mesh/src/lib/circle-core.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const EVENT_KINDS = new Set([
  'credential-suspend',
  'credential-resume',
  'credential-revoke',
  'device-compromise'
]);

export function validateCircleMembershipCredentialPolicy(policy) {
  exactObject(policy, 'Circle credential lifecycle policy', [
    'schema',
    'version',
    'status',
    'runtime_activation',
    'authority_effect',
    'network_effect',
    'credential_algorithm',
    'requirements',
    'schemas',
    'event_kinds',
    'output'
  ]);
  if (
    policy.schema !== 'axiom-circle-membership-credential-lifecycle-policy.v0'
    || policy.version !== 0
    || policy.status !== 'inert-membership-credential-lifecycle'
    || policy.runtime_activation !== false
    || policy.authority_effect !== 'none'
    || policy.network_effect !== 'none'
    || policy.credential_algorithm !== 'Ed25519'
  ) throw new ValidationError('Circle credential lifecycle activation boundary is invalid');

  exactObject(policy.requirements, 'Circle credential lifecycle requirements', [
    'exact_circle_membership_principal_binding',
    'active_core_membership_required',
    'active_membership_exit_history_prohibited',
    'member_state_owner',
    'append_only_records',
    'public_material_only',
    'secret_material_included',
    'credential_may_change_roles',
    'device_may_change_membership_class',
    'credential_may_mint_execution_authority',
    'rotation_requires_exact_predecessor',
    'rotation_preserves_device_membership_principal',
    'compromise_invalidates_future_device_use',
    'revocation_is_irreversible_for_that_credential',
    'recovery_requires_new_device_and_new_credential',
    'recovery_proposal_grants_authority',
    'historical_authentication_claims_rewritten',
    'credential_use_must_be_within_membership_term'
  ]);
  const expectedRequirements = {
    exact_circle_membership_principal_binding: true,
    active_core_membership_required: true,
    active_membership_exit_history_prohibited: true,
    member_state_owner: 'independent-node',
    append_only_records: true,
    public_material_only: true,
    secret_material_included: false,
    credential_may_change_roles: false,
    device_may_change_membership_class: false,
    credential_may_mint_execution_authority: false,
    rotation_requires_exact_predecessor: true,
    rotation_preserves_device_membership_principal: true,
    compromise_invalidates_future_device_use: true,
    revocation_is_irreversible_for_that_credential: true,
    recovery_requires_new_device_and_new_credential: true,
    recovery_proposal_grants_authority: false,
    historical_authentication_claims_rewritten: false,
    credential_use_must_be_within_membership_term: true
  };
  if (JSON.stringify(policy.requirements) !== JSON.stringify(expectedRequirements)) {
    throw new ValidationError('Circle credential lifecycle requirement was weakened');
  }

  exactObject(policy.schemas, 'Circle credential lifecycle schema inventory', [
    'lifecycle', 'term', 'device', 'credential', 'event', 'recovery_proposal'
  ]);
  const expectedSchemas = {
    lifecycle: 'axiom-circle-membership-credential-lifecycle.v0',
    term: 'axiom-circle-membership-term.v0',
    device: 'axiom-circle-member-device.v0',
    credential: 'axiom-circle-member-device-credential.v0',
    event: 'axiom-circle-member-credential-event.v0',
    recovery_proposal: 'axiom-circle-member-recovery-proposal.v0'
  };
  if (JSON.stringify(policy.schemas) !== JSON.stringify(expectedSchemas)) {
    throw new ValidationError('Circle credential lifecycle schema inventory drifted');
  }
  exactSet(policy.event_kinds, EVENT_KINDS, 'Circle credential lifecycle event kinds');

  exactObject(policy.output, 'Circle credential lifecycle output policy', [
    'schema',
    'policy_digest_required',
    'circle_package_digest_required',
    'lifecycle_digest_required',
    'current_state_is_local_derivation',
    'portable_authority',
    'runtime_authority',
    'authority_effect',
    'network_effect'
  ]);
  if (
    policy.output.schema !== 'axiom-circle-membership-credential-state.v0'
    || policy.output.policy_digest_required !== true
    || policy.output.circle_package_digest_required !== true
    || policy.output.lifecycle_digest_required !== true
    || policy.output.current_state_is_local_derivation !== true
    || policy.output.portable_authority !== false
    || policy.output.runtime_authority !== false
    || policy.output.authority_effect !== 'none'
    || policy.output.network_effect !== 'none'
  ) throw new ValidationError('Circle credential lifecycle output boundary is invalid');
  return true;
}

export function validateCircleMembershipCredentialLifecycle(
  policy,
  circlePackage,
  lifecycle,
  { now = new Date() } = {}
) {
  validateCircleMembershipCredentialPolicy(policy);
  validateCircleCorePackage(circlePackage, { now });
  exactObject(lifecycle, 'Circle membership credential lifecycle', [
    'schema',
    'circle_id',
    'membership_id',
    'principal_id',
    'term',
    'devices',
    'credentials',
    'events',
    'recovery_proposals',
    'authority_effect',
    'network_effect',
    'runtime_activation'
  ]);
  if (
    lifecycle.schema !== policy.schemas.lifecycle
    || lifecycle.circle_id !== circlePackage.circle.circle_id
    || lifecycle.authority_effect !== 'none'
    || lifecycle.network_effect !== 'none'
    || lifecycle.runtime_activation !== false
  ) throw new ValidationError('Circle membership credential lifecycle boundary is invalid');

  const membership = circlePackage.memberships.find(
    item => item.membership_id === lifecycle.membership_id
  );
  if (
    !membership
    || membership.status !== 'active'
    || membership.principal_id !== lifecycle.principal_id
  ) throw new ValidationError('Circle credential lifecycle is not bound to an active membership');
  if (circlePackage.exits.some(exit => exit.membership_id === membership.membership_id)) {
    throw new ValidationError('Circle credential lifecycle rejects exit history on active membership');
  }

  const term = validateTerm(policy, lifecycle.term, lifecycle, membership);
  const devices = uniqueRecords(
    lifecycle.devices,
    'Circle member devices',
    'device_id',
    item => validateDevice(policy, item, lifecycle, membership, term)
  );
  const deviceById = new Map(devices.map(item => [item.device_id, item]));
  const credentials = uniqueRecords(
    lifecycle.credentials,
    'Circle member credentials',
    'credential_id',
    item => validateCredential(policy, item, lifecycle, membership, term, deviceById)
  );
  const credentialById = new Map(credentials.map(item => [item.credential_id, item]));
  validateCredentialGraph(credentials, credentialById);

  const events = validateEvents(policy, lifecycle.events, lifecycle, deviceById, credentialById);
  const recoveryProposals = uniqueRecords(
    lifecycle.recovery_proposals,
    'Circle member recovery proposals',
    'recovery_id',
    item => validateRecoveryProposal(
      policy,
      item,
      lifecycle,
      deviceById,
      credentialById,
      events
    )
  );

  return Object.freeze({
    valid: true,
    schema: lifecycle.schema,
    circle_id: lifecycle.circle_id,
    membership_id: lifecycle.membership_id,
    principal_id: lifecycle.principal_id,
    term: Object.freeze({ ...term }),
    device_count: devices.length,
    credential_count: credentials.length,
    event_count: events.length,
    recovery_proposal_count: recoveryProposals.length,
    policy_digest: digestObject(policy),
    circle_package_digest: digestObject(circlePackage),
    lifecycle_digest: digestObject(lifecycle),
    runtime_activation: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
}

export function deriveCircleMembershipCredentialState(
  policy,
  circlePackage,
  lifecycle,
  { asOf, now = new Date() } = {}
) {
  const validation = validateCircleMembershipCredentialLifecycle(
    policy,
    circlePackage,
    lifecycle,
    { now }
  );
  const asOfIso = canonicalTimestamp(asOf, 'Circle credential state as_of');
  const asOfMs = Date.parse(asOfIso);
  const term = lifecycle.term;
  const termActive = asOfMs >= Date.parse(term.begins_at)
    && (term.ends_at === null || asOfMs <= Date.parse(term.ends_at));

  const supersededAt = new Map();
  for (const credential of lifecycle.credentials) {
    if (credential.supersedes_credential_id !== null) {
      supersededAt.set(credential.supersedes_credential_id, credential.issued_at);
    }
  }
  const compromisedAt = new Map();
  for (const event of lifecycle.events) {
    if (event.kind === 'device-compromise') {
      compromisedAt.set(event.target_id, event.at);
    }
  }

  const credentialStates = lifecycle.credentials.map(credential => {
    const issuedMs = Date.parse(credential.issued_at);
    let status = issuedMs > asOfMs ? 'not-yet-issued' : 'active';
    const superseded = supersededAt.get(credential.credential_id);
    if (superseded && Date.parse(superseded) <= asOfMs) status = 'superseded';
    if (
      credential.expires_at !== null
      && Date.parse(credential.expires_at) < asOfMs
      && status === 'active'
    ) status = 'expired';

    for (const event of lifecycle.events) {
      if (
        event.target_type !== 'credential'
        || event.target_id !== credential.credential_id
        || Date.parse(event.at) > asOfMs
      ) continue;
      if (event.kind === 'credential-suspend' && status === 'active') status = 'suspended';
      else if (event.kind === 'credential-resume' && status === 'suspended') status = 'active';
      else if (event.kind === 'credential-revoke') status = 'revoked';
    }
    const compromised = compromisedAt.get(credential.device_id);
    if (compromised && Date.parse(compromised) <= asOfMs) status = 'device-compromised';

    return Object.freeze({
      credential_id: credential.credential_id,
      device_id: credential.device_id,
      status,
      authentication_eligible: termActive && status === 'active',
      grants_roles: false,
      grants_runtime_authority: false
    });
  });

  return Object.freeze({
    schema: policy.output.schema,
    circle_id: lifecycle.circle_id,
    membership_id: lifecycle.membership_id,
    principal_id: lifecycle.principal_id,
    as_of: asOfIso,
    membership_term_active: termActive,
    credentials: Object.freeze(credentialStates),
    policy_digest: validation.policy_digest,
    circle_package_digest: validation.circle_package_digest,
    lifecycle_digest: validation.lifecycle_digest,
    current_state_is_local_derivation: true,
    portable_authority: false,
    runtime_authority: false,
    authority_effect: 'none',
    network_effect: 'none'
  });
}

function validateTerm(policy, term, lifecycle, membership) {
  exactObject(term, 'Circle membership term', [
    'schema',
    'term_id',
    'circle_id',
    'membership_id',
    'principal_id',
    'begins_at',
    'ends_at',
    'changes_core_membership',
    'authority_effect'
  ]);
  if (
    term.schema !== policy.schemas.term
    || !identifier(term.term_id)
    || term.circle_id !== lifecycle.circle_id
    || term.membership_id !== lifecycle.membership_id
    || term.principal_id !== lifecycle.principal_id
    || term.changes_core_membership !== false
    || term.authority_effect !== 'none'
  ) throw new ValidationError('Circle membership term is invalid');
  const begins = timestampMs(term.begins_at, 'Circle membership term begins_at');
  if (
    begins < Date.parse(membership.accepted_at)
    || begins < Date.parse(membership.status_effective_at)
  ) throw new ValidationError('Circle membership term predates membership activation');
  if (term.ends_at !== null) {
    const ends = timestampMs(term.ends_at, 'Circle membership term ends_at');
    if (ends <= begins) throw new ValidationError('Circle membership term end must follow start');
  }
  return term;
}

function validateDevice(policy, device, lifecycle, membership, term) {
  exactObject(device, 'Circle member device', [
    'schema',
    'device_id',
    'circle_id',
    'membership_id',
    'principal_id',
    'registered_at',
    'state_owner',
    'secret_material_included',
    'execution_authority',
    'authority_effect',
    'network_effect'
  ]);
  if (
    device.schema !== policy.schemas.device
    || !identifier(device.device_id)
    || device.circle_id !== lifecycle.circle_id
    || device.membership_id !== membership.membership_id
    || device.principal_id !== membership.principal_id
    || device.state_owner !== 'independent-node'
    || device.secret_material_included !== false
    || device.execution_authority !== false
    || device.authority_effect !== 'none'
    || device.network_effect !== 'none'
  ) throw new ValidationError('Circle member device is invalid');
  const registered = timestampMs(device.registered_at, 'Circle member device registered_at');
  if (registered < Date.parse(term.begins_at)) {
    throw new ValidationError('Circle member device predates membership term');
  }
  if (term.ends_at !== null && registered > Date.parse(term.ends_at)) {
    throw new ValidationError('Circle member device is outside membership term');
  }
  return device;
}

function validateCredential(policy, credential, lifecycle, membership, term, deviceById) {
  exactObject(credential, 'Circle member credential', [
    'schema',
    'credential_id',
    'device_id',
    'circle_id',
    'membership_id',
    'principal_id',
    'algorithm',
    'public_key_fingerprint',
    'issued_at',
    'expires_at',
    'supersedes_credential_id',
    'secret_material_included',
    'execution_authority',
    'authority_effect',
    'network_effect'
  ]);
  const device = deviceById.get(credential.device_id);
  if (
    credential.schema !== policy.schemas.credential
    || !identifier(credential.credential_id)
    || !device
    || credential.circle_id !== lifecycle.circle_id
    || credential.membership_id !== membership.membership_id
    || credential.principal_id !== membership.principal_id
    || credential.algorithm !== policy.credential_algorithm
    || !DIGEST.test(credential.public_key_fingerprint)
    || !(credential.supersedes_credential_id === null || identifier(credential.supersedes_credential_id))
    || credential.secret_material_included !== false
    || credential.execution_authority !== false
    || credential.authority_effect !== 'none'
    || credential.network_effect !== 'none'
  ) throw new ValidationError('Circle member credential is invalid');
  const issued = timestampMs(credential.issued_at, 'Circle member credential issued_at');
  if (issued < Date.parse(device.registered_at) || issued < Date.parse(term.begins_at)) {
    throw new ValidationError('Circle member credential predates its device or membership term');
  }
  if (credential.expires_at !== null) {
    const expires = timestampMs(credential.expires_at, 'Circle member credential expires_at');
    if (expires <= issued) throw new ValidationError('Circle member credential expiry must follow issuance');
    if (term.ends_at !== null && expires > Date.parse(term.ends_at)) {
      throw new ValidationError('Circle member credential extends beyond membership term');
    }
  }
  return credential;
}

function validateCredentialGraph(credentials, credentialById) {
  const fingerprints = new Set();
  const successorByPredecessor = new Map();
  for (const credential of credentials) {
    if (fingerprints.has(credential.public_key_fingerprint)) {
      throw new ValidationError('Circle credential rotation cannot reuse a public key fingerprint');
    }
    fingerprints.add(credential.public_key_fingerprint);
    if (credential.supersedes_credential_id === null) continue;
    const prior = credentialById.get(credential.supersedes_credential_id);
    if (!prior || prior.credential_id === credential.credential_id) {
      throw new ValidationError('Circle credential rotation predecessor is invalid');
    }
    if (
      prior.device_id !== credential.device_id
      || prior.membership_id !== credential.membership_id
      || prior.principal_id !== credential.principal_id
      || Date.parse(credential.issued_at) <= Date.parse(prior.issued_at)
    ) throw new ValidationError('Circle credential rotation changes binding or chronology');
    if (successorByPredecessor.has(prior.credential_id)) {
      throw new ValidationError('Circle credential rotation cannot branch from one predecessor');
    }
    successorByPredecessor.set(prior.credential_id, credential.credential_id);
  }

  for (const credential of credentials) {
    const visited = new Set();
    let cursor = credential;
    while (cursor.supersedes_credential_id !== null) {
      if (visited.has(cursor.credential_id)) {
        throw new ValidationError('Circle credential rotation contains a cycle');
      }
      visited.add(cursor.credential_id);
      cursor = credentialById.get(cursor.supersedes_credential_id);
      if (!cursor) break;
    }
  }
}

function validateEvents(policy, value, lifecycle, deviceById, credentialById) {
  if (!Array.isArray(value) || value.length > 4096) {
    throw new ValidationError('Circle credential events are invalid');
  }
  const seenIds = new Set();
  const credentialState = new Map([...credentialById.keys()].map(id => [id, 'active']));
  const compromisedDevices = new Set();
  let previousAt = null;
  const result = [];
  for (const event of value) {
    exactObject(event, 'Circle member credential event', [
      'schema',
      'event_id',
      'circle_id',
      'membership_id',
      'principal_id',
      'target_type',
      'target_id',
      'kind',
      'at',
      'reason_code',
      'authority_effect',
      'network_effect'
    ]);
    if (
      event.schema !== policy.schemas.event
      || !identifier(event.event_id)
      || seenIds.has(event.event_id)
      || event.circle_id !== lifecycle.circle_id
      || event.membership_id !== lifecycle.membership_id
      || event.principal_id !== lifecycle.principal_id
      || !['credential', 'device'].includes(event.target_type)
      || !EVENT_KINDS.has(event.kind)
      || !identifier(event.reason_code)
      || event.authority_effect !== 'none'
      || event.network_effect !== 'none'
    ) throw new ValidationError('Circle credential event is invalid');
    seenIds.add(event.event_id);
    const at = timestampMs(event.at, 'Circle credential event at');
    if (previousAt !== null && at < previousAt) {
      throw new ValidationError('Circle credential events must be chronological');
    }
    previousAt = at;

    if (event.kind === 'device-compromise') {
      if (event.target_type !== 'device' || !deviceById.has(event.target_id)) {
        throw new ValidationError('Circle device compromise target is invalid');
      }
      if (compromisedDevices.has(event.target_id)) {
        throw new ValidationError('Circle device compromise cannot be repeated');
      }
      const device = deviceById.get(event.target_id);
      if (at < Date.parse(device.registered_at)) {
        throw new ValidationError('Circle device compromise predates device registration');
      }
      compromisedDevices.add(event.target_id);
      result.push(event);
      continue;
    }

    if (event.target_type !== 'credential' || !credentialById.has(event.target_id)) {
      throw new ValidationError('Circle credential event target is invalid');
    }
    const credential = credentialById.get(event.target_id);
    if (at < Date.parse(credential.issued_at)) {
      throw new ValidationError('Circle credential event predates credential issuance');
    }
    if (compromisedDevices.has(credential.device_id)) {
      throw new ValidationError('Circle credential event cannot reactivate a compromised device');
    }
    const state = credentialState.get(event.target_id);
    if (event.kind === 'credential-suspend') {
      if (state !== 'active') throw new ValidationError('Circle credential suspend transition is invalid');
      credentialState.set(event.target_id, 'suspended');
    } else if (event.kind === 'credential-resume') {
      if (state !== 'suspended') throw new ValidationError('Circle credential resume transition is invalid');
      credentialState.set(event.target_id, 'active');
    } else if (event.kind === 'credential-revoke') {
      if (state === 'revoked') throw new ValidationError('Circle credential revocation is irreversible');
      credentialState.set(event.target_id, 'revoked');
    }
    result.push(event);
  }
  return result;
}

function validateRecoveryProposal(
  policy,
  proposal,
  lifecycle,
  deviceById,
  credentialById,
  events
) {
  exactObject(proposal, 'Circle member recovery proposal', [
    'schema',
    'recovery_id',
    'circle_id',
    'membership_id',
    'principal_id',
    'compromised_device_id',
    'proposed_replacement_device_id',
    'proposed_replacement_credential_id',
    'proposed_at',
    'grants_authority',
    'requires_explicit_admission',
    'authority_effect',
    'network_effect'
  ]);
  if (
    proposal.schema !== policy.schemas.recovery_proposal
    || !identifier(proposal.recovery_id)
    || proposal.circle_id !== lifecycle.circle_id
    || proposal.membership_id !== lifecycle.membership_id
    || proposal.principal_id !== lifecycle.principal_id
    || !deviceById.has(proposal.compromised_device_id)
    || !identifier(proposal.proposed_replacement_device_id)
    || !identifier(proposal.proposed_replacement_credential_id)
    || deviceById.has(proposal.proposed_replacement_device_id)
    || credentialById.has(proposal.proposed_replacement_credential_id)
    || proposal.grants_authority !== false
    || proposal.requires_explicit_admission !== true
    || proposal.authority_effect !== 'none'
    || proposal.network_effect !== 'none'
  ) throw new ValidationError('Circle member recovery proposal is invalid');
  const compromise = events.find(event => (
    event.kind === 'device-compromise'
    && event.target_id === proposal.compromised_device_id
  ));
  if (!compromise) {
    throw new ValidationError('Circle recovery proposal requires prior device compromise');
  }
  if (timestampMs(proposal.proposed_at, 'Circle recovery proposal proposed_at') < Date.parse(compromise.at)) {
    throw new ValidationError('Circle recovery proposal predates device compromise');
  }
  return proposal;
}

function uniqueRecords(value, label, key, validator) {
  if (!Array.isArray(value) || value.length > 4096) {
    throw new ValidationError(`${label} are invalid`);
  }
  const seen = new Set();
  const result = [];
  for (const item of value) {
    const validated = validator(item);
    if (seen.has(validated[key])) throw new ValidationError(`Duplicate ${key}: ${validated[key]}`);
    seen.add(validated[key]);
    result.push(validated);
  }
  return result;
}

function exactSet(values, expected, label) {
  if (!Array.isArray(values)) throw new ValidationError(`${label} must be an array`);
  const actual = new Set(values);
  if (
    actual.size !== expected.size
    || values.length !== expected.size
    || [...expected].some(value => !actual.has(value))
  ) throw new ValidationError(`${label} inventory drifted`);
}

function exactObject(value, label, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new ValidationError(`${label} fields are invalid`);
  }
}

function identifier(value) {
  return typeof value === 'string' && ID.test(value);
}

function canonicalTimestamp(value, label) {
  if (typeof value !== 'string') throw new ValidationError(`${label} is invalid`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) {
    throw new ValidationError(`${label} must be canonical UTC`);
  }
  return value;
}

function timestampMs(value, label) {
  return Date.parse(canonicalTimestamp(value, label));
}
