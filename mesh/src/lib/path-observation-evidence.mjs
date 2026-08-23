import { createPublicKey, verify } from 'node:crypto';

import {
  canonicalJson,
  digestObject,
  sha256,
  ValidationError
} from './canonical.mjs';
import { validateResilientPathFabric } from './resilient-path-fabric.mjs';

export const PATH_OBSERVATION_EVIDENCE_SCHEMA = 'axiom-path-observation-evidence.v0';
export const PATH_OBSERVATION_EVIDENCE_STATUS = 'inert-evidence-laboratory';
export const PATH_OBSERVATION_STATEMENT_SCHEMA = 'axiom-path-observation-statement.v0';

export const PATH_OBSERVATION_REQUIRED_ROLE_BY_KIND = Object.freeze({
  'node-profile': 'node-profile-authority',
  'node-attestation': 'attestation-verifier',
  'node-energy': 'energy-observer',
  'link-profile': 'link-profile-authority',
  'link-latency': 'telemetry-observer',
  'link-regulatory': 'regulatory-authority',
  'link-failure-domains': 'failure-domain-auditor'
});

export const PATH_OBSERVATION_KINDS = Object.freeze(
  Object.keys(PATH_OBSERVATION_REQUIRED_ROLE_BY_KIND)
);

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const MAX_EVIDENCE_RECORDS = 8192;

export function validatePathObservationEvidence(
  pathFabricDocument,
  evidencePackage,
  {
    trustedSigners,
    evaluatedAt,
    maxAgeSecondsByKind
  } = {}
) {
  const pathFabric = validateResilientPathFabric(pathFabricDocument);
  const evaluationTime = parseEvaluationTime(evaluatedAt);
  const freshnessPolicy = normalizeFreshnessPolicy(maxAgeSecondsByKind);
  const trustPolicy = normalizeTrustedSigners(trustedSigners);

  exactObject(evidencePackage, 'Path observation evidence package', [
    'schema',
    'version',
    'status',
    'portfolio_digest',
    'evidence_records',
    'authority_effect',
    'network_effect',
    'runtime_activation'
  ]);

  if (
    evidencePackage.schema !== PATH_OBSERVATION_EVIDENCE_SCHEMA
    || evidencePackage.version !== 0
    || evidencePackage.status !== PATH_OBSERVATION_EVIDENCE_STATUS
    || evidencePackage.authority_effect !== 'none'
    || evidencePackage.network_effect !== 'none'
    || evidencePackage.runtime_activation !== false
  ) {
    throw new ValidationError('Path observation evidence activation boundary is invalid');
  }

  digest(evidencePackage.portfolio_digest, 'portfolio_digest');
  if (evidencePackage.portfolio_digest !== pathFabric.portfolio_digest) {
    throw new ValidationError('Path observation evidence does not bind the exact path portfolio');
  }

  if (
    !Array.isArray(evidencePackage.evidence_records)
    || evidencePackage.evidence_records.length < 1
    || evidencePackage.evidence_records.length > MAX_EVIDENCE_RECORDS
  ) {
    throw new ValidationError(`Path observation evidence requires 1-${MAX_EVIDENCE_RECORDS} records`);
  }

  const expectedClaims = buildExpectedClaims(pathFabricDocument);
  const seenEvidenceIds = new Set();
  const seenClaimKeys = new Set();
  const seenSignerNonces = new Set();
  const sourceDigestByRef = new Map();
  const statementDigests = [];

  for (let index = 0; index < evidencePackage.evidence_records.length; index += 1) {
    const normalized = validateEvidenceRecord(
      evidencePackage.evidence_records[index],
      index,
      expectedClaims,
      pathFabric.portfolio_digest,
      trustPolicy.bySignerId,
      evaluationTime,
      freshnessPolicy
    );

    if (seenEvidenceIds.has(normalized.statement.evidence_id)) {
      throw new ValidationError(`Evidence id ${normalized.statement.evidence_id} is duplicated`);
    }
    seenEvidenceIds.add(normalized.statement.evidence_id);

    const claimKey = evidenceClaimKey(
      normalized.statement.kind,
      normalized.statement.subject_id
    );
    if (seenClaimKeys.has(claimKey)) {
      throw new ValidationError(`Evidence claim ${claimKey} is duplicated`);
    }
    seenClaimKeys.add(claimKey);

    const signerNonceKey = `${normalized.statement.signer_id}:${normalized.statement.nonce}`;
    if (seenSignerNonces.has(signerNonceKey)) {
      throw new ValidationError(
        `Evidence signer nonce ${signerNonceKey} is reused within the package`
      );
    }
    seenSignerNonces.add(signerNonceKey);

    const priorSourceDigest = sourceDigestByRef.get(normalized.statement.source_ref);
    if (priorSourceDigest && priorSourceDigest !== normalized.statement.source_digest) {
      throw new ValidationError(
        `Evidence source ${normalized.statement.source_ref} maps to inconsistent source digests`
      );
    }
    sourceDigestByRef.set(
      normalized.statement.source_ref,
      normalized.statement.source_digest
    );

    statementDigests.push(normalized.statement_digest);
  }

  if (seenClaimKeys.size !== expectedClaims.size) {
    const missing = [...expectedClaims.keys()]
      .filter(key => !seenClaimKeys.has(key))
      .sort();
    throw new ValidationError(
      `Path observation evidence coverage is incomplete${missing.length ? `: missing ${missing.join(', ')}` : ''}`
    );
  }

  for (const claimKey of seenClaimKeys) {
    if (!expectedClaims.has(claimKey)) {
      throw new ValidationError(`Path observation evidence contains unexpected claim ${claimKey}`);
    }
  }

  statementDigests.sort();
  const verificationPolicyDigest = digestObject({
    evaluated_at: evaluationTime.toISOString(),
    freshness_policy: freshnessPolicy,
    trusted_signers: trustPolicy.digestEntries
  });
  const verificationDigest = digestObject({
    schema: PATH_OBSERVATION_EVIDENCE_SCHEMA,
    portfolio_digest: pathFabric.portfolio_digest,
    verification_policy_digest: verificationPolicyDigest,
    statement_digests: statementDigests
  });

  return Object.freeze({
    valid: true,
    schema: PATH_OBSERVATION_EVIDENCE_SCHEMA,
    portfolio_digest: pathFabric.portfolio_digest,
    evaluated_at: evaluationTime.toISOString(),
    evidence_count: statementDigests.length,
    claim_attribution_complete: true,
    signatures_verified: true,
    freshness_satisfied: true,
    source_artifacts_reproduced: false,
    truth_established: false,
    verification_policy_digest: verificationPolicyDigest,
    verification_digest: verificationDigest,
    authority_effect: 'none',
    network_effect: 'none',
    runtime_activation: false,
    live_routing_changed: false,
    radio_control_performed: false
  });
}

function buildExpectedClaims(pathFabricDocument) {
  const expected = new Map();

  for (const node of pathFabricDocument.nodes) {
    addExpected(expected, 'node-profile', node.node_id, {
      role: node.role,
      transit_allowed: node.transit_allowed,
      compute_class: node.compute_class,
      maintenance_class: node.maintenance_class
    });
    addExpected(expected, 'node-attestation', node.node_id, {
      attestation_state: node.attestation_state
    });
    addExpected(expected, 'node-energy', node.node_id, {
      energy_state: node.energy_state
    });
  }

  for (const link of pathFabricDocument.links) {
    addExpected(expected, 'link-profile', link.link_id, {
      from_node_id: link.from_node_id,
      to_node_id: link.to_node_id,
      medium: link.medium,
      maintenance_class: link.maintenance_class
    });
    addExpected(expected, 'link-latency', link.link_id, {
      observed_latency_ms: link.observed_latency_ms
    });
    addExpected(expected, 'link-regulatory', link.link_id, {
      regulatory_state: link.regulatory_state
    });
    addExpected(expected, 'link-failure-domains', link.link_id, {
      failure_domains: link.failure_domains
    });
  }

  return expected;
}

function addExpected(expected, kind, subjectId, claims) {
  expected.set(evidenceClaimKey(kind, subjectId), claims);
}

function validateEvidenceRecord(
  record,
  index,
  expectedClaims,
  portfolioDigest,
  trustedSignerById,
  evaluationTime,
  freshnessPolicy
) {
  exactObject(record, `evidence_records[${index}]`, ['statement', 'signature']);
  const statement = record.statement;
  exactObject(statement, `evidence_records[${index}].statement`, [
    'schema',
    'portfolio_digest',
    'evidence_id',
    'kind',
    'subject_id',
    'observed_at',
    'valid_until',
    'source_ref',
    'source_digest',
    'signer_id',
    'nonce',
    'claims'
  ]);

  if (statement.schema !== PATH_OBSERVATION_STATEMENT_SCHEMA) {
    throw new ValidationError(`Evidence record ${index} statement schema is invalid`);
  }
  digest(statement.portfolio_digest, `evidence_records[${index}].statement.portfolio_digest`);
  if (statement.portfolio_digest !== portfolioDigest) {
    throw new ValidationError(
      `Evidence record ${index} does not bind the exact path portfolio`
    );
  }
  identifier(statement.evidence_id, `evidence_records[${index}].statement.evidence_id`);
  if (!PATH_OBSERVATION_KINDS.includes(statement.kind)) {
    throw new ValidationError(`Evidence record ${statement.evidence_id} kind is invalid`);
  }
  identifier(statement.subject_id, `evidence_records[${index}].statement.subject_id`);
  identifier(statement.source_ref, `evidence_records[${index}].statement.source_ref`);
  digest(statement.source_digest, `evidence_records[${index}].statement.source_digest`);
  identifier(statement.signer_id, `evidence_records[${index}].statement.signer_id`);
  identifier(statement.nonce, `evidence_records[${index}].statement.nonce`);

  const claimKey = evidenceClaimKey(statement.kind, statement.subject_id);
  const expected = expectedClaims.get(claimKey);
  if (!expected) {
    throw new ValidationError(`Evidence record ${statement.evidence_id} references an unexpected claim ${claimKey}`);
  }
  exactClaims(statement.kind, statement.claims);
  if (canonicalJson(statement.claims) !== canonicalJson(expected)) {
    throw new ValidationError(`Evidence record ${statement.evidence_id} does not match the exact path-fabric claim`);
  }

  const observedAt = parseTimestamp(statement.observed_at, 'observed_at');
  const validUntil = parseTimestamp(statement.valid_until, 'valid_until');
  if (observedAt > evaluationTime) {
    throw new ValidationError(`Evidence record ${statement.evidence_id} is dated in the future`);
  }
  if (validUntil <= observedAt || validUntil < evaluationTime) {
    throw new ValidationError(`Evidence record ${statement.evidence_id} is expired or has an invalid validity window`);
  }
  const ageSeconds = Math.floor((evaluationTime.valueOf() - observedAt.valueOf()) / 1000);
  if (ageSeconds > freshnessPolicy[statement.kind]) {
    throw new ValidationError(`Evidence record ${statement.evidence_id} exceeds the configured freshness limit`);
  }

  const trustedSigner = trustedSignerById.get(statement.signer_id);
  if (!trustedSigner) {
    throw new ValidationError(`Evidence signer ${statement.signer_id} is not in the evaluator trust set`);
  }
  const requiredRole = PATH_OBSERVATION_REQUIRED_ROLE_BY_KIND[statement.kind];
  if (!trustedSigner.roles.has(requiredRole)) {
    throw new ValidationError(
      `Evidence signer ${statement.signer_id} is not trusted for required role ${requiredRole}`
    );
  }

  verifyEvidenceSignature(statement, record.signature, trustedSigner.publicKey);
  return Object.freeze({
    statement,
    statement_digest: digestObject(statement)
  });
}

function exactClaims(kind, claims) {
  switch (kind) {
    case 'node-profile':
      exactObject(claims, 'node-profile claims', [
        'role',
        'transit_allowed',
        'compute_class',
        'maintenance_class'
      ]);
      return;
    case 'node-attestation':
      exactObject(claims, 'node-attestation claims', ['attestation_state']);
      return;
    case 'node-energy':
      exactObject(claims, 'node-energy claims', ['energy_state']);
      return;
    case 'link-profile':
      exactObject(claims, 'link-profile claims', [
        'from_node_id',
        'to_node_id',
        'medium',
        'maintenance_class'
      ]);
      return;
    case 'link-latency':
      exactObject(claims, 'link-latency claims', ['observed_latency_ms']);
      return;
    case 'link-regulatory':
      exactObject(claims, 'link-regulatory claims', ['regulatory_state']);
      return;
    case 'link-failure-domains':
      exactObject(claims, 'link-failure-domains claims', ['failure_domains']);
      return;
    default:
      throw new ValidationError(`Unsupported path observation evidence kind ${kind}`);
  }
}

function verifyEvidenceSignature(statement, signature, publicKey) {
  if (typeof signature !== 'string' || signature.length < 1 || signature.length > 1024) {
    throw new ValidationError('Path observation evidence signature is invalid');
  }
  let valid = false;
  try {
    valid = verify(
      null,
      Buffer.from(canonicalJson(statement)),
      publicKey,
      Buffer.from(signature, 'base64url')
    );
  } catch {
    valid = false;
  }
  if (!valid) throw new ValidationError('Path observation evidence signature is invalid');
}

function normalizeTrustedSigners(trustedSigners) {
  if (!trustedSigners || typeof trustedSigners !== 'object' || Array.isArray(trustedSigners)) {
    throw new ValidationError('trustedSigners must be an externally supplied signer map');
  }
  const bySignerId = new Map();
  const digestEntries = [];

  for (const signerId of Object.keys(trustedSigners).sort()) {
    identifier(signerId, `trustedSigners.${signerId}`);
    const signer = trustedSigners[signerId];
    exactObject(signer, `trustedSigners.${signerId}`, ['public_key', 'roles']);
    if (typeof signer.public_key !== 'string' || signer.public_key.length < 1 || signer.public_key.length > 8192) {
      throw new ValidationError(`trustedSigners.${signerId}.public_key is invalid`);
    }
    if (!Array.isArray(signer.roles) || signer.roles.length < 1 || signer.roles.length > 32) {
      throw new ValidationError(`trustedSigners.${signerId}.roles must contain 1-32 roles`);
    }
    const roles = new Set();
    for (const role of signer.roles) {
      identifier(role, `trustedSigners.${signerId}.roles`);
      if (roles.has(role)) throw new ValidationError(`trustedSigners.${signerId}.roles contains duplicates`);
      roles.add(role);
    }

    let publicKey;
    try {
      publicKey = createPublicKey(signer.public_key);
    } catch {
      throw new ValidationError(`trustedSigners.${signerId}.public_key is invalid`);
    }
    if (publicKey.asymmetricKeyType !== 'ed25519') {
      throw new ValidationError(`trustedSigners.${signerId}.public_key must use Ed25519`);
    }

    bySignerId.set(signerId, Object.freeze({ publicKey, roles }));
    digestEntries.push({
      signer_id: signerId,
      public_key_digest: sha256(signer.public_key),
      roles: [...roles].sort()
    });
  }

  if (bySignerId.size < 1) {
    throw new ValidationError('trustedSigners must contain at least one signer');
  }
  return Object.freeze({ bySignerId, digestEntries });
}

function normalizeFreshnessPolicy(value) {
  exactObject(value, 'maxAgeSecondsByKind', PATH_OBSERVATION_KINDS);
  const normalized = {};
  for (const kind of PATH_OBSERVATION_KINDS) {
    const seconds = value[kind];
    if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > 31_536_000) {
      throw new ValidationError(`maxAgeSecondsByKind.${kind} must be an integer from 1 through 31536000`);
    }
    normalized[kind] = seconds;
  }
  return Object.freeze(normalized);
}

function parseEvaluationTime(value) {
  return parseTimestamp(value, 'evaluatedAt');
}

function parseTimestamp(value, label) {
  if (typeof value !== 'string' || !value.endsWith('Z')) {
    throw new ValidationError(`${label} must be a UTC date-time`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) {
    throw new ValidationError(`${label} must be a canonical ISO UTC date-time`);
  }
  return parsed;
}

function evidenceClaimKey(kind, subjectId) {
  return `${kind}:${subjectId}`;
}

function exactObject(value, label, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError(`${label} must be an object`);
  }
  const expected = new Set(fields);
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) throw new ValidationError(`${label} contains unknown field ${key}`);
  }
  for (const field of fields) {
    if (!Object.hasOwn(value, field)) throw new ValidationError(`${label} is missing required field ${field}`);
  }
}

function identifier(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) {
    throw new ValidationError(`${label} must be a bounded identifier`);
  }
  return value;
}

function digest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) {
    throw new ValidationError(`${label} must be a lowercase SHA-256 digest`);
  }
  return value;
}
