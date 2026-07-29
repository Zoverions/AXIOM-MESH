import { createPublicKey, generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { digestObject, sha256, ValidationError } from './lib/canonical.mjs';
import { MeshIdentity, verifyObjectSignature } from './lib/identity.mjs';
import {
  PILOT_CUSTODY_CONTROLS,
  PILOT_DOSSIER_SCHEMA,
  PILOT_EVIDENCE_SCHEMAS,
  PILOT_EVIDENCE_TYPES,
  PILOT_POLICY_SCHEMA,
  PILOT_REVIEW_ROLES,
  PILOT_TRUST_ROOTS,
  pilotApprovalPayload,
  validatePilotReviewPolicy,
  verifyPilotDossier
} from './pilot-dossier.mjs';

const EVIDENCE_SCHEMA = 'axiom-pilot-dossier-verifier-conformance-evidence.v1';
const KERNEL_VERSION = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
).version;
const REVISION = /^[a-f0-9]{40}$/;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export function createSyntheticPilotFixture({ now = Date.now() } = {}) {
  const authority = identity('pilot-policy-authority');
  const reviewers = PILOT_REVIEW_ROLES.map(role => identity(`pilot-${role.replaceAll('_', '-')}`));
  const generatedAt = now - DAY;
  const observationEndedAt = generatedAt - HOUR;
  const observationStartedAt = observationEndedAt - (720 * HOUR);
  const build = {
    kernel_version: '0.12.0-dev.0',
    source_revision: 'a'.repeat(40),
    image_digest: `sha256:${'b'.repeat(64)}`
  };
  const policy = {
    schema: PILOT_POLICY_SCHEMA,
    version: 1,
    policy_id: 'pilot_policy_conformance_only',
    issued_at: new Date(observationStartedAt - DAY).toISOString(),
    expires_at: new Date(now + (30 * DAY)).toISOString(),
    build,
    requirements: {
      minimum_observation_hours: 720,
      minimum_availability_percent: 99.5,
      minimum_successful_intents: 1_000,
      maximum_p95_intent_latency_ms: 2_000,
      maximum_backup_rpo_minutes: 1_440,
      maximum_restore_rto_minutes: 240,
      maximum_critical_alert_ack_minutes: 30,
      expected_deprecated_history_entries: 32,
      evidence_max_age_days: 30,
      required_evidence: [...PILOT_EVIDENCE_TYPES]
    },
    reviewers: reviewers.map((reviewer, index) => ({
      role: PILOT_REVIEW_ROLES[index],
      reviewer_id: `synthetic_${PILOT_REVIEW_ROLES[index]}`,
      key_id: reviewer.keyId,
      public_key_pem: publicPem(reviewer)
    })),
    authority: {
      key_id: authority.keyId
    }
  };
  policy.attestation = authority.signObject(policy);

  const dossier = {
    schema: PILOT_DOSSIER_SCHEMA,
    version: 1,
    dossier_id: 'pilot_dossier_conformance_only',
    policy_id: policy.policy_id,
    claim: 'pilot-evidence-submitted-for-review',
    generated_at: new Date(generatedAt).toISOString(),
    build,
    deployment: {
      deployment_id: 'synthetic_pilot_deployment',
      environment: 'isolated-non-public-pilot',
      platform: 'synthetic_platform',
      region: 'synthetic_region',
      deployed_at: new Date(observationStartedAt - HOUR).toISOString(),
      topology: 'independent-service-units',
      service_units: ['gateway', 'grid', 'hypervisor', 'sandbox'],
      non_public: true,
      public_ingress: false,
      deny_egress: true,
      resource_limits_enforced: true,
      pilot_owned_receivers: true,
      actual_provider_adapter: true,
      scheduled_restore_from_pilot_media: true
    },
    observation: {
      started_at: new Date(observationStartedAt).toISOString(),
      ended_at: new Date(observationEndedAt).toISOString(),
      duration_hours: 720,
      continuous: true
    },
    measurements: {
      availability_percent: 99.9,
      successful_intents: 10_000,
      failed_intents: 2,
      p95_intent_latency_ms: 850,
      acknowledged_mutation_evidence_loss: 0,
      backup_rpo_minutes: 720,
      restore_rto_minutes: 90,
      critical_alert_ack_minutes: 12,
      deprecated_history_entries_disposed: 32
    },
    trust_roots: PILOT_TRUST_ROOTS.map((type, index) => ({
      type,
      digest: syntheticDigest(10 + index)
    })),
    custody: PILOT_CUSTODY_CONTROLS.map((control, index) => ({
      control,
      backend: `synthetic_backend_${index}`,
      custodian: `synthetic_custodian_${index}`,
      workload_identity: `synthetic_workload_${index}`,
      exportable: false,
      rotation_observed: true,
      receipt_reference: `synthetic://custody/${control}`,
      receipt_sha256: syntheticDigest(30 + index),
      observed_at: new Date(observationEndedAt - ((index + 1) * HOUR)).toISOString()
    })),
    evidence: PILOT_EVIDENCE_TYPES.map((type, index) => ({
      type,
      schema: PILOT_EVIDENCE_SCHEMAS[type],
      reference: `synthetic://evidence/${type}`,
      sha256: syntheticDigest(60 + index),
      source_revision: build.source_revision,
      image_digest: build.image_digest,
      observed_at: new Date(observationEndedAt - ((index + 1) * HOUR)).toISOString(),
      disposition: 'passed',
      independently_verified: true
    })),
    approvals: []
  };
  dossier.approvals = reviewers.map((reviewer, index) => {
    const approval = {
      role: PILOT_REVIEW_ROLES[index],
      reviewer_id: policy.reviewers[index].reviewer_id,
      decision: 'approved-for-promotion-review',
      signed_at: new Date(observationEndedAt + ((index + 1) * 60_000)).toISOString()
    };
    return {
      ...approval,
      attestation: reviewer.signObject(pilotApprovalPayload(dossier, approval))
    };
  });
  return {
    authority,
    authorityPublicKey: publicPem(authority),
    reviewerIdentities: reviewers,
    policy,
    dossier
  };
}

export function runPilotDossierConformanceDrill({
  now = Date.now(),
  sourceRevision = process.env.GITHUB_SHA
} = {}) {
  const fixture = createSyntheticPilotFixture({ now });
  const policyResult = validatePilotReviewPolicy(
    fixture.policy,
    fixture.authorityPublicKey,
    { now }
  );
  const dossierResult = verifyPilotDossier(
    fixture.dossier,
    fixture.policy,
    fixture.authorityPublicKey,
    { now }
  );

  const wrongBuild = structuredClone(fixture.dossier);
  wrongBuild.build.image_digest = syntheticDigest(200);
  const tamperedApproval = structuredClone(fixture.dossier);
  tamperedApproval.approvals[4].decision = 'approved';
  const missingEvidence = structuredClone(fixture.dossier);
  missingEvidence.evidence.pop();
  const secretBearing = structuredClone(fixture.dossier);
  secretBearing.deployment.private_key = 'forbidden';

  const checks = {
    authority_signature_verified: policyResult.valid === true,
    valid_synthetic_fixture_accepted: dossierResult.valid === true,
    production_promotion_not_claimed: dossierResult.production_promoted === false,
    wrong_build_rejected: rejects(() => verifyPilotDossier(
      wrongBuild,
      fixture.policy,
      fixture.authorityPublicKey,
      { now }
    )),
    tampered_approval_rejected: rejects(() => verifyPilotDossier(
      tamperedApproval,
      fixture.policy,
      fixture.authorityPublicKey,
      { now }
    )),
    incomplete_evidence_rejected: rejects(() => verifyPilotDossier(
      missingEvidence,
      fixture.policy,
      fixture.authorityPublicKey,
      { now }
    )),
    secret_field_rejected: rejects(() => verifyPilotDossier(
      secretBearing,
      fixture.policy,
      fixture.authorityPublicKey,
      { now }
    ))
  };
  if (Object.values(checks).some(value => value !== true)) {
    throw new ValidationError('Pilot dossier conformance checks failed');
  }

  const signer = identity('pilot-dossier-conformance');
  const unsigned = {
    schema: EVIDENCE_SCHEMA,
    status: 'passed',
    generated_at: new Date(now).toISOString(),
    scope: 'synthetic-schema-and-signature-conformance-only',
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
      reviewer_roles: PILOT_REVIEW_ROLES.length,
      required_evidence_items: PILOT_EVIDENCE_TYPES.length,
      required_custody_controls: PILOT_CUSTODY_CONTROLS.length,
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
  verifyPilotDossierConformanceEvidence(evidence);
  return evidence;
}

export function verifyPilotDossierConformanceEvidence(evidence) {
  if (
    !evidence
    || canonicalKeys(evidence) !== canonicalKeys({
      schema: 0,
      status: 0,
      generated_at: 0,
      scope: 0,
      synthetic_fixture: 0,
      live_pilot_observed: 0,
      production_promotion_claimed: 0,
      source: 0,
      checks: 0,
      results: 0,
      signer: 0,
      attestation: 0
    })
    || evidence.schema !== EVIDENCE_SCHEMA
    || evidence.status !== 'passed'
    || evidence.scope !== 'synthetic-schema-and-signature-conformance-only'
    || evidence.synthetic_fixture !== true
    || evidence.live_pilot_observed !== false
    || evidence.production_promotion_claimed !== false
    || canonicalKeys(evidence.source) !== canonicalKeys({
      kernel_version: 0,
      revision: 0,
      commit_bound: 0
    })
    || evidence.source.kernel_version !== KERNEL_VERSION
    || (
      evidence.source.commit_bound === true
        ? !REVISION.test(evidence.source.revision ?? '')
        : evidence.source.commit_bound !== false || evidence.source.revision !== null
    )
    || canonicalKeys(evidence.checks) !== canonicalKeys({
      authority_signature_verified: 0,
      valid_synthetic_fixture_accepted: 0,
      production_promotion_not_claimed: 0,
      wrong_build_rejected: 0,
      tampered_approval_rejected: 0,
      incomplete_evidence_rejected: 0,
      secret_field_rejected: 0
    })
    || Object.values(evidence.checks).some(value => value !== true)
    || canonicalKeys(evidence.results) !== canonicalKeys({
      reviewer_roles: 0,
      required_evidence_items: 0,
      required_custody_controls: 0,
      fixture_policy_digest: 0,
      fixture_dossier_digest: 0
    })
    || evidence.results?.reviewer_roles !== PILOT_REVIEW_ROLES.length
    || evidence.results?.required_evidence_items !== PILOT_EVIDENCE_TYPES.length
    || evidence.results?.required_custody_controls !== PILOT_CUSTODY_CONTROLS.length
    || !/^[a-f0-9]{64}$/.test(evidence.results?.fixture_policy_digest ?? '')
    || !/^[a-f0-9]{64}$/.test(evidence.results?.fixture_dossier_digest ?? '')
    || !Number.isFinite(Date.parse(evidence.generated_at))
    || new Date(evidence.generated_at).toISOString() !== evidence.generated_at
    || canonicalKeys(evidence.signer) !== canonicalKeys({
      key_id: 0,
      public_key_pem: 0
    })
    || canonicalKeys(evidence.attestation) !== canonicalKeys({
      algorithm: 0,
      key_id: 0,
      digest: 0,
      signature: 0
    })
    || !/^[a-z][a-z0-9-]{0,63}:[a-f0-9]{16}$/.test(evidence.signer?.key_id ?? '')
    || evidence.attestation?.algorithm !== 'Ed25519'
    || !/^[a-f0-9]{64}$/.test(evidence.attestation?.digest ?? '')
    || !/^[A-Za-z0-9_-]{80,128}$/.test(evidence.attestation?.signature ?? '')
  ) throw new ValidationError('Pilot dossier conformance evidence is invalid');
  const unsigned = structuredClone(evidence);
  delete unsigned.attestation;
  const key = createPublicKeyStrict(evidence.signer?.public_key_pem);
  if (
    !evidence.signer.key_id.endsWith(
      `:${sha256(evidence.signer.public_key_pem).slice(0, 16)}`
    )
    || evidence.attestation?.key_id !== evidence.signer?.key_id
    || !verifyObjectSignature(unsigned, evidence.attestation, key)
  ) throw new ValidationError('Pilot dossier conformance signature is invalid');
  return {
    valid: true,
    schema: evidence.schema,
    live_pilot_observed: false,
    production_promotion_claimed: false
  };
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

function syntheticDigest(seed) {
  return `sha256:${Number(seed).toString(16).padStart(64, '0')}`;
}

function rejects(callback) {
  try {
    callback();
    return false;
  } catch (error) {
    return error instanceof ValidationError;
  }
}

function createPublicKeyStrict(pem) {
  if (
    typeof pem !== 'string'
    || !pem.includes('-----BEGIN PUBLIC KEY-----')
    || pem.includes('PRIVATE KEY')
  ) throw new ValidationError('Pilot dossier conformance signer is invalid');
  try {
    const key = createPublicKey(pem);
    if (key.asymmetricKeyType !== 'ed25519') throw new Error('not Ed25519');
    return key;
  } catch {
    throw new ValidationError('Pilot dossier conformance signer is invalid');
  }
}

function canonicalKeys(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  return Object.keys(value).sort().join('\n');
}

async function main() {
  if (process.argv.length !== 2) {
    throw new ValidationError(
      'Usage: node src/pilot-dossier-conformance-drill.mjs'
    );
  }
  process.stdout.write(`${JSON.stringify(
    runPilotDossierConformanceDrill(),
    null,
    2
  )}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
