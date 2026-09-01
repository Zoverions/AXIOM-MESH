import {
  ValidationError,
  digestObject
} from './canonical.mjs';
import {
  evaluateMachineIdentityCurrentness,
  verifyMachineIdentityCredentialHistory
} from './agent-trust-machine-identity.mjs';
import {
  validateRuntimeConnectorCatalogEntry
} from './runtime-connector-fabric-contracts.mjs';
import {
  normalizeVerifierProfile
} from './verifier-independence.mjs';
import {
  compileAssuranceWorkOrder
} from './assurance-work-order.mjs';

export const VERIFIER_CANDIDATE_ADMISSION_SCHEMA =
  'axiom-verifier-candidate-admission.v1';

const LIVE_CANDIDATE_ADMISSIONS = new WeakSet();

export function admitVerifierCandidate({
  profile,
  catalogEntry,
  credentialHistory,
  revocations = [],
  trustedIssuerPublicKey,
  at
} = {}) {
  const normalizedProfile = normalizeVerifierProfile(profile);
  if (validateRuntimeConnectorCatalogEntry(catalogEntry) !== true) {
    throw new ValidationError('verifier candidate runtime catalog entry is invalid');
  }
  if (catalogEntry.integration_class !== 'agent-runtime') {
    throw new ValidationError(
      'verifier candidate must bind an agent-runtime catalog entry'
    );
  }
  if (catalogEntry.subject?.subject_id !== normalizedProfile.runtime_id) {
    throw new ValidationError(
      'verifier candidate profile runtime_id does not match catalog subject'
    );
  }

  if (
    normalizedProfile.model_family !== 'family.unverified'
    || normalizedProfile.operator_domain !== 'operator.unverified'
  ) {
    throw new ValidationError(
      'verifier candidate cannot self-assert model_family or operator_domain diversity'
    );
  }

  const history = verifyMachineIdentityCredentialHistory(credentialHistory, {
    trustedIssuerPublicKey,
    expectedPrincipalId: normalizedProfile.verifier_id
  });
  const currentness = evaluateMachineIdentityCurrentness({
    credentialHistory,
    revocations,
    trustedIssuerPublicKey,
    at
  });
  if (currentness.status !== 'active') {
    throw new ValidationError(
      `verifier candidate machine identity is not active: ${currentness.status}`
    );
  }
  const active = history.find(
    item => item.credential_digest === currentness.credential_digest
  );
  if (!active) {
    throw new ValidationError(
      'verifier candidate active credential is absent from verified history'
    );
  }
  if (active.statement.runtime_id !== normalizedProfile.runtime_id) {
    throw new ValidationError(
      'verifier candidate machine credential runtime_id does not match profile'
    );
  }

  const body = Object.freeze({
    schema: VERIFIER_CANDIDATE_ADMISSION_SCHEMA,
    verifier_profile: normalizedProfile,
    verifier_profile_digest: normalizedProfile.profile_digest,
    catalog_entry_id: catalogEntry.entry_id,
    catalog_entry_version: catalogEntry.entry_version,
    catalog_entry_digest: digestObject(catalogEntry),
    machine_credential_digest: active.credential_digest,
    machine_key_epoch: active.statement.key_epoch,
    machine_operational_key_id: active.statement.operational_key_id,
    principal_authority_digest: active.statement.principal_authority_digest,
    runtime_id: active.statement.runtime_id,
    runtime_kind: active.statement.runtime_kind,
    runtime_software_digest: active.statement.runtime_software_digest,
    sponsor_id: active.statement.sponsor,
    identity_currentness: 'active',
    identity_evidence_scope: currentness.evidence_scope,
    runtime_identity_bound: true,
    model_family_verified: false,
    operator_domain_verified: false,
    catalog_presence_grants_authority: false,
    authority_effect: 'none',
    execution_effect: 'none'
  });
  const admission = Object.freeze({
    ...body,
    admission_digest: digestObject(body)
  });
  LIVE_CANDIDATE_ADMISSIONS.add(admission);
  return admission;
}

export function collectAdmittedVerifierProfiles(admissions) {
  if (!Array.isArray(admissions) || admissions.length < 1 || admissions.length > 256) {
    throw new ValidationError(
      'verifier candidate admissions must contain 1-256 items'
    );
  }
  const profiles = [];
  const ids = new Set();
  for (const admission of admissions) {
    if (
      !admission
      || typeof admission !== 'object'
      || !LIVE_CANDIDATE_ADMISSIONS.has(admission)
      || admission.schema !== VERIFIER_CANDIDATE_ADMISSION_SCHEMA
    ) {
      throw new ValidationError(
        'verifier candidate pool accepts only live broker admissions'
      );
    }
    if (ids.has(admission.verifier_profile.verifier_id)) {
      throw new ValidationError(
        'verifier candidate pool contains duplicate verifier identity'
      );
    }
    ids.add(admission.verifier_profile.verifier_id);
    profiles.push(admission.verifier_profile);
  }
  return Object.freeze(profiles);
}

export function compileAdmittedAssuranceWorkOrder({
  verifierCandidateAdmissions,
  ...options
} = {}) {
  return compileAssuranceWorkOrder({
    ...options,
    verifierCandidates: collectAdmittedVerifierProfiles(
      verifierCandidateAdmissions
    )
  });
}
