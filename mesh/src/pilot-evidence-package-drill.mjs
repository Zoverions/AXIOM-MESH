import { createPublicKey, generateKeyPairSync } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  canonicalJson,
  digestObject,
  sha256,
  ValidationError
} from './lib/canonical.mjs';
import { MeshIdentity, verifyObjectSignature } from './lib/identity.mjs';
import {
  PILOT_EVIDENCE_PRODUCER_ROLES,
  PILOT_EVIDENCE_ENVELOPE_VERSION,
  pilotEvidenceEnvelopePayload,
  verifyPilotEvidencePackage
} from './pilot-evidence-package.mjs';
import {
  PILOT_EVIDENCE_DETAIL_CONTRACT_VERSION
} from './pilot-evidence-contracts.mjs';
import {
  PILOT_EVIDENCE_TYPES,
  PILOT_REVIEW_ROLES,
  pilotApprovalPayload
} from './pilot-dossier.mjs';
import {
  createSyntheticPilotFixture
} from './pilot-dossier-conformance-drill.mjs';

const EVIDENCE_SCHEMA =
  'axiom-pilot-evidence-package-verifier-conformance-evidence.v2';
const REVISION = /^[a-f0-9]{40}$/;
const KERNEL_VERSION = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8')
).version;

export async function createSyntheticPilotEvidencePackage({
  root,
  now = Date.now()
}) {
  const fixture = createSyntheticPilotFixture({ now });
  await mkdir(join(root, 'evidence'), { recursive: true, mode: 0o700 });
  fixture.dossier.approvals = [];

  for (let index = 0; index < PILOT_EVIDENCE_TYPES.length; index += 1) {
    const type = PILOT_EVIDENCE_TYPES[index];
    const metadata = fixture.dossier.evidence[index];
    const role = PILOT_EVIDENCE_PRODUCER_ROLES[type];
    const reviewerIndex = PILOT_REVIEW_ROLES.indexOf(role);
    const reviewer = fixture.policy.reviewers[reviewerIndex];
    const identity = fixture.reviewerIdentities[reviewerIndex];
    const unsigned = {
      schema: metadata.schema,
      version: PILOT_EVIDENCE_ENVELOPE_VERSION,
      evidence_type: type,
      status: 'passed',
      deployment_id: fixture.dossier.deployment.deployment_id,
      source: {
        kernel_version: fixture.dossier.build.kernel_version,
        source_revision: fixture.dossier.build.source_revision,
        image_digest: fixture.dossier.build.image_digest
      },
      observed_at: metadata.observed_at,
      producer: {
        role,
        reviewer_id: reviewer.reviewer_id
      },
      summary: `Synthetic ${type.replaceAll('_', ' ')} package conformance record.`,
      details: syntheticEvidenceDetails({
        type,
        metadata,
        dossier: fixture.dossier,
        policy: fixture.policy,
        index
      }),
      signer: {
        key_id: reviewer.key_id
      }
    };
    const envelope = {
      ...unsigned,
      attestation: identity.signObject(unsigned)
    };
    const serialized = canonicalJson(envelope);
    const relativePath = `evidence/${type}.json`;
    await writeFile(join(root, relativePath), serialized, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx'
    });
    metadata.reference = relativePath;
    metadata.sha256 = `sha256:${sha256(serialized)}`;
  }
  await writeCanonicalControlFiles(root, fixture);
  return fixture;
}

export async function runPilotEvidencePackageConformanceDrill({
  now = Date.now(),
  sourceRevision = process.env.GITHUB_SHA
} = {}) {
  const root = await mkdtemp(join(tmpdir(), 'axiom-pilot-evidence-package-'));
  try {
    const fixture = await createSyntheticPilotEvidencePackage({ root, now });
    const valid = await verifyPilotEvidencePackage({
      packageDir: root,
      authorityPublicKey: fixture.authorityPublicKey,
      now
    });

    const unexpectedPath = join(root, 'unexpected.json');
    await writeFile(unexpectedPath, '{}', { mode: 0o600, flag: 'wx' });
    const unexpectedFileRejected = await rejects(() => verifyPilotEvidencePackage({
      packageDir: root,
      authorityPublicKey: fixture.authorityPublicKey,
      now
    }));
    await rm(unexpectedPath);

    const targetType = 'capacity_measurement';
    const targetPath = join(root, 'evidence', `${targetType}.json`);
    const canonicalTarget = await readFile(targetPath, 'utf8');
    await writeFile(targetPath, `${canonicalTarget}\n`, { encoding: 'utf8' });
    await bindEvidenceDigestAndResign(root, fixture, targetType);
    const noncanonicalJsonRejected = await rejects(() => verifyPilotEvidencePackage({
      packageDir: root,
      authorityPublicKey: fixture.authorityPublicKey,
      now
    }));
    await writeFile(targetPath, canonicalTarget, { encoding: 'utf8' });
    await bindEvidenceDigestAndResign(root, fixture, targetType);

    const secretType = 'provider_assessment';
    const secretPath = join(root, 'evidence', `${secretType}.json`);
    const secretOriginal = await readFile(secretPath, 'utf8');
    const secretEnvelope = JSON.parse(secretOriginal);
    secretEnvelope.details.api_key = 'redacted';
    resignEnvelope(fixture, secretType, secretEnvelope);
    await writeFile(secretPath, canonicalJson(secretEnvelope), { encoding: 'utf8' });
    await bindEvidenceDigestAndResign(root, fixture, secretType);
    const secretFieldRejected = await rejects(() => verifyPilotEvidencePackage({
      packageDir: root,
      authorityPublicKey: fixture.authorityPublicKey,
      now
    }));
    await writeFile(secretPath, secretOriginal, { encoding: 'utf8' });
    await bindEvidenceDigestAndResign(root, fixture, secretType);

    const roleType = 'scheduled_restore';
    const rolePath = join(root, 'evidence', `${roleType}.json`);
    const roleOriginal = await readFile(rolePath, 'utf8');
    const wrongRoleEnvelope = JSON.parse(roleOriginal);
    wrongRoleEnvelope.producer.role = 'platform_operator';
    resignEnvelope(fixture, roleType, wrongRoleEnvelope);
    await writeFile(rolePath, canonicalJson(wrongRoleEnvelope), { encoding: 'utf8' });
    await bindEvidenceDigestAndResign(root, fixture, roleType);
    const wrongRoleRejected = await rejects(() => verifyPilotEvidencePackage({
      packageDir: root,
      authorityPublicKey: fixture.authorityPublicKey,
      now
    }));
    await writeFile(rolePath, roleOriginal, { encoding: 'utf8' });
    await bindEvidenceDigestAndResign(root, fixture, roleType);

    const detailType = 'availability_observation';
    const detailPath = join(root, 'evidence', `${detailType}.json`);
    const detailOriginal = await readFile(detailPath, 'utf8');
    const invalidDetailEnvelope = JSON.parse(detailOriginal);
    invalidDetailEnvelope.details.availability_percent -= 0.1;
    resignEnvelope(fixture, detailType, invalidDetailEnvelope);
    await writeFile(detailPath, canonicalJson(invalidDetailEnvelope), {
      encoding: 'utf8'
    });
    await bindEvidenceDigestAndResign(root, fixture, detailType);
    const invalidDetailContractRejected = await rejects(
      () => verifyPilotEvidencePackage({
        packageDir: root,
        authorityPublicKey: fixture.authorityPublicKey,
        now
      })
    );
    await writeFile(detailPath, detailOriginal, { encoding: 'utf8' });
    await bindEvidenceDigestAndResign(root, fixture, detailType);

    const missingType = 'independent_security_review';
    const missingPath = join(root, 'evidence', `${missingType}.json`);
    const missingOriginal = await readFile(missingPath);
    await rm(missingPath);
    const missingFileRejected = await rejects(() => verifyPilotEvidencePackage({
      packageDir: root,
      authorityPublicKey: fixture.authorityPublicKey,
      now
    }));
    await writeFile(missingPath, missingOriginal, { mode: 0o600, flag: 'wx' });

    const checks = {
      exact_canonical_package_accepted: valid.valid === true,
      production_promotion_not_claimed: valid.production_promoted === false,
      unexpected_file_rejected: unexpectedFileRejected,
      missing_file_rejected: missingFileRejected,
      noncanonical_json_rejected: noncanonicalJsonRejected,
      wrong_producer_role_rejected: wrongRoleRejected,
      invalid_detail_contract_rejected: invalidDetailContractRejected,
      secret_field_rejected: secretFieldRejected
    };
    if (Object.values(checks).some(value => value !== true)) {
      throw new ValidationError('Pilot evidence package conformance checks failed');
    }

    const signer = identity('pilot-package-conformance');
    const unsigned = {
      schema: EVIDENCE_SCHEMA,
      status: 'passed',
      generated_at: new Date(now).toISOString(),
      scope: 'synthetic-offline-package-conformance-only',
      synthetic_fixture: true,
      live_pilot_observed: false,
      production_promotion_claimed: false,
      source: {
        kernel_version: KERNEL_VERSION,
        revision: REVISION.test(sourceRevision ?? '') ? sourceRevision : null,
        commit_bound: REVISION.test(sourceRevision ?? '')
      },
      checks,
      results: {
        canonical_control_files: valid.canonical_control_files,
        canonical_evidence_files: valid.canonical_evidence_files,
        evidence_detail_contract_version:
          valid.evidence_detail_contract_version,
        producer_roles: Object.keys(valid.producer_roles).length,
        fixture_policy_digest: digestObject(fixture.policy),
        fixture_dossier_digest: digestObject(fixture.dossier)
      },
      signer: {
        key_id: signer.keyId,
        public_key_pem: publicPem(signer)
      }
    };
    const evidence = {
      ...unsigned,
      attestation: signer.signObject(unsigned)
    };
    verifyPilotEvidencePackageConformanceEvidence(evidence);
    return evidence;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

export function verifyPilotEvidencePackageConformanceEvidence(evidence) {
  exactObject(evidence, 'Pilot package conformance evidence', [
    'schema',
    'status',
    'generated_at',
    'scope',
    'synthetic_fixture',
    'live_pilot_observed',
    'production_promotion_claimed',
    'source',
    'checks',
    'results',
    'signer',
    'attestation'
  ]);
  exactObject(evidence.source, 'Pilot package conformance source', [
    'kernel_version',
    'revision',
    'commit_bound'
  ]);
  exactObject(evidence.checks, 'Pilot package conformance checks', [
    'exact_canonical_package_accepted',
    'production_promotion_not_claimed',
    'unexpected_file_rejected',
    'missing_file_rejected',
    'noncanonical_json_rejected',
    'wrong_producer_role_rejected',
    'invalid_detail_contract_rejected',
    'secret_field_rejected'
  ]);
  exactObject(evidence.results, 'Pilot package conformance results', [
    'canonical_control_files',
    'canonical_evidence_files',
    'evidence_detail_contract_version',
    'producer_roles',
    'fixture_policy_digest',
    'fixture_dossier_digest'
  ]);
  exactObject(evidence.signer, 'Pilot package conformance signer', [
    'key_id',
    'public_key_pem'
  ]);
  exactObject(evidence.attestation, 'Pilot package conformance attestation', [
    'algorithm',
    'key_id',
    'digest',
    'signature'
  ]);
  if (
    evidence.schema !== EVIDENCE_SCHEMA
    || evidence.status !== 'passed'
    || evidence.scope !== 'synthetic-offline-package-conformance-only'
    || evidence.synthetic_fixture !== true
    || evidence.live_pilot_observed !== false
    || evidence.production_promotion_claimed !== false
    || evidence.source.kernel_version !== KERNEL_VERSION
    || (
      evidence.source.commit_bound === true
        ? !REVISION.test(evidence.source.revision ?? '')
        : evidence.source.commit_bound !== false || evidence.source.revision !== null
    )
    || Object.values(evidence.checks).some(value => value !== true)
    || evidence.results.canonical_control_files !== 2
    || evidence.results.canonical_evidence_files !== PILOT_EVIDENCE_TYPES.length
    || evidence.results.evidence_detail_contract_version
      !== PILOT_EVIDENCE_DETAIL_CONTRACT_VERSION
    || evidence.results.producer_roles !== PILOT_REVIEW_ROLES.length
    || !/^[a-f0-9]{64}$/.test(evidence.results.fixture_policy_digest ?? '')
    || !/^[a-f0-9]{64}$/.test(evidence.results.fixture_dossier_digest ?? '')
    || !Number.isFinite(Date.parse(evidence.generated_at))
    || new Date(evidence.generated_at).toISOString() !== evidence.generated_at
    || !/^[a-z][a-z0-9-]{0,63}:[a-f0-9]{16}$/.test(evidence.signer.key_id ?? '')
    || evidence.attestation.algorithm !== 'Ed25519'
    || evidence.attestation.key_id !== evidence.signer.key_id
  ) throw new ValidationError('Pilot evidence package conformance evidence is invalid');

  const publicKey = parsePublicKey(evidence.signer.public_key_pem);
  const exported = publicKey.export({ type: 'spki', format: 'pem' });
  const unsigned = structuredClone(evidence);
  delete unsigned.attestation;
  if (
    !evidence.signer.key_id.endsWith(`:${sha256(exported).slice(0, 16)}`)
    || !verifyObjectSignature(unsigned, evidence.attestation, publicKey)
  ) throw new ValidationError('Pilot evidence package conformance signature is invalid');
  return {
    valid: true,
    schema: evidence.schema,
    live_pilot_observed: false,
    production_promotion_claimed: false
  };
}

function syntheticEvidenceDetails({
  type,
  metadata,
  dossier,
  policy,
  index
}) {
  const digest = offset => syntheticPackageDigest((index * 10) + offset);
  switch (type) {
    case 'deployment_manifest':
      return {
        environment: dossier.deployment.environment,
        platform: dossier.deployment.platform,
        region: dossier.deployment.region,
        topology: dossier.deployment.topology,
        service_units: [...dossier.deployment.service_units],
        non_public: dossier.deployment.non_public,
        public_ingress: dossier.deployment.public_ingress,
        deny_egress: dossier.deployment.deny_egress,
        resource_limits_enforced:
          dossier.deployment.resource_limits_enforced,
        pilot_owned_receivers: dossier.deployment.pilot_owned_receivers,
        actual_provider_adapter: dossier.deployment.actual_provider_adapter,
        scheduled_restore_from_pilot_media:
          dossier.deployment.scheduled_restore_from_pilot_media
      };
    case 'image_provenance':
      return {
        source_revision: dossier.build.source_revision,
        image_digest: dossier.build.image_digest,
        source_archive_sha256: digest(1),
        sbom_sha256: digest(2),
        provenance_sha256: digest(3),
        container_manifest_sha256: digest(4),
        reproducible_source_verified: true,
        image_signature_verified: true
      };
    case 'availability_observation':
      return {
        ...dossier.observation,
        availability_percent: dossier.measurements.availability_percent,
        successful_intents: dossier.measurements.successful_intents,
        failed_intents: dossier.measurements.failed_intents,
        acknowledged_mutation_evidence_loss:
          dossier.measurements.acknowledged_mutation_evidence_loss
      };
    case 'capacity_measurement':
      return {
        profile_id: 'synthetic_capacity_profile',
        peak_concurrency: 4,
        successful_intents: dossier.measurements.successful_intents,
        failed_intents: dossier.measurements.failed_intents,
        p95_intent_latency_ms:
          dossier.measurements.p95_intent_latency_ms,
        resource_limits_enforced:
          dossier.deployment.resource_limits_enforced,
        overload_rejection_verified: true,
        dependency_loss_recovery_verified: true,
        saturation_within_limits: true
      };
    case 'external_telemetry':
      return {
        receiver_owner: 'synthetic_pilot_operator',
        retention_policy_id: 'synthetic_retention_policy',
        metrics_transport_authenticated: true,
        alert_transport_authenticated: true,
        fixed_vocabulary_enforced: true,
        sensitive_values_omitted: true,
        critical_alert_ack_minutes:
          dossier.measurements.critical_alert_ack_minutes,
        delivery_receipts_verified: true
      };
    case 'provider_assessment': {
      const custody = dossier.custody.find(
        item => item.control === 'provider_secret_signer'
      );
      return {
        adapter_id: 'synthetic_provider_adapter',
        adapter_sha256: digest(1),
        backend: custody.backend,
        workload_identity: custody.workload_identity,
        backend_authorization_least_privilege: true,
        provider_signer_pinned: true,
        nonce_freshness_verified: true,
        rotation_observed: true,
        rollback_verified: true,
        private_runtime_cleanup_verified: true
      };
    }
    case 'custody_assessment':
      return {
        controls: dossier.custody.map(item => ({
          control: item.control,
          backend: item.backend,
          custodian: item.custodian,
          workload_identity: item.workload_identity,
          exportable: item.exportable,
          rotation_observed: item.rotation_observed,
          receipt_sha256: item.receipt_sha256
        })),
        all_non_exportable: true,
        separation_of_duties_verified: true
      };
    case 'scheduled_restore':
      return {
        media_owner: 'synthetic_pilot_operator',
        backup_id: 'synthetic_pilot_backup',
        backup_sha256: digest(1),
        restored_at: metadata.observed_at,
        rpo_minutes: dossier.measurements.backup_rpo_minutes,
        rto_minutes: dossier.measurements.restore_rto_minutes,
        pilot_owned_media: true,
        wrong_key_rejected: true,
        state_integrity_verified: true,
        rollback_verified: true
      };
    case 'credential_rotation':
      return {
        custody_backend: dossier.custody.find(
          item => item.control === 'service_identities'
        ).backend,
        rotated_service_identities: [
          'gateway',
          'grid',
          'hypervisor',
          'sandbox'
        ],
        operator_token_rotated: true,
        telemetry_token_rotated: true,
        retired_credentials_rejected: true,
        trust_lineage_verified: true,
        rollback_verified: true,
        secret_values_omitted: true
      };
    case 'data_key_rotation':
      return {
        custody_backend: dossier.custody.find(
          item => item.control === 'data_protection_key'
        ).backend,
        live_state_reencrypted: true,
        retained_backups_reencrypted: true,
        recovery_copies_reencrypted: true,
        wrong_key_rejected: true,
        restore_verified: true,
        interruption_recovery_verified: true,
        rollback_verified: true,
        old_key_retired: true
      };
    case 'credential_history_attestations':
      return {
        expected_entries:
          policy.requirements.expected_deprecated_history_entries,
        verified_entries:
          policy.requirements.expected_deprecated_history_entries,
        not_applicable_entries: 0,
        pending_entries: 0,
        repository_reintroduced: 0,
        external_dispositions_complete: true,
        disposition_ledger_sha256: digest(1)
      };
    case 'incident_tabletop':
      return {
        exercise_id: 'synthetic_facilitated_tabletop',
        facilitated: true,
        named_responders: [
          'synthetic_incident_commander',
          'synthetic_operations_lead'
        ],
        independent_reviewer_id: policy.reviewers.find(
          item => item.role === 'independent_reviewer'
        ).reviewer_id,
        notification_decisions_recorded: true,
        evidence_preserved: true,
        containment_verified: true,
        recovery_verified: true,
        communications_verified: true,
        closure_verified: true,
        unresolved_critical_findings: 0,
        unresolved_high_findings: 0
      };
    case 'independent_security_review':
      return {
        review_id: 'synthetic_independent_review',
        reviewer_organization: 'synthetic_review_organization',
        reviewer_id: policy.reviewers.find(
          item => item.role === 'independent_reviewer'
        ).reviewer_id,
        completed_at: metadata.observed_at,
        scope: [
          'container_policy',
          'kernel',
          'pilot_evidence_intake',
          'provider_boundary'
        ],
        report_sha256: digest(1),
        findings: {
          critical: 0,
          high: 0,
          medium: 0,
          low: 0
        },
        unresolved_critical_findings: 0,
        unresolved_high_findings: 0,
        remediation_owners_assigned: true,
        residual_risk_documented: true
      };
    default:
      throw new ValidationError(`Unsupported synthetic pilot evidence: ${type}`);
  }
}

function syntheticPackageDigest(seed) {
  return `sha256:${String(seed + 1).padStart(64, '0')}`;
}

async function writeCanonicalControlFiles(root, fixture) {
  resignDossier(fixture);
  await Promise.all([
    writeFile(join(root, 'policy.json'), canonicalJson(fixture.policy), {
      encoding: 'utf8',
      mode: 0o600
    }),
    writeFile(join(root, 'dossier.json'), canonicalJson(fixture.dossier), {
      encoding: 'utf8',
      mode: 0o600
    })
  ]);
}

async function bindEvidenceDigestAndResign(root, fixture, type) {
  const path = join(root, 'evidence', `${type}.json`);
  const raw = await readFile(path);
  const metadata = fixture.dossier.evidence.find(item => item.type === type);
  metadata.sha256 = `sha256:${sha256(raw)}`;
  await writeCanonicalControlFiles(root, fixture);
}

function resignDossier(fixture) {
  fixture.dossier.approvals = [];
  const observationEndedAt = Date.parse(fixture.dossier.observation.ended_at);
  fixture.dossier.approvals = fixture.reviewerIdentities.map((reviewer, index) => {
    const approval = {
      role: PILOT_REVIEW_ROLES[index],
      reviewer_id: fixture.policy.reviewers[index].reviewer_id,
      decision: 'approved-for-promotion-review',
      signed_at: new Date(observationEndedAt + ((index + 1) * 60_000)).toISOString()
    };
    return {
      ...approval,
      attestation: reviewer.signObject(pilotApprovalPayload(fixture.dossier, approval))
    };
  });
}

function resignEnvelope(fixture, type, envelope) {
  const role = PILOT_EVIDENCE_PRODUCER_ROLES[type];
  const index = PILOT_REVIEW_ROLES.indexOf(role);
  envelope.attestation = fixture.reviewerIdentities[index].signObject(
    pilotEvidenceEnvelopePayload(envelope)
  );
}

async function rejects(callback) {
  try {
    await callback();
    return false;
  } catch (error) {
    return error instanceof ValidationError;
  }
}

function identity(service) {
  const pair = generateKeyPairSync('ed25519');
  return new MeshIdentity(
    service,
    pair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    pair.publicKey.export({ type: 'spki', format: 'pem' })
  );
}

function publicPem(identityValue) {
  return identityValue.publicKey.export({ type: 'spki', format: 'pem' });
}

function parsePublicKey(pem) {
  if (
    typeof pem !== 'string'
    || !pem.includes('-----BEGIN PUBLIC KEY-----')
    || pem.includes('PRIVATE KEY')
  ) throw new ValidationError('Pilot package conformance signer is invalid');
  try {
    const key = createPublicKey(pem);
    if (key.asymmetricKeyType !== 'ed25519') throw new Error('not Ed25519');
    return key;
  } catch {
    throw new ValidationError('Pilot package conformance signer is invalid');
  }
}

function exactObject(value, name, keys) {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...keys].sort())
  ) throw new ValidationError(`${name} fields are invalid`);
}

async function main() {
  if (process.argv.length !== 2) {
    throw new ValidationError(
      'Usage: node src/pilot-evidence-package-drill.mjs'
    );
  }
  process.stdout.write(`${JSON.stringify(
    await runPilotEvidencePackageConformanceDrill(),
    null,
    2
  )}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
