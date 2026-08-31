import {
  ValidationError,
  assertPlainObject,
  assertString,
  digestObject,
  newId
} from '../lib/canonical.mjs';
import {
  CIRCLE_CHARTER_SCHEMA,
  CIRCLE_CORE_PACKAGE_SCHEMA,
  CIRCLE_INVITATION_SCHEMA,
  CIRCLE_MEMBERSHIP_SCHEMA,
  CIRCLE_SCHEMA,
  validateCircleCorePackage
} from '../lib/circle-core.mjs';
import { executeBuiltin as executeCurrentBuiltin } from './social-executor.mjs';

const PRINCIPAL_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const PARTICIPATION_MODELS = new Set(['voluntary', 'contractual']);
const CIRCLE_ACTIONS = new Set(['circle.create']);
const BOOTSTRAP_INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Narrow local Circle extensions over the current Social+core Sandbox stack.
 *
 * Circle Core v0 remains an inert, non-authorizing record contract. This layer
 * can construct candidate local lifecycle mutations, but it cannot grant
 * execution authority, activate a network effect, or make Circle records into
 * portable authority.
 */
export function executeBuiltin({ tool, intent, assurance }) {
  const action = intent?.action;
  if (!CIRCLE_ACTIONS.has(action)) {
    return executeCurrentBuiltin({ tool, intent, assurance });
  }
  if (tool !== 'builtin.validate-mutation') {
    throw new ValidationError('Capability tool does not match local Circle intent action');
  }
  const principal = assertPlainObject(intent.principal, 'intent.principal');
  const principalId = assertString(principal.id, 'intent.principal.id', {
    min: 1,
    max: 160,
    pattern: PRINCIPAL_ID
  });
  const input = assertPlainObject(intent.input ?? {}, 'intent.input');

  if (action === 'circle.create') return createLocalCircle(principalId, input);
  throw new ValidationError('Unsupported local Circle action');
}

function createLocalCircle(owner, input) {
  exactKeys(input, ['name', 'purpose', 'participation_model'], 'Circle create input');
  const name = assertString(input.name, 'Circle name', { min: 1, max: 160 });
  const purpose = assertString(input.purpose, 'Circle purpose', { min: 1, max: 1000 });
  const participationModel = assertString(input.participation_model, 'Circle participation_model', {
    min: 1,
    max: 32
  });
  if (!PARTICIPATION_MODELS.has(participationModel)) {
    throw new ValidationError('Circle participation_model is unsupported');
  }

  const createdAt = new Date().toISOString();
  const circleId = newId('circle');
  const invitationId = newId('circle_invitation');
  const membershipId = newId('circle_membership');
  const circle = {
    schema: CIRCLE_SCHEMA,
    circle_id: circleId,
    name,
    purpose,
    created_by: owner,
    created_at: createdAt,
    trust_anchor_id: newId('circle_anchor'),
    participation_model: participationModel,
    member_state_ownership: 'independent-node',
    policy_floor: 'raise-only',
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
  const charter = {
    schema: CIRCLE_CHARTER_SCHEMA,
    circle_id: circleId,
    version: 1,
    effective_from: createdAt,
    supersedes_digest: null,
    roles: [
      {
        role_id: 'steward',
        label: 'Steward',
        declared_modes: ['propose', 'deliberate', 'evidence', 'vote', 'approve', 'review', 'appeal', 'observe'],
        execution_authority: false
      },
      {
        role_id: 'member',
        label: 'Member',
        declared_modes: ['propose', 'deliberate', 'evidence', 'vote', 'appeal', 'observe'],
        execution_authority: false
      },
      {
        role_id: 'observer',
        label: 'Observer',
        declared_modes: ['observe'],
        execution_authority: false
      }
    ],
    decision_rule: {
      quorum_basis_points: 5000,
      approval_basis_points: 6000,
      abstention_counts_toward_quorum: true
    },
    appeal_enabled: true,
    member_exit_enabled: true,
    execution_authority: false,
    authority_effect: 'none'
  };
  const charterDigest = digestObject(charter);
  const invitation = {
    schema: CIRCLE_INVITATION_SCHEMA,
    invitation_id: invitationId,
    circle_id: circleId,
    invited_principal: owner,
    membership_class: 'member',
    role_ids: ['steward'],
    issued_by: owner,
    issued_at: createdAt,
    expires_at: new Date(Date.parse(createdAt) + BOOTSTRAP_INVITATION_LIFETIME_MS).toISOString(),
    charter_digest: charterDigest,
    one_use: true,
    authority_effect: 'none'
  };
  const membership = {
    schema: CIRCLE_MEMBERSHIP_SCHEMA,
    membership_id: membershipId,
    circle_id: circleId,
    invitation_id: invitationId,
    principal_id: owner,
    role_ids: ['steward'],
    accepted_at: createdAt,
    status: 'active',
    status_effective_at: createdAt,
    member_state_ownership: 'independent-node',
    disclosure_profile: 'selective',
    authority_effect: 'none',
    network_effect: 'none'
  };
  const document = {
    schema: CIRCLE_CORE_PACKAGE_SCHEMA,
    version: 0,
    status: 'inert-contract-laboratory',
    circle,
    charter,
    invitations: [invitation],
    memberships: [membership],
    proposals: [],
    tasks: [],
    decisions: [],
    appeals: [],
    exits: [],
    exports: [],
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  };
  const validation = validateCircleCorePackage(document);

  return {
    output: {
      circle_id: circleId,
      membership_id: membershipId,
      package_digest: validation.package_digest,
      authority_effect: 'none',
      network_effect: 'none',
      runtime_activation: false
    },
    mutation: {
      kind: 'circle.local.created',
      subject: circleId,
      payload: {
        owner,
        package: document
      }
    }
  };
}

function exactKeys(value, required, label) {
  const expected = new Set(required);
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) throw new ValidationError(`${label} contains unsupported field ${key}`);
  }
  for (const key of required) {
    if (!(key in value)) throw new ValidationError(`${label} is missing ${key}`);
  }
}
