import { ValidationError } from '../../mesh/src/lib/canonical.mjs';
import {
  deriveCircleMembershipCredentialState as deriveBaseCircleMembershipCredentialState,
  validateCircleMembershipCredentialLifecycle as validateBaseCircleMembershipCredentialLifecycle,
  validateCircleMembershipCredentialPolicy
} from './implementation.mjs';

export { validateCircleMembershipCredentialPolicy };

export function validateCircleMembershipCredentialLifecycle(
  policy,
  circlePackage,
  lifecycle,
  options = {}
) {
  const validation = validateBaseCircleMembershipCredentialLifecycle(
    policy,
    circlePackage,
    lifecycle,
    options
  );
  enforceSingleCredentialLineagePerDevice(lifecycle.credentials);
  enforceNoPostCompromiseCredentialIssuance(lifecycle.credentials, lifecycle.events);
  return validation;
}

export function deriveCircleMembershipCredentialState(
  policy,
  circlePackage,
  lifecycle,
  options = {}
) {
  validateCircleMembershipCredentialLifecycle(policy, circlePackage, lifecycle, options);
  return deriveBaseCircleMembershipCredentialState(policy, circlePackage, lifecycle, options);
}

function enforceSingleCredentialLineagePerDevice(credentials) {
  const rootByDevice = new Map();
  for (const credential of credentials) {
    if (credential.supersedes_credential_id !== null) continue;
    if (rootByDevice.has(credential.device_id)) {
      throw new ValidationError(
        `Circle member device ${credential.device_id} cannot have parallel root credential lineages`
      );
    }
    rootByDevice.set(credential.device_id, credential.credential_id);
  }
}

function enforceNoPostCompromiseCredentialIssuance(credentials, events) {
  const compromisedAt = new Map();
  for (const event of events) {
    if (event.kind !== 'device-compromise') continue;
    compromisedAt.set(event.target_id, Date.parse(event.at));
  }
  for (const credential of credentials) {
    const compromiseAt = compromisedAt.get(credential.device_id);
    if (compromiseAt === undefined) continue;
    if (Date.parse(credential.issued_at) >= compromiseAt) {
      throw new ValidationError(
        `Circle member device ${credential.device_id} cannot issue credentials at or after compromise`
      );
    }
  }
}
