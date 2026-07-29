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
  PILOT_EVIDENCE_TYPES,
  PILOT_REVIEW_ROLES,
  pilotApprovalPayload
} from './pilot-dossier.mjs';
import {
  createSyntheticPilotFixture
} from './pilot-dossier-conformance-drill.mjs';

const EVIDENCE_SCHEMA =
  'axiom-pilot-evidence-package-verifier-conformance-evidence.v1';
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
      details: {
        synthetic_fixture: true,
        sequence: index + 1,
        live_system_observed: false
      },
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
    'secret_field_rejected'
  ]);
  exactObject(evidence.results, 'Pilot package conformance results', [
    'canonical_control_files',
    'canonical_evidence_files',
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
