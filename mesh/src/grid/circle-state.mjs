import {
  ValidationError,
  assertPlainObject,
  assertString
} from '../lib/canonical.mjs';
import { validateCircleCorePackage } from '../lib/circle-core.mjs';

const PRINCIPAL_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;

export const CIRCLE_GRID_EVENT_KINDS = Object.freeze({
  created: 'circle.local.created'
});

export function validateCircleGridEvent(rawEvent, actor) {
  if (!rawEvent || typeof rawEvent !== 'object' || Array.isArray(rawEvent)) return null;
  if (rawEvent.kind !== CIRCLE_GRID_EVENT_KINDS.created) return null;

  const eventActor = assertString(actor, 'Circle event actor', {
    min: 1,
    max: 160,
    pattern: PRINCIPAL_ID
  });
  const payload = assertPlainObject(rawEvent.payload, 'Circle created payload');
  exactKeys(payload, ['owner', 'package'], 'Circle created payload');
  const owner = assertString(payload.owner, 'Circle owner', {
    min: 1,
    max: 160,
    pattern: PRINCIPAL_ID
  });
  if (owner !== eventActor) {
    throw new ValidationError('Circle owner must match the authenticated actor');
  }

  const document = assertPlainObject(payload.package, 'Circle package');
  const validation = validateCircleCorePackage(document);
  if (rawEvent.subject !== validation.circle_id) {
    throw new ValidationError('Circle event subject must match the package Circle');
  }
  if (document.circle.created_by !== owner) {
    throw new ValidationError('Circle creator must match the authenticated owner');
  }

  const bootstrapInvitations = document.invitations.filter(invitation => (
    invitation.invited_principal === owner
    && invitation.issued_by === owner
    && invitation.role_ids.length === 1
    && invitation.role_ids[0] === 'steward'
    && invitation.one_use === true
  ));
  if (bootstrapInvitations.length !== 1) {
    throw new ValidationError('Circle bootstrap must contain one exact owner steward invitation');
  }
  const bootstrapMemberships = document.memberships.filter(membership => (
    membership.principal_id === owner
    && membership.invitation_id === bootstrapInvitations[0].invitation_id
    && membership.role_ids.length === 1
    && membership.role_ids[0] === 'steward'
    && membership.status === 'active'
  ));
  if (bootstrapMemberships.length !== 1) {
    throw new ValidationError('Circle bootstrap must contain one exact active owner steward membership');
  }

  return Object.freeze({
    owner,
    package: document,
    circle_id: validation.circle_id,
    package_digest: validation.package_digest,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false
  });
}

function exactKeys(value, expectedKeys, label) {
  const expected = new Set(expectedKeys);
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) throw new ValidationError(`${label} contains unsupported field ${key}`);
  }
  for (const key of expectedKeys) {
    if (!(key in value)) throw new ValidationError(`${label} is missing ${key}`);
  }
}
