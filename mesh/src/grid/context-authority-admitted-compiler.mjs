import {
  ValidationError,
  digestObject
} from '../lib/canonical.mjs';
import {
  compileContextCapsuleFromSignedEvidence
} from '../lib/context-authority-evidence.mjs';
import {
  ContextAuthorityAdmissionGridStore
} from './context-authority-admission-store.mjs';

function boundedEvidenceArray(value, label) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 128) {
    throw new ValidationError(`${label} must contain 1-128 signed evidence envelopes`);
  }
  return value;
}

function compilationEvidence({
  policyDecisionEvidence,
  leaseEvidence,
  accessReceiptEvidence,
  revocationCheckEvidence
}) {
  if (!policyDecisionEvidence) {
    throw new ValidationError(
      'Admitted-evidence compilation requires signed policy decision evidence'
    );
  }
  return [
    policyDecisionEvidence,
    ...boundedEvidenceArray(leaseEvidence, 'leaseEvidence'),
    ...boundedEvidenceArray(accessReceiptEvidence, 'accessReceiptEvidence'),
    ...boundedEvidenceArray(revocationCheckEvidence, 'revocationCheckEvidence')
  ];
}

function referenceTime(now, issuedAt) {
  const value = now ?? Date.parse(String(issuedAt));
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ValidationError(
      'Admitted-evidence compilation requires a valid reference time'
    );
  }
  return value;
}

function admissionProof(admission) {
  return Object.freeze({
    evidence_id: admission.evidence_id,
    evidence_type: admission.evidence_type,
    issuer_principal_ref: admission.issuer_principal_ref,
    issuer_nonce: admission.issuer_nonce,
    key_id: admission.key_id,
    payload_sha256: admission.payload_sha256,
    envelope_sha256: admission.envelope_sha256,
    admitted_event_id: admission.admitted_event_id,
    admitted_by: admission.admitted_by,
    admitted_at: admission.admitted_at
  });
}

export class ContextAuthorityCompilerGridStore extends
  ContextAuthorityAdmissionGridStore {
  getStatus() {
    return {
      ...super.getStatus(),
      context_authority_compiler_runtime:
        'current-signed-and-persistently-admitted-evidence-required'
    };
  }

  compileContextCapsuleFromAdmittedEvidence({
    request,
    policyDecisionEvidence,
    leaseEvidence,
    accessReceiptEvidence,
    revocationCheckEvidence,
    claims,
    brokerPrincipalRef,
    capsuleId,
    issuedAt,
    localProvenanceReceiptRefs = [],
    minimumNecessaryPolicyRef,
    grantRef,
    now
  } = {}) {
    const compileAt = referenceTime(now, issuedAt);
    const envelopes = compilationEvidence({
      policyDecisionEvidence,
      leaseEvidence,
      accessReceiptEvidence,
      revocationCheckEvidence
    });

    const admissions = envelopes.map(envelope =>
      this.assertContextAuthorityEvidenceAdmitted(envelope, {
        now: compileAt
      })
    );

    const compilation = compileContextCapsuleFromSignedEvidence({
      request,
      policyDecisionEvidence,
      leaseEvidence,
      accessReceiptEvidence,
      revocationCheckEvidence,
      trustPins: this.contextAuthorityTrustPins,
      claims,
      brokerPrincipalRef,
      capsuleId,
      issuedAt,
      localProvenanceReceiptRefs,
      minimumNecessaryPolicyRef,
      grantRef,
      now: compileAt,
      maxEvidenceLifetimeSeconds:
        this.contextAuthorityMaxEvidenceLifetimeSeconds
    });

    const proofs = admissions
      .map(admissionProof)
      .sort((left, right) => left.evidence_id.localeCompare(right.evidence_id));
    const admissionIds = proofs.map(item => item.evidence_id);
    const verifiedIds = [...compilation.authority_evidence_ids].sort();
    if (JSON.stringify(admissionIds) !== JSON.stringify(verifiedIds)) {
      throw new ValidationError(
        'Compiled authority evidence does not match persistently admitted evidence'
      );
    }

    return Object.freeze({
      ...compilation,
      authority_evidence_admission_verified: true,
      authority_evidence_admission_ids: admissionIds,
      authority_evidence_admission_event_ids:
        proofs.map(item => item.admitted_event_id),
      authority_evidence_admission_bundle_sha256: digestObject(proofs),
      authority_evidence_registry_persistent: true,
      authority_evidence_registry_consumes_leases: false,
      authority_evidence_registry_issues_authority: false,
      authority_evidence_registry_reads_vaults: false,
      authority_evidence_registry_delivers_capsule: false,
      grants_vault_access: false,
      grants_execution_authority: false
    });
  }
}
