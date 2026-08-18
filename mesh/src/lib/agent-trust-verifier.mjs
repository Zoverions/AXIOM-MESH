import {
  ValidationError,
  canonicalJson,
  digestObject
} from './canonical.mjs';
import { verifyMachineIdentityCredential } from './agent-trust-machine-identity.mjs';
import { verifyAgentAuthorityManifest } from './agent-trust-authority-manifest.mjs';
import { verifyAgentSignedHandoff } from './agent-trust-signed-handoff.mjs';
import { verifyAgentAttenuationProof } from './agent-trust-attenuation-proof.mjs';

export const AGENT_TRUST_VERIFICATION_REPORT_SCHEMA =
  'axiom-agent-trust-verification-report.v1';

const REPORT_CLAIMS = Object.freeze({
  authority_granted: false,
  execution_authorized: false,
  delegation_authority_verified: false,
  global_currentness_verified: false,
  revocation_currentness_verified: false,
  task_success_verified: false,
  effect_execution_verified: false,
  legal_identity_verified: false,
  truth_verified: false,
  network_effect: false,
  filesystem_effect: false,
  authority_effect: 'none'
});

const REPORT_META = Object.freeze({
  verification_profile: 'a1-a2-a3a-a4a-integrity-only',
  report_origin: 'local-verification-result',
  report_authentication: 'none',
  portable_assurance: false
});

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${label} must be an object`);
  }
  return value;
}

function digest(value, label) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new ValidationError(`${label} must be a lowercase SHA-256 digest`);
  }
  return value;
}

function exactKeys(value, allowed, label) {
  const source = object(value, label);
  for (const key of Object.keys(source)) {
    if (!allowed.has(key)) throw new ValidationError(`${label} contains unsupported field ${key}`);
  }
  return source;
}

function exactClosedObject(value, expected, label) {
  const source = object(value, label);
  const expectedKeys = Object.keys(expected).sort();
  const actualKeys = Object.keys(source).sort();
  if (canonicalJson(actualKeys) !== canonicalJson(expectedKeys)) {
    throw new ValidationError(`${label} contains unsupported or missing fields`);
  }
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (source[key] !== expectedValue) {
      throw new ValidationError(`${label} ${key} must remain ${String(expectedValue)}`);
    }
  }
  return Object.freeze({ ...expected });
}

function reportBody({ credential, manifest, handoff, attenuation }) {
  return Object.freeze({
    schema: AGENT_TRUST_VERIFICATION_REPORT_SCHEMA,
    ...REPORT_META,
    sender: Object.freeze({
      principal_id: credential.statement.principal_id,
      credential_digest: credential.credential_digest,
      issuer_id: credential.statement.issuer_id,
      issuer_key_id: credential.statement.issuer_key_id,
      operational_key_id: credential.statement.operational_key_id,
      key_epoch: credential.statement.key_epoch,
      principal_authority_digest: credential.statement.principal_authority_digest
    }),
    authority_manifest: Object.freeze({
      manifest_digest: manifest.manifest_digest,
      policy_digest: manifest.evaluation.policy_digest,
      capability_registry_digest: manifest.evaluation.capability_registry_digest,
      discovery_digest: manifest.evaluation.discovery_digest,
      delegation_allowed: manifest.authority.delegation.allowed,
      max_delegation_depth: manifest.authority.delegation.max_depth
    }),
    handoff: Object.freeze({
      handoff_digest: handoff.handoff_digest,
      handoff_id: handoff.statement.handoff_id,
      recipient_principal_id: handoff.statement.recipient_principal_id,
      recipient_identity_digest: handoff.statement.recipient_identity_digest,
      intended_executor_id: handoff.statement.intended_executor_id,
      intended_executor_identity_digest: handoff.statement.intended_executor_identity_digest,
      action: handoff.statement.action,
      purpose: handoff.statement.purpose,
      destination: handoff.statement.destination,
      input_digest: handoff.statement.input_digest,
      delegation_chain_head_digest: handoff.statement.delegation_chain_head_digest,
      remaining_delegation_depth: handoff.statement.remaining_delegation_depth
    }),
    attenuation_proof: attenuation === null
      ? null
      : Object.freeze({
        proof_digest: attenuation.proof_digest,
        parent_ceiling_digest: attenuation.attenuation.parent_ceiling_digest,
        child_ceiling_digest: attenuation.attenuation.child_ceiling_digest,
        authority_relation: attenuation.attenuation.authority_relation,
        proof_only: true
      }),
    claims: REPORT_CLAIMS
  });
}

export function verifyAgentTrustBundle({
  identityCredential,
  trustedIssuerPublicKey,
  authorityManifest,
  authorityEvidence,
  handoff,
  expectedRecipientPrincipalId,
  expectedRecipientIdentityDigest,
  expectedExecutorId,
  expectedExecutorIdentityDigest,
  expectedInputDigest,
  expectedParentTaskId,
  attenuationProof = null,
  attenuationEvidence = null
} = {}) {
  const manifest = verifyAgentAuthorityManifest(authorityManifest, authorityEvidence);
  const credential = verifyMachineIdentityCredential(identityCredential, {
    trustedIssuerPublicKey,
    expectedPrincipalId: manifest.principal.id,
    expectedPrincipalDefinitionDigest: manifest.principal.principal_definition_digest
  });
  if (credential.credential_digest !== manifest.identity.credential_digest) {
    throw new ValidationError('ATP bundle identity credential does not match authority manifest');
  }

  const verifiedHandoff = verifyAgentSignedHandoff(handoff, {
    identityCredential,
    trustedIssuerPublicKey,
    authorityManifest,
    authorityEvidence,
    expectedRecipientPrincipalId,
    expectedRecipientIdentityDigest,
    expectedExecutorId,
    expectedExecutorIdentityDigest,
    expectedInputDigest,
    expectedParentTaskId
  });
  if (verifiedHandoff.statement.sender_credential_digest !== credential.credential_digest) {
    throw new ValidationError('ATP bundle handoff sender credential does not match verified identity');
  }
  if (verifiedHandoff.statement.authority_manifest_digest !== manifest.manifest_digest) {
    throw new ValidationError('ATP bundle handoff does not match verified authority manifest');
  }

  let attenuation = null;
  if (attenuationProof !== null) {
    attenuation = verifyAgentAttenuationProof(
      attenuationProof,
      object(attenuationEvidence, 'ATP attenuation evidence')
    );
    if (attenuation.statement.parent_authorization_claimed !== false) {
      throw new ValidationError('ATP attenuation proof cannot claim parent delegation authority');
    }
    if (verifiedHandoff.statement.delegation_chain_head_digest !== null) {
      throw new ValidationError('A4a handoff cannot bind an authority-bearing attenuation proof');
    }
  } else if (attenuationEvidence !== null) {
    throw new ValidationError('ATP attenuation evidence requires an attenuation proof');
  }

  const body = reportBody({
    credential,
    manifest,
    handoff: verifiedHandoff,
    attenuation
  });
  const report = Object.freeze({
    ...body,
    verification_report_digest: digestObject(body)
  });

  return Object.freeze({
    valid: true,
    underlying_artifacts_reverified: true,
    report_authenticated: false,
    portable_assurance: false,
    authority_granted: false,
    execution_authorized: false,
    report
  });
}

export function checkAgentTrustVerificationReportIntegrity(raw, expected = {}) {
  const value = exactKeys(raw, new Set([
    'schema',
    'verification_profile',
    'report_origin',
    'report_authentication',
    'portable_assurance',
    'sender',
    'authority_manifest',
    'handoff',
    'attenuation_proof',
    'claims',
    'verification_report_digest'
  ]), 'ATP verification report');

  if (value.schema !== AGENT_TRUST_VERIFICATION_REPORT_SCHEMA) {
    throw new ValidationError('ATP verification report schema is unsupported');
  }
  exactClosedObject({
    verification_profile: value.verification_profile,
    report_origin: value.report_origin,
    report_authentication: value.report_authentication,
    portable_assurance: value.portable_assurance
  }, REPORT_META, 'ATP verification report metadata');
  exactClosedObject(value.claims, REPORT_CLAIMS, 'ATP verification report claims');

  const suppliedDigest = digest(
    value.verification_report_digest,
    'ATP verification report verification_report_digest'
  );
  const { verification_report_digest: ignored, ...body } = value;
  if (suppliedDigest !== digestObject(body)) {
    throw new ValidationError('ATP verification report digest mismatch');
  }

  const sender = object(value.sender, 'ATP verification report sender');
  const manifest = object(value.authority_manifest, 'ATP verification report authority_manifest');
  const handoff = object(value.handoff, 'ATP verification report handoff');
  const checkable = {
    sender_principal_id: sender.principal_id,
    credential_digest: sender.credential_digest,
    authority_manifest_digest: manifest.manifest_digest,
    handoff_digest: handoff.handoff_digest,
    action: handoff.action,
    recipient_principal_id: handoff.recipient_principal_id,
    intended_executor_id: handoff.intended_executor_id,
    input_digest: handoff.input_digest
  };
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (!Object.hasOwn(checkable, key)) {
      throw new ValidationError(`ATP verification report expected check ${key} is unsupported`);
    }
    if (checkable[key] !== expectedValue) {
      throw new ValidationError(`ATP verification report ${key} mismatch`);
    }
  }

  return Object.freeze({
    valid_report_integrity: true,
    verification_report_digest: suppliedDigest,
    report_authenticated: false,
    underlying_artifacts_reverified: false,
    portable_assurance: false,
    authority_granted: false,
    execution_authorized: false
  });
}
